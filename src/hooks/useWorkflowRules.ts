import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useWorkflowRules() {
  return useQuery({
    queryKey: ['workflow-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workflow_rules')
        .select('*')
        .order('created_at');
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });
}

export function useInvalidateWorkflowRules() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: ['workflow-rules'] });
}
