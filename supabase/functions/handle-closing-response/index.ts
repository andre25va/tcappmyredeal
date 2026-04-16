// handle-closing-response v1
// Public endpoint — captures agent response from closing confirmation email
// No JWT required (accessed via email link click)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { sendViaGmail } from './_shared/gmail.ts';
import { getSupabaseClient } from './_shared/supabase.ts';

const TC_EMAIL = 'tc@myredeal.com';
const RESPONSE_URL = 'https://alxrmusieuzgssynktxg.supabase.co/functions/v1/handle-closing-response';

serve(async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const response = url.searchParams.get('response');

  if (!token) return htmlPage(errorPage('This link is missing required information.'));

  const supabase = getSupabaseClient();
  const { data: confirmation, error } = await supabase
    .from('closing_confirmations').select('*').eq('token', token).single();

  if (error || !confirmation) return htmlPage(errorPage('This confirmation link is invalid or has expired.'));

  if (response === 'new_date') {
    if (req.method === 'POST') {
      try {
        const formData = await req.formData();
        const newDate = formData.get('new_date') as string;
        if (!newDate) return htmlPage(newDateForm(token, confirmation.deal_address, 'Please select a date.'));
        await supabase.from('closing_confirmations').update({ response: 'new_date', new_proposed_date: newDate, responded_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('token', token);
        await notifyTC(supabase, confirmation, 'new_date', newDate);
        return htmlPage(thankYouPage(confirmation.contact_name, confirmation.deal_address, 'new_date', newDate));
      } catch (err) {
        return htmlPage(newDateForm(token, confirmation.deal_address, 'Something went wrong. Please try again.'));
      }
    }
    return htmlPage(newDateForm(token, confirmation.deal_address));
  }

  if (confirmation.responded_at) return htmlPage(thankYouPage(confirmation.contact_name, confirmation.deal_address, confirmation.response, confirmation.new_proposed_date));

  const validResponses = ['yes', 'no', 'not_sure', 'dead'];
  if (!response || !validResponses.includes(response)) return htmlPage(errorPage('Invalid response. Please use the buttons in the email.'));

  await supabase.from('closing_confirmations').update({ response, responded_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('token', token);
  await notifyTC(supabase, confirmation, response);
  return htmlPage(thankYouPage(confirmation.contact_name, confirmation.deal_address, response));
});

async function notifyTC(supabase: any, confirmation: any, response: string, newDate?: string) {
  const responseData: Record<string, { icon: string; label: string; color: string; action: string }> = {
    yes:      { icon: '✅', label: 'Closing is confirmed — ON TRACK', color: '#059669', action: '' },
    no:       { icon: '❌', label: 'Closing is NOT happening today', color: '#dc2626', action: 'Confirm the new date and update all parties immediately.' },
    not_sure: { icon: '🤷', label: 'Agent is not sure', color: '#d97706', action: 'Follow up with the agent and title company to confirm.' },
    dead:     { icon: '💀', label: 'Deal is dead', color: '#dc2626', action: 'Consider archiving this deal and notifying all parties.' },
    new_date: { icon: '📅', label: `New closing date proposed: ${newDate || 'unknown'}`, color: '#2563eb', action: 'Update the closing date in TC Command and approve the cascade.' },
  };
  const r = responseData[response] || responseData['not_sure'];
  const needsAction = response !== 'yes';
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;padding:40px 24px;"><div style="text-align:center;margin-bottom:28px;"><div style="font-size:24px;font-weight:800;color:#0f172a;">🏠 MyReDeal</div><div style="font-size:12px;color:#94a3b8;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px;">Closing Confirmation Alert</div></div><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:28px;margin-bottom:20px;"><div style="font-size:32px;text-align:center;margin-bottom:16px;">${r.icon}</div><div style="font-size:18px;font-weight:700;color:${r.color};text-align:center;margin-bottom:20px;">${r.label}</div><table style="width:100%;border-collapse:collapse;"><tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:10px 0;color:#64748b;font-size:13px;width:110px;">Property</td><td style="padding:10px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${confirmation.deal_address}</td></tr><tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:10px 0;color:#64748b;font-size:13px;">Scheduled</td><td style="padding:10px 0;color:#1a1a1a;font-size:14px;">${confirmation.scheduled_closing_date}</td></tr><tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:10px 0;color:#64748b;font-size:13px;">Agent</td><td style="padding:10px 0;color:#1a1a1a;font-size:14px;">${confirmation.contact_name} &lt;${confirmation.contact_email}&gt;</td></tr><tr><td style="padding:10px 0;color:#64748b;font-size:13px;">Responded</td><td style="padding:10px 0;color:#1a1a1a;font-size:13px;">${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CST</td></tr></table></div>${needsAction ? `<div style="background:#fef2f2;border:2px solid #fecaca;border-radius:10px;padding:18px 20px;margin-bottom:20px;"><div style="font-size:13px;font-weight:700;color:#dc2626;margin-bottom:6px;">⚡ Action Required</div><div style="font-size:13px;color:#7f1d1d;line-height:1.5;">${r.action}</div></div>` : ''}<div style="text-align:center;padding-top:20px;border-top:1px solid #f1f5f9;"><div style="font-size:11px;color:#cbd5e1;">TC Command · MyReDeal</div></div></div></body></html>`;
  const urgency = response === 'yes' ? '✅' : '🚨';
  const subject = `${urgency} Closing Response: ${confirmation.deal_address} — ${r.icon} ${response.replace('_', ' ').toUpperCase()}`;
  const result = await sendViaGmail({ to: [TC_EMAIL], subject, bodyHtml: html });
  if (result.success) {
    await supabase.from('closing_confirmations').update({ tc_notified_at: new Date().toISOString() }).eq('token', confirmation.token);
    await supabase.from('email_send_log').insert({ deal_id: confirmation.deal_id, template_name: 'TC Closing Alert v1', to_addresses: [TC_EMAIL], cc_addresses: [], subject, body_html: html, gmail_message_id: result.messageId, gmail_thread_id: result.threadId, email_type: 'reminder', sent_by: 'handle-closing-response' });
  }
}

function htmlPage(body: string): Response { return new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }); }
function errorPage(message: string): string { return page('⚠️', 'Link Error', message); }
function page(icon: string, title: string, body: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh;"><div style="max-width:480px;margin:0 auto;padding:60px 20px;text-align:center;"><div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:44px 32px;"><div style="font-size:52px;margin-bottom:20px;">${icon}</div><div style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:12px;">${title}</div><div style="font-size:15px;color:#475569;line-height:1.6;">${body}</div></div><div style="font-size:11px;color:#94a3b8;margin-top:24px;">MyReDeal Transaction Coordination</div></div></body></html>`;
}
function thankYouPage(agentName: string, dealAddress: string, response: string, newDate?: string): string {
  const messages: Record<string, { icon: string; title: string; msg: string }> = {
    yes:      { icon: '✅', title: 'Thank You!', msg: 'Your TC has been notified. Have a great closing today! 🎉' },
    no:       { icon: '❌', title: 'Got it.', msg: 'Your TC has been notified and will reach out shortly.' },
    not_sure: { icon: '🤷', title: 'Noted.', msg: 'Your TC has been notified and will follow up with you.' },
    dead:     { icon: '💀', title: "We're sorry to hear that.", msg: 'Your TC has been notified and will take next steps.' },
    new_date: { icon: '📅', title: 'New Date Captured!', msg: `Your TC has been notified of the proposed new closing date: <strong>${newDate || ''}</strong>.` },
  };
  const m = messages[response] || messages['not_sure'];
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh;"><div style="max-width:480px;margin:0 auto;padding:60px 20px;text-align:center;"><div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:44px 32px;"><div style="font-size:52px;margin-bottom:20px;">${m.icon}</div><div style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:12px;">${m.title}</div><div style="font-size:15px;color:#475569;margin-bottom:24px;line-height:1.6;">${m.msg}</div><div style="background:#f1f5f9;border-radius:10px;padding:14px 18px;"><div style="font-size:13px;color:#64748b;margin-bottom:4px;">Property</div><div style="font-size:15px;font-weight:700;color:#1e293b;">${dealAddress}</div></div></div><div style="font-size:11px;color:#94a3b8;margin-top:24px;">MyReDeal Transaction Coordination</div></div></body></html>`;
}
function newDateForm(token: string, dealAddress: string, errorMsg?: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh;"><div style="max-width:480px;margin:0 auto;padding:60px 20px;"><div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:40px 32px;"><div style="text-align:center;margin-bottom:28px;"><div style="font-size:44px;margin-bottom:16px;">📅</div><div style="font-size:20px;font-weight:800;color:#0f172a;margin-bottom:8px;">Propose New Closing Date</div><div style="font-size:14px;color:#64748b;">${dealAddress}</div></div>${errorMsg ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;color:#dc2626;font-size:13px;margin-bottom:20px;">${errorMsg}</div>` : ''}<form method="POST" action="${RESPONSE_URL}?token=${token}&response=new_date"><label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:8px;">New Closing Date</label><input type="date" name="new_date" required style="width:100%;padding:13px 14px;border:1.5px solid #d1d5db;border-radius:8px;font-size:16px;box-sizing:border-box;margin-bottom:20px;color:#1a1a1a;background:#fff;"><button type="submit" style="width:100%;background:#2563eb;color:#ffffff;border:none;padding:15px;border-radius:9px;font-size:15px;font-weight:700;cursor:pointer;">Submit New Date</button></form></div><div style="font-size:11px;color:#94a3b8;margin-top:24px;text-align:center;">MyReDeal Transaction Coordination</div></div></body></html>`;
}
