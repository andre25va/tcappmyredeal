import { useQuery, useQueryClient } from '@tanstack/react-query';
import { loadDeals } from '../utils/supabaseDb';
import { Deal } from '../types';

export const ORG_DEALS_KEY = (orgId: string | null | undefined) =>
  ['org-deals', orgId] as const;

export function useOrgDeals(orgId: string | null | undefined) {
  return useQuery<Deal[]>({
    queryKey: ORG_DEALS_KEY(orgId),
    queryFn: () => loadDeals(orgId ?? undefined),
    enabled: !!orgId,
    staleTime: 60_000,
  });
}

export function useInvalidateOrgDeals() {
  const qc = useQueryClient();
  return (orgId: string | null | undefined) =>
    qc.invalidateQueries({ queryKey: ORG_DEALS_KEY(orgId) });
}

export function useSetOrgDealsData() {
  const qc = useQueryClient();
  return (orgId: string | null | undefined, updater: (prev: Deal[]) => Deal[]) =>
    qc.setQueryData<Deal[]>(ORG_DEALS_KEY(orgId), (prev) => updater(prev ?? []));
}
