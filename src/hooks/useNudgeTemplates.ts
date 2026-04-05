import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useNudgeTemplates(orgId: string | undefined) {
  return useQuery({
    queryKey: ['nudge-templates', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from('nudge_templates')
        .select('*')
        .or(`org_id.eq.${orgId},org_id.is.null`)
        .eq('is_active', true)
        .order('name');
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });
}
