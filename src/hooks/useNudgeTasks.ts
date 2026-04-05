import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useNudgeTasks(dealId: string | undefined) {
  return useQuery({
    queryKey: ['nudge-tasks', dealId],
    queryFn: async () => {
      if (!dealId) return [];
      const { data } = await supabase
        .from('task_nudge_status')
        .select('*')
        .eq('deal_id', dealId)
        .order('due_date', { ascending: true });
      return data || [];
    },
    enabled: !!dealId,
    staleTime: 30_000,
  });
}

export function useInvalidateNudgeTasks() {
  const queryClient = useQueryClient();
  return (dealId: string) =>
    queryClient.invalidateQueries({ queryKey: ['nudge-tasks', dealId] });
}
