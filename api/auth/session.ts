import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const { data: session } = await supabase
      .from('sessions')
      .select('*, profiles(*)')
      .eq('token', token)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (!session) return res.status(401).json({ error: 'Session expired or invalid' });

    // Update last_used
    await supabase.from('sessions').update({ last_used: new Date().toISOString() }).eq('token', token);

    return res.status(200).json({ valid: true, profile: session.profiles });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid session' });
  }
}
