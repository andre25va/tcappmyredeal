import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';
import nodemailer from 'nodemailer';
import { randomUUID } from 'crypto';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

const DEMO_PHONE = '+17085069000';

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  const maskedLocal = local.slice(0, 3) + '***';
  const domainParts = domain.split('.');
  const maskedDomain = domainParts[0].slice(0, 3) + '***.' + domainParts.slice(1).join('.');
  return `${maskedLocal}@${maskedDomain}`;
}

function parseDeviceLabel(ua: string): string {
  if (!ua) return 'Unknown device';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android device';
  if (/Mac/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows PC';
  if (/Linux/i.test(ua)) return 'Linux device';
  return 'Another device';
}

async function handleRequestOtp(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { phone, delivery = 'sms' } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'Phone number required' });
  const normalized = normalizePhone(phone);
  try {
    const { count: whitelistCount } = await supabase.from('allowed_phones').select('*', { count: 'exact', head: true });
    let allowedEntry: any = null;
    if ((whitelistCount ?? 0) > 0) {
      const { data: allowed } = await supabase.from('allowed_phones').select('id, email, is_demo').eq('phone', normalized).single();
      if (!allowed) return res.status(403).json({ error: 'This phone number is not authorized. Contact your admin.' });
      allowedEntry = allowed;
    }
    if (allowedEntry?.is_demo) return res.status(400).json({ error: 'Use the Demo Access button to log in.' });
    await supabase.from('otp_codes').update({ used: true }).eq('phone', normalized).eq('used', false);
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await supabase.from('otp_codes').insert({ phone: normalized, code, expires_at: expiresAt });
    if (delivery === 'email') {
      if (!allowedEntry?.email) return res.status(400).json({ error: 'No email address on file for this number.' });
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com', port: 587, secure: false,
        auth: { user: 'tc@myredeal.com', pass: process.env.GMAIL_APP_PASSWORD },
      });
      await transporter.sendMail({
        from: 'TC Command <tc@myredeal.com>',
        to: allowedEntry.email,
        subject: 'Your TC Command Login Code',
        html: `<div style="font-family: sans-serif; max-width: 420px; margin: 0 auto; padding: 32px 24px;">
          <div style="margin-bottom: 24px;">
            <span style="font-size: 18px; font-weight: 700; color: #111827;">TC Command</span>
          </div>
          <p style="color: #374151; font-size: 15px; margin-bottom: 8px;">Your login verification code:</p>
          <div style="background: #f3f4f6; border-radius: 12px; padding: 24px; text-align: center; margin: 16px 0 24px;">
            <span style="font-size: 40px; font-weight: 700; letter-spacing: 10px; color: #111827; font-family: monospace;">${code}</span>
          </div>
          <p style="color: #6b7280; font-size: 13px;">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #9ca3af; font-size: 12px;">MyReDeal &middot; TC Command</p>
        </div>`,
      });
      return res.status(200).json({ success: true, message: 'Code sent to email!', emailHint: maskEmail(allowedEntry.email) });
    } else {
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await client.messages.create({
        body: `Your TC Command login code is: ${code}\n\nExpires in 10 minutes. Do not share this code.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: normalized,
      });
      return res.status(200).json({ success: true, message: 'Code sent!' });
    }
  } catch (err: any) {
    console.error('request-otp error:', err);
    return res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
  }
}

async function handleVerifyOtp(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { phone, code, force = false } = req.body || {};
  if (!phone || !code) return res.status(400).json({ error: 'Phone and code required' });
  const normalized = normalizePhone(phone);
  const isDemo = normalized === DEMO_PHONE;
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket?.remoteAddress || '';
  const ua = req.headers['user-agent'] || '';
  try {
    const { data: otp } = await supabase.from('otp_codes').select('*').eq('phone', normalized).eq('used', false)
      .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).single();
    if (!otp) return res.status(400).json({ error: 'Code expired or not found. Request a new one.' });
    await supabase.from('otp_codes').update({ attempts: otp.attempts + 1 }).eq('id', otp.id);
    if (otp.attempts >= 5) {
      await supabase.from('otp_codes').update({ used: true }).eq('id', otp.id);
      return res.status(400).json({ error: 'Too many attempts. Please request a new code.' });
    }
    if (otp.code !== String(code).trim()) return res.status(400).json({ error: 'Incorrect code. Please try again.' });
    await supabase.from('otp_codes').update({ used: true }).eq('id', otp.id);
    const { count: whitelistCount } = await supabase.from('allowed_phones').select('*', { count: 'exact', head: true });
    const isBootstrap = (whitelistCount ?? 0) === 0;
    let { data: profile } = await supabase.from('profiles').select('*').eq('phone', normalized).single();
    const isFirstLogin = !profile;
    if (!profile) {
      const role = isBootstrap ? 'admin' : 'tc';
      const { data: newProfile, error: profileErr } = await supabase.from('profiles').insert({ phone: normalized, role, name: '' }).select().single();
      if (profileErr) throw profileErr;
      profile = newProfile;
      if (isBootstrap) await supabase.from('allowed_phones').insert({ phone: normalized, name: 'Admin', added_by: newProfile.id });
    }

    // ── Single-session enforcement (skip for demo) ──
    if (!isDemo && !force) {
      const { data: existingSessions } = await supabase
        .from('sessions')
        .select('id, ip_address, user_agent, last_used, created_at')
        .eq('user_id', profile.id)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString())
        .order('last_used', { ascending: false })
        .limit(1);
      if (existingSessions && existingSessions.length > 0) {
        const existing = existingSessions[0];
        return res.status(200).json({
          hasExistingSession: true,
          deviceLabel: parseDeviceLabel(existing.user_agent || ''),
          lastSeen: existing.last_used || existing.created_at,
        });
      }
    }

    // Invalidate all old active sessions (skip for demo)
    if (!isDemo) {
      await supabase
        .from('sessions')
        .update({ is_active: false })
        .eq('user_id', profile.id)
        .eq('is_active', true);
    }

    await supabase.from('profiles').update({ last_login: new Date().toISOString() }).eq('id', profile.id);
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('sessions').insert({ token, user_id: profile.id, expires_at: expiresAt, ip_address: ip, user_agent: ua, is_active: true });
    await supabase.from('audit_log').insert({
      user_id: profile.id, user_name: profile.name || normalized, user_phone: normalized,
      action: 'login', entity_type: 'user', entity_id: profile.id, entity_name: profile.name || normalized,
      metadata: { ip, ua, isFirstLogin, forced: force }, ip_address: ip, user_agent: ua,
    });
    return res.status(200).json({ success: true, token, profile, isFirstLogin });
  } catch (err: any) {
    console.error('verify-otp error:', err);
    return res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
}

async function handleSession(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    // Check for valid active session
    const { data: session } = await supabase
      .from('sessions')
      .select('*, profiles(*)')
      .eq('token', token)
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (!session) {
      // Check if this token was kicked out by another login
      const { data: kicked } = await supabase
        .from('sessions')
        .select('id')
        .eq('token', token)
        .eq('is_active', false)
        .single();
      if (kicked) {
        return res.status(401).json({ valid: false, reason: 'other_device' });
      }
      return res.status(401).json({ error: 'Session expired or invalid' });
    }

    await supabase.from('sessions').update({ last_used: new Date().toISOString() }).eq('token', token);
    return res.status(200).json({ valid: true, profile: session.profiles });
  } catch {
    return res.status(401).json({ error: 'Invalid session' });
  }
}

async function handleLogout(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(400).json({ error: 'No token' });
  try {
    const { data: session } = await supabase.from('sessions').select('*, profiles(id, name, phone)').eq('token', token).single();
    await supabase.from('sessions').update({ is_active: false }).eq('token', token);
    if (session?.profiles) {
      const p = session.profiles as any;
      await supabase.from('audit_log').insert({
        user_id: p.id, user_name: p.name, user_phone: p.phone,
        action: 'logout', entity_type: 'user', entity_id: p.id, entity_name: p.name,
      });
    }
    return res.status(200).json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Logout failed' });
  }
}

async function handleUpdateProfile(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const { name, timezone, avatar_color } = req.body || {};
  try {
    const { data: session } = await supabase.from('sessions').select('user_id, profiles(*)').eq('token', token).eq('is_active', true).gt('expires_at', new Date().toISOString()).single();
    if (!session) return res.status(401).json({ error: 'Session expired' });
    const updates: any = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (timezone !== undefined) updates.timezone = timezone;
    if (avatar_color !== undefined) updates.avatar_color = avatar_color;
    const { data: updated, error } = await supabase.from('profiles').update(updates).eq('id', session.user_id).select().single();
    if (error) throw error;
    const oldProfile = session.profiles as any;
    await supabase.from('audit_log').insert({
      user_id: session.user_id, user_name: updated.name, user_phone: updated.phone,
      action: 'update', entity_type: 'user', entity_id: session.user_id, entity_name: 'Profile',
      old_data: { name: oldProfile?.name, timezone: oldProfile?.timezone },
      new_data: { name: updated.name, timezone: updated.timezone },
    });
    return res.status(200).json({ success: true, profile: updated });
  } catch (err: any) {
    console.error('update-profile error:', err);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
}

async function handleDemoLogin(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket?.remoteAddress || '';
  const ua = req.headers['user-agent'] || '';
  try {
    let { data: profile } = await supabase.from('profiles').select('*').eq('phone', DEMO_PHONE).single();
    if (!profile) {
      const { data: newProfile, error } = await supabase.from('profiles').insert({ phone: DEMO_PHONE, role: 'viewer', name: 'Demo User' }).select().single();
      if (error) throw error;
      profile = newProfile;
    }
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    // Demo: allow concurrent sessions (is_active = true, no invalidation of existing)
    await supabase.from('sessions').insert({ token, user_id: profile.id, expires_at: expiresAt, ip_address: ip, user_agent: ua, is_active: true });
    await supabase.from('audit_log').insert({
      user_id: profile.id, user_name: 'Demo User', user_phone: DEMO_PHONE,
      action: 'demo_login', entity_type: 'user', entity_id: profile.id, entity_name: 'Demo User',
      metadata: { ip, ua }, ip_address: ip, user_agent: ua,
    });
    return res.status(200).json({ success: true, token, profile, isFirstLogin: false });
  } catch (err: any) {
    console.error('demo-login error:', err);
    return res.status(500).json({ error: 'Demo login failed. Please try again.' });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;
  switch (action) {
    case 'request-otp': return handleRequestOtp(req, res);
    case 'verify-otp': return handleVerifyOtp(req, res);
    case 'session': return handleSession(req, res);
    case 'logout': return handleLogout(req, res);
    case 'update-profile': return handleUpdateProfile(req, res);
    case 'demo-login': return handleDemoLogin(req, res);
    default: return res.status(404).json({ error: `Unknown auth action: ${action}` });
  }
}
