// alert-tc Edge Function v1
// Sends TC a system error/alert notification email
// Called by n8n error branches when automated workflows fail
// Also used by R1 MLS cookie health check

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { sendViaGmail } from './_shared/gmail.ts';
import { corsHeaders, jsonResponse, errorResponse } from './_shared/supabase.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { workflowName, errorMessage, details, alertType } = body;

    const isHealthAlert = alertType === 'mls_cookies_expired';

    const dateStr = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Chicago',
    });

    let subject: string;
    let emailHtml: string;

    if (isHealthAlert) {
      subject = '🍪 MLS Cookies Expired — Refresh Needed';
      emailHtml = `<!DOCTYPE html><html><body style="background-color:#fef9c3;padding:32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:0 16px;">
  <div style="background:#92400e;border-radius:10px;padding:20px;margin-bottom:16px;">
    <div style="font-size:16px;font-weight:800;color:#ffffff;">🍪 Matrix MLS Cookies Expired</div>
    <div style="font-size:13px;color:#fde68a;margin-top:4px;">${dateStr}</div>
  </div>
  <div style="background:#ffffff;border:2px solid #f59e0b;border-radius:10px;padding:20px;">
    <p style="font-size:14px;font-weight:700;color:#1e293b;">The MLS scraper cannot fetch supplements — cookies need to be refreshed.</p>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="font-size:13px;font-weight:700;color:#92400e;margin:0 0 8px 0;">How to fix in ~2 minutes:</p>
      <ol style="font-size:13px;color:#78350f;margin:0;padding-left:20px;line-height:1.8;">
        <li>Open <strong>Heartland Matrix</strong> in Chrome and log in (use 2FA if prompted)</li>
        <li>Open DevTools → Application → Cookies → find the Matrix domain</li>
        <li>Copy all cookie key=value pairs</li>
        <li>Paste them here in TC Command chat and type: <em>"update matrix cookies"</em></li>
        <li>Tasklet will update Railway in ~30 seconds ✅</li>
      </ol>
    </div>
    <p style="font-size:12px;color:#64748b;">Supplement fetching will resume automatically once cookies are updated.</p>
  </div>
  <div style="text-align:center;padding:16px 0 8px 0;"><div style="font-size:11px;color:#94a3b8;">TC Command · MyReDeal · System Alert</div></div>
</div></body></html>`;
    } else {
      subject = `🚨 Automation Failed: ${workflowName || 'Unknown Workflow'}`;
      emailHtml = `<!DOCTYPE html><html><body style="background-color:#fef2f2;padding:32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:0 16px;">
  <div style="background:#dc2626;border-radius:10px;padding:20px;margin-bottom:16px;">
    <div style="font-size:16px;font-weight:800;color:#ffffff;">🚨 Automation Failed</div>
    <div style="font-size:13px;color:#fecaca;margin-top:4px;">${dateStr}</div>
  </div>
  <div style="background:#ffffff;border:2px solid #fca5a5;border-radius:10px;padding:20px;">
    <div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:12px;">Workflow: <span style="color:#dc2626;">${workflowName || 'Unknown'}</span></div>
    <div style="font-size:13px;color:#475569;background:#fef2f2;padding:12px;border-radius:6px;font-family:monospace;word-break:break-all;">${errorMessage || 'An unexpected error occurred.'}</div>
    ${details ? `<div style="font-size:12px;color:#64748b;margin-top:12px;"><strong>Details:</strong> ${String(details).substring(0, 500)}</div>` : ''}
    <div style="font-size:13px;color:#475569;margin-top:16px;padding:12px;background:#fff7ed;border-radius:6px;border:1px solid #fed7aa;">
      ⚠️ This automation did not complete. Please check TC Command and handle any missed actions manually today.
    </div>
  </div>
  <div style="text-align:center;padding:16px 0 8px 0;"><div style="font-size:11px;color:#94a3b8;">TC Command · MyReDeal · System Notification</div></div>
</div></body></html>`;
    }

    const result = await sendViaGmail({
      to: ['tc@myredeal.com'],
      subject,
      bodyHtml: emailHtml,
    });

    if (!result.success) throw new Error('Email send failed: ' + result.error);

    console.log('alert-tc sent:', subject);
    return jsonResponse({ success: true, messageId: result.messageId });
  } catch (err: any) {
    console.error('alert-tc error:', err);
    return errorResponse(err.message);
  }
});
