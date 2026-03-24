import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const sb = () =>
  createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!
  );

/**
 * POST /api/callbacks/initiate
 * Initiates a two-leg call:
 *   1. Twilio calls the TC (staffPhone) first
 *   2. When TC answers, TwiML dials the contact (contactPhone)
 *
 * Body: { contactPhone, staffPhone, contactName?, dealId?, contactId?, profileId? }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { contactPhone, staffPhone, contactName, dealId, contactId, profileId } = req.body || {};

  if (!contactPhone || !staffPhone) {
    return res.status(400).json({ error: 'contactPhone and staffPhone are required' });
  }

  const accountSid  = process.env.TWILIO_ACCOUNT_SID;
  const authToken   = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !twilioPhone) {
    console.error('callbacks/initiate: missing Twilio credentials');
    return res.status(500).json({ error: 'Twilio credentials not configured' });
  }

  // Normalize phone to E.164 (add +1 if missing country code)
  const normalizePhone = (phone: string): string => {
    const digits = phone.replace(/\D/g, '');
    if (phone.startsWith('+')) return phone;
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return `+${digits}`;
  };

  const toPhone   = normalizePhone(staffPhone);
  const fromPhone = twilioPhone;
  const contactE164 = normalizePhone(contactPhone);

  const baseUrl      = 'https://tcappmyredeal.vercel.app';
  const twimlUrl     = `${baseUrl}/api/callbacks/twiml?contactPhone=${encodeURIComponent(contactE164)}&contactName=${encodeURIComponent(contactName || 'Contact')}`;
  const statusCbUrl  = `${baseUrl}/api/callbacks/status`;

  const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  const params = new URLSearchParams({
    To:             toPhone,
    From:           fromPhone,
    Url:            twimlUrl,
    StatusCallback: statusCbUrl,
    StatusCallbackMethod: 'POST',
    StatusCallbackEvent: 'initiated ringing in-progress completed busy no-answer canceled failed',
  });

  try {
    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      }
    );

    if (!twilioRes.ok) {
      const errText = await twilioRes.text();
      console.error('Twilio call creation failed:', twilioRes.status, errText);
      return res.status(500).json({ error: 'Failed to initiate call', details: errText });
    }

    const data = await twilioRes.json();
    const callSid = data.sid as string;

    console.log(`Call initiated to TC ${toPhone}, SID: ${callSid}`);

    // ── Log call to Supabase ───────────────────────────────────────────────────
    try {
      const supabase = sb();
      const { error: insertErr } = await supabase.from('call_logs').insert({
        call_sid:     callSid,
        deal_id:      dealId   || null,
        contact_id:   contactId || null,
        direction:    'outbound',
        to_number:    contactE164,
        from_number:  fromPhone,
        status:       'initiated',
        initiated_by: profileId || null,
        started_at:   new Date().toISOString(),
      });
      if (insertErr) console.error('call_logs insert error:', insertErr.message);
    } catch (dbErr: any) {
      console.error('call_logs insert exception:', dbErr?.message);
    }

    return res.status(200).json({ callSid, staffCallSid: callSid });
  } catch (err: any) {
    console.error('Failed to initiate call:', err);
    return res.status(500).json({ error: err.message });
  }
}
