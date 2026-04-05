import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useArchivedContacts() {
  return useQuery({
    queryKey: ['archived-contacts'],
    queryFn: async () => {
      const { data } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email, phone, contact_type, company, created_at')
        .eq('is_active', false)
        .order('created_at', { ascending: false });
      return data || [];
    },
    staleTime: 30_000,
  });
}

export function useInvalidateArchivedContacts() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: ['archived-contacts'] });
}
