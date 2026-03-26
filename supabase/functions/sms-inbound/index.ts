// sms-inbound Edge Function
// Handles inbound SMS/MMS from Twilio webhook
// verify_jwt: false — Twilio webhook does not send user JWTs

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { getSupabaseClient } from '../_shared/supabase.ts';

// ── Simple acknowledgment patterns (no AI needed) ─────────────────────────────
const SIMPLE_ACK_PATTERNS = [
  /^(ok|okay|k)[\s!.?]*$/i,
  /^(yes|yeah|yep|yup|yessir)[\s!.?]*$/i,
  /^(no|nope|nah)[\s!.?]*$/i,
  /^(thanks?|thank you|thx|ty|tysm)[\s!.?]*$/i,
  /^(got it|gotcha|got that|i got it)[\s!.?]*$/i,
  /^(sounds good|sounds great|perfect|great|awesome|excellent|amazing)[\s!.?]*$/i,
  /^(confirmed?|will do|on it|done|sure|absolutely|of course)[\s!.?]*$/i,
  /^(received|got your message|message received)[\s!.?]*$/i,
  /^👍[\s!.?]*$/,
  /^(understood|noted|copy that|10-4)[\s!.?]*$/i,
];

function isSimpleAck(body: string): boolean {
  return SIMPLE_ACK_PATTERNS.some(p => p.test(body.trim()));
}

// Normalize phone to E.164 format
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return phone;
}

// Strip country code for partial matching
function phoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

// Escape XML special chars for TwiML
function xmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── AI Intent Classification ──────────────────────────────────────────────────
interface AIClassification {
  intent: 'simple_ack' | 'question' | 'document' | 'scheduling' | 'urgent' | 'other';
  isSimple: boolean;
  suggestedReply?: string;
}

async function classifyWithAI(body: string, openaiKey: string): Promise<AIClassification> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 200,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `You classify inbound SMS messages from real estate clients to a transaction coordinator (TC).

Intents:
- "simple_ack": brief acknowledgment, yes/no, thanks — TC action NOT needed
- "question": client asking something — TC must respond
- "document": requesting or referencing a document — TC must respond
- "scheduling": date/time request or confirmation — TC must respond
- "urgent": urgent issue, complaint, or time-sensitive problem — TC must respond ASAP
- "other": doesn't fit above — TC should review

Respond ONLY with valid JSON. No markdown, no extra text.
Format: {"intent":"...","isSimple":true/false,"suggestedReply":"..."(only if isSimple=true, max 2 sentences, friendly & professional)}`,
        },
        { role: 'user', content: `SMS: "${body}"` },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenAI error ${res.status}`);

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '{}';

  try {
    return JSON.parse(content) as AIClassification;
  } catch {
    console.error('AI JSON parse error, raw:', content);
    return { intent: 'other', isSimple: false };
  }
}

// ── Send SMS via Twilio REST ──────────────────────────────────────────────────
async function sendSms(to: string, body: string, accountSid: string, authToken: string, from: string): Promise<string | null> {
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    console.error('Twilio send error:', data);
    return null;
  }
  return data.sid || null;
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  // Health check
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ ok: true, fn: 'sms-inbound' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    // Parse Twilio's URL-encoded form body
    const formData = await req.formData();
    const from        = formData.get('From')?.toString() || '';
    const to          = formData.get('To')?.toString() || '';
    const body        = formData.get('Body')?.toString() || '';
    const messageSid  = formData.get('MessageSid')?.toString() || '';
    const numMedia    = parseInt(formData.get('NumMedia')?.toString() || '0');
    const numTo       = parseInt(formData.get('NumTo')?.toString() || '1');

    const normalizedFrom = normalizePhone(from);
    const fromDigits     = phoneDigits(normalizedFrom);
    const isGroupMMS     = numTo > 1 || to.includes(',');

    const supabase     = getSupabaseClient();
    const accountSid   = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
    const authToken    = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
    const twilioNumber = Deno.env.get('TWILIO_PHONE_NUMBER') || '';

    // ── Look up contact ───────────────────────────────────────────────────────
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, phone, org_id')
      .ilike('phone', `%${fromDigits}`)
      .limit(1);

    const contact = contacts?.[0] ?? null;
    const contactName = contact
      ? `${contact.first_name} ${contact.last_name}`.trim()
      : normalizedFrom;

    // ── Look up most recent active deal ───────────────────────────────────────
    let deal: { id: string; property_address: string; city: string; state: string; org_id: string } | null = null;

    if (contact) {
      const { data: dp } = await supabase
        .from('deal_participants')
        .select(`
          deal_id,
          deals!inner (
            id, property_address, city, state, org_id, pipeline_stage
          )
        `)
        .eq('contact_id', contact.id)
        .neq('deals.pipeline_stage', 'closed')
        .order('created_at', { ascending: false })
        .limit(1);

      if (dp?.[0]?.deals) {
        deal = dp[0].deals as typeof deal;
      }
    }

    const orgId = contact?.org_id ?? deal?.org_id ?? null;

    // ══════════════════════════════════════════════════════════════════════════
    // GROUP MMS BRANCH
    // ══════════════════════════════════════════════════════════════════════════
    if (isGroupMMS) {
      const logBody = `[Group MMS] ${body}`;

      await supabase.from('messages').insert({
        direction: 'inbound',
        channel: 'sms',
        from_number: normalizedFrom,
        to_number: to,
        body: logBody,
        deal_id: deal?.id ?? null,
        contact_id: contact?.id ?? null,
        org_id: orgId,
        external_message_id: messageSid,
        need_reply: true,
        metadata: { is_group_mms: true, num_recipients: numTo, num_media: numMedia },
      });

      await supabase.from('comm_tasks').insert({
        title: `[Group MMS] New message from ${contactName}`,
        description: body,
        contact_id: contact?.id ?? null,
        contact_name: contactName,
        contact_phone: normalizedFrom,
        deal_id: deal?.id ?? null,
        deal_address: deal?.property_address ?? null,
        channel: 'sms',
        source: 'inbound_group_mms',
        priority: 'normal',
        org_id: orgId,
      });

      // Send "Message Received" reply
      if (accountSid && authToken && twilioNumber) {
        await sendSms(normalizedFrom, 'Message Received', accountSid, authToken, twilioNumber);
      }

      return new Response('<Response/>', { headers: { 'Content-Type': 'text/xml' } });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // NORMAL INBOUND SMS FLOW
    // ══════════════════════════════════════════════════════════════════════════

    // ── Get or create conversation ────────────────────────────────────────────
    let conversationId: string | null = null;

    if (deal?.id) {
      // Try to find existing SMS conversation for this deal
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('id')
        .eq('channel', 'sms')
        .eq('deal_id', deal.id)
        .limit(1);

      if (existingConv?.[0]) {
        conversationId = existingConv[0].id;
      }
    } else if (contact) {
      // No deal — find by contact name in recent SMS convos
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('id')
        .eq('channel', 'sms')
        .is('deal_id', null)
        .eq('name', contactName)
        .limit(1);

      if (existingConv?.[0]) {
        conversationId = existingConv[0].id;
      }
    }

    if (!conversationId) {
      // Create new conversation
      const participant = contact
        ? { contact_id: contact.id, name: contactName, phone: normalizedFrom }
        : { contact_id: null, name: normalizedFrom, phone: normalizedFrom };

      const { data: newConv } = await supabase
        .from('conversations')
        .insert({
          name: contactName,
          deal_id: deal?.id ?? null,
          type: 'direct',
          channel: 'sms',
          participants: [participant],
          last_message_at: new Date().toISOString(),
          last_message_preview: body.slice(0, 100),
          unread_count: 1,
        })
        .select('id')
        .single();

      conversationId = newConv?.id ?? null;
    }

    // ── Classify intent ───────────────────────────────────────────────────────
    let classification: AIClassification;

    if (isSimpleAck(body)) {
      classification = { intent: 'simple_ack', isSimple: true };
    } else {
      const openaiKey = Deno.env.get('OPENAI_API_KEY');
      if (openaiKey) {
        try {
          classification = await classifyWithAI(body, openaiKey);
        } catch (err) {
          console.error('AI classification failed, defaulting to flag-for-TC:', err);
          classification = { intent: 'other', isSimple: false };
        }
      } else {
        console.warn('OPENAI_API_KEY not set — all non-simple messages flagged for TC');
        classification = { intent: 'other', isSimple: false };
      }
    }

    const { intent, isSimple, suggestedReply } = classification;
    const needReply = !isSimple;

    // ── Log inbound message ───────────────────────────────────────────────────
    const { data: insertedMsg } = await supabase
      .from('messages')
      .insert({
        direction: 'inbound',
        channel: 'sms',
        from_number: normalizedFrom,
        to_number: to,
        body,
        deal_id: deal?.id ?? null,
        contact_id: contact?.id ?? null,
        conversation_id: conversationId,
        org_id: orgId,
        external_message_id: messageSid,
        need_reply: needReply,
        metadata: {
          intent,
          is_mms: numMedia > 0,
          num_media: numMedia,
          ai_classified: !isSimpleAck(body),
        },
      })
      .select('id')
      .single();

    const insertedMsgId = insertedMsg?.id ?? null;

    // ── Update conversation stats ─────────────────────────────────────────────
    if (conversationId) {
      // Fetch current unread count then increment
      const { data: convRow } = await supabase
        .from('conversations')
        .select('unread_count')
        .eq('id', conversationId)
        .single();

      const newUnread = ((convRow?.unread_count as number) ?? 0) + 1;

      await supabase.from('conversations').update({
        last_message_at: new Date().toISOString(),
        last_message_preview: body.slice(0, 100),
        unread_count: newUnread,
        waiting_for_reply: needReply,
        waiting_since: needReply ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq('id', conversationId);
    }

    // ── Handle simple ACK: auto-reply ─────────────────────────────────────────
    if (isSimple && suggestedReply) {
      // Log outbound auto-reply
      await supabase.from('messages').insert({
        direction: 'outbound',
        channel: 'sms',
        from_number: twilioNumber || to,
        to_number: normalizedFrom,
        body: suggestedReply,
        deal_id: deal?.id ?? null,
        contact_id: contact?.id ?? null,
        conversation_id: conversationId,
        org_id: orgId,
        metadata: {
          auto_reply: true,
          intent,
          triggered_by_message_id: insertedMsgId,
        },
      });

      const escaped = xmlEscape(suggestedReply);
      return new Response(`<Response><Message>${escaped}</Message></Response>`, {
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // ── Handle complex / unknown: flag for TC ─────────────────────────────────
    if (needReply) {
      const priority = intent === 'urgent' ? 'high' : 'normal';

      let taskTitle = `Reply needed: SMS from ${contactName}`;
      if (intent === 'question') taskTitle = `Question via SMS: ${contactName}`;
      else if (intent === 'document') taskTitle = `Document request via SMS: ${contactName}`;
      else if (intent === 'scheduling') taskTitle = `Scheduling SMS from ${contactName}`;
      else if (intent === 'urgent') taskTitle = `🚨 URGENT SMS from ${contactName}`;

      await supabase.from('comm_tasks').insert({
        title: taskTitle,
        description: body,
        contact_id: contact?.id ?? null,
        contact_name: contactName,
        contact_phone: normalizedFrom,
        deal_id: deal?.id ?? null,
        deal_address: deal?.property_address ?? null,
        channel: 'sms',
        source: 'inbound_sms_ai',
        priority,
        conversation_id: conversationId,
        org_id: orgId,
      });
    }

    // Return empty TwiML — no auto-reply sent, TC will respond manually
    return new Response('<Response/>', { headers: { 'Content-Type': 'text/xml' } });

  } catch (error) {
    console.error('sms-inbound fatal error:', error);
    // Always return valid TwiML — never let Twilio see a 500
    return new Response('<Response/>', { headers: { 'Content-Type': 'text/xml' } });
  }
});
