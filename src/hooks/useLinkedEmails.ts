import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface LinkedEmailThread {
  id: string;
  gmail_thread_id: string;
  deal_id: string;
  score: number;
  score_breakdown: Record<string, number>;
  link_method: 'auto' | 'manual' | 'ai_suggested';
  linked_at: string;
  email_subject: string | null;
  email_snippet: string | null;
  email_from: string | null;
  email_date: string | null;
  has_attachment: boolean;
  is_unread: boolean;
}

interface UseLinkedEmailsResult {
  threads: LinkedEmailThread[];
  loading: boolean;
  error: string | null;
  unreadCount: number;
  markRead: (threadId: string) => Promise<void>;
  refetch: () => void;
}

export function useLinkedEmails(dealId: string): UseLinkedEmailsResult {
  const [threads, setThreads] = useState<LinkedEmailThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchThreads = useCallback(async () => {
    if (!dealId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('email_thread_links')
        .select('*')
        .eq('deal_id', dealId)
        .order('email_date', { ascending: false });

      if (err) throw err;
      setThreads((data as LinkedEmailThread[]) ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load emails');
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  const markRead = useCallback(async (gmailThreadId: string) => {
    const { error: err } = await supabase
      .from('email_thread_links')
      .update({ is_unread: false })
      .eq('gmail_thread_id', gmailThreadId)
      .eq('deal_id', dealId);
    if (!err) {
      setThreads(prev =>
        prev.map(t => t.gmail_thread_id === gmailThreadId ? { ...t, is_unread: false } : t)
      );
    }
  }, [dealId]);

  const unreadCount = threads.filter(t => t.is_unread).length;

  return { threads, loading, error, unreadCount, markRead, refetch: fetchThreads };
}
