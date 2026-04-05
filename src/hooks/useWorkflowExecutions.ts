import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useWorkflowExecutions() {
  return useQuery({
    queryKey: ['workflow-executions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workflow_executions')
        .select('*')
        .order('executed_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });
}

export function useInvalidateWorkflowExecutions() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: ['workflow-executions'] });
}
