import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useDeletedContacts() {
  return useQuery({
    queryKey: ['deleted-contacts'],
    queryFn: async () => {
      const { data } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email, phone, contact_type, company, deleted_at, deleted_by')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });
      return data || [];
    },
    staleTime: 30_000,
  });
}

export function useInvalidateDeletedContacts() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: ['deleted-contacts'] });
}
