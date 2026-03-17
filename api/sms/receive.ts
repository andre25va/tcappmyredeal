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
    const isWhatsApp = From && From.startsWith('whatsapp:');
    const fromPhone = isWhatsApp ? From.replace('whatsapp:', '') : From;
    const channel: 'sms' | 'whatsapp' = isWhatsApp ? 'whatsapp' : 'sms';
    const fromClean = fromPhone.replace(/\D/g, '');
    const fromE164 = fromClean.startsWith('1') ? `+${fromClean}` : `+1${fromClean}`;

    // 1. Match contact — try contact_phone_channels first (trusted registry)
    let matchedContact: any = null;
    const { data: phoneChannel } = await supabase
      .from('contact_phone_channels')
      .select('contact_id, contacts(id, first_name, last_name, phone)')
      .eq('phone_e164', fromE164)
      .eq('status', 'active')
      .limit(1)
      .single();

    if (phoneChannel?.contacts) {
      matchedContact = phoneChannel.contacts;
    }

    // Fall back to fuzzy phone match on contacts table
    if (!matchedContact) {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, phone')
        .not('phone', 'is', null);

      for (const c of contacts || []) {
        const cPhone = (c.phone || '').replace(/\D/g, '');
        if (cPhone && (fromClean.endsWith(cPhone) || cPhone.endsWith(fromClean.slice(-10)))) {
          matchedContact = c;
          break;
        }
      }
    }

    const contactName = matchedContact
      ? `${matchedContact.first_name} ${matchedContact.last_name}`
      : fromPhone;

    // 2. Find related deal via deal_participants join
    let relatedDeal: any = null;
    if (matchedContact) {
      const { data: participants } = await supabase
        .from('deal_participants')
        .select('deal_id')
        .eq('contact_id', matchedContact.id);
      const relatedDealIds = (participants || []).map((p: any) => p.deal_id);
      if (relatedDealIds.length > 0) {
        const { data: deals } = await supabase
          .from('deals')
          .select('id, property_address, pipeline_stage, closing_date, city, state')
          .in('id', relatedDealIds)
          .eq('status', 'active')
          .limit(1);
        relatedDeal = deals?.[0] || null;
      }
    }

    // ── SMS Commands ──────────────────────────────────────────────────────────
    const bodyUpper = Body.trim().toUpperCase();

    // HELP command
    if (bodyUpper === 'HELP') {
      await sendTwilioReply(fromPhone, '📋 TC Command:\n• OPEN FILES - list your active deals\n• STATUS <address> - get deal update\n• CALL ME - request a callback\n• Or just text us anything! 🏠', isWhatsApp);
      res.setHeader('Content-Type', 'text/xml');
      return res.send('<Response></Response>');
    }

    // OPEN FILES command
    if (bodyUpper === 'OPEN FILES') {
      if (!matchedContact) {
        await sendTwilioReply(fromPhone, "We don't recognize this number. Please text us your name and we'll get you set up! 🏠", isWhatsApp);
      } else {
        const { data: parts } = await supabase
          .from('deal_participants').select('deal_id').eq('contact_id', matchedContact.id);
        const dIds = (parts || []).map((p: any) => p.deal_id);
        if (dIds.length > 0) {
          const { data: deals } = await supabase
            .from('deals')
            .select('property_address, pipeline_stage, closing_date')
            .in('id', dIds).eq('status', 'active');
          if (deals && deals.length > 0) {
            const list = deals.map((d: any, i: number) => {
              const closing = d.closing_date ? new Date(d.closing_date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : 'TBD';
              return `${i + 1}. ${d.property_address} (${d.pipeline_stage}) - Closing: ${closing}`;
            }).join('\n');
            await sendTwilioReply(fromPhone, `📂 Your active files:\n${list}\n\nReply STATUS <address> for details.`, isWhatsApp);
          } else {
            await sendTwilioReply(fromPhone, 'No active files found. Text us if you need help! 🏠', isWhatsApp);
          }
        } else {
          await sendTwilioReply(fromPhone, 'No active files found. Text us if you need help! 🏠', isWhatsApp);
        }
      }
      await supabase.from('communication_events').insert({
        contact_id: matchedContact?.id || null,
        channel: channel,
        direction: 'inbound',
        event_type: 'sms_command',
        summary: 'OPEN FILES command',
        source_ref: MessageSid,
      });
      res.setHeader('Content-Type', 'text/xml');
      return res.send('<Response></Response>');
    }

    // STATUS <address> command
    if (bodyUpper.startsWith('STATUS ')) {
      const searchQuery = Body.trim().substring(7).toLowerCase();
      if (matchedContact) {
        const { data: parts } = await supabase
          .from('deal_participants').select('deal_id').eq('contact_id', matchedContact.id);
        const dIds = (parts || []).map((p: any) => p.deal_id);
        if (dIds.length > 0) {
          const { data: deals } = await supabase
            .from('deals')
            .select('id, property_address, pipeline_stage, closing_date, city, state')
            .in('id', dIds).eq('status', 'active');
          const match = (deals || []).find((d: any) => d.property_address.toLowerCase().includes(searchQuery));
          if (match) {
            const closing = match.closing_date ? new Date(match.closing_date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : 'TBD';
            const summary = `📋 ${match.property_address}\nStatus: ${match.pipeline_stage}\nClosing: ${closing}\nCity: ${match.city || ''}, ${match.state || ''}\n\nText us if you have questions! 🏠`;
            await sendTwilioReply(fromPhone, summary, isWhatsApp);
          } else {
            await sendTwilioReply(fromPhone, `Couldn't find a deal matching "${Body.trim().substring(7)}". Try OPEN FILES to see your active deals.`, isWhatsApp);
          }
        }
      } else {
        await sendTwilioReply(fromPhone, "We don't recognize this number. Text us your name and we'll get you set up! 🏠", isWhatsApp);
      }
      await supabase.from('communication_events').insert({
        contact_id: matchedContact?.id || null,
        channel: channel,
        direction: 'inbound',
        event_type: 'sms_command',
        summary: `STATUS command: ${searchQuery}`,
        source_ref: MessageSid,
      });
      res.setHeader('Content-Type', 'text/xml');
      return res.send('<Response></Response>');
    }

    // CALL ME command
    if (bodyUpper === 'CALL ME') {
      await supabase.from('callback_requests').insert({
        caller_contact_id: matchedContact?.id || null,
        phone_e164: fromE164,
        requested_by_channel: 'sms',
        reason: 'Requested via SMS CALL ME command',
        priority: 'normal',
        status: 'open',
      });
      await supabase.from('communication_events').insert({
        contact_id: matchedContact?.id || null,
        channel: channel,
        direction: 'inbound',
        event_type: 'callback_request',
        summary: 'CALL ME command - callback requested',
        source_ref: MessageSid,
      });
      await sendTwilioReply(fromPhone, '✅ Callback requested! A team member will call you back shortly. 📞', isWhatsApp);
      res.setHeader('Content-Type', 'text/xml');
      return res.send('<Response></Response>');
    }

    // ── End SMS Commands — continue to AI classification ──────────────────────

    // 3. Find or create conversation
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

    const now = new Date().toISOString();

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
          last_message_at: now,
          last_message_preview: Body.substring(0, 80),
          unread_count: 1,
          waiting_for_reply: false,
          waiting_since: null,
        })
        .select()
        .single();
      conversation = newConv;
    } else {
      // ✅ KEY: Clear waiting_for_reply when they reply back
      await supabase
        .from('conversations')
        .update({
          last_message_at: now,
          last_message_preview: Body.substring(0, 80),
          unread_count: (conversation.unread_count || 0) + 1,
          waiting_for_reply: false,
          waiting_since: null,
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
      sent_at: now,
    });

    // Create notification for inbound message
    await supabase.from('notifications').insert({
      type: channel,
      title: `New ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} from ${contactName}`,
      body: Body.substring(0, 200),
      from_name: contactName,
      from_identifier: fromPhone,
      conversation_id: conversation?.id || null,
      deal_id: relatedDeal?.id || null,
      contact_id: matchedContact?.id || null,
    });

    // 5. AI classify and auto-create comm task
    const ai = await classifyMessage(contactName, relatedDeal?.property_address || null, Body);

    let createdTaskId: string | null = null;
    if (ai.needs_task) {
      const { data: task } = await supabase
        .from('comm_tasks')
        .insert({
          title: ai.task_title || `Reply to ${contactName}: "${Body.substring(0, 40)}..."`,
          description: `Inbound ${channel.toUpperCase()} from ${contactName} (${fromPhone}): "${Body}"`,
          channel,
          contact_id: matchedContact?.id || null,
          deal_id: relatedDeal?.id || null,
          status: 'pending',
          priority: ai.priority || 'normal',
          source: 'auto_inbound',
          due_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        })
        .select()
        .single();
      createdTaskId = task?.id || null;
    }

    // 6. Auto-reply
    const autoReply = ai.auto_reply || 'Thanks for reaching out! We\'ll get back to you shortly. 🏠';
    await sendTwilioReply(fromPhone, autoReply, isWhatsApp);

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
      sent_at: now,
    });

    res.setHeader('Content-Type', 'text/xml');
    return res.send('<Response></Response>');
  } catch (err: any) {
    console.error('Message receive error:', err);
    res.setHeader('Content-Type', 'text/xml');
    return res.send('<Response></Response>');
  }
}
