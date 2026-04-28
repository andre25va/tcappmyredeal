import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Gold standard gmail.ts v3 (inline) ────────────────────────────────────────
const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

function getGmailCreds() {
  const clientId = Deno.env.get('GMAIL_CLIENT_ID');
  const clientSecret = Deno.env.get('GMAIL_CLIENT_SECRET');
  const refreshToken = Deno.env.get('GMAIL_REFRESH_TOKEN');
  if (!clientId || !clientSecret || !refreshToken) throw new Error('Missing Gmail OAuth credentials');
  return { clientId, clientSecret, refreshToken };
}

async function getAccessToken(creds: { clientId: string; clientSecret: string; refreshToken: string }): Promise<string> {
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
  const data = await res.json();
  if (!data.access_token) throw new Error(`Gmail token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

function base64UrlEncode(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeRfc2047(str: string): string {
  if (/^[\x20-\x7E]*$/.test(str)) return str;
  return `=?UTF-8?B?${btoa(unescape(encodeURIComponent(str)))}?=`;
}

async function sendGmail(to: string[], subject: string, bodyHtml: string): Promise<void> {
  const creds = getGmailCreds();
  const token = await getAccessToken(creds);
  const from = 'tc@myredeal.com';
  const encodedSubject = encodeRfc2047(subject);
  const boundary = `boundary_${Date.now()}`;
  const rawMessage = [
    `From: TC Command <${from}>`,
    `To: ${to.join(', ')}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    btoa(unescape(encodeURIComponent(bodyHtml))),
    '',
    `--${boundary}--`,
  ].join('\r\n');
  const encodedMessage = base64UrlEncode(rawMessage);
  const res = await fetch(GMAIL_SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encodedMessage }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail send failed: ${err}`);
  }
}
// ──────────────────────────────────────────────────────────────────────────────

interface OverdueMilestone {
  id: string;
  deal_id: string;
  label: string;
  milestone: string;
  due_date: string;
  property_address: string;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  try {
    // 1. Find all overdue milestones not yet escalated, on active (non-archived) deals
    const { data: rows, error: fetchErr } = await supabase
      .from('deal_timeline')
      .select(`
        id,
        deal_id,
        label,
        milestone,
        due_date,
        deals!inner(property_address, archived_at)
      `)
      .lt('due_date', today)
      .not('status', 'in', '("completed","waived","extended")')
      .is('escalated_at', null);

    if (fetchErr) throw new Error(`Fetch error: ${fetchErr.message}`);

    // Filter out archived deals
    const overdue: OverdueMilestone[] = (rows ?? [])
      .filter((r: any) => !r.deals?.archived_at)
      .map((r: any) => ({
        id: r.id,
        deal_id: r.deal_id,
        label: r.label || r.milestone || 'Milestone',
        milestone: r.milestone,
        due_date: r.due_date,
        property_address: r.deals?.property_address || 'Unknown Address',
      }));

    if (overdue.length === 0) {
      return new Response(
        JSON.stringify({ escalated: 0, message: 'No newly overdue milestones' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date().toISOString();
    const escalatedIds: string[] = [];

    // 2. For each overdue milestone: create a task + mark escalated
    for (const m of overdue) {
      const daysOverdue = Math.floor(
        (new Date(today).getTime() - new Date(m.due_date).getTime()) / 86400000
      );

      // Create high-priority task
      const { error: taskErr } = await supabase.from('tasks').insert({
        deal_id: m.deal_id,
        title: `⚠️ Overdue: ${m.label}`,
        description: `Milestone "${m.label}" was due ${m.due_date} (${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} ago). Review and take action or mark as waived.`,
        category: 'milestone',
        priority: 'high',
        status: 'pending',
        due_date: today,
        is_required: true,
      });

      if (taskErr) {
        console.error(`Task insert failed for milestone ${m.id}:`, taskErr.message);
        continue;
      }

      // Mark escalated
      const { error: escalateErr } = await supabase
        .from('deal_timeline')
        .update({ escalated_at: now })
        .eq('id', m.id);

      if (escalateErr) {
        console.error(`Escalate update failed for milestone ${m.id}:`, escalateErr.message);
        continue;
      }

      escalatedIds.push(m.id);
    }

    // 3. Send single summary email to TC
    if (escalatedIds.length > 0) {
      const escalatedItems = overdue.filter(m => escalatedIds.includes(m.id));

      const rows_html = escalatedItems.map(m => {
        const daysOverdue = Math.floor(
          (new Date(today).getTime() - new Date(m.due_date).getTime()) / 86400000
        );
        return `
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-weight:500;color:#1a1a2e;">${m.property_address}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#374151;">${m.label}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#374151;">${m.due_date}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#dc2626;font-weight:600;">${daysOverdue} day${daysOverdue !== 1 ? 's' : ''}</td>
          </tr>`;
      }).join('');

      const bodyHtml = `
        <!DOCTYPE html>
        <html>
        <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0;padding:24px;">
          <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
            <div style="background:#dc2626;padding:20px 24px;">
              <h1 style="color:#fff;margin:0;font-size:18px;">⚠️ Overdue Milestones — Action Required</h1>
              <p style="color:#fecaca;margin:4px 0 0;font-size:13px;">${escalatedItems.length} milestone${escalatedItems.length !== 1 ? 's have' : ' has'} passed their due date</p>
            </div>
            <div style="padding:24px;">
              <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <thead>
                  <tr style="background:#fef2f2;">
                    <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600;border-bottom:2px solid #fecaca;">Property</th>
                    <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600;border-bottom:2px solid #fecaca;">Milestone</th>
                    <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600;border-bottom:2px solid #fecaca;">Was Due</th>
                    <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600;border-bottom:2px solid #fecaca;">Overdue By</th>
                  </tr>
                </thead>
                <tbody>${rows_html}</tbody>
              </table>
              <div style="margin-top:20px;padding:12px 16px;background:#fef2f2;border-radius:8px;border-left:4px solid #dc2626;">
                <p style="margin:0;font-size:13px;color:#7f1d1d;">
                  High-priority tasks have been created in your deal workspace for each item above.
                  Review, take action, or mark as waived.
                </p>
              </div>
            </div>
            <div style="padding:16px 24px;background:#f9fafb;border-top:1px solid #f0f0f0;text-align:center;">
              <p style="margin:0;font-size:11px;color:#9ca3af;">TC Command · Milestone Escalation Alert</p>
            </div>
          </div>
        </body>
        </html>`;

      await sendGmail(
        ['tc@myredeal.com'],
        `⚠️ ${escalatedItems.length} Overdue Milestone${escalatedItems.length !== 1 ? 's' : ''} — Action Required`,
        bodyHtml
      );
    }

    return new Response(
      JSON.stringify({ escalated: escalatedIds.length, milestones: escalatedIds }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('escalate-milestones error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
