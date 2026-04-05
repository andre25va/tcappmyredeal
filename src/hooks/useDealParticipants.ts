import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useDealParticipants(dealId: string | undefined) {
  return useQuery({
    queryKey: ['deal-participants', dealId],
    queryFn: async () => {
      if (!dealId) return [];
      const { data, error } = await supabase
        .from('deal_participants')
        .select(`id, deal_role, side, is_extracted, contact_id, contacts(id, first_name, last_name, email, phone, company, contact_type)`)
        .eq('deal_id', dealId);
      if (error) throw error;
      return (data || []).map((p: any) => ({
        ...p,
        side: p.side === 'listing' ? 'seller' : p.side,
      }));
    },
    enabled: !!dealId,
    staleTime: 30_000,
  });
}

export function useInvalidateDealParticipants() {
  const queryClient = useQueryClient();
  return (dealId: string) =>
    queryClient.invalidateQueries({ queryKey: ['deal-participants', dealId] });
}
