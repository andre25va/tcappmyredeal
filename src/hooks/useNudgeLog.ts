import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useNudgeLog(dealId: string | undefined) {
  return useQuery({
    queryKey: ['nudge-log', dealId],
    queryFn: async () => {
      if (!dealId) return [];
      const { data } = await supabase
        .from('nudge_log')
        .select('*')
        .eq('deal_id', dealId)
        .order('sent_at', { ascending: false });
      return data || [];
    },
    enabled: !!dealId,
    staleTime: 30_000,
  });
}

export function useInvalidateNudgeLog() {
  const queryClient = useQueryClient();
  return (dealId: string) =>
    queryClient.invalidateQueries({ queryKey: ['nudge-log', dealId] });
}
