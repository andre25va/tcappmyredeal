import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useChecklistTemplateItems() {
  return useQuery({
    queryKey: ['checklist-template-items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checklist_template_items')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });
}

export function useInvalidateChecklistTemplateItems() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: ['checklist-template-items'] });
}
