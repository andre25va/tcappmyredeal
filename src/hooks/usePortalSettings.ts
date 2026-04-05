import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

const PORTAL_SETTINGS_KEYS = [
  'portal_show_status',
  'portal_show_closing_date',
  'portal_show_next_item',
  'portal_welcome_message',
  'portal_request_types',
  'portal_allowed_roles',
] as const;

export function usePortalSettings() {
  return useQuery({
    queryKey: ['portal-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('key, value')
        .in('key', [...PORTAL_SETTINGS_KEYS]);
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });
}

export function useInvalidatePortalSettings() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: ['portal-settings'] });
}
