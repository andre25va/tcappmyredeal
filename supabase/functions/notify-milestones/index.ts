// notify-milestones Edge Function v2
// Instead of sending emails directly, queues notifications in pending_notifications
// for TC review and approval before sending.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { getSupabaseClient, corsHeaders, jsonResponse, errorResponse } from './_shared/supabase.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseClient();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    // 1. Load all active deals with contract_date + mls_id set
    const { data: deals, error: dealsError } = await supabase
      .from('deals')
      .select(`
        id, property_address, city, state,
        contract_date, closing_date,
        mls_id, user_id,
        buyer_name, seller_name
      `)
      .eq('status', 'contract')
      .not('contract_date', 'is', null)
      .not('mls_id', 'is', null);

    if (dealsError) return errorResponse(`Failed to load deals: ${dealsError.message}`);
    if (!deals?.length) return jsonResponse({ checked: 0, queued: 0, message: 'No active deals with contract_date' });

    const results = { checked: deals.length, queued: 0, skipped: 0, errors: [] as string[] };

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

        // Only queue when daysUntil matches days_before_notification
        if (daysUntil !== cfg.days_before_notification) continue;

        const milestoneDateStr = milestoneDate.toISOString().split('T')[0];
        const propertyLabel = [deal.property_address, deal.city, deal.state].filter(Boolean).join(', ');

        // 3. Collect recipients
        const recipients: Array<{ email: string; type: 'agent' | 'client'; name: string }> = [];

        if (cfg.notify_agent && deal.user_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('name, contact_id, contacts(email)')
            .eq('id', deal.user_id)
            .single();

          const agentEmail = (profile as any)?.contacts?.email;
          if (agentEmail) {
            recipients.push({ email: agentEmail, type: 'agent', name: (profile as any)?.name || 'Agent' });
          }
        }

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

        const daysLabel = cfg.days_before_notification === 1
          ? 'tomorrow'
          : `in ${cfg.days_before_notification} days`;

        for (const recipient of recipients) {
          // Dedup: skip if already pending or sent for same deal+milestone+email+due_date
          const { data: existing } = await supabase
            .from('pending_notifications')
            .select('id')
            .eq('deal_id', deal.id)
            .eq('milestone_type_key', milestoneType.key)
            .eq('recipient_email', recipient.email)
            .eq('due_date', milestoneDateStr)
            .in('status', ['pending', 'sent'])
            .maybeSingle();

          if (existing) {
            results.skipped++;
            continue;
          }

          const subject = `Upcoming: ${milestoneType.label} ${daysLabel} — ${propertyLabel}`;
          const body = buildEmailBody({
            recipientName: recipient.name,
            milestoneLabel: milestoneType.label,
            milestoneDate: milestoneDateStr,
            daysUntil: cfg.days_before_notification,
            propertyLabel,
            buyerName: deal.buyer_name,
            sellerName: deal.seller_name,
            closingDate: deal.closing_date,
          });

          const { error: insertErr } = await supabase
            .from('pending_notifications')
            .insert({
              user_id: deal.user_id,
              deal_id: deal.id,
              milestone_type_key: milestoneType.key,
              milestone_label: milestoneType.label,
              due_date: milestoneDateStr,
              days_before: cfg.days_before_notification,
              recipient_type: recipient.type,
              recipient_name: recipient.name,
              recipient_email: recipient.email,
              subject,
              body,
              status: 'pending',
            });

          if (insertErr) {
            results.errors.push(`Deal ${deal.id} / ${milestoneType.label}: ${insertErr.message}`);
          } else {
            results.queued++;
          }
        }
      }
    }

    return jsonResponse({
      date: todayStr,
      deals_checked: results.checked,
      notifications_queued: results.queued,
      skipped_duplicates: results.skipped,
      errors: results.errors.length ? results.errors : undefined,
    });
  } catch (err) {
    console.error('notify-milestones error:', err);
    return errorResponse(err.message);
  }
});

function buildEmailBody(opts: {
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
    ? 'TODAY'
    : opts.daysUntil === 1
    ? 'tomorrow'
    : `in ${opts.daysUntil} days (${opts.milestoneDate})`;

  const lines = [
    `Hi ${opts.recipientName},`,
    '',
    `This is a reminder that the ${opts.milestoneLabel} deadline is coming up ${daysLabel}.`,
    '',
    `Property: ${opts.propertyLabel}`,
  ];
  if (opts.buyerName) lines.push(`Buyer: ${opts.buyerName}`);
  if (opts.sellerName) lines.push(`Seller: ${opts.sellerName}`);
  if (opts.closingDate) lines.push(`Closing: ${opts.closingDate}`);
  lines.push(`Milestone Date: ${opts.milestoneDate}`);
  lines.push('');
  lines.push('Please take any necessary action before the deadline.');
  lines.push('');
  lines.push('Best,');
  lines.push('MyReDeal TC');

  return lines.join('\n');
}
