import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useDocumentLog(dealId: string | undefined, enabled: boolean = true) {
  return useQuery({
    queryKey: ['document-log', dealId],
    queryFn: async () => {
      if (!dealId) return [];
      const { data, error } = await supabase
        .from('document_log')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!dealId && enabled,
    staleTime: 30_000,
  });
}

export function useInvalidateDocumentLog() {
  const qc = useQueryClient();
  return (dealId: string) => qc.invalidateQueries({ queryKey: ['document-log', dealId] });
}
