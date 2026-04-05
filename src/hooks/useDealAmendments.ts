import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useDealAmendments(dealId: string | undefined) {
  return useQuery({
    queryKey: ['deal-amendments', dealId],
    queryFn: async () => {
      if (!dealId) return [];
      const { data, error } = await supabase
        .from('deal_amendments')
        .select('*')
        .eq('deal_id', dealId)
        .order('amendment_number', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!dealId,
    staleTime: 30_000,
  });
}

export function useInvalidateDealAmendments() {
  const queryClient = useQueryClient();
  return (dealId: string) =>
    queryClient.invalidateQueries({ queryKey: ['deal-amendments', dealId] });
}
