import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listOrgMembers } from '../utils/supabaseDb';

export function useOrgMembers(token: string | null, orgId: string | null) {
  return useQuery({
    queryKey: ['org-members', orgId],
    queryFn: async () => {
      if (!token || !orgId) return [];
      return await listOrgMembers(token, orgId);
    },
    enabled: !!token && !!orgId,
    staleTime: 30_000,
  });
}

export function useInvalidateOrgMembers() {
  const queryClient = useQueryClient();
  return (orgId: string) =>
    queryClient.invalidateQueries({ queryKey: ['org-members', orgId] });
}
