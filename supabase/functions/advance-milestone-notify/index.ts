// advance-milestone-notify Edge Function
// Called immediately when TC advances a deal milestone in WorkspaceOverview.
// Reads milestone_notification_settings for the target milestone, resolves
// deal participants by role/side, substitutes template variables, and sends
// emails via Gmail API.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Supabase client ──────────────────────────────────────────────────────────
let _client: SupabaseClient | null = null;
function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  _client = createClient(url, serviceKey);
  return _client;
}

// ── CORS ─────────────────────────────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message }, status);
}

// ── Gmail helpers (inlined) ──────────────────────────────────────────────────
const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

interface EmailPayload {
  to: string[];
  subject: string;
  bodyHtml: string;
  from?: string;
}

function getGmailCredentials() {
  const clientId = Deno.env.get('GMAIL_CLIENT_ID');
  const clientSecret = Deno.env.get('GMAIL_CLIENT_SECRET');
  const refreshToken = Deno.env.get('GMAIL_REFRESH_TOKEN');
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Gmail OAuth credentials');
  }
  return { clientId, clientSecret, refreshToken };
}

async function getAccessToken(creds: { clientId: string; clientSecret: string; refreshToken: string }) {
  const res = await fetch(GMAIL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  const d = await res.json();
  return d.access_token as string;
}

function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildMimeMessage(email: EmailPayload): string {
  const from = email.from || 'tc@myredeal.com';
  const htmlB64 = btoa(unescape(encodeURIComponent(email.bodyHtml)));
  const subjectEncoded = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(email.subject)))}?=`;
  const boundary = `alt_${crypto.randomUUID().replace(/-/g, '')}`;
  return [
    `From: ${from}`,
    `To: ${email.to.join(', ')}`,
    `Subject: ${subjectEncoded}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    htmlB64,
    `--${boundary}--`,
  ].join('\r\n');
}

async function sendViaGmail(email: EmailPayload): Promise<{ success: boolean; error?: string }> {
  try {
    const creds = getGmailCredentials();
    const accessToken = await getAccessToken(creds);
    const mime = buildMimeMessage(email);
    const res = await fetch(GMAIL_SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: base64UrlEncode(mime) }),
    });
    if (!res.ok) return { success: false, error: `Gmail API (${res.status}): ${await res.text()}` };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ── Plain text → HTML ─────────────────────────────────────────────────────────
function textToHtml(text: string): string {
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#333;">${
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .split('\n\n')
      .map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`)
      .join('')
  }</div>`;
}

// ── Template variable substitution ───────────────────────────────────────────
function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { deal_id, milestone_key } = await req.json();
    if (!deal_id || !milestone_key) {
      return errorResponse('Missing deal_id or milestone_key', 400);
    }

    const supabase = getSupabaseClient();

    // 1. Load notification settings for this milestone
    const { data: settings, error: settingsErr } = await supabase
      .from('milestone_notification_settings')
      .select('*')
      .eq('milestone', milestone_key)
      .maybeSingle();

    if (settingsErr) return errorResponse(`Settings lookup failed: ${settingsErr.message}`);
    if (!settings) {
      return jsonResponse({ sent: 0, message: `No notification settings found for: ${milestone_key}` });
    }
    if (!settings.send_email) {
      return jsonResponse({ sent: 0, message: 'Email notifications disabled for this milestone' });
    }

    // 2. Load deal
    const { data: deal, error: dealErr } = await supabase
      .from('deals')
      .select('id, property_address, city, state, closing_date, contract_date, assigned_tc_user_id')
      .eq('id', deal_id)
      .single();

    if (dealErr || !deal) return errorResponse(`Deal not found: ${deal_id}`);

    const propertyLabel = [deal.property_address, deal.city, deal.state].filter(Boolean).join(', ');
    const closingDateStr = deal.closing_date
      ? new Date(deal.closing_date).toLocaleDateString('en-US', {
          month: 'long', day: 'numeric', year: 'numeric',
        })
      : 'TBD';

    // 3. TC name
    let tcName = 'Your Transaction Coordinator';
    if (deal.assigned_tc_user_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', deal.assigned_tc_user_id)
        .single();
      if (profile?.name) tcName = profile.name;
    }

    // 4. Load deal participants with contact emails
    const { data: participants, error: partErr } = await supabase
      .from('deal_participants')
      .select('deal_role, side, contact_id, contacts(email, full_name, first_name, last_name)')
      .eq('deal_id', deal_id)
      .not('contact_id', 'is', null);

    if (partErr) return errorResponse(`Failed to load participants: ${partErr.message}`);

    // 5. Build recipient list based on notify flags
    const recipients: Array<{ email: string; name: string }> = [];
    const seen = new Set<string>();

    const addByRole = (roles: string[], sideFilter?: string) => {
      for (const p of participants || []) {
        if (!roles.includes(p.deal_role)) continue;
        // Side filter: skip only if participant has a side set AND it doesn't match
        if (sideFilter && p.side && p.side !== sideFilter && p.side !== 'both') continue;
        const c = (p as any).contacts;
        const email = c?.email;
        if (!email || seen.has(email)) continue;
        seen.add(email);
        const name = c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Team Member';
        recipients.push({ email, name });
      }
    };

    if (settings.notify_buyer_agent)   addByRole(['lead_agent'], 'buyer');
    if (settings.notify_seller_agent)  addByRole(['lead_agent'], 'seller');
    if (settings.notify_lender)        addByRole(['lender']);
    if (settings.notify_title)         addByRole(['title_officer']);
    if (settings.notify_buyer)         addByRole(['buyer']);
    if (settings.notify_seller)        addByRole(['seller']);

    // Fallback: if notify_buyer_agent or notify_seller_agent is true but no
    // lead_agent with a matching side was found, include any lead_agent
    const hasLeadAgent = recipients.some(r =>
      (participants || []).some(p => p.deal_role === 'lead_agent' && (p as any).contacts?.email === r.email)
    );
    if (!hasLeadAgent && (settings.notify_buyer_agent || settings.notify_seller_agent)) {
      addByRole(['lead_agent']); // no side filter
    }

    if (!recipients.length) {
      return jsonResponse({ sent: 0, message: 'No matching recipients found' });
    }

    // 6. Send emails
    let sent = 0;
    const errors: string[] = [];

    for (const recipient of recipients) {
      const vars = {
        recipient_name: recipient.name,
        property_address: propertyLabel,
        closing_date: closingDateStr,
        tc_name: tcName,
      };

      const subject = fillTemplate(
        settings.email_subject || `Milestone update for ${propertyLabel}`,
        vars
      );
      const bodyText = fillTemplate(settings.email_body || '', vars);
      const bodyHtml = textToHtml(bodyText);

      const result = await sendViaGmail({
        to: [recipient.email],
        subject,
        bodyHtml,
      });

      if (!result.success) {
        errors.push(`${recipient.email}: ${result.error}`);
        console.error(`advance-milestone-notify: failed for ${recipient.email}:`, result.error);
      } else {
        sent++;
        // Log to email_send_log
        await supabase.from('email_send_log').insert({
          deal_id,
          to_addresses: [recipient.email],
          cc_addresses: [],
          subject,
          body_html: bodyHtml,
          email_type: 'milestone_advance',
          sent_by: 'system',
          template_name: `milestone_advance:${milestone_key}`,
        });
      }
    }

    return jsonResponse({ sent, errors, total: recipients.length });

  } catch (err: any) {
    console.error('advance-milestone-notify error:', err);
    return errorResponse(err.message || 'Unknown error');
  }
});
