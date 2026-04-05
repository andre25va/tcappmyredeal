import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useChecklistDocLinks(dealId: string | undefined) {
  return useQuery({
    queryKey: ['checklist-doc-links', dealId],
    queryFn: async () => {
      if (!dealId) return [];
      const { data: links } = await supabase
        .from('checklist_document_links')
        .select('id, checklist_item_id, document_id')
        .eq('deal_id', dealId);
      if (!links || links.length === 0) return links || [];
      const docIds = [...new Set((links as any[]).map((l) => l.document_id))];
      const { data: docs } = await supabase
        .from('deal_documents')
        .select('id, file_name')
        .in('id', docIds);
      const nameMap: Record<string, string> = {};
      ((docs ?? []) as any[]).forEach((d) => { nameMap[d.id] = d.file_name; });
      return (links as any[]).map((l) => ({ ...l, file_name: nameMap[l.document_id] ?? '' }));
    },
    enabled: !!dealId,
    staleTime: 30_000,
  });
}

export function useInvalidateChecklistDocLinks() {
  const queryClient = useQueryClient();
  return (dealId: string) =>
    queryClient.invalidateQueries({ queryKey: ['checklist-doc-links', dealId] });
}
