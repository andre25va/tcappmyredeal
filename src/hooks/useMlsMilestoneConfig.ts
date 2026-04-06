import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useMlsMilestoneConfig(mlsId: string | undefined) {
  return useQuery({
    queryKey: ['mls-milestone-config', mlsId],
    queryFn: async () => {
      if (!mlsId) return [];
      const { data, error } = await supabase
        .from('mls_milestone_config')
        .select('*')
        .eq('mls_id', mlsId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!mlsId,
    staleTime: 30_000,
  });
}

export function useMlsMilestoneConfigWithTypes(mlsId: string | undefined) {
  return useQuery({
    queryKey: ['mls-milestone-config-with-types', mlsId],
    queryFn: async () => {
      if (!mlsId) return [];
      const { data, error } = await supabase
        .from('mls_milestone_config')
        .select(`
          sort_order,
          due_days_from_contract,
          milestone_types!mls_milestone_config_milestone_type_id_fkey (
            id, key, label, sort_order
          )
        `)
        .eq('mls_id', mlsId)
        .order('sort_order');
      if (error) throw error;
      return data || [];
    },
    enabled: !!mlsId,
    staleTime: 30_000,
  });
}

// Full config including email templates and notify flags — used by MilestoneAdvanceModal
export function useMlsMilestoneConfigFull(mlsId: string | undefined) {
  return useQuery({
    queryKey: ['mls-milestone-config-full', mlsId],
    queryFn: async () => {
      if (!mlsId) return [];
      const { data, error } = await supabase
        .from('mls_milestone_config')
        .select(`
          *,
          milestone_types!mls_milestone_config_milestone_type_id_fkey (
            id, key, label, sort_order
          )
        `)
        .eq('mls_id', mlsId)
        .order('sort_order');
      if (error) throw error;
      return data || [];
    },
    enabled: !!mlsId,
    staleTime: 30_000,
  });
}

export function useInvalidateMlsMilestoneConfig() {
  const queryClient = useQueryClient();
  return (mlsId?: string) => {
    if (mlsId) {
      queryClient.invalidateQueries({ queryKey: ['mls-milestone-config', mlsId] });
      queryClient.invalidateQueries({ queryKey: ['mls-milestone-config-with-types', mlsId] });
      queryClient.invalidateQueries({ queryKey: ['mls-milestone-config-full', mlsId] });
    } else {
      queryClient.invalidateQueries({ queryKey: ['mls-milestone-config'] });
      queryClient.invalidateQueries({ queryKey: ['mls-milestone-config-with-types'] });
      queryClient.invalidateQueries({ queryKey: ['mls-milestone-config-full'] });
    }
  };
}
