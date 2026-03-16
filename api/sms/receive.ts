import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

const OPENAI_KEY = process.env.OPENAI_API_KEY!;

async function classifyMessage(contactName: string, dealAddress: string | null, messageBody: string) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 200,
      messages: [
        {
          role: 'system',
          content: `You are a TC (Transaction Coordinator) assistant. Analyze inbound messages from clients and determine:
1. Does this message contain a REQUEST or ACTION needed? (yes/no)
2. If yes, write a concise task title (under 60 chars) for the TC to act on.
3. Suggest priority: high/normal/low

Respond ONLY with JSON: {"needs_task": true/false, "task_title": "...", "priority": "high|normal|low", "auto_reply": "brief friendly acknowledgment under 100 chars"}`,
        },
        {
          role: 'user',
          content: `Contact: ${contactName}${dealAddress ? ` (Deal: ${dealAddress})` : ''}\nMessage: "${messageBody}"`,
        },
      ],
    }),
  });
  const data = await resp.json() as any;
  try {
    return JSON.parse(data.choices[0].message.content);
  } catch {
    return { needs_task: false, auto_reply: 'Got it! I\'ll get back to you shortly.' };
  }
}

async function sendTwilioReply(to: string, body: string, isWhatsApp: boolean) {
  const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID!;
  const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
  const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER!;
  // For WhatsApp: use sandbox number or approved WA number
  const WA_FROM = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;

  const toFormatted = isWhatsApp ? `whatsapp:${to}` : to;
  const fromFormatted = isWhatsApp ? WA_FROM : FROM_NUMBER;

  const params = new URLSearchParams({ To: toFormatted, From: fromFormatted, Body: body });
  await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const { From, Body, MessageSid } = req.body as { From: string; Body: string; MessageSid: string };

  try {
    // Detect channel — WhatsApp messages arrive as "whatsapp:+1xxxxxxxxxx"
    const isWhatsApp = From && From.startsWith('whatsapp:');
    const fromPhone = isWhatsApp ? From.replace('whatsapp:', '') : From;
    const channel: 'sms' | 'whatsapp' = isWhatsApp ? 'whatsapp' : 'sms';

    // 1. Match inbound number to a contact (normalize to digits for comparison)
    const fromClean = fromPhone.replace(/\D/g, '');
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, phone')
      .not('phone', 'is', null);

    let matchedContact: any = null;
    for (const c of contacts || []) {
      const cPhone = (c.phone || '').replace(/\D/g, '');
      if (cPhone && fromClean.endsWith(cPhone) || cPhone.endsWith(fromClean.slice(-10))) {
        matchedContact = c;
        break;
      }
    }

    const contactName = matchedContact
      ? `${matchedContact.first_name} ${matchedContact.last_name}`
      : fromPhone;

    // 2. Find related deal
    let relatedDeal: any = null;
    if (matchedContact) {
      const { data: deals } = await supabase
        .from('deals')
        .select('id, property_address, pipeline_stage')
        .eq('status', 'active')
        .limit(10);

      for (const deal of deals || []) {
        const { data: fullDeal } = await supabase
          .from('deals')
          .select('deal_data')
          .eq('id', deal.id)
          .single();
        const dd = fullDeal?.deal_data as any;
        if (dd?.contacts?.some((c: any) => c.id === matchedContact.id || c.phone?.replace(/\D/g, '').endsWith(fromClean.slice(-10)))) {
          relatedDeal = deal;
          break;
        }
      }
    }

    // 3. Find or create conversation (match by channel + contact)
    let conversation: any = null;
    if (matchedContact) {
      const { data: existing } = await supabase
        .from('conversations')
        .select('*')
        .eq('channel', channel)
        .eq('type', 'direct')
        .contains('participants', JSON.stringify([{ contact_id: matchedContact.id }]))
        .order('last_message_at', { ascending: false })
        .limit(1);
      conversation = existing?.[0];
    }

    if (!conversation) {
      // Also try matching by phone number in participants
      const { data: byPhone } = await supabase
        .from('conversations')
        .select('*')
        .eq('channel', channel)
        .eq('type', 'direct')
        .order('last_message_at', { ascending: false })
        .limit(20);

      for (const conv of byPhone || []) {
        const participants = conv.participants as any[];
        if (participants?.some((p: any) => p.phone?.replace(/\D/g, '').endsWith(fromClean.slice(-10)))) {
          conversation = conv;
          break;
        }
      }
    }

    if (!conversation) {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({
          name: contactName,
          deal_id: relatedDeal?.id || null,
          type: 'direct',
          channel,
          participants: matchedContact
            ? [{ contact_id: matchedContact.id, name: contactName, phone: fromPhone }]
            : [{ contact_id: null, name: contactName, phone: fromPhone }],
          last_message_at: new Date().toISOString(),
          last_message_preview: Body.substring(0, 80),
          unread_count: 1,
        })
        .select()
        .single();
      conversation = newConv;
    } else {
      await supabase
        .from('conversations')
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: Body.substring(0, 80),
          unread_count: (conversation.unread_count || 0) + 1,
        })
        .eq('id', conversation.id);
    }

    // 4. Save inbound message
    await supabase.from('messages').insert({
      conversation_id: conversation?.id || null,
      deal_id: relatedDeal?.id || null,
      contact_id: matchedContact?.id || null,
      direction: 'inbound',
      channel,
      body: Body,
      status: 'received',
      from_number: fromPhone,
      to_number: process.env.TWILIO_PHONE_NUMBER,
      external_message_id: MessageSid,
      sent_at: new Date().toISOString(),
    });

    // 5. AI classify and auto-create task
    const ai = await classifyMessage(contactName, relatedDeal?.property_address || null, Body);

    let createdTaskId: string | null = null;
    if (ai.needs_task && relatedDeal) {
      const { data: task } = await supabase
        .from('tasks')
        .insert({
          deal_id: relatedDeal.id,
          title: ai.task_title || `Reply to ${contactName}: "${Body.substring(0, 40)}..."`,
          description: `Inbound ${channel.toUpperCase()} from ${contactName} (${fromPhone}): "${Body}"`,
          category: 'Communication',
          status: 'pending',
          priority: ai.priority || 'normal',
          due_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        })
        .select()
        .single();
      createdTaskId = task?.id || null;
    }

    // 6. Auto-reply to client (same channel they used)
    const autoReply = ai.auto_reply || 'Thanks for reaching out! We\'ll get back to you shortly. 🏠';
    await sendTwilioReply(fromPhone, autoReply, isWhatsApp);

    // Save auto-reply message
    const WA_FROM = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
    await supabase.from('messages').insert({
      conversation_id: conversation?.id || null,
      deal_id: relatedDeal?.id || null,
      contact_id: matchedContact?.id || null,
      direction: 'outbound',
      channel,
      body: autoReply,
      status: 'sent',
      from_number: isWhatsApp ? WA_FROM : process.env.TWILIO_PHONE_NUMBER,
      to_number: fromPhone,
      auto_created_task_id: createdTaskId,
      sent_at: new Date().toISOString(),
    });

    // Twilio expects TwiML response
    res.setHeader('Content-Type', 'text/xml');
    return res.send('<Response></Response>');
  } catch (err: any) {
    console.error('Message receive error:', err);
    res.setHeader('Content-Type', 'text/xml');
    return res.send('<Response></Response>');
  }
}
