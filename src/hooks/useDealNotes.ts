import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useDealNotes(dealId: string | undefined) {
  return useQuery({
    queryKey: ['deal-notes', dealId],
    queryFn: async () => {
      if (!dealId) return [];
      const { data, error } = await supabase
        .from('deal_notes')
        .select('*, profiles:author_id(name)')
        .eq('deal_id', dealId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!dealId,
    staleTime: 30_000,
  });
}

export function useInvalidateDealNotes() {
  const queryClient = useQueryClient();
  return (dealId: string) =>
    queryClient.invalidateQueries({ queryKey: ['deal-notes', dealId] });
}
