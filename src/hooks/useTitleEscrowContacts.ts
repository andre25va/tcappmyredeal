import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export const TITLE_ESCROW_CONTACTS_KEY = ['title_escrow_contacts'] as const;

export function useTitleEscrowContacts() {
  return useQuery({
    queryKey: TITLE_ESCROW_CONTACTS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .in('contact_type', ['title', 'escrow'])
        .is('deleted_at', null)
        .order('full_name');
      if (error) throw error;
      return (data ?? []).map((c: any) => ({
        id: c.id,
        fullName: c.full_name || '',
        company: c.company || '',
        email: c.email || '',
        phone: c.phone || '',
        role: c.contact_type || '',
      }));
    },
  });
}
