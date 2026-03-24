import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface ReviewQueueItem {
  id: string;
  gmail_thread_id: string;
  // Derived from thread_from
  from_email: string;
  from_name: string | null;
  // Derived from thread_subject / thread_snippet
  subject: string;
  snippet: string | null;
  received_at: string;
  has_attachment: boolean;
  top_deal_id: string | null;
  top_deal_address: string | null;
  top_deal_score: number | null;
  runner_up_deal_id: string | null;
  runner_up_deal_address: string | null;
  runner_up_deal_score: number | null;
  ai_suggestion: string | null;
  status: 'pending' | 'confirmed' | 'dismissed' | 'new_deal';
  score_breakdown: Record<string, number> | null;
  created_at: string;
}

export interface LinkedThread {
  id: string;
  gmail_thread_id: string;
  deal_id: string;
  deal_address: string | null;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  snippet: string | null;
  score: number | null;
  link_method: 'auto' | 'manual' | 'ai_suggested';
  created_at: string;
}

export interface ReviewQueueStats {
  needsReview: number;
  unmatched: number;
  recentlyLinked: number;
  total: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Parse "Name <email@domain>" or plain email into { name, email } */
function parseFrom(threadFrom: string | null): { email: string; name: string | null } {
  if (!threadFrom) return { email: '', name: null };
  const match = threadFrom.match(/^(.+?)\s*<(.+?)>$/);
  if (match) return { email: match[2].trim(), name: match[1].trim() || null };
  return { email: threadFrom.trim(), name: null };
}

/** Reconstruct "Name <email>" for inserts */
function buildFrom(name: string | null, email: string): string {
  return name ? `${name} <${email}>` : email;
}

// ─── Address parser ────────────────────────────────────────────────────────────
export function parseAddressString(full: string): {
  property_address: string;
  city: string;
  state: string;
  zip: string;
} {
  const trimmed = full.trim();
  const match = trimmed.match(
    /^(.+?),\s*([^,]+?),?\s*([A-Za-z]{2})\s*(\d{5})?$/
  );
  if (match) {
    return {
      property_address: match[1].trim(),
      city: match[2].trim(),
      state: match[3].toUpperCase(),
      zip: match[4] ?? '',
    };
  }
  return { property_address: trimmed, city: '', state: '', zip: '' };
}

export function useEmailReviewQueue() {
  const [needsReview, setNeedsReview] = useState<ReviewQueueItem[]>([]);
  const [unmatched, setUnmatched] = useState<ReviewQueueItem[]>([]);
  const [recentlyLinked, setRecentlyLinked] = useState<LinkedThread[]>([]);
  const [stats, setStats] = useState<ReviewQueueStats>({ needsReview: 0, unmatched: 0, recentlyLinked: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Transform a raw email_review_queue row into ReviewQueueItem */
  function mapQueueRow(row: any): ReviewQueueItem {
    const { email, name } = parseFrom(row.thread_from);
    return {
      id: row.id,
      gmail_thread_id: row.gmail_thread_id,
      from_email: email,
      from_name: name,
      subject: row.thread_subject || '',
      snippet: row.thread_snippet || null,
      received_at: row.received_at,
      has_attachment: !!row.has_attachment,
      top_deal_id: row.top_deal_id ?? null,
      top_deal_address: null,      // not stored in queue table
      top_deal_score: row.top_deal_score ?? null,
      runner_up_deal_id: row.runner_up_deal_id ?? null,
      runner_up_deal_address: null, // not stored in queue table
      runner_up_deal_score: row.runner_up_score ?? null,
      ai_suggestion: row.ai_suggestion ?? null,
      status: row.status,
      score_breakdown: row.score_breakdown ?? null,
      created_at: row.received_at, // alias
    };
  }

  /** Transform a raw email_thread_links row into LinkedThread */
  function mapLinkedRow(row: any): LinkedThread {
    const { email, name } = parseFrom(row.thread_from);
    return {
      id: row.id,
      gmail_thread_id: row.gmail_thread_id,
      deal_id: row.deal_id,
      deal_address: row.deals?.property_address ?? null,
      from_email: email || null,
      from_name: name || null,
      subject: row.thread_subject || null,
      snippet: row.thread_snippet || null,
      score: row.score ?? null,
      link_method: row.link_method,
      created_at: row.linked_at,
    };
  }

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [reviewRes, unmatchedRes, linkedRes] = await Promise.all([
        // Needs Review: pending with score >= 35
        supabase
          .from('email_review_queue')
          .select('*')
          .eq('status', 'pending')
          .gte('top_deal_score', 35)
          .order('received_at', { ascending: false })
          .limit(50),

        // Unmatched: pending with score <35 OR null, PLUS new_deal detections
        supabase
          .from('email_review_queue')
          .select('*')
          .or('status.eq.new_deal,and(status.eq.pending,or(top_deal_score.lt.35,top_deal_score.is.null))')
          .order('received_at', { ascending: false })
          .limit(50),

        // Recently linked: auto + manual last 20
        supabase
          .from('email_thread_links')
          .select(`
            id, gmail_thread_id, deal_id,
            thread_from, thread_subject, thread_snippet,
            score, link_method, linked_at,
            has_attachment,
            deals!inner(property_address)
          `)
          .in('link_method', ['auto', 'manual'])
          .order('linked_at', { ascending: false })
          .limit(20),
      ]);

      const reviewItems = (reviewRes.data || []).map(mapQueueRow);
      const unmatchedItems = (unmatchedRes.data || []).map(mapQueueRow);
      const linkedItems = (linkedRes.data || []).map(mapLinkedRow);

      setNeedsReview(reviewItems);
      setUnmatched(unmatchedItems);
      setRecentlyLinked(linkedItems);
      setStats({
        needsReview: reviewItems.length,
        unmatched: unmatchedItems.length,
        recentlyLinked: linkedItems.length,
        total: reviewItems.length + unmatchedItems.length,
      });
    } catch (err: any) {
      setError(err.message ?? 'Failed to load review queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 60000);
    return () => clearInterval(t);
  }, [fetchAll]);

  const confirmLink = useCallback(async (item: ReviewQueueItem, dealId: string, _dealAddress: string) => {
    await supabase.from('email_thread_links').upsert({
      gmail_thread_id: item.gmail_thread_id,
      deal_id: dealId,
      thread_from: buildFrom(item.from_name, item.from_email),
      thread_subject: item.subject,
      thread_snippet: item.snippet,
      thread_date: item.received_at,
      has_attachment: item.has_attachment,
      score: item.top_deal_score ?? 0,
      score_breakdown: item.score_breakdown,
      link_method: 'manual',
      is_unread: true,
    }, { onConflict: 'gmail_thread_id,deal_id' });

    await supabase.from('email_review_queue').update({ status: 'confirmed' }).eq('id', item.id);
    await fetchAll();
  }, [fetchAll]);

  const dismissItem = useCallback(async (item: ReviewQueueItem) => {
    await supabase.from('email_review_queue').update({ status: 'dismissed' }).eq('id', item.id);
    await fetchAll();
  }, [fetchAll]);

  const markNewDeal = useCallback(async (item: ReviewQueueItem) => {
    await supabase.from('email_review_queue').update({ status: 'new_deal' }).eq('id', item.id);
    await fetchAll();
  }, [fetchAll]);

  const createAndLink = useCallback(async (
    item: ReviewQueueItem,
    fullAddress: string,
    buyerName?: string,
    price?: number,
  ): Promise<{ dealId: string | null; error: string | null }> => {
    try {
      const parsed = parseAddressString(fullAddress);

      const { data: dealData, error: dealError } = await supabase
        .from('deals')
        .insert({
          property_address: parsed.property_address,
          city: parsed.city,
          state: parsed.state,
          zip: parsed.zip,
          pipeline_stage: 'active',
          status: 'active',
          ...(buyerName ? { buyer_name: buyerName } : {}),
          ...(price ? { purchase_price: price } : {}),
        })
        .select('id, property_address')
        .single();

      if (dealError) throw new Error(dealError.message);
      const dealId = dealData.id as string;

      await supabase.from('email_thread_links').upsert({
        gmail_thread_id: item.gmail_thread_id,
        deal_id: dealId,
        thread_from: buildFrom(item.from_name, item.from_email),
        thread_subject: item.subject,
        thread_snippet: item.snippet,
        thread_date: item.received_at,
        has_attachment: item.has_attachment,
        score: 100,
        score_breakdown: { manual_new_deal: 100 },
        link_method: 'manual',
        is_unread: true,
      }, { onConflict: 'gmail_thread_id,deal_id' });

      await supabase
        .from('email_review_queue')
        .update({ status: 'confirmed' })
        .eq('id', item.id);

      await fetchAll();
      return { dealId, error: null };
    } catch (err: any) {
      return { dealId: null, error: err.message ?? 'Failed to create deal' };
    }
  }, [fetchAll]);

  return {
    needsReview, unmatched, recentlyLinked, stats,
    loading, error, refetch: fetchAll,
    confirmLink, dismissItem, markNewDeal, createAndLink,
  };
}
