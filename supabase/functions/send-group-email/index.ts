// send-group-email Edge Function
// Sends a broadcast email to a list of recipients, logs to email_blasts + email_blast_recipients.
// Uses Gmail OAuth for sending (same pattern as advance-milestone-notify).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── CORS ─────────────────────────────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResp(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── Email HTML wrapper ────────────────────────────────────────────────────────
function wrapBodyHtml(body: string, confirmUrl?: string, declineUrl?: string): string {
  const buttons = (confirmUrl || declineUrl) ? `
    <div style="margin: 32px 0; text-align: center;">
      ${confirmUrl ? `<a href="${confirmUrl}" style="display:inline-block;margin:0 8px;padding:12px 28px;background-color:#22c55e;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">✅ Confirm</a>` : ''}
      ${declineUrl ? `<a href="${declineUrl}" style="display:inline-block;margin:0 8px;padding:12px 28px;background-color:#ef4444;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">❌ Decline</a>` : ''}
    </div>` : '';

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
    ${buttons}
    <div style="margin-top:40px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;text-align:center;">
      TC Team &nbsp;·&nbsp; <a href="mailto:tc@myredeal.com" style="color:#6b7280;">tc@myredeal.com</a>
    </div>
  </div>
</body>
</html>`;
}

// ── Gmail OAuth helpers ───────────────────────────────────────────────────────
const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

function getGmailCredentials() {
  const clientId = Deno.env.get('GMAIL_CLIENT_ID');
  const clientSecret = Deno.env.get('GMAIL_CLIENT_SECRET');
  const refreshToken = Deno.env.get('GMAIL_REFRESH_TOKEN');
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Gmail OAuth credentials');
  }
  return { clientId, clientSecret, refreshToken };
}

async function getGmailAccessToken(): Promise<string> {
  const { clientId, clientSecret, refreshToken } = getGmailCredentials();
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
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail token refresh failed: ${err}`);
  }
  const json = await res.json();
  return json.access_token;
}

// RFC 2047 encode subject so emoji/non-ASCII don't corrupt the header
function encodeSubject(subject: string): string {
  if (/[^\x00-\x7F]/.test(subject)) {
    // Encode as UTF-8 base64 encoded-word
    const encoded = btoa(unescape(encodeURIComponent(subject)));
    return `=?UTF-8?B?${encoded}?=`;
  }
  return subject;
}

function makeRawEmail(to: string, subject: string, htmlBody: string, fromName = 'TC Team', fromEmail = 'tc@myredeal.com'): string {
  const boundary = 'boundary_' + Math.random().toString(36).slice(2);
  const raw = [
    `From: ${fromName} <${fromEmail}>`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    btoa(unescape(encodeURIComponent(htmlBody))),
    `--${boundary}--`,
  ].join('\r\n');
  return btoa(unescape(encodeURIComponent(raw))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sendViaGmail(accessToken: string, to: string, subject: string, htmlBody: string): Promise<void> {
  const raw = makeRawEmail(to, subject, htmlBody);
  const res = await fetch(GMAIL_SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail send failed: ${err}`);
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const trackBase = Deno.env.get('APP_URL')
      ? `${Deno.env.get('SUPABASE_URL')}/functions/v1/track-email`
      : `${supabaseUrl}/functions/v1/track-email`;

    if (!supabaseUrl || !serviceKey) {
      return jsonResp({ error: 'Missing Supabase env vars' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const {
      subject,
      body_html,
      include_confirm = false,
      include_decline = false,
      blast_type = 'general',
      deal_id = null,
      sent_by = null,
      recipients, // Array of { name?, email }
    } = body;

    if (!subject || !body_html || !recipients?.length) {
      return jsonResp({ error: 'Missing required fields: subject, body_html, and recipients are required.' }, 400);
    }

    // ── Insert blast record ─────────────────────────────────────────────────
    const { data: blast, error: blastError } = await supabase
      .from('email_blasts')
      .insert({
        subject,
        body_html,
        include_confirm,
        include_decline,
        blast_type,
        deal_id: deal_id || null,
        sent_by: sent_by || null,
      })
      .select()
      .single();

    if (blastError) {
      console.error('blast insert error:', JSON.stringify(blastError));
      return jsonResp({ error: 'blast_insert_failed', detail: blastError.message, code: blastError.code }, 500);
    }

    // ── Insert recipient rows ───────────────────────────────────────────────
    const recipientRows = recipients.map((r: { name?: string; email: string }) => ({
      blast_id: blast.id,
      name: r.name ?? null,
      email: r.email,
    }));

    const { data: insertedRecipients, error: recipError } = await supabase
      .from('email_blast_recipients')
      .insert(recipientRows)
      .select();

    if (recipError) {
      console.error('recipient insert error:', JSON.stringify(recipError));
      return jsonResp({ error: 'recipient_insert_failed', detail: recipError.message, code: recipError.code }, 500);
    }

    // ── Get Gmail access token once ────────────────────────────────────────
    let accessToken: string;
    try {
      accessToken = await getGmailAccessToken();
    } catch (gmailErr) {
      console.error('Gmail auth error:', gmailErr);
      return jsonResp({ error: 'gmail_auth_failed', detail: String(gmailErr) }, 500);
    }

    // ── Send emails ────────────────────────────────────────────────────────
    const sendResults: { email: string; success: boolean; error?: string }[] = [];

    for (const recipient of insertedRecipients ?? []) {
      const pixelUrl = `${trackBase}/open?token=${recipient.token}`;
      const confirmUrl = include_confirm ? `${trackBase}/confirm?token=${recipient.token}` : undefined;
      const declineUrl = include_decline ? `${trackBase}/decline?token=${recipient.token}` : undefined;

      const htmlWithTracking = wrapBodyHtml(body_html, confirmUrl, declineUrl)
        .replace('</body>', `<img src="${pixelUrl}" width="1" height="1" style="display:none;" alt="" /></body>`);

      try {
        await sendViaGmail(accessToken, recipient.email, subject, htmlWithTracking);
        await supabase
          .from('email_blast_recipients')
          .update({ sent_at: new Date().toISOString() })
          .eq('id', recipient.id);
        sendResults.push({ email: recipient.email, success: true });
      } catch (sendErr) {
        console.error(`Send error for ${recipient.email}:`, sendErr);
        sendResults.push({ email: recipient.email, success: false, error: String(sendErr) });
      }
    }

    return jsonResp({ blast_id: blast.id, results: sendResults });

  } catch (err) {
    console.error('send-group-email unhandled error:', err);
    return jsonResp({ error: 'unhandled', detail: String(err) }, 500);
  }
});
