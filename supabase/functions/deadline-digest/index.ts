// deadline-digest Edge Function v1
// Queries deal_timeline for milestones due in ≤3 days on active deals
// Sends TC a consolidated deadline alert email
// Called daily by n8n at 7am CST

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { sendViaGmail } from './_shared/gmail.ts';
import { getSupabaseClient, corsHeaders, jsonResponse, errorResponse } from './_shared/supabase.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseClient();
    const today = new Date().toISOString().split('T')[0];
    const threeDaysFromNow = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];

    // Get all milestones due in ≤3 days that are not complete/n/a
    const { data: milestones, error } = await supabase
      .from('deal_timeline')
      .select('id, deal_id, milestone, label, due_date, status')
      .gte('due_date', today)
      .lte('due_date', threeDaysFromNow)
      .not('status', 'in', '(complete,n/a)')
      .order('due_date', { ascending: true });

    if (error) throw new Error('DB query failed: ' + error.message);

    if (!milestones || milestones.length === 0) {
      return jsonResponse({ success: true, skipped: true, reason: 'No milestones due in next 3 days' });
    }

    // Fetch deal info for each unique deal_id
    const dealIds = [...new Set(milestones.map((m: any) => m.deal_id))];
    const { data: deals, error: dealsErr } = await supabase
      .from('deals')
      .select('id, property_address, pipeline_stage, archived_at, closing_date')
      .in('id', dealIds)
      .is('archived_at', null);

    if (dealsErr) throw new Error('Deal fetch failed: ' + dealsErr.message);

    const dealMap = new Map((deals || []).map((d: any) => [d.id, d]));

    // Filter milestones to active deals only and group by deal
    const grouped = new Map<string, { deal: any; milestones: any[] }>();
    for (const m of milestones) {
      const deal = dealMap.get(m.deal_id);
      if (!deal) continue; // skip archived/terminated
      if (!grouped.has(m.deal_id)) {
        grouped.set(m.deal_id, { deal, milestones: [] });
      }
      const daysLeft = Math.ceil((new Date(m.due_date).getTime() - new Date(today).getTime()) / 86400000);
      grouped.get(m.deal_id)!.milestones.push({
        label: m.label || m.milestone,
        dueDate: m.due_date,
        daysLeft,
      });
    }

    if (grouped.size === 0) {
      return jsonResponse({ success: true, skipped: true, reason: 'No milestones on active deals' });
    }

    const totalMilestones = [...grouped.values()].reduce((sum, g) => sum + g.milestones.length, 0);

    const dateStr = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'America/Chicago',
    });

    // Build email HTML
    let emailHtml = `<!DOCTYPE html><html><body style="background-color:#f1f5f9;padding:32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:620px;margin:0 auto;padding:0 16px;">

<!-- Header -->
<div style="text-align:center;padding:24px 0 16px 0;">
  <div style="font-size:22px;font-weight:800;color:#0f172a;">⏰ Deadline Alert</div>
  <div style="font-size:13px;color:#64748b;margin-top:4px;">${dateStr}</div>
  <div style="font-size:14px;color:#dc2626;font-weight:700;margin-top:6px;">${totalMilestones} milestone${totalMilestones !== 1 ? 's' : ''} due in the next 3 days across ${grouped.size} deal${grouped.size !== 1 ? 's' : ''}</div>
</div>`;

    for (const [, g] of grouped) {
      const todayMilestones = g.milestones.filter((m: any) => m.daysLeft === 0);
      const borderColor = todayMilestones.length > 0 ? '#dc2626' : '#f59e0b';
      const headerBg = todayMilestones.length > 0 ? '#7f1d1d' : '#1e3a5f';

      emailHtml += `
<div style="background:#ffffff;border:2px solid ${borderColor};border-radius:10px;margin-bottom:16px;overflow:hidden;">
  <div style="background:${headerBg};padding:12px 18px;">
    <div style="font-size:14px;font-weight:700;color:#ffffff;">${g.deal.property_address}</div>
    <div style="font-size:11px;color:#93c5fd;margin-top:2px;">${g.deal.pipeline_stage || 'Active'}${g.deal.closing_date ? ` · Closes ${g.deal.closing_date}` : ''}</div>
  </div>
  <div style="padding:12px 18px;">`;

      for (const m of g.milestones) {
        const urgency = m.daysLeft === 0 ? '🔴' : m.daysLeft === 1 ? '🟠' : '🟡';
        const daysText = m.daysLeft === 0 ? '<strong>Due TODAY</strong>' : m.daysLeft === 1 ? '<strong>Due TOMORROW</strong>' : `Due in ${m.daysLeft} days`;
        const color = m.daysLeft === 0 ? '#dc2626' : m.daysLeft === 1 ? '#ea580c' : '#d97706';

        emailHtml += `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid #f1f5f9;">
      <div style="font-size:13px;font-weight:600;color:#1e293b;">${urgency} ${m.label}</div>
      <div style="font-size:12px;color:${color};font-weight:600;white-space:nowrap;margin-left:12px;">${daysText} · ${m.dueDate}</div>
    </div>`;
      }

      emailHtml += `  </div>
</div>`;
    }

    emailHtml += `
<div style="text-align:center;padding:16px 0 8px 0;">
  <div style="font-size:11px;color:#94a3b8;">TC Command · MyReDeal · ${dateStr}</div>
</div>
</div></body></html>`;

    const subject = `⏰ ${totalMilestones} Deadline${totalMilestones !== 1 ? 's' : ''} in 3 Days — ${dateStr}`;
    const result = await sendViaGmail({ to: ['tc@myredeal.com'], subject, bodyHtml: emailHtml });

    if (!result.success) throw new Error('Email send failed: ' + result.error);

    console.log('deadline-digest: sent', totalMilestones, 'milestones across', grouped.size, 'deals');

    return jsonResponse({
      success: true,
      milestones_found: totalMilestones,
      deals_affected: grouped.size,
      messageId: result.messageId,
    });
  } catch (err: any) {
    console.error('deadline-digest error:', err);
    return errorResponse(err.message);
  }
});
