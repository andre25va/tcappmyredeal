import type { VercelRequest, VercelResponse } from '@vercel/node';
const RESEND_API_KEY_AUTH = process.env.RESEND_API_KEY || '';
import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';
import { randomUUID } from 'crypto';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

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

/** Returns true if the user-agent is a desktop browser (not mobile/tablet) */
function isDesktopDevice(ua: string): boolean {
  if (!ua) return false;
  if (/iPhone|iPad|Android/i.test(ua)) return false;
  return /Mac|Windows|Linux/i.test(ua);
}

/** Verify admin token — returns userId or null */
async function requireAdmin(token: string): Promise<string | null> {
  if (!token) return null;
  try {
    // Step 1: Find the active session
    const { data: session } = await supabase
      .from('sessions')
      .select('user_id')
      .eq('token', token)
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .single();
    if (!session) return null;

    // Step 2: Check the profile's role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user_id)
      .single();
    if (!profile || profile.role !== 'admin') return null;

    return session.user_id as string;
  } catch {
    return null;
  }
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
      const { data: allowed } = await supabase.from('allowed_phones').select('id, email, is_demo, is_active').eq('phone', normalized).single();
      if (!allowed) return res.status(403).json({ error: 'This phone number is not authorized. Contact your admin.' });
      if (allowed.is_active === false) return res.status(403).json({ error: 'Your access has been suspended. Contact your admin.' });
      allowedEntry = allowed;
    }
    if (allowedEntry?.is_demo) return res.status(400).json({ error: 'Use the Demo Access button to log in.' });
    await supabase.from('otp_codes').update({ used: true }).eq('phone', normalized).eq('used', false);
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await supabase.from('otp_codes').insert({ phone: normalized, code, expires_at: expiresAt });
    if (delivery === 'email') {
      if (!allowedEntry?.email) return res.status(400).json({ error: 'No email address on file for this number.' });
      const resendResp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY_AUTH}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'TC Command <tc@myredeal.com>',
          to: [allowedEntry.email],
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
        }),
      });
      if (!resendResp.ok) {
        const resendErr = await resendResp.json() as { message?: string };
        throw new Error(resendErr.message || 'Failed to send OTP email');
      }
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

    if (!isBootstrap) {
      await supabase.from('allowed_phones').update({ profile_id: profile.id }).eq('phone', normalized);
    }


    await supabase.from('otp_codes').update({ used: true }).eq('id', otp.id);


    await supabase.from('profiles').update({ last_login: new Date().toISOString() }).eq('id', profile.id);
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('sessions').insert({ token, user_id: profile.id, expires_at: expiresAt, ip_address: ip, user_agent: ua, is_active: true });

    // If the new session is from a desktop, invalidate all other active desktop sessions
    // for this user so stale data isn't seen on old machines. Mobile sessions are left alone.
    if (isDesktopDevice(ua)) {
      const { data: existingSessions } = await supabase
        .from('sessions')
        .select('id, user_agent')
        .eq('user_id', profile.id)
        .eq('is_active', true)
        .neq('token', token);

      const staleDesktopIds = (existingSessions || [])
        .filter(s => isDesktopDevice(s.user_agent || ''))
        .map(s => s.id);

      if (staleDesktopIds.length > 0) {
        await supabase
          .from('sessions')
          .update({ is_active: false, invalidated_reason: 'new_desktop_session' })
          .in('id', staleDesktopIds);
      }
    }

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
    const { data: session } = await supabase
      .from('sessions')
      .select('*, profiles(*)')
      .eq('token', token)
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (!session) {
      // Only show 'other_device' if an admin explicitly revoked access
      const { data: kicked } = await supabase
        .from('sessions')
        .select('id, invalidated_reason')
        .eq('token', token)
        .eq('is_active', false)
        .not('invalidated_reason', 'is', null)
        .single();
      if (kicked) {
        return res.status(401).json({ valid: false, reason: 'other_device' });
      }
      return res.status(401).json({ error: 'Session expired or invalid' });
    }

    await supabase.from('sessions').update({ last_used: new Date().toISOString() }).eq('token', token);

    // Fetch org memberships for this user
    const profileData = session.profiles as any;
    const { data: memberships } = await supabase
      .from('user_org_memberships')
      .select('id, org_id, role_in_org, status, invited_at, joined_at, organizations(id, name, org_code)')
      .eq('user_id', profileData.id)
      .eq('status', 'active');

    const orgMemberships = (memberships || []).map((m: any) => ({
      membershipId: m.id,
      orgId: m.org_id,
      orgName: m.organizations?.name ?? '',
      orgCode: m.organizations?.org_code ?? '',
      roleInOrg: m.role_in_org as 'team_admin' | 'tc' | 'agent',
      status: m.status,
    }));

    return res.status(200).json({
      valid: true,
      profile: { ...profileData, orgMemberships },
    });
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

async function handleRequestDemoCode(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    // Invalidate any existing unused demo OTP codes
    await supabase.from('otp_codes').update({ used: true }).eq('phone', DEMO_PHONE).eq('used', false);

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min expiry
    await supabase.from('otp_codes').insert({ phone: DEMO_PHONE, code, expires_at: expiresAt });

    // Send to tc@myredeal.com via Resend
    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY_AUTH}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'TC Command <tc@myredeal.com>',
        to: ['tc@myredeal.com'],
        subject: 'Demo Access Code Requested',
        html: `<div style="font-family: sans-serif; max-width: 420px; margin: 0 auto; padding: 32px 24px;">
          <h2 style="color: #111827; margin-bottom: 8px;">Demo Access Requested</h2>
          <p style="color: #374151;">Someone is requesting a demo of TC Command. Share this code with them:</p>
          <div style="background: #f3f4f6; border-radius: 12px; padding: 24px; text-align: center; margin: 16px 0 24px;">
            <span style="font-size: 40px; font-weight: 700; letter-spacing: 10px; color: #111827; font-family: monospace;">${code}</span>
          </div>
          <p style="color: #6b7280; font-size: 13px;">This code expires in <strong>15 minutes</strong>. The demo session lasts 24 hours.</p>
          <p style="color: #6b7280; font-size: 13px;">If you did not expect this request, you can ignore this email.</p>
        </div>`,
      }),
    });

    if (!resendResp.ok) throw new Error('Failed to send email');

    return res.status(200).json({ success: true, message: 'Code sent to the TC team. Ask them for the code.' });
  } catch (err: any) {
    console.error('request-demo-code error:', err);
    return res.status(500).json({ error: 'Failed to send demo code. Please try again.' });
  }
}

async function handleDemoLogin(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Demo access code required.' });

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket?.remoteAddress || '';
  const ua = req.headers['user-agent'] || '';

  try {
    // Verify the OTP code for the demo phone
    const { data: otp } = await supabase
      .from('otp_codes')
      .select('*')
      .eq('phone', DEMO_PHONE)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!otp) return res.status(400).json({ error: 'Code expired or not found. Request a new one.' });

    await supabase.from('otp_codes').update({ attempts: otp.attempts + 1 }).eq('id', otp.id);
    if (otp.attempts >= 5) {
      await supabase.from('otp_codes').update({ used: true }).eq('id', otp.id);
      return res.status(400).json({ error: 'Too many attempts. Please request a new code.' });
    }

    if (otp.code !== String(code).trim()) return res.status(400).json({ error: 'Incorrect code. Please try again.' });

    await supabase.from('otp_codes').update({ used: true }).eq('id', otp.id);

    // Find or create demo profile
    let { data: profile } = await supabase.from('profiles').select('*').eq('phone', DEMO_PHONE).single();
    if (!profile) {
      const { data: newProfile, error } = await supabase.from('profiles').insert({
        phone: DEMO_PHONE, role: 'viewer', name: 'Demo User'
      }).select().single();
      if (error) throw error;
      profile = newProfile;
    }

    // IMPORTANT: Kill ALL existing active sessions for demo user (single session enforcement)
    await supabase
      .from('sessions')
      .update({ is_active: false, invalidated_reason: 'new_demo_session' })
      .eq('user_id', profile.id)
      .eq('is_active', true);

    await supabase.from('allowed_phones').update({ profile_id: profile.id }).eq('phone', DEMO_PHONE);

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
    await supabase.from('sessions').insert({
      token, user_id: profile.id, expires_at: expiresAt,
      ip_address: ip, user_agent: ua, is_active: true
    });

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

// ── User Management (admin only) ──────────────────────────────────────────────

async function handleListUsers(req: VercelRequest, res: VercelResponse) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const adminId = await requireAdmin(token);
  if (!adminId) return res.status(403).json({ error: 'Admin access required' });

  try {
    const { data: allowed } = await supabase
      .from('allowed_phones')
      .select('id, phone, name, role, email, is_demo, is_active, created_at, profile_id, added_by')
      .order('created_at');

    if (!allowed || allowed.length === 0) return res.status(200).json({ users: [] });

    const profileIds = allowed.filter(u => u.profile_id).map(u => u.profile_id as string);
    let profileMap: Record<string, any> = {};
    if (profileIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, last_login, name, timezone')
        .in('id', profileIds);
      if (profiles) profiles.forEach(p => { profileMap[p.id] = p; });
    }

    const { data: activeSessions } = await supabase
      .from('sessions')
      .select('user_id')
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString());

    const sessionCounts: Record<string, number> = {};
    if (activeSessions) {
      activeSessions.forEach(s => {
        sessionCounts[s.user_id] = (sessionCounts[s.user_id] || 0) + 1;
      });
    }

    const users = allowed.map(u => {
      const profile = u.profile_id ? profileMap[u.profile_id] : null;
      return {
        ...u,
        last_login: profile?.last_login || null,
        active_sessions: profile ? (sessionCounts[profile.id] || 0) : 0,
      };
    });

    return res.status(200).json({ users });
  } catch (err: any) {
    console.error('list-users error:', err);
    return res.status(500).json({ error: 'Failed to list users' });
  }
}

async function handleAddUser(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const adminId = await requireAdmin(token);
  if (!adminId) return res.status(403).json({ error: 'Admin access required' });

  const { phone, name, role, email, is_demo } = req.body || {};
  if (!phone || !name) return res.status(400).json({ error: 'Phone and name required' });

  const normalized = normalizePhone(phone);

  try {
    const { data: existing } = await supabase.from('allowed_phones').select('id').eq('phone', normalized).single();
    if (existing) return res.status(400).json({ error: 'This phone number is already in the system.' });

    const { data: newUser, error } = await supabase.from('allowed_phones').insert({
      phone: normalized,
      name: name.trim(),
      role: role || 'tc',
      email: email?.trim() || null,
      is_demo: is_demo || false,
      is_active: true,
      added_by: adminId,
    }).select().single();

    if (error) throw error;

    await supabase.from('audit_log').insert({
      user_id: adminId,
      action: 'add_user',
      entity_type: 'user',
      entity_id: newUser.id,
      entity_name: name,
      new_data: { phone: normalized, name, role, email, is_demo },
    });

    return res.status(200).json({ success: true, user: newUser });
  } catch (err: any) {
    console.error('add-user error:', err);
    return res.status(500).json({ error: err.message || 'Failed to add user' });
  }
}

async function handleEditUser(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const adminId = await requireAdmin(token);
  if (!adminId) return res.status(403).json({ error: 'Admin access required' });

  const { id, name, role, email, is_demo, is_active } = req.body || {};
  if (!id) return res.status(400).json({ error: 'User ID required' });

  try {
    const updates: any = {};
    if (name !== undefined) updates.name = name.trim();
    if (role !== undefined) updates.role = role;
    if (email !== undefined) updates.email = email?.trim() || null;
    if (is_demo !== undefined) updates.is_demo = is_demo;
    if (is_active !== undefined) updates.is_active = is_active;

    const { data: updated, error } = await supabase
      .from('allowed_phones')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (is_active === false && updated.profile_id) {
      await supabase
        .from('sessions')
        .update({ is_active: false, invalidated_reason: 'access_revoked' })
        .eq('user_id', updated.profile_id)
        .eq('is_active', true);
    }

    await supabase.from('audit_log').insert({
      user_id: adminId,
      action: 'edit_user',
      entity_type: 'user',
      entity_id: id,
      entity_name: updated.name,
      new_data: updates,
    });

    return res.status(200).json({ success: true, user: updated });
  } catch (err: any) {
    console.error('edit-user error:', err);
    return res.status(500).json({ error: err.message || 'Failed to update user' });
  }
}

async function handleDeleteUser(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const adminId = await requireAdmin(token);
  if (!adminId) return res.status(403).json({ error: 'Admin access required' });

  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'User ID required' });

  try {
    const { data: target } = await supabase
      .from('allowed_phones')
      .select('profile_id, name, phone')
      .eq('id', id)
      .single();

    if (!target) return res.status(404).json({ error: 'User not found' });

    if (target.profile_id === adminId) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }

    if (target.profile_id) {
      await supabase
        .from('sessions')
        .update({ is_active: false, invalidated_reason: 'user_deleted' })
        .eq('user_id', target.profile_id);
    }

    await supabase.from('allowed_phones').delete().eq('id', id);

    await supabase.from('audit_log').insert({
      user_id: adminId,
      action: 'delete_user',
      entity_type: 'user',
      entity_id: id,
      entity_name: target.name,
      metadata: { phone: target.phone },
    });

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('delete-user error:', err);
    return res.status(500).json({ error: err.message || 'Failed to delete user' });
  }
}


// ── Org Management (admin/team_admin only) ─────────────────────────────────

async function handleOrgManagement(req: VercelRequest, res: VercelResponse) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const userId = await requireAdmin(token);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  // GET: list members of an org (or all orgs for master admin)
  if (req.method === 'GET') {
    const { orgId, listOrgs } = req.query as Record<string, string>;

    if (listOrgs === 'true') {
      // Master admin: list all orgs
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, org_code, is_active, organization_type')
        .order('name');
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ orgs: data });
    }

    if (!orgId) return res.status(400).json({ error: 'orgId required' });

    const { data, error } = await supabase
      .from('user_org_memberships')
      .select('id, user_id, role_in_org, status, invited_at, joined_at, profiles(id, name, phone, role, is_active, last_login, is_master_admin)')
      .eq('org_id', orgId)
      .order('created_at');
    if (error) return res.status(500).json({ error: error.message });

    const members = (data || []).map((m: any) => ({
      membershipId: m.id,
      userId: m.user_id,
      roleInOrg: m.role_in_org,
      status: m.status,
      invitedAt: m.invited_at,
      joinedAt: m.joined_at,
      profile: m.profiles ? {
        id: m.profiles.id,
        name: m.profiles.name,
        phone: m.profiles.phone,
        role: m.profiles.role,
        isActive: m.profiles.is_active,
        lastLogin: m.profiles.last_login,
        isMasterAdmin: m.profiles.is_master_admin,
      } : null,
    }));

    return res.status(200).json({ members });
  }

  // POST: mutation actions
  if (req.method === 'POST') {
    const body = req.body as any;
    const subAction = body.action as string;

    if (subAction === 'add-member') {
      const { orgId, profileId, roleInOrg } = body;
      if (!orgId || !profileId || !roleInOrg) return res.status(400).json({ error: 'orgId, profileId, roleInOrg required' });

      const { data: existing } = await supabase
        .from('user_org_memberships')
        .select('id, status')
        .eq('org_id', orgId)
        .eq('user_id', profileId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('user_org_memberships')
          .update({ status: 'active', role_in_org: roleInOrg, joined_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ success: true, action: 'reactivated' });
      }

      const { error } = await supabase
        .from('user_org_memberships')
        .insert({
          user_id: profileId,
          org_id: orgId,
          role_in_org: roleInOrg,
          status: 'active',
          invited_at: new Date().toISOString(),
          joined_at: new Date().toISOString(),
        });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true, action: 'added' });
    }

    if (subAction === 'update-role') {
      const { membershipId, roleInOrg } = body;
      if (!membershipId || !roleInOrg) return res.status(400).json({ error: 'membershipId, roleInOrg required' });
      const { error } = await supabase
        .from('user_org_memberships')
        .update({ role_in_org: roleInOrg })
        .eq('id', membershipId);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true });
    }

    if (subAction === 'remove-member') {
      const { membershipId } = body;
      if (!membershipId) return res.status(400).json({ error: 'membershipId required' });
      const { error } = await supabase
        .from('user_org_memberships')
        .update({ status: 'inactive' })
        .eq('id', membershipId);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true });
    }

    if (subAction === 'grant-deal-access') {
      const { dealId, profileId } = body;
      if (!dealId || !profileId) return res.status(400).json({ error: 'dealId, profileId required' });
      const { error } = await supabase
        .from('deal_access')
        .upsert({ deal_id: dealId, user_id: profileId, granted_by: userId, granted_at: new Date().toISOString() },
          { onConflict: 'deal_id,user_id' });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true });
    }

    if (subAction === 'revoke-deal-access') {
      const { dealId, profileId } = body;
      if (!dealId || !profileId) return res.status(400).json({ error: 'dealId, profileId required' });
      const { error } = await supabase
        .from('deal_access')
        .delete()
        .eq('deal_id', dealId)
        .eq('user_id', profileId);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Unknown sub-action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleLookupProfile(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const adminId = await requireAdmin(token);
  if (!adminId) return res.status(401).json({ error: 'Unauthorized' });

  const { phone } = req.query as Record<string, string>;
  if (!phone) return res.status(400).json({ error: 'phone required' });

  const { data } = await supabase
    .from('profiles')
    .select('id, name, phone')
    .eq('phone', phone)
    .maybeSingle();

  return res.status(200).json({ profile: data ?? null });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;
  switch (action) {
    case 'request-otp':       return handleRequestOtp(req, res);
    case 'verify-otp':        return handleVerifyOtp(req, res);
    case 'session':           return handleSession(req, res);
    case 'logout':            return handleLogout(req, res);
    case 'update-profile':    return handleUpdateProfile(req, res);
    case 'request-demo-code': return handleRequestDemoCode(req, res);
    case 'demo-login':        return handleDemoLogin(req, res);
    case 'list-users':        return handleListUsers(req, res);
    case 'add-user':          return handleAddUser(req, res);
    case 'edit-user':         return handleEditUser(req, res);
    case 'delete-user':       return handleDeleteUser(req, res);
    case 'org-management':    return handleOrgManagement(req, res);
    case 'lookup-profile':    return handleLookupProfile(req, res);
    default: return res.status(404).json({ error: `Unknown auth action: ${action}` });
  }
}
