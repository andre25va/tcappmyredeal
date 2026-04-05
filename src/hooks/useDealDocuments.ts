import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useDealDocuments(dealId: string | undefined) {
  return useQuery({
    queryKey: ['deal-documents', dealId],
    queryFn: async () => {
      if (!dealId) return [];
      const { data, error } = await supabase
        .from('deal_documents')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!dealId,
    staleTime: 30_000,
  });
}

export function useInvalidateDealDocuments() {
  const qc = useQueryClient();
  return (dealId: string) => qc.invalidateQueries({ queryKey: ['deal-documents', dealId] });
}
