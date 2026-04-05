import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useVoiceDealUpdates(dealId: string | undefined) {
  return useQuery({
    queryKey: ['voice-deal-updates', dealId],
    queryFn: async () => {
      if (!dealId) return [];
      const { data, error } = await supabase
        .from('voice_deal_updates')
        .select('*, caller_contact:caller_contact_id(id, first_name, last_name)')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!dealId,
    staleTime: 30_000,
  });
}

export function useInvalidateVoiceDealUpdates() {
  const queryClient = useQueryClient();
  return (dealId: string) =>
    queryClient.invalidateQueries({ queryKey: ['voice-deal-updates', dealId] });
}
