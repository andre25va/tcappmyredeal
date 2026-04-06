// advance-milestone-notify Edge Function (v2)
// Fires when TC manually advances a deal milestone in WorkspaceOverview.
// Source of truth: mls_milestone_config + milestone_types (NOT milestone_notification_settings)
// Universal email template: current milestone confirmed + next milestone due + days to closing

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Supabase client ───────────────────────────────────────────────────────────
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

// ── Gmail helpers ─────────────────────────────────────────────────────────────
const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

interface EmailPayload {
  to: string[];
  subject: string;
  bodyHtml: string;
}

function getGmailCredentials() {
  const clientId = Deno.env.get('GMAIL_CLIENT_ID');
  const clientSecret = Deno.env.get('GMAIL_CLIENT_SECRET');
  const refreshToken = Deno.env.get('GMAIL_REFRESH_TOKEN');
  if (!clientId || !clientSecret || !refreshToken) throw new Error('Missing Gmail OAuth credentials');
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
  const from = 'TC Team <tc@myredeal.com>';
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
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: base64UrlEncode(mime) }),
    });
    if (!res.ok) return { success: false, error: `Gmail API (${res.status}): ${await res.text()}` };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'TBD';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// ── Universal email template ──────────────────────────────────────────────────
function buildEmailHtml(vars: {
  firstName: string;
  dealAddress: string;
  currentMilestone: string;
  currentDate: string;
  nextMilestone: string | null;
  nextDueDate: string | null;
  daysToClosing: number | null;
  closingDate: string | null;
}): string {
  const nextSection = vars.nextMilestone
    ? `<p>⏭️ <strong>Coming up next:</strong><br>${vars.nextMilestone} is due on <strong>${vars.nextDueDate || 'TBD'}</strong>.</p>`
    : '';

  const closingSection = vars.daysToClosing !== null
    ? `<p>🏠 <strong>${vars.daysToClosing} days</strong> until closing on <strong>${formatDate(vars.closingDate)}</strong>.</p>`
    : '';

  return `
<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#333;max-width:600px;">
  <p>Hi ${vars.firstName},</p>
  <p>This is a quick update on your transaction at <strong>${vars.dealAddress}</strong>.</p>
  <p>✅ <strong>${vars.currentMilestone}</strong> — ${vars.currentDate}</p>
  ${nextSection}
  ${closingSection}
  <p>If you have any questions, don't hesitate to reach out.</p>
  <p><strong>TC Team</strong><br>
  <a href="mailto:tc@myredeal.com">tc@myredeal.com</a></p>
</div>`.trim();
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { deal_id, milestone_key } = await req.json();
    if (!deal_id || !milestone_key) return errorResponse('Missing deal_id or milestone_key', 400);

    const supabase = getSupabaseClient();

    // 1. Load deal
    const { data: deal, error: dealErr } = await supabase
      .from('deals')
      .select('id, property_address, city, state, contract_date, closing_date, mls_id, assigned_tc_user_id')
      .eq('id', deal_id)
      .single();

    if (dealErr || !deal) return errorResponse(`Deal not found: ${deal_id}`);

    const dealAddress = [deal.property_address, deal.city, deal.state].filter(Boolean).join(', ');

    // 2. Load ALL mls_milestone_config rows for this deal's MLS board, ordered by sort_order
    const { data: configs, error: configErr } = await supabase
      .from('mls_milestone_config')
      .select(`
        id, sort_order, due_days_from_contract, enabled,
        notify_agent, notify_buyer, notify_seller, notify_lender, notify_title,
        email_subject, email_body,
        milestone_types ( id, key, label )
      `)
      .eq('mls_id', deal.mls_id)
      .order('sort_order', { ascending: true });

    if (configErr) return errorResponse(`Config lookup failed: ${configErr.message}`);
    if (!configs || configs.length === 0) {
      return jsonResponse({ sent: 0, message: `No milestone config found for MLS board` });
    }

    // 3. Find current milestone config row
    const currentIdx = configs.findIndex((c: any) => c.milestone_types?.key === milestone_key);
    if (currentIdx === -1) {
      return jsonResponse({ sent: 0, message: `No config row found for milestone_key: ${milestone_key}` });
    }

    const currentConfig = configs[currentIdx] as any;
    if (!currentConfig.enabled) {
      return jsonResponse({ sent: 0, message: 'Notifications disabled for this milestone' });
    }

    // 4. Find next milestone
    const nextConfig = configs[currentIdx + 1] as any | undefined;
    let nextMilestoneLabel: string | null = null;
    let nextDueDateStr: string | null = null;

    if (nextConfig && deal.contract_date && nextConfig.due_days_from_contract != null) {
      nextMilestoneLabel = nextConfig.milestone_types?.label || null;
      nextDueDateStr = formatDate(addDays(deal.contract_date, nextConfig.due_days_from_contract));
    } else if (nextConfig) {
      nextMilestoneLabel = nextConfig.milestone_types?.label || null;
    }

    // 5. Days to closing
    const days = daysUntil(deal.closing_date);

    // 6. Load deal participants
    const { data: participants, error: partErr } = await supabase
      .from('deal_participants')
      .select('deal_role, side, contact_id, contacts(email, full_name, first_name, last_name)')
      .eq('deal_id', deal_id)
      .not('contact_id', 'is', null);

    if (partErr) return errorResponse(`Failed to load participants: ${partErr.message}`);

    // 7. Build recipient list from notify flags
    const recipients: Array<{ email: string; firstName: string }> = [];
    const seen = new Set<string>();

    const addByRole = (roles: string[], sideFilter?: string) => {
      for (const p of participants || []) {
        if (!roles.includes(p.deal_role)) continue;
        if (sideFilter && p.side && p.side !== sideFilter && p.side !== 'both') continue;
        const c = (p as any).contacts;
        const email = c?.email;
        if (!email || seen.has(email)) continue;
        seen.add(email);
        const firstName = c.first_name || c.full_name?.split(' ')[0] || 'there';
        recipients.push({ email, firstName });
      }
    };

    if (currentConfig.notify_agent)   addByRole(['lead_agent']);
    if (currentConfig.notify_buyer)   addByRole(['buyer']);
    if (currentConfig.notify_seller)  addByRole(['seller']);
    if (currentConfig.notify_lender)  addByRole(['lender']);
    if (currentConfig.notify_title)   addByRole(['title_officer']);

    if (!recipients.length) {
      return jsonResponse({ sent: 0, message: 'No matching recipients found' });
    }

    // 8. Build subject — use custom if set, else default
    const currentLabel = currentConfig.milestone_types?.label || milestone_key;
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const defaultSubject = `${dealAddress} — ${currentLabel} Confirmed`;
    const subject = currentConfig.email_subject?.trim()
      ? currentConfig.email_subject.trim()
      : defaultSubject;

    // 9. Send emails
    let sent = 0;
    const errors: string[] = [];

    for (const recipient of recipients) {
      const bodyHtml = buildEmailHtml({
        firstName: recipient.firstName,
        dealAddress,
        currentMilestone: currentLabel,
        currentDate: today,
        nextMilestone: nextMilestoneLabel,
        nextDueDate: nextDueDateStr,
        daysToClosing: days,
        closingDate: deal.closing_date,
      });

      const result = await sendViaGmail({ to: [recipient.email], subject, bodyHtml });

      if (!result.success) {
        errors.push(`${recipient.email}: ${result.error}`);
        console.error(`advance-milestone-notify: failed for ${recipient.email}:`, result.error);
      } else {
        sent++;
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
