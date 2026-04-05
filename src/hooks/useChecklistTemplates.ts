import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useChecklistTemplates() {
  return useQuery({
    queryKey: ['checklist-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checklist_templates')
        .select('*')
        .eq('checklist_type', 'milestone')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });
}

export function useInvalidateChecklistTemplates() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: ['checklist-templates'] });
}
