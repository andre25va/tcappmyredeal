// api/onboard.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID!;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
const FROM_SMS = process.env.TWILIO_PHONE_NUMBER!;
const FROM_WA = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

async function sendTwilio(to: string, body: string, channel: 'sms' | 'whatsapp') {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
  const toFmt = channel === 'whatsapp' ? `whatsapp:${to}` : to;
  const fromFmt = channel === 'whatsapp' ? FROM_WA : FROM_SMS;
  const params = new URLSearchParams({ To: toFmt, From: fromFmt, Body: body });
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  if (!resp.ok) {
    const data = await resp.json() as any;
    throw new Error(data.message || 'Twilio error');
  }
  return resp.json();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.query as { action: string };

  // ── action=start-sms ──────────────────────────────────────────────────────
  if (action === 'start-sms') {
    const { phone, contact_id, contact_name, channel = 'sms', initiated_by } = req.body as {
      phone: string; contact_id?: string; contact_name?: string;
      channel?: 'sms' | 'whatsapp'; initiated_by?: string;
    };
    if (!phone) return res.status(400).json({ error: 'phone required' });

    const raw = phone.replace(/\D/g, '');
    const e164 = raw.startsWith('1') ? `+${raw}` : `+1${raw}`;

    // Cancel any existing active session for this phone
    await supabase.from('onboarding_sessions')
      .update({ status: 'abandoned' })
      .eq('phone_e164', e164)
      .eq('status', 'active');

    // Create new session
    const { data: session, error } = await supabase.from('onboarding_sessions').insert({
      phone_e164: e164,
      channel,
      step: 'greeting',
      collected: {},
      contact_id: contact_id || null,
      initiated_by: initiated_by || null,
      status: 'active',
    }).select().single();

    if (error) return res.status(500).json({ error: error.message });

    const greeting = contact_name
      ? `Hi ${contact_name.split(' ')[0]}! 👋 I'm your TC at MyReDeal. I'll set up your TC Command account in just a few quick steps.\n\nReply YES to get started (or STOP to skip).`
      : `Hi! 👋 I'm your TC at MyReDeal. I'll set up your TC Command account in just a few quick steps.\n\nReply YES to get started (or STOP to skip).`;

    await sendTwilio(e164, greeting, channel);
    return res.json({ success: true, session_id: session.id });
  }

  // ── action=send-form ──────────────────────────────────────────────────────
  if (action === 'send-form') {
    const { phone, contact_name, channel = 'sms', form_url } = req.body as {
      phone: string; contact_name?: string; channel?: 'sms' | 'whatsapp'; form_url?: string;
    };
    if (!phone) return res.status(400).json({ error: 'phone required' });

    const raw = phone.replace(/\D/g, '');
    const e164 = raw.startsWith('1') ? `+${raw}` : `+1${raw}`;
    const url = form_url || 'https://form.jotform.com/260755368659069';
    const firstName = contact_name ? contact_name.split(' ')[0] : 'there';

    const msg = `Hi ${firstName}! 👋 Welcome to TC Command by MyReDeal.\n\nPlease fill out this quick onboarding form so we can get your account set up:\n${url}\n\nShould take less than 2 minutes! 🏠`;
    await sendTwilio(e164, msg, channel);
    return res.json({ success: true });
  }

  return res.status(400).json({ error: 'Invalid action. Use start-sms or send-form.' });
}
