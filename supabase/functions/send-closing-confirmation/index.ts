// send-closing-confirmation v1
// Queries deals closing today, sends confirmation email to agents with 4-button response

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { sendViaGmail } from './_shared/gmail.ts';
import { getSupabaseClient, corsHeaders, jsonResponse, errorResponse } from './_shared/supabase.ts';

const BASE_URL = 'https://alxrmusieuzgssynktxg.supabase.co/functions/v1/handle-closing-response';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = getSupabaseClient();

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

    const { data: deals, error: dealsError } = await supabase
      .from('deals')
      .select('id, property_address, city, state, closing_date, transaction_type')
      .eq('closing_date', today)
      .not('status', 'in', '("archived","closed","dead","cancelled","terminated")');

    if (dealsError) return errorResponse('Failed to query deals: ' + dealsError.message);
    if (!deals || deals.length === 0) return jsonResponse({ skipped: true, reason: 'No deals closing today', date: today });

    const sent: any[] = [];
    const skipped: any[] = [];

    for (const deal of deals) {
      const dealAddress = [deal.property_address, deal.city, deal.state].filter(Boolean).join(', ');

      const { data: participants } = await supabase
        .from('deal_participants')
        .select('contact_id, deal_role, side, contacts(first_name, last_name, email)')
        .eq('deal_id', deal.id)
        .in('deal_role', ['lead_agent', 'co_agent']);

      const agents = (participants || []).filter((p: any) => p.contacts?.email);

      if (agents.length === 0) {
        skipped.push({ deal: deal.property_address, reason: 'No agents with email' });
        continue;
      }

      for (const agent of agents) {
        const contact = (agent as any).contacts;
        const agentName = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
        const agentEmail = contact.email;

        const { data: existing } = await supabase
          .from('closing_confirmations')
          .select('id')
          .eq('deal_id', deal.id)
          .eq('contact_email', agentEmail)
          .gte('sent_at', today + 'T00:00:00Z')
          .limit(1);

        if (existing && existing.length > 0) {
          skipped.push({ deal: deal.property_address, agent: agentName, reason: 'Already sent today' });
          continue;
        }

        const token = crypto.randomUUID();

        await supabase.from('closing_confirmations').insert({
          deal_id: deal.id,
          contact_id: agent.contact_id,
          contact_email: agentEmail,
          contact_name: agentName,
          deal_address: dealAddress,
          scheduled_closing_date: deal.closing_date,
          token,
        });

        const yesUrl = `${BASE_URL}?token=${token}&response=yes`;
        const noUrl = `${BASE_URL}?token=${token}&response=no`;
        const notSureUrl = `${BASE_URL}?token=${token}&response=not_sure`;
        const deadUrl = `${BASE_URL}?token=${token}&response=dead`;
        const newDateUrl = `${BASE_URL}?token=${token}&response=new_date`;

        const dateFormatted = new Date(deal.closing_date + 'T12:00:00').toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });

        const html = buildEmail(agentName, dealAddress, dateFormatted, yesUrl, noUrl, notSureUrl, deadUrl, newDateUrl);

        const result = await sendViaGmail({
          to: [agentEmail],
          subject: `Closing Confirmation Needed — ${dealAddress}`,
          bodyHtml: html,
        });

        if (result.success) {
          sent.push({ deal: deal.property_address, agent: agentName, email: agentEmail });
          await supabase.from('email_send_log').insert({
            deal_id: deal.id,
            template_name: 'Closing Day Confirmation v1',
            to_addresses: [agentEmail],
            cc_addresses: [],
            subject: `Closing Confirmation Needed — ${dealAddress}`,
            body_html: html,
            gmail_message_id: result.messageId,
            gmail_thread_id: result.threadId,
            email_type: 'reminder',
            sent_by: 'n8n-closing-check',
          });
        } else {
          skipped.push({ deal: deal.property_address, agent: agentName, reason: 'Email failed: ' + result.error });
        }
      }
    }

    return jsonResponse({ success: true, date: today, sent, skipped });
  } catch (err) {
    console.error(err);
    return errorResponse((err as Error).message);
  }
});

function buildEmail(agentName: string, address: string, dateFormatted: string, yesUrl: string, noUrl: string, notSureUrl: string, deadUrl: string, newDateUrl: string): string {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 24px;">
  <div style="text-align:center;margin-bottom:32px;">
    <div style="font-size:26px;font-weight:800;color:#0f172a;">🏠 MyReDeal</div>
    <div style="font-size:12px;color:#94a3b8;margin-top:4px;letter-spacing:0.5px;text-transform:uppercase;">Transaction Coordination</div>
  </div>
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:32px;margin-bottom:24px;">
    <p style="font-size:16px;color:#1a1a1a;margin:0 0 6px 0;font-weight:600;">Hi ${agentName},</p>
    <p style="font-size:15px;color:#475569;margin:0 0 28px 0;line-height:1.6;">You have a closing scheduled <strong style="color:#0f172a;">today</strong>. Please confirm the status so we can keep everything on track.</p>
    <div style="background:#0f172a;border-radius:10px;padding:20px 24px;margin-bottom:28px;text-align:center;">
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Property</div>
      <div style="font-size:18px;font-weight:700;color:#ffffff;margin-bottom:6px;">📍 ${address}</div>
      <div style="font-size:13px;color:#94a3b8;">${dateFormatted}</div>
    </div>
    <p style="font-size:14px;font-weight:600;color:#374151;margin:0 0 16px 0;text-align:center;">What is the closing status?</p>
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:5px 5px 5px 0;width:50%;"><a href="${yesUrl}" style="display:block;background:#059669;color:#ffffff;text-align:center;padding:16px 12px;border-radius:9px;text-decoration:none;font-size:14px;font-weight:700;">✅ Yes, We Are Closing</a></td>
        <td style="padding:5px 0 5px 5px;width:50%;"><a href="${newDateUrl}" style="display:block;background:#2563eb;color:#ffffff;text-align:center;padding:16px 12px;border-radius:9px;text-decoration:none;font-size:14px;font-weight:700;">📅 New Closing Date</a></td>
      </tr>
      <tr>
        <td style="padding:5px 5px 5px 0;width:50%;"><a href="${notSureUrl}" style="display:block;background:#d97706;color:#ffffff;text-align:center;padding:16px 12px;border-radius:9px;text-decoration:none;font-size:14px;font-weight:700;">🤷 Not Sure Yet</a></td>
        <td style="padding:5px 0 5px 5px;width:50%;"><a href="${deadUrl}" style="display:block;background:#dc2626;color:#ffffff;text-align:center;padding:16px 12px;border-radius:9px;text-decoration:none;font-size:14px;font-weight:700;">💀 Deal Is Dead</a></td>
      </tr>
    </table>
  </div>
  <p style="font-size:12px;color:#94a3b8;text-align:center;margin:0 0 24px 0;">Your TC will be notified immediately of your response.<br>Questions? Reply directly to this email.</p>
  <div style="text-align:center;padding-top:20px;border-top:1px solid #f1f5f9;">
    <div style="font-size:11px;color:#cbd5e1;">MyReDeal Transaction Coordination · tc@myredeal.com</div>
  </div>
</div></body></html>`;
}
