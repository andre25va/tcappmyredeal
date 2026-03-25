import { useState, useEffect, useRef, useCallback } from 'react';
import { Deal } from '../types';
import { RawEmail } from '../ai/types';
import { dealToRecord } from '../ai/dealConverter';

interface EmailApiItem {
  id: string;
  threadGroupId?: string;
  subject: string;
  from: string;
  to?: string;
  date: string;
  snippet: string;
  body?: string;
  bodyHtml?: string;
  attachments?: Array<{ filename: string }>;
  classification?: {
    shouldAttach: boolean;
    confidence: number;
    category: string;
    reason: string;
    extractedSignals: string[];
    source: string;
  };
}

interface EmailStats {
  total: number;
  highConfidence: number;
  aiClassified: number;
  grayZone: number;
}

interface UseDealEmailsReturn {
  emails: RawEmail[];
  rawEmails: EmailApiItem[];
  loading: boolean;
  error: string | null;
  stats: EmailStats;
  refetch: () => void;
}

// Simple in-memory cache keyed by deal ID
const emailCache = new Map<string, { emails: RawEmail[]; rawEmails: EmailApiItem[]; stats: EmailStats; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function mapToRawEmail(email: EmailApiItem): RawEmail {
  return {
    id: email.id,
    threadId: email.threadGroupId || email.id,
    subject: email.subject,
    from: email.from,
    to: email.to ? email.to.split(', ') : [],
    snippet: email.snippet,
    bodyText: email.body,
    bodyHtml: email.bodyHtml,
    receivedAt: email.date,
    attachmentNames: email.attachments?.map((a) => a.filename) || [],
  };
}

function computeStats(rawEmails: EmailApiItem[]): EmailStats {
  let highConfidence = 0;
  let aiClassified = 0;
  let grayZone = 0;

  for (const e of rawEmails) {
    const c = e.classification;
    if (!c) continue;
    if (c.confidence >= 0.8) highConfidence++;
    else if (c.confidence >= 0.5) aiClassified++;
    else grayZone++;
  }

  return { total: rawEmails.length, highConfidence, aiClassified, grayZone };
}

export function useDealEmails(deal: Deal): UseDealEmailsReturn {
  const [emails, setEmails] = useState<RawEmail[]>([]);
  const [rawEmails, setRawEmails] = useState<EmailApiItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<EmailStats>({ total: 0, highConfidence: 0, aiClassified: 0, grayZone: 0 });
  const abortRef = useRef<AbortController | null>(null);
  // Keep a ref to the latest deal so fetchEmails can access it without being a dependency
  const dealRef = useRef<Deal>(deal);
  dealRef.current = deal;

  const fetchEmails = useCallback(async (skipCache = false) => {
    const currentDeal = dealRef.current;
    const dealId = currentDeal.id;

    // Check cache
    if (!skipCache) {
      const cached = emailCache.get(dealId);
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        setEmails(cached.emails);
        setRawEmails(cached.rawEmails);
        setStats(cached.stats);
        setError(null);
        return;
      }
    }

    // Build request body from deal record
    const record = dealToRecord(currentDeal);

    const body = {
      addresses: record.addressVariants || [],
      mlsNumber: record.mlsNumber || '',
      dealId: record.id,
      clientNames: record.clientNames || [],
      participantEmails: record.participantEmails || [],
      linkedThreadIds: record.linkedThreadIds || [],
    };

    // Abort any in-flight request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/email/search-classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        // Silently handle expected failures (Gmail not configured, etc.)
        console.warn(`[useDealEmails] Email fetch returned ${res.status} — skipping`);
        return;
      }

      const data = await res.json();
      // If server says Gmail isn't configured, just silently return empty
      if (data.warning) {
        console.info('[useDealEmails]', data.warning);
        return;
      }
      const apiEmails: EmailApiItem[] = data.emails || [];
      const mapped = apiEmails.map(mapToRawEmail);
      const emailStats = computeStats(apiEmails);

      // Update cache
      emailCache.set(dealId, { emails: mapped, rawEmails: apiEmails, stats: emailStats, fetchedAt: Date.now() });

      setEmails(mapped);
      setRawEmails(apiEmails);
      setStats(emailStats);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      // Silently suppress — email is an enhancement, not core functionality
      console.warn('[useDealEmails] Email fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  // ✅ FIX: Only depend on deal.id — not the full deal object
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal.id]);

  // Fetch on mount / deal ID change only
  useEffect(() => {
    fetchEmails();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchEmails]);

  const refetch = useCallback(() => fetchEmails(true), [fetchEmails]);

  return { emails, rawEmails, loading, error, stats, refetch };
}
