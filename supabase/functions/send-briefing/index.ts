// send-briefing Edge Function - v26
// v26: Deal-centric layout — one card per deal, inline tasks grouped under each deal,
//      urgent closing banners, TC action emphasis, persistent reminder language

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { sendViaGmail } from './_shared/gmail.ts';
import { getSupabaseClient, corsHeaders, jsonResponse, errorResponse } from './_shared/supabase.ts';

const FOLLOWUP_BASE_URL = 'https://alxrmusieuzgssynktxg.supabase.co/functions/v1/followup-draft';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseClient();

    const { data: configs, error: configError } = await supabase
      .from('briefing_config')
      .select('*')
      .limit(1);

    if (configError || !configs?.length) {
      return jsonResponse({ skipped: true, reason: 'No briefing config found' });
    }

    const config = configs[0];

    if (!config.enabled) {
      return jsonResponse({ skipped: true, reason: 'Briefing is disabled' });
    }

    if (config.last_sent_at) {
      const lastSent = new Date(config.last_sent_at);
      const now = new Date();
      const lastSentDate = lastSent.toLocaleDateString('en-US', { timeZone: config.timezone });
      const todayDate = now.toLocaleDateString('en-US', { timeZone: config.timezone });
      if (lastSentDate === todayDate) {
        return jsonResponse({ skipped: true, reason: 'Already sent today' });
      }
    }

    const today = new Date().toISOString().split('T')[0];
    const threeDaysFromNow = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
    const fourteenDaysFromNow = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

    const { data: rawDeals, error: queryError } = await supabase
      .from('deals')
      .select('id, property_address, closing_date, status, pipeline_stage, purchase_price, buyer_name, seller_name');

    if (queryError) {
      return errorResponse('Failed to query deals: ' + queryError.message);
    }

    const allDeals = (rawDeals || []).filter(d =>
      d.status !== 'closed' &&
      d.status !== 'archived' &&
      d.status !== 'cancelled' &&
      d.status !== 'terminated'
    );

    const { data: allTasks } = await supabase
      .from('tasks')
      .select('id, deal_id, title, status, priority, due_date');

    // Build deal cards with tasks
    interface DealCard {
      id: string;
      address: string;
      status: string;
      closingDate: string | null;
      daysToClosing: number | null;
      overdueTasks: TaskItem[];
      dueTodayTasks: TaskItem[];
      upcomingTasks: TaskItem[];
      urgencyScore: number; // higher = more urgent
    }

    interface TaskItem {
      id: string;
      title: string;
      dueDate: string;
      daysOverdue: number;
      priority: string;
    }

    const calculateDaysLeft = (closeDate: string): number => {
      return Math.ceil((new Date(closeDate).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24));
    };

    const dealCards: DealCard[] = allDeals.map(deal => {
      const dealTasks = (allTasks || []).filter(t => t.deal_id === deal.id && t.status !== 'completed');
      const daysToClosing = deal.closing_date ? calculateDaysLeft(deal.closing_date) : null;

      const overdueTasks: TaskItem[] = [];
      const dueTodayTasks: TaskItem[] = [];
      const upcomingTasks: TaskItem[] = [];

      for (const task of dealTasks) {
        if (!task.due_date) continue;
        if (task.due_date < today) {
          const daysOverdue = Math.floor(
            (new Date(today).getTime() - new Date(task.due_date).getTime()) / (1000 * 60 * 60 * 24)
          );
          overdueTasks.push({ id: task.id, title: task.title, dueDate: task.due_date, daysOverdue, priority: task.priority || 'normal' });
        } else if (task.due_date === today) {
          dueTodayTasks.push({ id: task.id, title: task.title, dueDate: task.due_date, daysOverdue: 0, priority: task.priority || 'normal' });
        } else if (task.due_date <= fourteenDaysFromNow) {
          upcomingTasks.push({ id: task.id, title: task.title, dueDate: task.due_date, daysOverdue: 0, priority: task.priority || 'normal' });
        }
      }

      overdueTasks.sort((a, b) => b.daysOverdue - a.daysOverdue);
      upcomingTasks.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

      // Urgency score: closing soon + overdue tasks
      let urgencyScore = 0;
      if (daysToClosing !== null && daysToClosing <= 1) urgencyScore += 1000;
      else if (daysToClosing !== null && daysToClosing <= 3) urgencyScore += 500;
      else if (daysToClosing !== null && daysToClosing <= 7) urgencyScore += 200;
      urgencyScore += overdueTasks.length * 50;
      urgencyScore += overdueTasks.reduce((sum, t) => sum + t.daysOverdue, 0);
      urgencyScore += dueTodayTasks.length * 10;

      return {
        id: deal.id,
        address: deal.property_address,
        status: deal.status || deal.pipeline_stage || 'Active',
        closingDate: deal.closing_date,
        daysToClosing,
        overdueTasks,
        dueTodayTasks,
        upcomingTasks,
        urgencyScore,
      };
    });

    // Sort by urgency (most urgent first)
    dealCards.sort((a, b) => b.urgencyScore - a.urgencyScore);

    // Only show deals with something actionable or closing soon
    const actionableDeals = dealCards.filter(d =>
      d.overdueTasks.length > 0 ||
      d.dueTodayTasks.length > 0 ||
      (d.daysToClosing !== null && d.daysToClosing <= 14)
    );

    // Critical closing ≤3 days
    const closingCritical = dealCards.filter(d => d.daysToClosing !== null && d.daysToClosing <= 3 && d.daysToClosing >= 0);

    const totalOverdue = dealCards.reduce((sum, d) => sum + d.overdueTasks.length, 0);
    const totalDueToday = dealCards.reduce((sum, d) => sum + d.dueTodayTasks.length, 0);

    const dateStr = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: config.timezone,
    });

    const statusLabel = (status: string): string => {
      const s = status.toLowerCase();
      if (s.includes('contract')) return 'Under Contract';
      if (s.includes('clear')) return 'Clear to Close';
      if (s.includes('diligence')) return 'Due Diligence';
      if (s.includes('closed')) return 'Closed';
      return status;
    };

    const statusColor = (status: string): string => {
      const s = status.toLowerCase();
      if (s.includes('clear')) return '#059669';
      if (s.includes('contract')) return '#2563eb';
      if (s.includes('diligence')) return '#d97706';
      return '#6b7280';
    };

    const taskBtnHtml = (taskId: string, label = '📬 Draft Follow-Up', color = '#2563eb') =>
      `<a href="${FOLLOWUP_BASE_URL}?task_id=${taskId}" target="_blank" style="display:inline-block;background:${color};color:#ffffff;font-size:11px;font-weight:600;padding:5px 12px;border-radius:5px;text-decoration:none;white-space:nowrap;">${label}</a>`;

    // ── Build Email ──
    let emailHtml = `<!DOCTYPE html><html><body style="background-color:#f1f5f9;padding:32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:660px;margin:0 auto;padding:0 16px;">

<!-- Header -->
<div style="text-align:center;padding:28px 0 20px 0;">
  <div style="font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.5px;">🏠 TC Command</div>
  <div style="font-size:13px;color:#64748b;margin-top:4px;">${dateStr}</div>
</div>`;

    // ── 🚨 Critical Closing Alert Banner ──
    if (closingCritical.length > 0) {
      emailHtml += `<div style="background:#7f1d1d;border-radius:10px;padding:18px 20px;margin-bottom:20px;">
  <div style="font-size:15px;font-weight:800;color:#fef2f2;margin-bottom:8px;">🚨 CLOSING ALERT — Action Required Today</div>`;
      for (const d of closingCritical) {
        const label = d.daysToClosing === 0 ? 'CLOSING TODAY' : d.daysToClosing === 1 ? 'CLOSING TOMORROW' : `CLOSING IN ${d.daysToClosing} DAYS`;
        emailHtml += `<div style="font-size:13px;color:#fecaca;margin-top:4px;">⚡ <strong style="color:#ffffff;">${d.address}</strong> — ${label}</div>`;
      }
      emailHtml += `<div style="font-size:12px;color:#fca5a5;margin-top:10px;">These deals need your full attention first. Complete all remaining tasks before close.</div>
</div>`;
    }

    // ── Summary Row ──
    const stageCounts = { total: allDeals.length, contract: 0, ctc: 0, dd: 0 };
    for (const deal of allDeals) {
      const s = (deal.status || '').toLowerCase();
      if (s.includes('contract')) stageCounts.contract++;
      else if (s.includes('clear')) stageCounts.ctc++;
      else if (s.includes('diligence')) stageCounts.dd++;
    }

    emailHtml += `<div style="display:flex;gap:10px;margin-bottom:20px;">
  ${[
    ['#1e3a5f', '#dbeafe', stageCounts.total, 'Active Deals'],
    ['#7f1d1d', '#fee2e2', totalOverdue, 'Overdue Tasks'],
    ['#713f12', '#fef9c3', totalDueToday, 'Due Today'],
    ['#14532d', '#dcfce7', closingCritical.length, 'Closing ≤3 Days'],
  ].map(([tc, bg, val, label]) =>
    `<div style="flex:1;background:${bg};border-radius:8px;padding:14px 10px;text-align:center;">
      <div style="font-size:28px;font-weight:800;color:${tc};">${val}</div>
      <div style="font-size:10px;color:${tc};font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">${label}</div>
    </div>`
  ).join('')}
</div>`;

    // ── Deal Cards ──
    if (actionableDeals.length > 0) {
      emailHtml += `<div style="font-size:13px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.7px;margin-bottom:10px;">📋 Your Deals — Action Needed</div>`;

      for (const deal of actionableDeals) {
        const isCritical = deal.daysToClosing !== null && deal.daysToClosing <= 3 && deal.daysToClosing >= 0;
        const borderColor = isCritical ? '#dc2626' : deal.overdueTasks.length > 0 ? '#f59e0b' : '#e2e8f0';
        const topBadgeBg = isCritical ? '#dc2626' : deal.overdueTasks.length > 0 ? '#d97706' : statusColor(deal.status);
        const closingText = deal.daysToClosing !== null
          ? deal.daysToClosing <= 0 ? '🔴 CLOSING TODAY'
          : deal.daysToClosing === 1 ? '🔴 CLOSING TOMORROW'
          : deal.daysToClosing <= 3 ? `🟡 ${deal.daysToClosing} days to close`
          : `🟢 ${deal.daysToClosing} days to close`
          : '';

        emailHtml += `<div style="background:#ffffff;border:2px solid ${borderColor};border-radius:10px;margin-bottom:16px;overflow:hidden;">
  <!-- Deal Header -->
  <div style="background:${topBadgeBg}08;border-bottom:1px solid ${borderColor}30;padding:14px 18px;display:flex;align-items:center;justify-content:space-between;">
    <div>
      <div style="font-size:15px;font-weight:700;color:#0f172a;">${deal.address}</div>
      <div style="font-size:12px;color:#64748b;margin-top:2px;">
        <span style="background:${topBadgeBg}18;color:${topBadgeBg};font-weight:600;padding:2px 8px;border-radius:4px;font-size:11px;">${statusLabel(deal.status)}</span>
        ${closingText ? `<span style="margin-left:10px;">${closingText}</span>` : ''}
      </div>
    </div>
    ${deal.overdueTasks.length > 0 ? `<div style="background:#fef2f2;color:#dc2626;font-size:11px;font-weight:700;padding:4px 10px;border-radius:6px;">${deal.overdueTasks.length} OVERDUE</div>` : ''}
  </div>
  <!-- Tasks -->
  <div style="padding:12px 18px;">`;

        // Overdue tasks under this deal
        if (deal.overdueTasks.length > 0) {
          emailHtml += `<div style="font-size:11px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">⚠️ Overdue</div>`;
          for (const task of deal.overdueTasks) {
            emailHtml += `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9;">
      <div>
        <div style="font-size:13px;font-weight:600;color:#1e293b;">${task.title}</div>
        <div style="font-size:11px;color:#dc2626;margin-top:2px;">${task.daysOverdue} day${task.daysOverdue !== 1 ? 's' : ''} overdue — due ${task.dueDate}</div>
      </div>
      <div style="margin-left:12px;flex-shrink:0;">${taskBtnHtml(task.id, '📬 Draft Follow-Up', '#dc2626')}</div>
    </div>`;
          }
        }

        // Due Today tasks
        if (deal.dueTodayTasks.length > 0) {
          emailHtml += `<div style="font-size:11px;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:0.5px;margin:${deal.overdueTasks.length > 0 ? '12px' : '0px'} 0 8px 0;">📅 Due Today</div>`;
          for (const task of deal.dueTodayTasks) {
            emailHtml += `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9;">
      <div>
        <div style="font-size:13px;font-weight:600;color:#1e293b;">${task.title}</div>
        <div style="font-size:11px;color:#d97706;margin-top:2px;">Due today — complete before EOD</div>
      </div>
      <div style="margin-left:12px;flex-shrink:0;">${taskBtnHtml(task.id, '📬 Draft Follow-Up', '#059669')}</div>
    </div>`;
          }
        }

        // Upcoming tasks (preview — no button, just awareness)
        if (deal.upcomingTasks.length > 0) {
          emailHtml += `<div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin:12px 0 6px 0;">🗓 Coming Up</div>`;
          for (const task of deal.upcomingTasks.slice(0, 3)) {
            emailHtml += `<div style="font-size:12px;color:#475569;padding:4px 0;">• ${task.title} <span style="color:#94a3b8;">— ${task.dueDate}</span></div>`;
          }
          if (deal.upcomingTasks.length > 3) {
            emailHtml += `<div style="font-size:11px;color:#94a3b8;padding:4px 0;">+${deal.upcomingTasks.length - 3} more upcoming tasks</div>`;
          }
        }

        if (deal.overdueTasks.length === 0 && deal.dueTodayTasks.length === 0 && deal.upcomingTasks.length === 0) {
          emailHtml += `<div style="font-size:12px;color:#94a3b8;padding:6px 0;">No tasks due in the next 14 days ✓</div>`;
        }

        emailHtml += `</div></div>`;
      }
    } else {
      emailHtml += `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px;text-align:center;margin-bottom:16px;">
  <div style="font-size:15px;color:#166534;font-weight:700;">✅ All Clear!</div>
  <div style="font-size:13px;color:#166534;margin-top:4px;">No overdue tasks or imminent closings. Pipeline is on track.</div>
</div>`;
    }

    // ── Idle Deals (no tasks, not closing soon) ──
    const idleDeals = dealCards.filter(d =>
      d.overdueTasks.length === 0 &&
      d.dueTodayTasks.length === 0 &&
      (d.daysToClosing === null || d.daysToClosing > 14)
    );
    if (idleDeals.length > 0) {
      emailHtml += `<div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:16px 18px;margin-bottom:16px;">
  <div style="font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">📁 Other Active Deals</div>
  <table style="width:100%;border-collapse:collapse;font-size:12px;">`;
      for (const d of idleDeals) {
        emailHtml += `<tr style="border-bottom:1px solid #f1f5f9;">
    <td style="padding:7px 0;color:#334155;font-weight:500;">${d.address}</td>
    <td style="padding:7px 0;color:#64748b;text-align:right;">${statusLabel(d.status)}</td>
    <td style="padding:7px 0;color:#94a3b8;text-align:right;padding-left:16px;">${d.closingDate ? `Closes ${d.closingDate}` : '—'}</td>
  </tr>`;
      }
      emailHtml += `</table></div>`;
    }

    // ── Nudge Reminder Footer ──
    emailHtml += `<div style="background:#1e293b;border-radius:10px;padding:16px 18px;margin-bottom:20px;text-align:center;">
  <div style="font-size:12px;color:#94a3b8;">⏰ <strong style="color:#f1f5f9;">Reminders active</strong> — you'll receive nudges at <strong style="color:#f1f5f9;">1 PM</strong> and <strong style="color:#f1f5f9;">3 PM</strong> for anything still unfinished. Tasks stay on the list until marked complete in TC Command.</div>
</div>`;

    // Footer
    emailHtml += `<div style="text-align:center;padding:16px 0 8px 0;"><div style="font-size:11px;color:#94a3b8;">TC Command · MyReDeal · Generated ${dateStr}</div></div>
</div></body></html>`;

    const recipients = config.to_addresses || ['tc@myredeal.com'];
    const subject = closingCritical.length > 0
      ? `🚨 TC Brief — ${closingCritical.length} Closing Alert${closingCritical.length > 1 ? 's' : ''} + ${totalOverdue} Overdue`
      : totalOverdue > 0
      ? `⚠️ TC Brief — ${totalOverdue} Overdue Task${totalOverdue !== 1 ? 's' : ''} · ${dateStr}`
      : `✅ TC Brief — ${dateStr}`;

    const result = await sendViaGmail({ to: recipients, subject, bodyHtml: emailHtml });

    if (!result.success) {
      return errorResponse('Failed to send briefing: ' + result.error);
    }

    await supabase.from('email_send_log').insert({
      deal_id: null,
      template_id: null,
      template_name: 'Morning Briefing v26',
      to_addresses: recipients,
      cc_addresses: [],
      subject,
      body_html: emailHtml,
      gmail_message_id: result.messageId,
      gmail_thread_id: result.threadId,
      email_type: 'briefing',
      sent_by: 'system',
    });

    await supabase
      .from('briefing_config')
      .update({ last_sent_at: new Date().toISOString() })
      .eq('id', config.id);

    return jsonResponse({
      success: true,
      messageId: result.messageId,
      recipients,
      deals_found: allDeals.length,
      actionable_deals: actionableDeals.length,
      closing_critical: closingCritical.length,
      overdue_tasks: totalOverdue,
      due_today: totalDueToday,
    });
  } catch (error) {
    console.error('send-briefing error:', error);
    return errorResponse(error.message);
  }
});
