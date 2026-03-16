import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket?.remoteAddress || '';
  const ua = req.headers['user-agent'] || '';

  try {
    // Get or create demo profile
    let { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('phone', '+17085069000')
      .single();

    if (!profile) {
      const { data: newProfile, error } = await supabase
        .from('profiles')
        .insert({ phone: '+17085069000', role: 'viewer', name: 'Demo User' })
        .select()
        .single();
      if (error) throw error;
      profile = newProfile;
    }

    // Create 24-hour demo session
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await supabase.from('sessions').insert({
      token,
      user_id: profile.id,
      expires_at: expiresAt,
      ip_address: ip,
      user_agent: ua,
    });

    // Audit log
    await supabase.from('audit_log').insert({
      user_id: profile.id,
      user_name: 'Demo User',
      user_phone: '+17085069000',
      action: 'demo_login',
      entity_type: 'user',
      entity_id: profile.id,
      entity_name: 'Demo User',
      metadata: { ip, ua },
      ip_address: ip,
      user_agent: ua,
    });

    return res.status(200).json({ success: true, token, profile, isFirstLogin: false });
  } catch (err: any) {
    console.error('demo-login error:', err);
    return res.status(500).json({ error: 'Demo login failed. Please try again.' });
  }
}
