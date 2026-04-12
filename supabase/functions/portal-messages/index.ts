// portal-messages Edge Function — v2
// v2: Email notifications on every message
//   • Client sends (inbound)  → email TC at tc@myredeal.com
//   • TC replies  (outbound)  → email client at their email address
// POST (client): { phone, pin, deal_id, body }
// POST (TC):     { tc_reply: true, deal_id, conversation_id, body }
// GET:           ?phone=&pin=&deal_id=

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── CORS ──────────────────────────────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function jsonResp(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normPhone(p: string): string {
  return (p ?? '').replace(/\D/g, '').slice(-10);
}

// ── Email helpers (same Gmail OAuth pattern as send-group-email) ──────────────
const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_URL  = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

function wrapBodyHtml(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background-color:#ffffff;color:#1a1a1a;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;background-color:#ffffff;color:#1a1a1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;">
    <div style="border-bottom:2px solid #e5e7eb;padding-bottom:16px;margin-bottom:24px;">
      <span style="font-size:18px;font-weight:700;color:#1a1a1a;">MyReDeal</span>
    </div>
    <div style="color:#1a1a1a;">
      ${body}
    </div>
    <div style="margin-top:40px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;text-align:center;">
      TC Team &nbsp;·&nbsp; <a href="mailto:tc@myredeal.com" style="color:#6b7280;">tc@myredeal.com</a>
    </div>
  </div>
</body>
</html>`;
}

function encodeSubject(subject: string): string {
  if (/[^\x00-\x7F]/.test(subject)) {
    const encoded = btoa(unescape(encodeURIComponent(subject)));
    return `=?UTF-8?B?${encoded}?=`;
  }
  return subject;
}

function makeRawEmail(to: string, subject: string, htmlBody: string): string {
  const boundary = 'boundary_' + Math.random().toString(36).slice(2);
  const htmlBase64 = btoa(unescape(encodeURIComponent(htmlBody)));
  const raw = [
    'From: TC Team <tc@myredeal.com>',
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    htmlBase64,
    `--${boundary}--`,
  ].join('\r\n');
  return btoa(unescape(encodeURIComponent(raw))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getGmailAccessToken(): Promise<string> {
  const clientId     = Deno.env.get('GMAIL_CLIENT_ID');
  const clientSecret = Deno.env.get('GMAIL_CLIENT_SECRET');
  const refreshToken = Deno.env.get('GMAIL_REFRESH_TOKEN');
  if (!clientId || !clientSecret || !refreshToken) throw new Error('Missing Gmail OAuth credentials');

  const res = await fetch(GMAIL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Gmail token refresh failed: ${await res.text()}`);
  return (await res.json()).access_token;
}

async function sendEmail(to: string, subject: string, bodyHtml: string): Promise<void> {
  try {
    const token = await getGmailAccessToken();
    const raw   = makeRawEmail(to, subject, wrapBodyHtml(bodyHtml));
    const res   = await fetch(GMAIL_SEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) console.error('Gmail send failed:', await res.text());
  } catch (e) {
    console.error('sendEmail error (non-fatal):', e);
  }
}

// ── Auth helper ───────────────────────────────────────────────────────────────
async function authenticate(
  supabase: any,
  phone: string,
  pin: string,
): Promise<{ contact: any } | { error: string }> {
  const phone10 = normPhone(phone);
  if (phone10.length < 10) return { error: 'Invalid phone number.' };
  if (!/^\d{4,6}$/.test(pin))  return { error: 'Invalid PIN.' };

  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, phone, email, pin, company')
    .order('created_at');

  const contact = (contacts ?? []).find(
    (c: any) => normPhone(c.phone ?? '') === phone10,
  );
  if (!contact)                              return { error: 'Phone number not found.' };
  if (String(contact.pin) !== String(pin))   return { error: 'Incorrect PIN.' };
  return { contact };
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl  = Deno.env.get('SUPABASE_URL')!;
  const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase     = createClient(supabaseUrl, serviceKey);

  try {

    // ── POST ──────────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = await req.json();

      // ── TC REPLY (outbound: TC → client) ───────────────────────────────────
      if (body.tc_reply === true) {
        const { deal_id, conversation_id, body: msgBody } = body;

        if (!deal_id || !msgBody?.trim()) {
          return jsonResp({ error: 'deal_id and body are required.' }, 400);
        }

        const now     = new Date().toISOString();
        const preview = msgBody.trim().slice(0, 100);

        // Find or use the provided conversation
        let convId = conversation_id;
        if (!convId) {
          const { data: convs } = await supabase
            .from('conversations')
            .select('id')
            .eq('deal_id', deal_id)
            .eq('channel', 'portal')
            .limit(1);
          convId = convs?.[0]?.id ?? null;
        }

        if (!convId) {
          // Create a new conversation for TC-initiated outbound
          const { data: newConv, error: convErr } = await supabase
            .from('conversations')
            .insert({
              deal_id,
              channel: 'portal',
              type: 'direct',
              name: 'TC Message',
              unread_count: 0,
              last_message_at: now,
              last_message_preview: preview,
              waiting_for_reply: false,
            })
            .select('id')
            .single();
          if (convErr || !newConv) return jsonResp({ error: 'Failed to create conversation.' }, 500);
          convId = newConv.id;
        } else {
          await supabase
            .from('conversations')
            .update({ last_message_at: now, last_message_preview: preview, waiting_for_reply: false })
            .eq('id', convId);
        }

        // Write outbound message
        const { data: msg, error: msgErr } = await supabase
          .from('messages')
          .insert({
            deal_id,
            conversation_id: convId,
            direction: 'outbound',
            channel: 'portal',
            body: msgBody.trim(),
            status: 'sent',
            sent_at: now,
          })
          .select('id')
          .single();

        if (msgErr || !msg) return jsonResp({ error: 'Failed to save message.' }, 500);

        // ── Email client ────────────────────────────────────────────────────
        // Get deal address + participants for this deal
        const { data: deal } = await supabase
          .from('deals')
          .select('deal_data')
          .eq('id', deal_id)
          .single();

        const address = deal?.deal_data?.address ?? 'your deal';

        // Get client-side contacts for this deal (is_client_side = true)
        const { data: participants } = await supabase
          .from('deal_participants')
          .select('contact_id')
          .eq('deal_id', deal_id)
          .eq('is_client_side', true);

        const contactIds = (participants ?? []).map((p: any) => p.contact_id);

        if (contactIds.length > 0) {
          const { data: clientContacts } = await supabase
            .from('contacts')
            .select('email, first_name, last_name')
            .in('id', contactIds)
            .not('email', 'is', null);

          for (const cc of clientContacts ?? []) {
            if (!cc.email) continue;
            const firstName = cc.first_name || 'there';
            await sendEmail(
              cc.email,
              `You have a new message — ${address}`,
              `<p>Hi ${firstName},</p>
               <p>Your transaction coordinator has sent you a new message regarding <strong>${address}</strong>.</p>
               <p style="margin:24px 0;">
                 <a href="https://client.myredeal.com" style="display:inline-block;padding:12px 28px;background-color:#1e3a5f;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">View Message in Portal →</a>
               </p>
               <p style="color:#6b7280;font-size:13px;">Log in with your phone number and PIN to view the full conversation.</p>`,
            );
          }
        }

        return jsonResp({ success: true, message_id: msg.id, conversation_id: convId });
      }

      // ── CLIENT INBOUND (client → TC) ───────────────────────────────────────
      const { phone, pin, deal_id, body: msgBody } = body;

      if (!phone || !pin || !deal_id || !msgBody?.trim()) {
        return jsonResp({ error: 'phone, pin, deal_id, and body are required.' }, 400);
      }

      const authResult = await authenticate(supabase, phone, pin);
      if ('error' in authResult) return jsonResp({ error: authResult.error }, 401);

      const { contact } = authResult;
      const contactName =
        [contact.first_name, contact.last_name].filter(Boolean).join(' ') ||
        contact.company ||
        'Client';
      const now     = new Date().toISOString();
      const preview = msgBody.trim().slice(0, 100);

      // Find or create portal conversation
      const { data: convs } = await supabase
        .from('conversations')
        .select('id, unread_count')
        .eq('deal_id', deal_id)
        .eq('channel', 'portal')
        .limit(1);

      let convId: string;

      if (convs && convs.length > 0) {
        convId = convs[0].id;
        await supabase
          .from('conversations')
          .update({
            unread_count:       (convs[0].unread_count ?? 0) + 1,
            last_message_at:    now,
            last_message_preview: preview,
            waiting_for_reply:  true,
            waiting_since:      now,
          })
          .eq('id', convId);
      } else {
        const { data: newConv, error: convErr } = await supabase
          .from('conversations')
          .insert({
            deal_id,
            channel: 'portal',
            type: 'direct',
            name: contactName,
            participants: [{ contact_id: contact.id, name: contactName }],
            unread_count: 1,
            last_message_at: now,
            last_message_preview: preview,
            waiting_for_reply: true,
            waiting_since: now,
          })
          .select('id')
          .single();

        if (convErr || !newConv) return jsonResp({ error: 'Failed to create conversation.' }, 500);
        convId = newConv.id;
      }

      // Write inbound message
      const { data: msg, error: msgErr } = await supabase
        .from('messages')
        .insert({
          deal_id,
          contact_id:      contact.id,
          conversation_id: convId,
          direction:       'inbound',
          channel:         'portal',
          body:            msgBody.trim(),
          status:          'received',
          sent_at:         now,
        })
        .select('id')
        .single();

      if (msgErr || !msg) return jsonResp({ error: 'Failed to save message.' }, 500);

      // ── Email TC ──────────────────────────────────────────────────────────
      const { data: deal } = await supabase
        .from('deals')
        .select('deal_data')
        .eq('id', deal_id)
        .single();

      const address = deal?.deal_data?.address ?? 'a deal';
      const snippet = msgBody.trim().length > 120
        ? msgBody.trim().slice(0, 120) + '…'
        : msgBody.trim();

      await sendEmail(
        'tc@myredeal.com',
        `📩 Portal message from ${contactName} — ${address}`,
        `<p>Hi Andre,</p>
         <p><strong>${contactName}</strong> sent you a message via the client portal for <strong>${address}</strong>:</p>
         <blockquote style="margin:16px 0;padding:12px 16px;background:#f3f4f6;border-left:4px solid #1e3a5f;border-radius:4px;color:#1a1a1a;font-style:italic;">${snippet}</blockquote>
         <p style="margin:24px 0;">
           <a href="https://tc.myredeal.com" style="display:inline-block;padding:12px 28px;background-color:#1e3a5f;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">Reply in TC App →</a>
         </p>
         <p style="color:#6b7280;font-size:13px;">Open the Inbox → Portal tab to reply.</p>`,
      );

      return jsonResp({ success: true, message_id: msg.id, conversation_id: convId });
    }

    // ── GET: fetch thread ──────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const url     = new URL(req.url);
      const phone   = url.searchParams.get('phone') ?? '';
      const pin     = url.searchParams.get('pin')   ?? '';
      const deal_id = url.searchParams.get('deal_id') ?? '';

      if (!phone || !pin || !deal_id) {
        return jsonResp({ error: 'phone, pin, and deal_id are required.' }, 400);
      }

      const authResult = await authenticate(supabase, phone, pin);
      if ('error' in authResult) return jsonResp({ error: authResult.error }, 401);

      const { data: convs } = await supabase
        .from('conversations')
        .select('id')
        .eq('deal_id', deal_id)
        .eq('channel', 'portal')
        .limit(1);

      if (!convs || convs.length === 0) {
        return jsonResp({ messages: [], conversation_id: null });
      }

      const convId = convs[0].id;

      // Mark as read (client is viewing)
      await supabase
        .from('conversations')
        .update({ unread_count: 0 })
        .eq('id', convId);

      const { data: messages } = await supabase
        .from('messages')
        .select('id, direction, body, sent_at, channel, contact_id')
        .eq('conversation_id', convId)
        .order('sent_at', { ascending: true });

      return jsonResp({ messages: messages ?? [], conversation_id: convId });
    }

    return jsonResp({ error: 'Method not allowed' }, 405);

  } catch (err: any) {
    console.error('portal-messages unhandled:', err);
    return jsonResp({ error: err?.message ?? 'Internal error' }, 500);
  }
});
