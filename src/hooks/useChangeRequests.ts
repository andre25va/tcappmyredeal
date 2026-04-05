import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useChangeRequests(dealId: string | undefined) {
  return useQuery({
    queryKey: ['change-requests', dealId],
    queryFn: async () => {
      if (!dealId) return [];
      const { data, error } = await supabase
        .from('change_requests')
        .select('*, contact:requested_by_contact_id(id, first_name, last_name)')
        .eq('deal_id', dealId)
        .eq('status', 'pending_review')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!dealId,
    staleTime: 30_000,
  });
}

export function useInvalidateChangeRequests() {
  const queryClient = useQueryClient();
  return (dealId: string) =>
    queryClient.invalidateQueries({ queryKey: ['change-requests', dealId] });
}
