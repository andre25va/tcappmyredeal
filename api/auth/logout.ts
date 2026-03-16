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
  if (!token) return res.status(400).json({ error: 'No token' });

  try {
    const { data: session } = await supabase
      .from('sessions')
      .select('*, profiles(id, name, phone)')
      .eq('token', token)
      .single();

    await supabase.from('sessions').delete().eq('token', token);

    if (session?.profiles) {
      await supabase.from('audit_log').insert({
        user_id: session.profiles.id,
        user_name: session.profiles.name,
        user_phone: session.profiles.phone,
        action: 'logout',
        entity_type: 'user',
        entity_id: session.profiles.id,
        entity_name: session.profiles.name,
      });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Logout failed' });
  }
}
