import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useCommConsoleData(cutoff: string | null) {
  return useQuery({
    queryKey: ['comm-console-data', cutoff],
    queryFn: async () => {
      // Voice Updates
      let vq = supabase
        .from('voice_deal_updates')
        .select('*, deals(id, property_address, city, state), caller_contact:caller_contact_id(id, first_name, last_name, phone)')
        .eq('review_status', 'pending')
        .order('created_at', { ascending: false })
        .limit(50);
      if (cutoff) vq = vq.gte('created_at', cutoff);

      // Callbacks
      let cq = supabase
        .from('callback_requests')
        .select('*, deals(id, property_address), contact:contact_id(id, first_name, last_name, phone)')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(50);
      if (cutoff) cq = cq.gte('created_at', cutoff);

      // Change Requests
      let crq = supabase
        .from('change_requests')
        .select('*, deals:deal_id(id, property_address), contact:requested_by_contact_id(id, first_name, last_name)')
        .eq('status', 'pending_review')
        .order('created_at', { ascending: false })
        .limit(50);
      if (cutoff) crq = crq.gte('created_at', cutoff);

      // Unidentified Calls
      let uq = supabase
        .from('call_log')
        .select('*')
        .is('caller_contact_id', null)
        .order('created_at', { ascending: false })
        .limit(50);
      if (cutoff) uq = uq.gte('created_at', cutoff);

      const [vRes, cRes, crRes, uRes] = await Promise.all([vq, cq, crq, uq]);

      return {
        voiceUpdates: vRes.data || [],
        callbacks: cRes.data || [],
        changeReqs: crRes.data || [],
        unidentified: uRes.data || [],
      };
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useInvalidateCommConsoleData() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: ['comm-console-data'] });
}
