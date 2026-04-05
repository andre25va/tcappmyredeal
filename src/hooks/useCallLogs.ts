import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useCallLogs(dealId: string | undefined) {
  return useQuery({
    queryKey: ['call-logs', dealId],
    queryFn: async () => {
      if (!dealId) return [];
      const { data, error } = await supabase
        .from('call_logs')
        .select('*, contact:contact_id(id, first_name, last_name, phone)')
        .eq('deal_id', dealId)
        .order('started_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!dealId,
    staleTime: 30_000,
  });
}

export function useInvalidateCallLogs() {
  const queryClient = useQueryClient();
  return (dealId: string) =>
    queryClient.invalidateQueries({ queryKey: ['call-logs', dealId] });
}
