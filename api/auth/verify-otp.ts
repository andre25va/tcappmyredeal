import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { phone, code } = req.body || {};
  if (!phone || !code) return res.status(400).json({ error: 'Phone and code required' });

  const normalized = normalizePhone(phone);
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || '';
  const ua = req.headers['user-agent'] || '';

  try {
    // Find valid OTP
    const { data: otp } = await supabase
      .from('otp_codes')
      .select('*')
      .eq('phone', normalized)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!otp) return res.status(400).json({ error: 'Code expired or not found. Request a new one.' });

    // Increment attempts
    await supabase.from('otp_codes').update({ attempts: otp.attempts + 1 }).eq('id', otp.id);

    if (otp.attempts >= 5) {
      await supabase.from('otp_codes').update({ used: true }).eq('id', otp.id);
      return res.status(400).json({ error: 'Too many attempts. Please request a new code.' });
    }

    if (otp.code !== String(code).trim()) {
      return res.status(400).json({ error: 'Incorrect code. Please try again.' });
    }

    // Mark OTP used
    await supabase.from('otp_codes').update({ used: true }).eq('id', otp.id);

    // Check whitelist count (bootstrap logic)
    const { count: whitelistCount } = await supabase
      .from('allowed_phones')
      .select('*', { count: 'exact', head: true });

    const isBootstrap = (whitelistCount ?? 0) === 0;

    // Get or create profile
    let { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('phone', normalized)
      .single();

    const isFirstLogin = !profile;

    if (!profile) {
      const role = isBootstrap ? 'admin' : 'tc';
      const { data: newProfile, error: profileErr } = await supabase
        .from('profiles')
        .insert({ phone: normalized, role, name: '' })
        .select()
        .single();
      if (profileErr) throw profileErr;
      profile = newProfile;

      // Auto-add to whitelist if bootstrap
      if (isBootstrap) {
        await supabase.from('allowed_phones').insert({ phone: normalized, name: 'Admin', added_by: newProfile.id });
      }
    }

    // Update last login
    await supabase.from('profiles').update({ last_login: new Date().toISOString() }).eq('id', profile.id);

    // Create session
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

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
      user_name: profile.name || normalized,
      user_phone: normalized,
      action: 'login',
      entity_type: 'user',
      entity_id: profile.id,
      entity_name: profile.name || normalized,
      metadata: { ip, ua, isFirstLogin },
      ip_address: ip,
      user_agent: ua,
    });

    return res.status(200).json({
      success: true,
      token,
      profile,
      isFirstLogin,
    });
  } catch (err: any) {
    console.error('verify-otp error:', err);
    return res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
}
