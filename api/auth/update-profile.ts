import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { name, timezone, avatar_color } = req.body || {};

  try {
    const { data: session } = await supabase
      .from('sessions')
      .select('user_id, profiles(*)')
      .eq('token', token)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (!session) return res.status(401).json({ error: 'Session expired' });

    const updates: any = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (timezone !== undefined) updates.timezone = timezone;
    if (avatar_color !== undefined) updates.avatar_color = avatar_color;

    const { data: updated, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', session.user_id)
      .select()
      .single();

    if (error) throw error;

    const oldProfile = session.profiles as any;
    await supabase.from('audit_log').insert({
      user_id: session.user_id,
      user_name: updated.name,
      user_phone: updated.phone,
      action: 'update',
      entity_type: 'user',
      entity_id: session.user_id,
      entity_name: 'Profile',
      old_data: { name: oldProfile?.name, timezone: oldProfile?.timezone },
      new_data: { name: updated.name, timezone: updated.timezone },
    });

    return res.status(200).json({ success: true, profile: updated });
  } catch (err: any) {
    console.error('update-profile error:', err);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
}
