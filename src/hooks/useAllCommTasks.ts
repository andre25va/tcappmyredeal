import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useAllCommTasks() {
  return useQuery({
    queryKey: ['all-comm-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comm_tasks')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 15_000,
  });
}

export function useInvalidateAllCommTasks() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: ['all-comm-tasks'] });
}
