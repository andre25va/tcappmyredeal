import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID!;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
const FROM_SMS = process.env.TWILIO_PHONE_NUMBER!;
const FROM_WA = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

async function sendTwilioMessage(to: string, body: string, channel: 'sms' | 'whatsapp') {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
  const toFormatted = channel === 'whatsapp' ? `whatsapp:${to}` : to;
  const fromFormatted = channel === 'whatsapp' ? FROM_WA : FROM_SMS;
  const params = new URLSearchParams({ To: toFormatted, From: fromFormatted, Body: body });
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

async function handleSend(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const {
    conversation_id, deal_id, recipients, body, type = 'direct',
    channel = 'sms', need_reply = false,
  } = req.body as {
    conversation_id?: string; deal_id?: string;
    recipients: Array<{ contact_id: string; name: string; phone: string }>;
    body: string; type?: 'direct' | 'broadcast' | 'group';
    channel?: 'sms' | 'whatsapp'; need_reply?: boolean;
  };
  if (!recipients?.length || !body) return res.status(400).json({ error: 'recipients and body required' });
  try {
    let convId = conversation_id;
    const now = new Date().toISOString();
    if (!convId) {
      const convName = type === 'direct' ? recipients[0].name : recipients.map(r => r.name.split(' ')[0]).join(', ');
      const { data: conv, error: convErr } = await supabase.from('conversations').insert({
        name: convName, deal_id: deal_id || null, type, channel, participants: recipients,
        last_message_at: now, last_message_preview: body.substring(0, 80), unread_count: 0,
        waiting_for_reply: need_reply, waiting_since: need_reply ? now : null,
      }).select().single();
      if (convErr) throw convErr;
      convId = conv.id;
    } else {
      await supabase.from('conversations').update({
        last_message_at: now, last_message_preview: body.substring(0, 80),
        ...(need_reply ? { waiting_for_reply: true, waiting_since: now } : {}),
      }).eq('id', convId);
    }
    const results: any[] = [], errors: any[] = [];
    for (const recipient of recipients) {
      const phone = recipient.phone.replace(/\D/g, '');
      const e164 = phone.startsWith('1') ? `+${phone}` : `+1${phone}`;
      try {
        const twilioResp = await sendTwilioMessage(e164, body, channel);
        const { data: msg } = await supabase.from('messages').insert({
          conversation_id: convId, deal_id: deal_id || null, contact_id: recipient.contact_id,
          direction: 'outbound', channel, body, status: 'sent',
          from_number: channel === 'whatsapp' ? FROM_WA : FROM_SMS,
          to_number: e164, external_message_id: twilioResp.sid, sent_at: now, need_reply,
        }).select().single();
        results.push({ contact_id: recipient.contact_id, name: recipient.name, message_id: msg?.id });
      } catch (err: any) {
        errors.push({ contact_id: recipient.contact_id, name: recipient.name, error: err.message });
      }
    }
    return res.json({ conversation_id: convId, sent: results, errors });
  } catch (err: any) {
    console.error('Message send error:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function handleConversations(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      const { conversation_id, deal_id } = req.query as Record<string, string>;
      if (conversation_id) {
        const { data: messages, error } = await supabase
          .from('messages').select('*, contacts(first_name, last_name, phone, contact_type)')
          .eq('conversation_id', conversation_id).order('sent_at', { ascending: true });
        if (error) throw error;
        await supabase.from('conversations').update({ unread_count: 0 }).eq('id', conversation_id);
        return res.json({ messages });
      }
      let q = supabase.from('conversations')
        .select('*, deals(property_address, city, state, pipeline_stage)')
        .order('last_message_at', { ascending: false });
      if (deal_id) q = q.eq('deal_id', deal_id);
      const { data: conversations, error } = await q;
      if (error) throw error;
      return res.json({ conversations });
    }
    if (req.method === 'DELETE') {
      const { conversation_id } = req.body as { conversation_id: string };
      if (!conversation_id) return res.status(400).json({ error: 'conversation_id required' });
      await supabase.from('messages').delete().eq('conversation_id', conversation_id);
      await supabase.from('conversations').delete().eq('id', conversation_id);
      return res.json({ success: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('Conversations error:', err);
    return res.status(500).json({ error: err.message });
  }
}


async function handleInbound(req: VercelRequest, res: VercelResponse) {
  // Twilio sends inbound messages as form-encoded POST
  const rawFrom = String(req.body?.From || '').trim();
  const rawTo = String(req.body?.To || '').trim();
  const body = String(req.body?.Body || '').trim();
  const messageSid = String(req.body?.MessageSid || '').trim();

  const channel: 'sms' | 'whatsapp' = rawFrom.startsWith('whatsapp:') ? 'whatsapp' : 'sms';
  const fromPhone = rawFrom.replace('whatsapp:', '');
  const toPhone = rawTo.replace('whatsapp:', '');

  try {
    const now = new Date().toISOString();

    // Find contact by phone number
    const normalised = fromPhone.replace(/\D/g, '');
    const e164 = normalised.startsWith('1') ? `+${normalised}` : `+1${normalised}`;
    const { data: contact } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, phone')
      .or(`phone.eq.${fromPhone},phone.eq.${e164}`)
      .limit(1)
      .single();

    const contactId: string | null = contact?.id ?? null;
    const fromName = contact
      ? [contact.first_name, contact.last_name].filter(Boolean).join(' ')
      : fromPhone;

    // Find most recent conversation for this contact/channel
    let convId: string | null = null;
    if (contactId) {
      const { data: recentMsg } = await supabase
        .from('messages')
        .select('conversation_id')
        .eq('contact_id', contactId)
        .eq('channel', channel)
        .order('sent_at', { ascending: false })
        .limit(1)
        .single();
      if (recentMsg) convId = recentMsg.conversation_id;
    }

    if (!convId) {
      // Create a new conversation
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({
          name: fromName,
          type: 'direct',
          channel,
          participants: contactId
            ? [{ contact_id: contactId, name: fromName, phone: fromPhone }]
            : [{ contact_id: null, name: fromName, phone: fromPhone }],
          last_message_at: now,
          last_message_preview: body.substring(0, 80),
          unread_count: 1,
          waiting_for_reply: false,
        })
        .select()
        .single();
      convId = newConv?.id ?? null;
    } else {
      // Increment unread and update preview
      const { data: conv } = await supabase
        .from('conversations')
        .select('unread_count')
        .eq('id', convId)
        .single();
      await supabase
        .from('conversations')
        .update({
          last_message_at: now,
          last_message_preview: body.substring(0, 80),
          unread_count: (conv?.unread_count ?? 0) + 1,
        })
        .eq('id', convId);
    }

    if (convId) {
      // Insert the inbound message
      await supabase.from('messages').insert({
        conversation_id: convId,
        contact_id: contactId,
        direction: 'inbound',
        channel,
        body,
        status: 'received',
        from_number: fromPhone,
        to_number: toPhone,
        external_message_id: messageSid,
        sent_at: now,
      });

      // Write a notification so the bell lights up
      await supabase.from('notifications').insert({
        type: channel,
        title: `${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} from ${fromName}`,
        body: body.length > 120 ? body.substring(0, 117) + '…' : body,
        from_name: fromName,
        from_identifier: fromPhone,
        conversation_id: convId,
        contact_id: contactId,
        is_read: false,
      });
    }
  } catch (err: any) {
    console.error('Inbound SMS error:', err);
  }

  // Always return empty TwiML to prevent Twilio error messages
  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send('<Response></Response>');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;
  if (action === 'send') return handleSend(req, res);
  if (action === 'inbound') return handleInbound(req, res);
  return handleConversations(req, res);
}
