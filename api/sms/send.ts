import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID!;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER!;

async function sendTwilioSms(to: string, body: string) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
  const params = new URLSearchParams({ To: to, From: FROM_NUMBER, Body: body });
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  const data = await resp.json() as any;
  if (!resp.ok) throw new Error(data.message || 'Twilio error');
  return data;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { conversation_id, deal_id, recipients, body, type = 'direct' } = req.body as {
    conversation_id?: string;
    deal_id?: string;
    recipients: Array<{ contact_id: string; name: string; phone: string }>;
    body: string;
    type?: 'direct' | 'broadcast' | 'group';
  };

  if (!recipients?.length || !body) {
    return res.status(400).json({ error: 'recipients and body required' });
  }

  try {
    let convId = conversation_id;

    if (!convId) {
      const convName = type === 'direct'
        ? recipients[0].name
        : recipients.map(r => r.name.split(' ')[0]).join(', ');

      const { data: conv, error: convErr } = await supabase
        .from('conversations')
        .insert({
          name: convName,
          deal_id: deal_id || null,
          type,
          channel: 'sms',
          participants: recipients,
          last_message_at: new Date().toISOString(),
          last_message_preview: body.substring(0, 80),
          unread_count: 0,
        })
        .select()
        .single();
      if (convErr) throw convErr;
      convId = conv.id;
    } else {
      await supabase
        .from('conversations')
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: body.substring(0, 80),
        })
        .eq('id', convId);
    }

    const results: any[] = [];
    const errors: any[] = [];

    for (const recipient of recipients) {
      const phone = recipient.phone.replace(/\D/g, '');
      const e164 = phone.startsWith('1') ? `+${phone}` : `+1${phone}`;

      try {
        const twilioResp = await sendTwilioSms(e164, body);
        const { data: msg } = await supabase.from('messages').insert({
          conversation_id: convId,
          deal_id: deal_id || null,
          contact_id: recipient.contact_id,
          direction: 'outbound',
          channel: 'sms',
          body,
          status: 'sent',
          from_number: FROM_NUMBER,
          to_number: e164,
          external_message_id: twilioResp.sid,
          sent_at: new Date().toISOString(),
        }).select().single();
        results.push({ contact_id: recipient.contact_id, name: recipient.name, message_id: msg?.id });
      } catch (err: any) {
        errors.push({ contact_id: recipient.contact_id, name: recipient.name, error: err.message });
      }
    }

    return res.json({ conversation_id: convId, sent: results, errors });
  } catch (err: any) {
    console.error('SMS send error:', err);
    return res.status(500).json({ error: err.message });
  }
}
