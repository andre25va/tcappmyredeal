import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const OPENAI_API = 'https://api.openai.com/v1/chat/completions';

// ─── Supabase ─────────────────────────────────────────────────────────────────
function sb() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface InboundEmail {
  gmailThreadId: string;
  subject: string;
  bodyText?: string;
  from: string;
  to?: string;
  cc?: string;
  date?: string;
  snippet?: string;
  hasAttachment?: boolean;
  attachmentNames?: string[];
  // Optional: PDF pages as base64 for AI extraction (send first PDF only)
  attachmentPdfs?: { filename: string; base64: string }[];
  inReplyTo?: string;
  isUnread?: boolean;
}

interface DealRecord {
  id: string;
  property_address: string;
  secondary_address?: string;
  mls_number?: string;
  client_name?: string;
  lender_email?: string;
  title_email?: string;
  participants?: { email?: string; role?: string; name?: string }[];
}

interface ScoreResult {
  dealId: string;
  score: number;
  breakdown: Record<string, number>;
}

// ─── Text utils ───────────────────────────────────────────────────────────────
function norm(s: string): string {
  return (s || '').toLowerCase().replace(/[^\w\s#]/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildAddressVariants(addr: string): string[] {
  if (!addr || addr.trim().length < 4) return [];
  const variants = new Set<string>();
  variants.add(addr.trim());
  const abbrevs: Record<string, string> = {
    'street': 'st', 'avenue': 'ave', 'boulevard': 'blvd', 'drive': 'dr',
    'road': 'rd', 'lane': 'ln', 'court': 'ct', 'place': 'pl',
    'highway': 'hwy', 'parkway': 'pkwy', 'circle': 'cir', 'terrace': 'ter',
    'trafficway': 'twy',
  };
  let abbrev = addr.toLowerCase();
  for (const [full, short] of Object.entries(abbrevs)) {
    abbrev = abbrev.replace(new RegExp(`\\b${full}\\b`, 'gi'), short);
  }
  variants.add(abbrev);
  // First 3 tokens (house# + street name)
  const first3 = addr.split(/\s+/).slice(0, 3).join(' ');
  if (first3.length > 4 && first3 !== addr.trim()) variants.add(first3.toLowerCase());
  // House number alone (weak signal, only used for address_body)
  const numMatch = addr.match(/^(\d+)\s/);
  if (numMatch) variants.add(numMatch[1]);
  return Array.from(variants).filter(v => v.length > 3);
}

function fuzzyMatch(text: string, variants: string[]): boolean {
  const t = norm(text);
  // Strong match: a full variant (>= 6 chars) found in text
  return variants.some(v => v.length >= 6 && t.includes(norm(v)));
}

function weakMatch(text: string, variants: string[]): boolean {
  const t = norm(text);
  return variants.some(v => v.length >= 4 && t.includes(norm(v)));
}

// ─── Score one deal against one email ────────────────────────────────────────
function scoreDeal(
  email: InboundEmail,
  deal: DealRecord,
  linkedThreadDealId: string | null,
  attachmentExtracted: { address?: string | null; mlsNumber?: string | null } | null
): ScoreResult {
  let score = 0;
  const breakdown: Record<string, number> = {};

  const subj = email.subject || '';
  const body = email.bodyText || email.snippet || '';
  const allParties = [email.from, email.to || '', email.cc || ''].join(' ').toLowerCase();

  // Build address variants (handles duplex dual-address)
  const addrVariants = [
    ...buildAddressVariants(deal.property_address || ''),
    ...buildAddressVariants(deal.secondary_address || ''),
  ].filter(Boolean);

  // ── Signal 1: Linked thread reply (+100) ────────────────────────────────
  // Email is a reply to a thread already linked to THIS deal
  if (linkedThreadDealId === deal.id) {
    score += 100; breakdown.linked_thread = 100;
  }

  // ── Signal 2: Attachment AI parse (+60) — PRIMARY ────────────────────────
  // AI extracted address or MLS# from a PDF that matches this deal
  if (attachmentExtracted) {
    let hit = false;
    if (attachmentExtracted.address && addrVariants.length) {
      if (weakMatch(attachmentExtracted.address, addrVariants)) hit = true;
    }
    if (!hit && attachmentExtracted.mlsNumber && deal.mls_number) {
      const extractedMLS = norm(attachmentExtracted.mlsNumber).replace(/\s/g, '');
      const dealMLS = norm(deal.mls_number).replace(/\s/g, '');
      if (extractedMLS.length >= 3 && dealMLS.length >= 3 && extractedMLS === dealMLS) hit = true;
    }
    if (hit) { score += 60; breakdown.attachment_parse = 60; }
  }

  // ── Signal 3: MLS# in subject or body (+60) ──────────────────────────────
  if (deal.mls_number && deal.mls_number.trim().length >= 3) {
    const mls = norm(deal.mls_number).replace(/\s/g, '');
    const textMLS = norm(`${subj} ${body}`).replace(/\s/g, '');
    if (textMLS.includes(mls)) {
      score += 60; breakdown.mls_match = 60;
    }
  }

  // ── Signal 4: Address in subject (+55) ──────────────────────────────────
  if (addrVariants.length && fuzzyMatch(subj, addrVariants)) {
    score += 55; breakdown.address_subject = 55;
  }

  // ── Signal 5: Address in body (+45) ─────────────────────────────────────
  if (addrVariants.length && (fuzzyMatch(body, addrVariants) || weakMatch(body, addrVariants))) {
    score += 45; breakdown.address_body = 45;
  }

  // ── Signal 6: Participant email match (+25) ───────────────────────────────
  const participantEmails: string[] = [];
  if (deal.lender_email) participantEmails.push(deal.lender_email.toLowerCase());
  if (deal.title_email) participantEmails.push(deal.title_email.toLowerCase());
  for (const p of (deal.participants || [])) {
    if (p.email) participantEmails.push(p.email.toLowerCase());
  }
  if (participantEmails.some(pe => pe.length > 4 && allParties.includes(pe))) {
    score += 25; breakdown.participant_email = 25;
  }

  // ── Signal 7: Client name in text (+20) ──────────────────────────────────
  if (deal.client_name) {
    const cn = norm(deal.client_name);
    if (cn.length > 3 && norm(`${subj} ${body}`).includes(cn)) {
      score += 20; breakdown.client_name = 20;
    }
  }

  // ── Signal 8: Lender email domain match (+20) ────────────────────────────
  if (deal.lender_email) {
    const domain = deal.lender_email.split('@')[1]?.toLowerCase();
    if (domain && domain.length > 3 && (email.from || '').toLowerCase().includes(domain)) {
      score += 20; breakdown.lender_email = 20;
    }
  }

  // ── Signal 9: Title email domain match (+20) ─────────────────────────────
  if (deal.title_email) {
    const domain = deal.title_email.split('@')[1]?.toLowerCase();
    if (domain && domain.length > 3 && (email.from || '').toLowerCase().includes(domain)) {
      score += 20; breakdown.title_email = 20;
    }
  }

  // ── Signal 10: Attachment keyword match (+20) ────────────────────────────
  const txKw = ['contract', 'purchase', 'inspection', 'appraisal', 'closing', 'disclosure',
                 'addendum', 'title', 'earnest', 'escrow', 'commitment', 'hoa'];
  const attNames = (email.attachmentNames || []).map(n => norm(n));
  if (attNames.some(n => txKw.some(k => n.includes(k)))) {
    score += 20; breakdown.attachment_match = 20;
  }

  return { dealId: deal.id, score: Math.max(0, score), breakdown };
}

// ─── AI: Extract from PDF ────────────────────────────────────────────────────
async function extractFromPdf(
  base64: string,
  filename: string,
  apiKey: string
): Promise<{ address?: string | null; mlsNumber?: string | null; salePrice?: string | null; closeDate?: string | null }> {
  try {
    // GPT-4o-mini doesn't support PDF vision directly — send as text prompt
    // asking it to extract from the base64-decoded content if possible.
    // For real PDFs, the Gmail trigger should send the text content instead.
    const resp = await fetch(OPENAI_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: 'You extract real estate transaction data from document text. Return ONLY a JSON object with these fields: address (string|null), mlsNumber (string|null), salePrice (string|null), closeDate (string|null). If a field is not found return null. Do not guess.',
          },
          {
            role: 'user',
            content: `Document filename: "${filename}"\n\nBase64-encoded content (first 2000 chars of decoded text):\n${Buffer.from(base64, 'base64').toString('utf-8').slice(0, 2000)}`,
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'pdf_extract',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                address: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                mlsNumber: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                salePrice: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                closeDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              },
              required: ['address', 'mlsNumber', 'salePrice', 'closeDate'],
            },
          },
        },
      }),
    });
    const data = await resp.json();
    return JSON.parse(data.choices?.[0]?.message?.content || '{"address":null,"mlsNumber":null,"salePrice":null,"closeDate":null}');
  } catch (err) {
    console.error('PDF extract error:', filename, err);
    return { address: null, mlsNumber: null, salePrice: null, closeDate: null };
  }
}

// ─── AI: Explain match for review queue ──────────────────────────────────────
async function aiExplainMatch(
  email: InboundEmail,
  topDeal: DealRecord,
  score: number,
  breakdown: Record<string, number>,
  apiKey: string
): Promise<string> {
  try {
    const resp = await fetch(OPENAI_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 200,
        messages: [
          {
            role: 'system',
            content: 'You help a real estate TC decide if an email belongs to a specific deal. In 1-2 sentences, explain why this email might or might not belong to the deal. Be concrete about what matched and what is uncertain.',
          },
          {
            role: 'user',
            content: `Email — Subject: "${email.subject}" | From: ${email.from} | Snippet: ${(email.snippet || email.bodyText || '').slice(0, 300)}\n\nDeal — Address: ${topDeal.property_address}${topDeal.mls_number ? ` | MLS#: ${topDeal.mls_number}` : ''}\n\nScore: ${score} | Matched signals: ${Object.keys(breakdown).join(', ') || 'none'}\n\nShould a TC review this match?`,
          },
        ],
      }),
    });
    const data = await resp.json();
    return (data.choices?.[0]?.message?.content || '').trim();
  } catch {
    return '';
  }
}

// ─── AI: Classify unmatched email ────────────────────────────────────────────
async function aiClassifyUnmatched(
  email: InboundEmail,
  apiKey: string
): Promise<{ classification: 'new_deal' | 'junk' | 'unknown'; reason: string }> {
  try {
    const resp = await fetch(OPENAI_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'unmatched_classify',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                classification: { type: 'string', enum: ['new_deal', 'junk', 'unknown'] },
                reason: { type: 'string' },
              },
              required: ['classification', 'reason'],
            },
          },
        },
        messages: [
          {
            role: 'system',
            content: 'Classify this unmatched email for a real estate transaction coordinator. new_deal = email describes a real estate transaction that may be new business. junk = spam, marketing, newsletters, automated alerts, unrelated. unknown = unclear.',
          },
          {
            role: 'user',
            content: `Subject: "${email.subject}"\nFrom: ${email.from}\nSnippet: ${(email.snippet || email.bodyText || '').slice(0, 500)}`,
          },
        ],
      }),
    });
    const data = await resp.json();
    return JSON.parse(data.choices?.[0]?.message?.content || '{"classification":"unknown","reason":""}');
  } catch {
    return { classification: 'unknown', reason: 'AI unavailable' };
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  const supabase = sb();
  const email = req.body as InboundEmail;

  if (!email?.gmailThreadId) {
    return res.status(400).json({ error: 'Missing gmailThreadId' });
  }

  try {
    // ── 0. Dedup: skip already auto/manually linked threads ─────────────────
    const { data: existing } = await supabase
      .from('email_thread_links')
      .select('id, deal_id, link_method')
      .eq('gmail_thread_id', email.gmailThreadId)
      .in('link_method', ['auto', 'manual'])
      .limit(1)
      .maybeSingle();

    if (existing) {
      return res.status(200).json({ status: 'already_linked', dealId: existing.deal_id, linkMethod: existing.link_method });
    }

    // ── 1. Load active deals (not closed/terminated) ────────────────────────
    const { data: rawDeals, error: dealsErr } = await supabase
      .from('deals')
      .select('id, property_address, secondary_address, mls_number, client_id, participants, lender_email, title_email')
      .not('pipeline_stage', 'in', '("closed","terminated")');

    if (dealsErr) {
      console.error('Supabase deals error:', dealsErr);
      return res.status(500).json({ error: 'Failed to load deals' });
    }
    if (!rawDeals?.length) {
      return res.status(200).json({ status: 'no_active_deals', scored: 0 });
    }

    // ── 2. Resolve client names ─────────────────────────────────────────────
    const clientIds = [...new Set(rawDeals.map((d: any) => d.client_id).filter(Boolean))];
    let clientMap: Record<string, string> = {};
    if (clientIds.length) {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, name')
        .in('id', clientIds);
      for (const c of (contacts || [])) clientMap[c.id] = c.name;
    }

    const deals: DealRecord[] = rawDeals.map((d: any) => ({
      id: d.id,
      property_address: d.property_address || '',
      secondary_address: d.secondary_address || '',
      mls_number: d.mls_number || '',
      client_name: clientMap[d.client_id] || '',
      lender_email: d.lender_email || '',
      title_email: d.title_email || '',
      participants: d.participants || [],
    }));

    // ── 3. Resolve linked_thread signal via inReplyTo ───────────────────────
    // If this email replies to a thread already linked to a deal, that deal gets +100
    let linkedThreadDealId: string | null = null;
    if (email.inReplyTo) {
      const { data: parentLink } = await supabase
        .from('email_thread_links')
        .select('deal_id')
        .eq('gmail_thread_id', email.inReplyTo)
        .limit(1)
        .maybeSingle();
      if (parentLink) linkedThreadDealId = parentLink.deal_id;
    }

    // ── 4. PDF AI extraction (if attachment present) ────────────────────────
    let attachmentExtracted: { address?: string | null; mlsNumber?: string | null } | null = null;
    if (apiKey && email.attachmentPdfs?.length) {
      // Process first PDF only to keep latency low
      attachmentExtracted = await extractFromPdf(
        email.attachmentPdfs[0].base64,
        email.attachmentPdfs[0].filename,
        apiKey
      );
    }

    // ── 5. Score all deals ──────────────────────────────────────────────────
    const scores: ScoreResult[] = deals.map(deal =>
      scoreDeal(email, deal, linkedThreadDealId, attachmentExtracted)
    );

    scores.sort((a, b) => b.score - a.score);
    const top = scores[0];
    const runnerUp = scores[1] || null;
    const gap = runnerUp ? top.score - runnerUp.score : top.score;
    const topDeal = deals.find(d => d.id === top.dealId) || null;

    const now = new Date().toISOString();
    const threadMeta = {
      thread_subject: (email.subject || '').slice(0, 500),
      thread_snippet: (email.snippet || (email.bodyText || '').slice(0, 300)),
      thread_from: email.from,
      thread_date: email.date || now,
      has_attachment: !!email.hasAttachment,
      is_unread: email.isUnread ?? true,
    };

    // ── 6a. AUTO-LINK (score ≥ 80, gap ≥ 20) ───────────────────────────────
    if (top.score >= 80 && gap >= 20) {
      const { error: linkErr } = await supabase
        .from('email_thread_links')
        .upsert({
          gmail_thread_id: email.gmailThreadId,
          deal_id: top.dealId,
          score: top.score,
          score_breakdown: top.breakdown,
          link_method: 'auto',
          linked_at: now,
          linked_by: 'system',
          ...threadMeta,
        }, { onConflict: 'gmail_thread_id,deal_id' });

      if (linkErr) console.error('Auto-link insert error:', linkErr);

      return res.status(200).json({
        status: 'auto_linked',
        dealId: top.dealId,
        dealAddress: topDeal?.property_address,
        score: top.score,
        gap,
        breakdown: top.breakdown,
      });
    }

    // ── 6b. NEEDS REVIEW (score 35–79) ──────────────────────────────────────
    if (top.score >= 35) {
      let aiSuggestion = '';
      if (apiKey && topDeal) {
        aiSuggestion = await aiExplainMatch(email, topDeal, top.score, top.breakdown, apiKey);
      }

      const { error: qErr } = await supabase
        .from('email_review_queue')
        .upsert({
          gmail_thread_id: email.gmailThreadId,
          top_deal_id: top.dealId,
          top_deal_score: top.score,
          runner_up_deal_id: runnerUp?.dealId || null,
          runner_up_score: runnerUp?.score || null,
          score_breakdown: top.breakdown,
          ai_suggestion: aiSuggestion,
          ai_suggested_deal: top.dealId,
          status: 'pending',
          received_at: now,
          ...threadMeta,
        }, { onConflict: 'gmail_thread_id' });

      if (qErr) console.error('Review queue insert error:', qErr);

      return res.status(200).json({
        status: 'needs_review',
        dealId: top.dealId,
        dealAddress: topDeal?.property_address,
        score: top.score,
        gap,
        aiSuggestion,
      });
    }

    // ── 6c. UNMATCHED (score < 35) ───────────────────────────────────────────
    let unmatchedResult: { classification: 'new_deal' | 'junk' | 'unknown'; reason: string } =
      { classification: 'unknown', reason: '' };
    if (apiKey) {
      unmatchedResult = await aiClassifyUnmatched(email, apiKey);
    }

    // Only queue non-junk unmatched emails
    if (unmatchedResult.classification !== 'junk') {
      const { error: uqErr } = await supabase
        .from('email_review_queue')
        .upsert({
          gmail_thread_id: email.gmailThreadId,
          top_deal_id: top.score > 10 ? top.dealId : null,
          top_deal_score: top.score > 10 ? top.score : null,
          score_breakdown: top.breakdown,
          ai_suggestion: unmatchedResult.reason,
          status: unmatchedResult.classification === 'new_deal' ? 'new_deal' : 'pending',
          received_at: now,
          ...threadMeta,
        }, { onConflict: 'gmail_thread_id' });

      if (uqErr) console.error('Unmatched queue insert error:', uqErr);
    }

    return res.status(200).json({
      status: 'unmatched',
      classification: unmatchedResult.classification,
      reason: unmatchedResult.reason,
      topScore: top.score,
      queued: unmatchedResult.classification !== 'junk',
    });

  } catch (err: any) {
    console.error('email-link handler error:', err);
    return res.status(500).json({ error: err.message || 'Email linking failed' });
  }
}
