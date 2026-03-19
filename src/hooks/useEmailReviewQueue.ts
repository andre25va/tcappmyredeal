import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface ReviewQueueItem {
  id: string;
  gmail_thread_id: string;
  gmail_message_id: string;
  from_email: string;
  from_name: string | null;
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

// ─── Address parser ────────────────────────────────────────────────────────────
// Parses "5777 Bristol St, Bel Aire, KS 67220" into components
export function parseAddressString(full: string): {
  property_address: string;
  city: string;
  state: string;
  zip: string;
} {
  const trimmed = full.trim();
  // Try to match: "street, city, ST 12345" or "street, city ST 12345"
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
  // Fallback: store whole string as property_address
  return { property_address: trimmed, city: '', state: '', zip: '' };
}

export function useEmailReviewQueue() {
  const [needsReview, setNeedsReview] = useState<ReviewQueueItem[]>([]);
  const [unmatched, setUnmatched] = useState<ReviewQueueItem[]>([]);
  const [recentlyLinked, setRecentlyLinked] = useState<LinkedThread[]>([]);
  const [stats, setStats] = useState<ReviewQueueStats>({ needsReview: 0, unmatched: 0, recentlyLinked: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [reviewRes, unmatchedRes, linkedRes] = await Promise.all([
        // Needs Review: score 35-79, pending
        supabase
          .from('email_review_queue')
          .select('*')
          .eq('status', 'pending')
          .gte('top_deal_score', 35)
          .order('received_at', { ascending: false })
          .limit(50),

        // Unmatched: score <35 or null, pending
        supabase
          .from('email_review_queue')
          .select('*')
          .eq('status', 'pending')
          .or('top_deal_score.lt.35,top_deal_score.is.null')
          .order('received_at', { ascending: false })
          .limit(50),

        // Recently linked: auto + AI last 20
        supabase
          .from('email_thread_links')
          .select(`
            id, gmail_thread_id, deal_id,
            from_email, from_name, subject, snippet,
            score, link_method, created_at,
            deals!inner(property_address)
          `)
          .in('link_method', ['auto', 'ai_suggested'])
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      const reviewItems = (reviewRes.data || []) as ReviewQueueItem[];
      const unmatchedItems = (unmatchedRes.data || []) as ReviewQueueItem[];
      const linkedItems = ((linkedRes.data || []) as any[]).map(r => ({
        ...r,
        deal_address: r.deals?.property_address ?? null,
      })) as LinkedThread[];

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
    const t = setInterval(fetchAll, 60000); // refresh every minute
    return () => clearInterval(t);
  }, [fetchAll]);

  const confirmLink = useCallback(async (item: ReviewQueueItem, dealId: string, dealAddress: string) => {
    await supabase.from('email_thread_links').upsert({
      gmail_thread_id: item.gmail_thread_id,
      deal_id: dealId,
      from_email: item.from_email,
      from_name: item.from_name,
      subject: item.subject,
      snippet: item.snippet,
      received_at: item.received_at,
      has_attachment: item.has_attachment,
      score: item.top_deal_score ?? 0,
      score_breakdown: item.score_breakdown,
      link_method: 'ai_suggested',
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

  /**
   * createAndLink — creates a new minimal deal from the email queue, links the thread to it,
   * and marks the queue item as new_deal/confirmed.
   *
   * @param item        The review queue item (email)
   * @param fullAddress Full address string e.g. "5777 Bristol St, Bel Aire, KS 67220"
   * @param buyerName   Optional buyer name
   * @param price       Optional purchase price (number)
   * @returns { dealId, error }
   */
  const createAndLink = useCallback(async (
    item: ReviewQueueItem,
    fullAddress: string,
    buyerName?: string,
    price?: number,
  ): Promise<{ dealId: string | null; error: string | null }> => {
    try {
      const parsed = parseAddressString(fullAddress);

      // 1 — Create minimal deal
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

      // 2 — Link thread to new deal
      await supabase.from('email_thread_links').upsert({
        gmail_thread_id: item.gmail_thread_id,
        deal_id: dealId,
        from_email: item.from_email,
        from_name: item.from_name,
        subject: item.subject,
        snippet: item.snippet,
        received_at: item.received_at,
        has_attachment: item.has_attachment,
        score: 100, // manually created = high confidence
        score_breakdown: { manual_new_deal: 100 },
        link_method: 'manual',
        is_unread: true,
      }, { onConflict: 'gmail_thread_id,deal_id' });

      // 3 — Mark queue item done
      await supabase
        .from('email_review_queue')
        .update({ status: 'new_deal' })
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
