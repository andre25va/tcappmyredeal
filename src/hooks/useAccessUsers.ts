import { useQuery, useQueryClient } from '@tanstack/react-query';

export function useAccessUsers() {
  const token = localStorage.getItem('tc_session') || '';

  return useQuery({
    queryKey: ['access-users'],
    queryFn: async () => {
      const res = await fetch('/api/auth?action=list-users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load users');
      return data.users || [];
    },
    enabled: !!token,
    staleTime: 30_000,
  });
}

export function useInvalidateAccessUsers() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: ['access-users'] });
}
