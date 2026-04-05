import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string
);

export interface MilestoneType {
  id: string;
  key: string;
  label: string;
  sort_order: number;
  created_at: string;
}

export const MILESTONE_TYPES_KEY = ['milestone_types'] as const;

export function useMilestoneTypes() {
  return useQuery({
    queryKey: MILESTONE_TYPES_KEY,
    queryFn: async (): Promise<MilestoneType[]> => {
      const { data, error } = await supabase
        .from('milestone_types')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as MilestoneType[];
    },
  });
}

export function useInvalidateMilestoneTypes() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: MILESTONE_TYPES_KEY });
}
