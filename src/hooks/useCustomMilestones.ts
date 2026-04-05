import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useCustomMilestones() {
  return useQuery({
    queryKey: ['custom-milestones'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_milestones')
        .select('*, contacts(id, first_name, last_name)')
        .order('created_at');
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });
}

export function useInvalidateCustomMilestones() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: ['custom-milestones'] });
}
