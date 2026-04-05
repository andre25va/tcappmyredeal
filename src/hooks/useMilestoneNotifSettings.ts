import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useMilestoneNotifSettings() {
  return useQuery({
    queryKey: ['milestone-notif-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('milestone_notification_settings')
        .select('*')
        .order('created_at');
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });
}

export function useInvalidateMilestoneNotifSettings() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: ['milestone-notif-settings'] });
}
