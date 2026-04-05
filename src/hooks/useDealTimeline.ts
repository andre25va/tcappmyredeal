import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useDealTimeline(dealId: string | undefined) {
  return useQuery({
    queryKey: ['deal-timeline', dealId],
    queryFn: async () => {
      if (!dealId) return [];
      const { data, error } = await supabase
        .from('deal_timeline')
        .select('*')
        .eq('deal_id', dealId)
        .order('sort_order', { ascending: true })
        .order('due_date', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!dealId,
    staleTime: 30_000,
  });
}

export function useInvalidateDealTimeline() {
  const queryClient = useQueryClient();
  return (dealId: string) =>
    queryClient.invalidateQueries({ queryKey: ['deal-timeline', dealId] });
}
