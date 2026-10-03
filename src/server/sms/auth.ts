import type { SupabaseClient } from '@supabase/supabase-js';
import { headerFirst } from '../../lib/sms/webhookUrl.ts';
import { serviceClient } from './repo.ts';

export async function requireStaff(
  headers: Record<string, string | string[] | undefined>,
  client: SupabaseClient = serviceClient(),
): Promise<{ userId: string } | null> {
  const header = headerFirst(headers.authorization || headers.Authorization);
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;

  const { data: session } = await client
    .from('sessions')
    .select('user_id')
    .eq('token', token)
    .eq('is_active', true)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (!session?.user_id) return null;

  const { data: profile } = await client
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', session.user_id)
    .maybeSingle();
  if (!profile || profile.is_active === false || profile.role === 'viewer') return null;
  return { userId: profile.id as string };
}
