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
    // Write confirmed link
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

    // Mark queue item confirmed
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

  return { needsReview, unmatched, recentlyLinked, stats, loading, error, refetch: fetchAll, confirmLink, dismissItem, markNewDeal };
}
