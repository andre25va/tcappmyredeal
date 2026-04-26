// send-nudge Edge Function - v3
// v3: Upgraded _shared/gmail.ts to v3 gold standard (RFC 2047 subject encoding)
// Called by n8n at 1 PM and 3 PM CST weekdays

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { sendViaGmail } from './_shared/gmail.ts';
import { getSupabaseClient, corsHeaders, jsonResponse, errorResponse } from './_shared/supabase.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = getSupabaseClient();
    const today = new Date().toISOString().split('T')[0];

    const { data: tasks, error: taskError } = await supabase
      .from('tasks')
      .select('id, title, due_date, deal_id, priority')
      .is('completed_at', null);

    const { data: deals, error: dealError } = await supabase
      .from('deals')
      .select('id, property_address, closing_date, status')
      .not('status', 'in', '("closed","archived","cancelled","terminated")');

    if (taskError || dealError) {
      return errorResponse('DB query failed: ' + (taskError?.message || dealError?.message));
    }

    const dealMap = new Map((deals || []).map((d: any) => [d.id, d]));

    interface NudgeItem {
      taskId: string;
      title: string;
      dueDate: string | null;
      daysOverdue: number;
      address: string;
      closingDate: string | null;
      daysToClosing: number | null;
      urgency: 'critical' | 'warning' | 'info';
    }

    const items: NudgeItem[] = [];
    const seenDealsClosingSoon = new Set<string>();

    for (const task of (tasks || [])) {
      const deal = dealMap.get(task.deal_id);
      if (!deal) continue;

      const daysOverdue = task.due_date
        ? Math.floor((new Date(today).getTime() - new Date(task.due_date).getTime()) / 86400000)
        : 0;
      const daysToClosing = deal.closing_date
        ? Math.ceil((new Date(deal.closing_date).getTime() - new Date(today).getTime()) / 86400000)
        : null;

      const isOverdue = task.due_date && task.due_date < today;
      const isClosingSoon = daysToClosing !== null && daysToClosing >= 0 && daysToClosing <= 3;

      if (!isOverdue && !isClosingSoon) continue;

      let urgency: 'critical' | 'warning' | 'info' = 'info';
      if ((isClosingSoon && (daysToClosing === 0 || daysToClosing === 1)) || daysOverdue >= 7) urgency = 'critical';
      else if ((isClosingSoon && daysToClosing <= 3) || daysOverdue >= 3) urgency = 'warning';

      items.push({
        taskId: task.id,
        title: task.title,
        dueDate: task.due_date,
        daysOverdue,
        address: deal.property_address,
        closingDate: deal.closing_date,
        daysToClosing,
        urgency,
      });

      if (isClosingSoon) seenDealsClosingSoon.add(deal.id);
    }

    for (const deal of (deals || [])) {
      if (seenDealsClosingSoon.has(deal.id)) continue;
      if (!deal.closing_date) continue;
      const daysToClosing = Math.ceil((new Date(deal.closing_date).getTime() - new Date(today).getTime()) / 86400000);
      if (daysToClosing >= 0 && daysToClosing <= 3) {
        items.push({
          taskId: '',
          title: '(No open tasks)',
          dueDate: null,
          daysOverdue: 0,
          address: deal.property_address,
          closingDate: deal.closing_date,
          daysToClosing,
          urgency: daysToClosing <= 1 ? 'critical' : 'warning',
        });
      }
    }

    if (items.length === 0) {
      return jsonResponse({ skipped: true, reason: 'No critical tasks or imminent closings' });
    }

    const grouped = new Map<string, NudgeItem[]>();
    for (const item of items) {
      if (!grouped.has(item.address)) grouped.set(item.address, []);
      grouped.get(item.address)!.push(item);
    }

    const now = new Date();
    const hour = now.toLocaleString('en-US', { hour: 'numeric', hour12: true, timeZone: 'America/Chicago' });
    const dateStr = now.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Chicago'
    });

    const dealCount = grouped.size;
    const taskCount = items.filter(i => i.taskId).length;
    const hasCritical = items.some(i => i.urgency === 'critical');

    let html = `<!DOCTYPE html><html><body style="background:#f1f5f9;padding:32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:0 16px;">
<div style="text-align:center;padding:20px 0 16px;">
  <div style="font-size:20px;font-weight:800;color:#0f172a;">TC Command Nudge</div>
  <div style="font-size:13px;color:#64748b;margin-top:4px;">${hour} - ${dateStr}</div>
</div>
<div style="background:${hasCritical ? '#7f1d1d' : '#1e3a5f'};border-radius:10px;padding:16px 20px;margin-bottom:18px;text-align:center;">
  <div style="font-size:16px;font-weight:800;color:#fff;">${taskCount} task${taskCount !== 1 ? 's' : ''} across ${dealCount} deal${dealCount !== 1 ? 's' : ''} need attention</div>
  <div style="font-size:12px;color:#cbd5e1;margin-top:6px;">Items stay in nudges until marked complete in TC Command.</div>
</div>`;

    for (const [address, dealItems] of grouped.entries()) {
      const topUrgency = dealItems.find(i => i.urgency === 'critical') ? 'critical'
        : dealItems.find(i => i.urgency === 'warning') ? 'warning' : 'info';
      const closingItem = dealItems.find(i => i.daysToClosing !== null);
      const dtc = closingItem?.daysToClosing;
      const closingBadge = dtc === 0 ? 'CLOSING TODAY'
        : dtc === 1 ? 'CLOSING TOMORROW'
        : dtc !== null && dtc <= 3 ? `Closing in ${dtc} days` : '';

      const borderColor = topUrgency === 'critical' ? '#dc2626' : topUrgency === 'warning' ? '#f59e0b' : '#e2e8f0';

      html += `<div style="background:#fff;border:2px solid ${borderColor};border-radius:10px;margin-bottom:14px;overflow:hidden;">`;
      html += `<div style="background:${borderColor}18;border-bottom:1px solid ${borderColor}44;padding:10px 16px;">`;
      html += `<div style="font-size:14px;font-weight:700;color:#0f172a;">${address}</div>`;
      if (closingBadge) html += `<div style="font-size:12px;color:#475569;margin-top:2px;">${closingBadge}</div>`;
      html += `</div><div style="padding:10px 16px;">`;

      for (const item of dealItems) {
        if (!item.taskId) continue;
        const overdueText = item.daysOverdue > 0
          ? ` - ${item.daysOverdue} day${item.daysOverdue !== 1 ? 's' : ''} overdue`
          : item.dueDate === today ? ' - Due today' : '';
        html += `<div style="padding:6px 0;border-bottom:1px solid #f1f5f9;">`;
        html += `<div style="font-size:13px;font-weight:600;color:#1e293b;">${item.title}<span style="color:${item.daysOverdue > 0 ? '#dc2626' : '#d97706'};font-size:11px;">${overdueText}</span></div>`;
        html += `</div>`;
      }

      html += `</div></div>`;
    }

    html += `<div style="text-align:center;padding:12px 0 8px;"><div style="font-size:11px;color:#94a3b8;">TC Command - MyReDeal - Next nudge check later today</div></div>
</div></body></html>`;

    const subject = hasCritical
      ? `TC Nudge - ${taskCount} critical item${taskCount !== 1 ? 's' : ''} - ${hour}`
      : `TC Nudge - ${taskCount} item${taskCount !== 1 ? 's' : ''} need attention - ${hour}`;

    const result = await sendViaGmail({ to: ['tc@myredeal.com'], subject, bodyHtml: html });
    if (!result.success) return errorResponse('Gmail send failed: ' + result.error);

    return jsonResponse({ success: true, taskCount, dealCount, messageId: result.messageId });
  } catch (err) {
    console.error(err);
    return errorResponse((err as Error).message);
  }
});
