import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useDealTasks(dealId: string | undefined) {
  return useQuery({
    queryKey: ['deal-tasks', dealId],
    queryFn: async () => {
      if (!dealId) return { tasks: [], linkedRequests: {} };
      const { data: taskRows } = await supabase
        .from('tasks')
        .select('id, title, category, priority, due_date, status')
        .eq('deal_id', dealId)
        .order('due_date', { ascending: true });

      const { data: reqs } = await supabase
        .from('requests')
        .select('id, task_id, status, request_type')
        .eq('deal_id', dealId)
        .not('task_id', 'is', null);

      const linkedRequests: Record<string, { id: string; status: string; request_type: string }> = {};
      (reqs || []).forEach((r: any) => {
        if (r.task_id) linkedRequests[r.task_id] = { id: r.id, status: r.status, request_type: r.request_type };
      });

      return { tasks: taskRows || [], linkedRequests };
    },
    enabled: !!dealId,
    staleTime: 30_000,
  });
}

export function useInvalidateDealTasks() {
  const queryClient = useQueryClient();
  return (dealId: string) =>
    queryClient.invalidateQueries({ queryKey: ['deal-tasks', dealId] });
}
