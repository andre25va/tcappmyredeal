import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface MlsEntryLive {
  id: string;
  name: string;
  state: string | null;
  url: string | null;
  notes: string | null;
  documents: any[];
  createdAt: string;
  [key: string]: any;
}

export const MLS_ENTRIES_KEY = ['mls_entries'] as const;

export function useMlsEntries() {
  return useQuery({
    queryKey: MLS_ENTRIES_KEY,
    queryFn: async (): Promise<MlsEntryLive[]> => {
      const { data, error } = await supabase
        .from('mls_entries')
        .select('*')
        .order('name');
      if (error) throw error;
      return (data ?? []) as MlsEntryLive[];
    },
  });
}
