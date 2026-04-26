// notify-milestones Edge Function (v2)
// Cron: fires daily to check upcoming milestone deadlines.
// Fixes: deal_role column (was 'role'), DB template substitution, Gmail sending.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Supabase client ────────────────────────────────────────────────────────────
let _client: SupabaseClient | null = null;
function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  _client = createClient(url, serviceKey);
  return _client;
}

// ── Gmail helpers ──────────────────────────────────────────────────────────────
const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_URL  = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

interface EmailPayload { to: string[]; subject: string; bodyHtml: string; }

function getGmailCredentials() {
  const clientId     = Deno.env.get('GMAIL_CLIENT_ID');
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
      client_id:     creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type:    'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  const d = await res.json();
  return d.access_token as string;
}

// Gold standard v3 — UTF-8 safe (fixes crash on emoji/special chars in property addresses)
function base64UrlEncode(str: string): string {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
    const creds       = getGmailCredentials();
    const accessToken = await getAccessToken(creds);
    const mime        = buildMimeMessage(email);
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

// ── Template helpers ───────────────────────────────────────────────────────────
const DEFAULT_SUBJECT = '{{deal_address}} — {{milestone_label}} Due {{due_date}}';
const DEFAULT_BODY = `Hi {{first_name}},

This is a reminder that the {{milestone_label}} deadline is coming up on {{due_date}} ({{days_before}} days away) for the transaction at {{deal_address}}.

Please make sure everything is in order before the deadline.

If you have any questions, don't hesitate to reach out.

TC Team
tc@myredeal.com`;

function substituteVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

function wrapBodyHtml(plainBody: string): string {
  const htmlBody = plainBody
    .split('\n\n')
    .map(block => `<p>${block.replace(/\n/g, '<br>')}</p>`)
    .join('\n');
  return `<div style="background-color:#ffffff;padding:24px;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a;max-width:600px;border-radius:8px;">${htmlBody}</div>`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'TBD';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ── Main handler ───────────────────────────────────────────────────────────────
Deno.serve(async () => {
  try {
    const supabase = getSupabaseClient();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Active contract deals
    const { data: deals, error: dealsError } = await supabase
      .from('deals')
      .select('id, property_address, city, state, contract_date, closing_date, mls_id, user_id')
      .eq('status', 'contract')
      .not('contract_date', 'is', null)
      .not('mls_id', 'is', null);

    if (dealsError) throw dealsError;
    if (!deals?.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 });

    // 2. All milestone configs (with DB templates + notify flags)
    const { data: configs, error: configError } = await supabase
      .from('mls_milestone_config')
      .select(`
        id, mls_id, due_days_from_contract, days_before_notification,
        notify_agent, notify_buyer, notify_seller, notify_lender, notify_title,
        email_subject, email_body,
        milestone_types ( id, key, label )
      `);

    if (configError) throw configError;
    if (!configs?.length) return new Response(JSON.stringify({ sent: 0, reason: 'no_config' }), { status: 200 });

    let sent = 0;
    const errors: string[] = [];

    for (const deal of deals) {
      const contractDate = new Date(deal.contract_date);
      contractDate.setHours(0, 0, 0, 0);

      const dealAddress = [deal.property_address, deal.city, deal.state].filter(Boolean).join(', ');
      const dealConfigs = configs.filter((c: any) => c.mls_id === deal.mls_id);
      if (!dealConfigs.length) continue;

      // Load participants with contact join (correct column: deal_role)
      const { data: participants } = await supabase
        .from('deal_participants')
        .select('deal_role, side, contact_id, contacts(email, first_name, last_name, full_name)')
        .eq('deal_id', deal.id)
        .not('contact_id', 'is', null)
        .in('deal_role', ['buyer', 'seller', 'lead_agent', 'lender', 'title_officer']);

      // Agent profile (TC user)
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, full_name, first_name')
        .eq('id', deal.user_id)
        .single();

      for (const config of dealConfigs) {
        const milestone = (config as any).milestone_types;
        if (!milestone) continue;

        const dueDate = new Date(contractDate);
        dueDate.setDate(dueDate.getDate() + config.due_days_from_contract);

        const notifyDate = new Date(dueDate);
        notifyDate.setDate(notifyDate.getDate() - config.days_before_notification);
        notifyDate.setHours(0, 0, 0, 0);

        if (notifyDate.getTime() !== today.getTime()) continue;

        const dueDateLabel = formatDate(dueDate.toISOString());

        // Build recipients based on notify flags
        const recipients: { email: string; firstName: string; recipientType: string }[] = [];
        const seen = new Set<string>();

        const addByRole = (roles: string[], recipientType: string) => {
          for (const p of participants || []) {
            if (!roles.includes((p as any).deal_role)) continue;
            const c = (p as any).contacts;
            const email = c?.email;
            if (!email || seen.has(email)) continue;
            seen.add(email);
            const firstName = c.first_name || c.full_name?.split(' ')[0] || 'there';
            recipients.push({ email, firstName, recipientType });
          }
        };

        if (config.notify_agent) {
          if (profile?.email && !seen.has(profile.email)) {
            seen.add(profile.email);
            const firstName = profile.first_name || profile.full_name?.split(' ')[0] || 'Agent';
            recipients.push({ email: profile.email, firstName, recipientType: 'agent' });
          }
          addByRole(['lead_agent'], 'agent');
        }
        if (config.notify_buyer)  addByRole(['buyer'], 'buyer');
        if (config.notify_seller) addByRole(['seller'], 'seller');
        if (config.notify_lender) addByRole(['lender'], 'lender');
        if (config.notify_title)  addByRole(['title_officer'], 'title');

        if (!recipients.length) continue;

        // Template substitution vars (shared)
        const subjectTemplate = (config as any).email_subject?.trim() || DEFAULT_SUBJECT;
        const bodyTemplate    = (config as any).email_body?.trim()    || DEFAULT_BODY;

        const sharedVars: Record<string, string> = {
          deal_address:    dealAddress,
          milestone_label: milestone.label,
          due_date:        dueDateLabel,
          days_before:     String(config.days_before_notification),
          closing_date:    formatDate(deal.closing_date),
        };

        for (const recipient of recipients) {
          // Dedup check
          const { data: existing } = await supabase
            .from('milestone_notification_log')
            .select('id')
            .eq('deal_id', deal.id)
            .eq('milestone_type_key', milestone.key)
            .eq('notification_type', recipient.recipientType)
            .gte('sent_at', today.toISOString())
            .maybeSingle();

          if (existing) continue;

          const vars = { ...sharedVars, first_name: recipient.firstName };
          const subject  = substituteVars(subjectTemplate, vars);
          const bodyHtml = wrapBodyHtml(substituteVars(bodyTemplate, vars));

          const result = await sendViaGmail({ to: [recipient.email], subject, bodyHtml });

          if (!result.success) {
            errors.push(`${recipient.email}: ${result.error}`);
            console.error(`notify-milestones: failed for ${recipient.email}:`, result.error);
          } else {
            sent++;

            // Log to email_send_log
            await supabase.from('email_send_log').insert({
              deal_id:       deal.id,
              to_addresses:  [recipient.email],
              cc_addresses:  [],
              subject,
              body_html:     bodyHtml,
              email_type:    'milestone_reminder',
              sent_by:       'system',
              template_name: `milestone_reminder:${milestone.key}`,
            });

            // Dedup log entry
            await supabase.from('milestone_notification_log').insert({
              deal_id:            deal.id,
              milestone_type_key: milestone.key,
              notification_type:  recipient.recipientType,
              sent_at:            new Date().toISOString(),
            });
          }
        }
      }
    }

    return new Response(JSON.stringify({ sent, errors }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('notify-milestones error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
