import { useQuery, useQueryClient } from '@tanstack/react-query';
import { loadContactsFull } from '../utils/supabaseDb';
import { ContactRecord } from '../types';

// Note: loadContactsFull() fetches all contacts without orgId filtering.
// Org-level filtering is performed client-side. The orgId is kept in the
// queryKey to scope cache entries per org and allow targeted invalidation.
export const ORG_CONTACTS_KEY = (orgId: string | null | undefined) =>
  ['org-contacts', orgId] as const;

export function useOrgContacts(orgId: string | null | undefined) {
  return useQuery<ContactRecord[]>({
    queryKey: ORG_CONTACTS_KEY(orgId),
    queryFn: () => loadContactsFull(),
    // Always enabled — loadContactsFull doesn't require orgId, filtering is client-side
    enabled: true,
    staleTime: 60_000,
  });
}

export function useInvalidateOrgContacts() {
  const qc = useQueryClient();
  return (orgId: string | null | undefined) =>
    qc.invalidateQueries({ queryKey: ORG_CONTACTS_KEY(orgId) });
}
