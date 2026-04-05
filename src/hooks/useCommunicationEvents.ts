import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useCommunicationEvents(dealId: string | undefined) {
  return useQuery({
    queryKey: ['communication-events', dealId],
    queryFn: async () => {
      if (!dealId) return [];
      const { data, error } = await supabase
        .from('communication_events')
        .select('*, contact:contact_id(id, first_name, last_name, phone)')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: !!dealId,
    staleTime: 30_000,
  });
}

export function useInvalidateCommunicationEvents() {
  const queryClient = useQueryClient();
  return (dealId: string) =>
    queryClient.invalidateQueries({ queryKey: ['communication-events', dealId] });
}
