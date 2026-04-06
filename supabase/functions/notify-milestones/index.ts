// notify-milestones Edge Function
// Checks all active deals for upcoming MLS milestone deadlines and sends
// notifications based on mls_milestone_config settings.
// Designed to be called daily (e.g. from a cron trigger or scheduled job).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { sendViaGmail } from './_shared/gmail.ts';
import { getSupabaseClient, corsHeaders, jsonResponse, errorResponse } from './_shared/supabase.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseClient();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD

    // 1. Load all active deals with contract_date + mls_id set
    const { data: deals, error: dealsError } = await supabase
      .from('deals')
      .select(`
        id, property_address, city, state,
        contract_date, closing_date,
        mls_id, assigned_tc_user_id, primary_client_account_id,
        buyer_name, seller_name
      `)
      .eq('status', 'contract')
      .not('contract_date', 'is', null)
      .not('mls_id', 'is', null);

    if (dealsError) return errorResponse(`Failed to load deals: ${dealsError.message}`);
    if (!deals?.length) return jsonResponse({ checked: 0, sent: 0, message: 'No active deals with contract_date' });

    const results = { checked: deals.length, sent: 0, skipped: 0, errors: [] as string[] };

    for (const deal of deals) {
      // 2. Load milestone configs for this deal's MLS
      const { data: configs, error: configErr } = await supabase
        .from('mls_milestone_config')
        .select(`
          id, due_days_from_contract, days_before_notification,
          notify_agent, notify_client,
          milestone_types(id, key, label)
        `)
        .eq('mls_id', deal.mls_id);

      if (configErr || !configs?.length) continue;

      const contractDate = new Date(deal.contract_date);
      contractDate.setHours(0, 0, 0, 0);

      for (const cfg of configs) {
        const milestoneType = (cfg as any).milestone_types;
        if (!milestoneType) continue;

        // Compute milestone date
        const milestoneDate = new Date(contractDate);
        milestoneDate.setDate(milestoneDate.getDate() + cfg.due_days_from_contract);

        // Days until this milestone from today
        const msPerDay = 1000 * 60 * 60 * 24;
        const daysUntil = Math.round((milestoneDate.getTime() - today.getTime()) / msPerDay);

        // Only notify when daysUntil matches days_before_notification
        if (daysUntil !== cfg.days_before_notification) continue;

        const milestoneDateStr = milestoneDate.toISOString().split('T')[0];
        const propertyLabel = [deal.property_address, deal.city, deal.state].filter(Boolean).join(', ');

        // 3. Collect recipients
        const recipients: Array<{ email: string; type: 'agent' | 'client'; name: string }> = [];

        // Agent = assigned TC user
        if (cfg.notify_agent && deal.assigned_tc_user_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('name, contact_id, contacts(email)')
            .eq('id', deal.assigned_tc_user_id)
            .single();

          const agentEmail = (profile as any)?.contacts?.email;
          if (agentEmail) {
            recipients.push({ email: agentEmail, type: 'agent', name: (profile as any)?.name || 'Agent' });
          }
        }

        // Client = deal participants marked is_client_side = true
        if (cfg.notify_client) {
          const { data: clientParticipants } = await supabase
            .from('deal_participants')
            .select('contact_id, contacts(email, first_name, last_name, full_name)')
            .eq('deal_id', deal.id)
            .eq('is_client_side', true)
            .not('contact_id', 'is', null);

          for (const p of clientParticipants || []) {
            const c = (p as any).contacts;
            if (c?.email) {
              const name = c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Client';
              recipients.push({ email: c.email, type: 'client', name });
            }
          }
        }

        if (!recipients.length) continue;

        for (const recipient of recipients) {
          // 4. Dedup check
          const { error: dupError } = await supabase
            .from('milestone_notification_log')
            .insert({
              deal_id: deal.id,
              milestone_type_id: milestoneType.id,
              recipient_type: recipient.type,
              recipient_email: recipient.email,
              scheduled_date: milestoneDateStr,
              days_before: cfg.days_before_notification,
            });

          // Unique constraint violation = already sent
          if (dupError) {
            results.skipped++;
            continue;
          }

          // 5. Send email
          const daysLabel = cfg.days_before_notification === 1
            ? 'tomorrow'
            : `in ${cfg.days_before_notification} days`;

          const subject = `Upcoming: ${milestoneType.label} ${daysLabel} — ${propertyLabel}`;
          const bodyHtml = buildEmailHtml({
            recipientName: recipient.name,
            milestoneLabel: milestoneType.label,
            milestoneDate: milestoneDateStr,
            daysUntil: cfg.days_before_notification,
            propertyLabel,
            buyerName: deal.buyer_name,
            sellerName: deal.seller_name,
            closingDate: deal.closing_date,
          });

          const sendResult = await sendViaGmail({
            to: [recipient.email],
            subject,
            bodyHtml,
          });

          if (sendResult.success) {
            results.sent++;
          } else {
            // Undo the log entry so we can retry
            await supabase
              .from('milestone_notification_log')
              .delete()
              .eq('deal_id', deal.id)
              .eq('milestone_type_id', milestoneType.id)
              .eq('recipient_type', recipient.type)
              .eq('days_before', cfg.days_before_notification);

            results.errors.push(`Deal ${deal.id} / ${milestoneType.label}: ${sendResult.error}`);
          }
        }
      }
    }

    return jsonResponse({
      date: todayStr,
      deals_checked: results.checked,
      notifications_sent: results.sent,
      skipped_duplicates: results.skipped,
      errors: results.errors.length ? results.errors : undefined,
    });
  } catch (err) {
    console.error('notify-milestones error:', err);
    return errorResponse(err.message);
  }
});

function buildEmailHtml(opts: {
  recipientName: string;
  milestoneLabel: string;
  milestoneDate: string;
  daysUntil: number;
  propertyLabel: string;
  buyerName?: string;
  sellerName?: string;
  closingDate?: string;
}): string {
  const daysLabel = opts.daysUntil === 0
    ? '<strong style="color:#ef4444">TODAY</strong>'
    : opts.daysUntil === 1
    ? '<strong style="color:#f97316">Tomorrow</strong>'
    : `<strong>in ${opts.daysUntil} days</strong> (${opts.milestoneDate})`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;color:#111;max-width:600px;margin:0 auto;padding:24px">
  <div style="background:#f8fafc;border-radius:12px;padding:24px;border:1px solid #e2e8f0">
    <h2 style="margin:0 0 4px;color:#1e293b">⏰ Milestone Reminder</h2>
    <p style="color:#64748b;margin:0 0 20px;font-size:14px">MyReDeal Notification</p>

    <p style="margin:0 0 16px">Hi ${opts.recipientName},</p>

    <div style="background:#fff;border-radius:8px;padding:16px;border-left:4px solid #6366f1;margin-bottom:20px">
      <p style="margin:0 0 6px;font-size:13px;color:#6366f1;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">
        ${opts.milestoneLabel}
      </p>
      <p style="margin:0;font-size:18px;font-weight:700;color:#1e293b">
        ${daysLabel}
      </p>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
      <tr>
        <td style="padding:6px 0;color:#64748b;width:40%">Property</td>
        <td style="padding:6px 0;font-weight:600">${opts.propertyLabel}</td>
      </tr>
      ${opts.buyerName ? `<tr><td style="padding:6px 0;color:#64748b">Buyer</td><td style="padding:6px 0">${opts.buyerName}</td></tr>` : ''}
      ${opts.sellerName ? `<tr><td style="padding:6px 0;color:#64748b">Seller</td><td style="padding:6px 0">${opts.sellerName}</td></tr>` : ''}
      ${opts.closingDate ? `<tr><td style="padding:6px 0;color:#64748b">Closing</td><td style="padding:6px 0">${opts.closingDate}</td></tr>` : ''}
      <tr>
        <td style="padding:6px 0;color:#64748b">Milestone Date</td>
        <td style="padding:6px 0">${opts.milestoneDate}</td>
      </tr>
    </table>

    <p style="font-size:12px;color:#94a3b8;margin:0;border-top:1px solid #e2e8f0;padding-top:16px">
      This is an automated reminder from MyReDeal. Log in to manage your deal details.
    </p>
  </div>
</body>
</html>`;
}
