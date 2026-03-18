import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

async function requireAdmin(token: string): Promise<{ ok: boolean; error?: string }> {
  if (!token) return { ok: false, error: 'Missing authorization token' };

  try {
    const { data: session, error: sErr } = await supabase
      .from('sessions')
      .select('user_id, is_active, expires_at')
      .eq('token', token)
      .single();

    if (sErr || !session) return { ok: false, error: 'Invalid or expired session' };
    if (!session.is_active) return { ok: false, error: 'Session revoked' };
    if (session.expires_at && new Date(session.expires_at) < new Date())
      return { ok: false, error: 'Session expired' };

    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user_id)
      .single();

    if (pErr || !profile) return { ok: false, error: 'Profile not found' };
    if (profile.role !== 'admin') return { ok: false, error: 'Admin access required' };

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Auth check failed' };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    const auth = await requireAdmin(token);
    if (!auth.ok) return res.status(403).json({ error: auth.error });

    // ── GET: list all states with their lookup URLs ──
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('state_license_links')
        .select('state_code, state_name, lookup_url, notes, updated_at')
        .order('state_name');

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ states: data });
    }

    // ── POST: upsert a state's lookup URL ──
    if (req.method === 'POST') {
      const { state_code, lookup_url, notes } = req.body || {};
      if (!state_code) return res.status(400).json({ error: 'state_code is required' });

      const { data, error } = await supabase
        .from('state_license_links')
        .update({ lookup_url: lookup_url || null, notes: notes || null, updated_at: new Date().toISOString() })
        .eq('state_code', state_code)
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ state: data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('[license-links] unhandled error:', err);
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
}
