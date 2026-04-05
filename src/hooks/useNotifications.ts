import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

export function useInvalidateNotifications() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
}
