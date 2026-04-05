import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useArchivedDeals() {
  return useQuery({
    queryKey: ['archived-deals'],
    queryFn: async () => {
      const { data } = await supabase
        .from('deals')
        .select('id, property_address, deal_type, transaction_type, closing_date, pipeline_stage, created_at')
        .eq('pipeline_stage', 'archived')
        .order('created_at', { ascending: false });
      return data || [];
    },
    staleTime: 30_000,
  });
}

export function useInvalidateArchivedDeals() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: ['archived-deals'] });
}
