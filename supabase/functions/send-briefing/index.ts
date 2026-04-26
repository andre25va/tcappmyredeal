// send-briefing Edge Function - v28
// v28: Upgraded _shared/gmail.ts to v3 gold standard (RFC 2047 subject encoding)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { sendViaGmail } from './_shared/gmail.ts';
import { getSupabaseClient, corsHeaders, jsonResponse, errorResponse } from './_shared/supabase.ts';

const FOLLOWUP_BASE_URL = 'https://alxrmusieuzgssynktxg.supabase.co/functions/v1/followup-draft';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = getSupabaseClient();
    const { data: configs } = await supabase.from('briefing_config').select('*').limit(1);
    if (!configs?.length) return jsonResponse({ skipped: true, reason: 'No briefing config found' });
    const config = configs[0];
    if (!config.enabled) return jsonResponse({ skipped: true, reason: 'Briefing disabled' });

    if (config.last_sent_at) {
      const lastSentDate = new Date(config.last_sent_at).toLocaleDateString('en-US', { timeZone: config.timezone });
      const todayDate = new Date().toLocaleDateString('en-US', { timeZone: config.timezone });
      if (lastSentDate === todayDate) return jsonResponse({ skipped: true, reason: 'Already sent today' });
    }

    const today = new Date().toISOString().split('T')[0];
    const fourteenDays = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

    const { data: rawDeals, error: queryError } = await supabase
      .from('deals')
      .select('id, property_address, closing_date, status, pipeline_stage, purchase_price');
    if (queryError) return errorResponse('Failed to query deals: ' + queryError.message);

    const allDeals = (rawDeals || []).filter((d: any) =>
      !['closed','archived','cancelled','terminated'].includes(d.status)
    );

    const { data: allTasks } = await supabase
      .from('tasks').select('id, deal_id, title, status, priority, due_date');

    const calcDays = (dt: string) =>
      Math.ceil((new Date(dt).getTime() - new Date(today).getTime()) / 86400000);

    const statusLabel = (s: string) => {
      const l = s.toLowerCase();
      if (l.includes('contract')) return 'Under Contract';
      if (l.includes('clear')) return 'Clear to Close';
      if (l.includes('diligence')) return 'Due Diligence';
      return s;
    };
    const statusColor = (s: string) => {
      const l = s.toLowerCase();
      if (l.includes('clear')) return '#059669';
      if (l.includes('contract')) return '#2563eb';
      if (l.includes('diligence')) return '#d97706';
      return '#6b7280';
    };
    const btn = (taskId: string, label: string, color: string) =>
      `<a href="${FOLLOWUP_BASE_URL}?task_id=${taskId}" target="_blank" style="display:inline-block;background:${color};color:#fff;font-size:11px;font-weight:600;padding:5px 12px;border-radius:5px;text-decoration:none;white-space:nowrap;">${label}</a>`;

    interface Task { id: string; title: string; dueDate: string; daysOverdue: number; }
    interface DealCard {
      id: string; address: string; status: string;
      closingDate: string|null; daysToClosing: number|null;
      overdue: Task[]; dueToday: Task[]; upcoming: Task[];
      score: number;
    }

    const cards: DealCard[] = allDeals.map((deal: any) => {
      const tasks = (allTasks || []).filter((t: any) => t.deal_id === deal.id && t.status !== 'completed');
      const dtc = deal.closing_date ? calcDays(deal.closing_date) : null;
      const overdue: Task[] = [], dueToday: Task[] = [], upcoming: Task[] = [];
      for (const t of tasks) {
        if (!t.due_date) continue;
        if (t.due_date < today) {
          const d = Math.floor((new Date(today).getTime() - new Date(t.due_date).getTime()) / 86400000);
          overdue.push({ id: t.id, title: t.title, dueDate: t.due_date, daysOverdue: d });
        } else if (t.due_date === today) {
          dueToday.push({ id: t.id, title: t.title, dueDate: t.due_date, daysOverdue: 0 });
        } else if (t.due_date <= fourteenDays) {
          upcoming.push({ id: t.id, title: t.title, dueDate: t.due_date, daysOverdue: 0 });
        }
      }
      overdue.sort((a, b) => b.daysOverdue - a.daysOverdue);
      upcoming.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      let score = 0;
      if (dtc !== null) {
        if (dtc <= 1) score += 1000;
        else if (dtc <= 3) score += 500;
        else if (dtc <= 7) score += 200;
      }
      score += overdue.length * 50 + overdue.reduce((s, t) => s + t.daysOverdue, 0) + dueToday.length * 10;
      return { id: deal.id, address: deal.property_address, status: deal.status || 'Active',
               closingDate: deal.closing_date, daysToClosing: dtc, overdue, dueToday, upcoming, score };
    });

    cards.sort((a, b) => b.score - a.score);

    const critical = cards.filter(d => d.daysToClosing !== null && d.daysToClosing >= 0 && d.daysToClosing <= 3);
    const actionable = cards.filter(d => d.overdue.length > 0 || d.dueToday.length > 0 || (d.daysToClosing !== null && d.daysToClosing <= 14));
    const idle = cards.filter(d => d.overdue.length === 0 && d.dueToday.length === 0 && (d.daysToClosing === null || d.daysToClosing > 14));
    const totalOverdue = cards.reduce((s, d) => s + d.overdue.length, 0);
    const totalToday = cards.reduce((s, d) => s + d.dueToday.length, 0);

    const dateStr = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: config.timezone
    });

    let html = `<!DOCTYPE html><html><body style="background:#f1f5f9;padding:32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:660px;margin:0 auto;padding:0 16px;">
<div style="text-align:center;padding:24px 0 18px;">
  <div style="font-size:22px;font-weight:800;color:#0f172a;">TC Command</div>
  <div style="font-size:13px;color:#64748b;margin-top:4px;">${dateStr}</div>
</div>`;

    if (critical.length > 0) {
      html += `<div style="background:#7f1d1d;border-radius:10px;padding:18px 20px;margin-bottom:18px;">
<div style="font-size:15px;font-weight:800;color:#fef2f2;margin-bottom:8px;">CLOSING ALERT - Action Required Today</div>`;
      for (const d of critical) {
        const lbl = d.daysToClosing === 0 ? 'CLOSING TODAY' : d.daysToClosing === 1 ? 'CLOSING TOMORROW' : `CLOSING IN ${d.daysToClosing} DAYS`;
        html += `<div style="font-size:13px;color:#fecaca;margin-top:4px;"><strong style="color:#fff;">${d.address}</strong> - ${lbl}</div>`;
      }
      html += `<div style="font-size:12px;color:#fca5a5;margin-top:10px;">Complete all remaining tasks before close of escrow.</div></div>`;
    }

    const stats = [
      ['#1e3a5f','#dbeafe', allDeals.length, 'Active Deals'],
      ['#7f1d1d','#fee2e2', totalOverdue, 'Overdue Tasks'],
      ['#713f12','#fef9c3', totalToday, 'Due Today'],
      ['#14532d','#dcfce7', critical.length, 'Closing &lt;=3 Days'],
    ];
    html += `<table style="width:100%;border-collapse:collapse;margin-bottom:18px;"><tr>`;
    for (const [tc,bg,val,lbl] of stats) {
      html += `<td style="padding:4px;"><div style="background:${bg};border-radius:8px;padding:12px 8px;text-align:center;"><div style="font-size:26px;font-weight:800;color:${tc};">${val}</div><div style="font-size:10px;color:${tc};font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">${lbl}</div></div></td>`;
    }
    html += `</tr></table>`;

    if (actionable.length > 0) {
      html += `<div style="font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.7px;margin-bottom:10px;">Action Needed</div>`;
      for (const d of actionable) {
        const isCrit = d.daysToClosing !== null && d.daysToClosing >= 0 && d.daysToClosing <= 3;
        const border = isCrit ? '#dc2626' : d.overdue.length > 0 ? '#f59e0b' : '#e2e8f0';
        const badge = isCrit ? '#dc2626' : d.overdue.length > 0 ? '#d97706' : statusColor(d.status);
        const closeTxt = d.daysToClosing !== null
          ? d.daysToClosing <= 0 ? 'CLOSING TODAY'
          : d.daysToClosing === 1 ? 'CLOSING TOMORROW'
          : d.daysToClosing <= 3 ? `${d.daysToClosing} days to close`
          : `${d.daysToClosing} days to close` : '';

        html += `<div style="background:#fff;border:2px solid ${border};border-radius:10px;margin-bottom:14px;overflow:hidden;">`;
        html += `<div style="background:${badge}11;border-bottom:1px solid ${border}44;padding:12px 16px;">`;
        html += `<table style="width:100%;border-collapse:collapse;"><tr>`;
        html += `<td><div style="font-size:14px;font-weight:700;color:#0f172a;">${d.address}</div>`;
        html += `<div style="margin-top:3px;"><span style="background:${badge}22;color:${badge};font-weight:600;padding:2px 7px;border-radius:4px;font-size:11px;">${statusLabel(d.status)}</span>${closeTxt ? ` <span style="font-size:12px;color:#475569;margin-left:8px;">${closeTxt}</span>` : ''}</div></td>`;
        if (d.overdue.length > 0) html += `<td style="text-align:right;white-space:nowrap;"><span style="background:#fef2f2;color:#dc2626;font-size:11px;font-weight:700;padding:3px 9px;border-radius:5px;">${d.overdue.length} OVERDUE</span></td>`;
        html += `</tr></table></div><div style="padding:10px 16px;">`;

        if (d.overdue.length > 0) {
          html += `<div style="font-size:11px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Overdue</div>`;
          for (const t of d.overdue) {
            html += `<table style="width:100%;border-collapse:collapse;margin-bottom:6px;"><tr>`;
            html += `<td style="padding:5px 0;"><div style="font-size:13px;font-weight:600;color:#1e293b;">${t.title}</div><div style="font-size:11px;color:#dc2626;margin-top:1px;">${t.daysOverdue} day${t.daysOverdue!==1?'s':''} overdue - due ${t.dueDate}</div></td>`;
            html += `<td style="text-align:right;padding-left:10px;white-space:nowrap;">${btn(t.id,'Draft Follow-Up','#dc2626')}</td></tr></table>`;
          }
        }

        if (d.dueToday.length > 0) {
          html += `<div style="font-size:11px;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:0.5px;margin:${d.overdue.length>0?'8px':0} 0 6px;">Due Today</div>`;
          for (const t of d.dueToday) {
            html += `<table style="width:100%;border-collapse:collapse;margin-bottom:6px;"><tr>`;
            html += `<td style="padding:5px 0;"><div style="font-size:13px;font-weight:600;color:#1e293b;">${t.title}</div><div style="font-size:11px;color:#d97706;margin-top:1px;">Due today - complete before EOD</div></td>`;
            html += `<td style="text-align:right;padding-left:10px;white-space:nowrap;">${btn(t.id,'Draft Follow-Up','#059669')}</td></tr></table>`;
          }
        }

        if (d.upcoming.length > 0) {
          html += `<div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin:8px 0 5px;">Coming Up</div>`;
          for (const t of d.upcoming.slice(0,3)) {
            html += `<div style="font-size:12px;color:#475569;padding:2px 0;">- ${t.title} <span style="color:#94a3b8;">- ${t.dueDate}</span></div>`;
          }
          if (d.upcoming.length > 3) html += `<div style="font-size:11px;color:#94a3b8;">+${d.upcoming.length-3} more</div>`;
        }

        if (!d.overdue.length && !d.dueToday.length && !d.upcoming.length) {
          html += `<div style="font-size:12px;color:#94a3b8;">No tasks due in the next 14 days</div>`;
        }
        html += `</div></div>`;
      }
    } else {
      html += `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px;text-align:center;margin-bottom:14px;"><div style="font-size:15px;color:#166534;font-weight:700;">All Clear!</div><div style="font-size:13px;color:#166534;margin-top:4px;">No overdue tasks or imminent closings.</div></div>`;
    }

    if (idle.length > 0) {
      html += `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin-bottom:14px;">`;
      html += `<div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Other Active Deals</div>`;
      html += `<table style="width:100%;border-collapse:collapse;font-size:12px;">`;
      for (const d of idle) {
        html += `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:6px 0;color:#334155;font-weight:500;">${d.address}</td><td style="padding:6px 0;color:#64748b;text-align:right;">${statusLabel(d.status)}</td><td style="padding:6px 0;color:#94a3b8;text-align:right;padding-left:14px;">${d.closingDate ? 'Closes '+d.closingDate : '-'}</td></tr>`;
      }
      html += `</table></div>`;
    }

    html += `<div style="background:#1e293b;border-radius:10px;padding:14px 18px;margin-bottom:18px;text-align:center;">
<div style="font-size:12px;color:#94a3b8;">Reminders active - nudges at <strong style="color:#f1f5f9;">1 PM</strong> &amp; <strong style="color:#f1f5f9;">3 PM</strong> for anything unfinished. Items stay until marked complete in TC Command.</div></div>`;

    html += `<div style="text-align:center;padding:14px 0 8px;"><div style="font-size:11px;color:#94a3b8;">TC Command - MyReDeal - ${dateStr}</div></div></div></body></html>`;

    const recipients = config.to_addresses || ['tc@myredeal.com'];
    const subject = critical.length > 0
      ? `TC Brief - ${critical.length} Closing Alert${critical.length>1?'s':''} + ${totalOverdue} Overdue`
      : totalOverdue > 0 ? `TC Brief - ${totalOverdue} Overdue - ${dateStr}`
      : `TC Brief - All Clear - ${dateStr}`;

    const result = await sendViaGmail({ to: recipients, subject, bodyHtml: html });
    if (!result.success) return errorResponse('Failed to send: ' + result.error);

    await supabase.from('email_send_log').insert({
      deal_id: null, template_id: null, template_name: 'Morning Briefing v28',
      to_addresses: recipients, cc_addresses: [], subject, body_html: html,
      gmail_message_id: result.messageId, gmail_thread_id: result.threadId,
      email_type: 'briefing', sent_by: 'system',
    });
    await supabase.from('briefing_config').update({ last_sent_at: new Date().toISOString() }).eq('id', config.id);

    return jsonResponse({ success: true, deals: allDeals.length, actionable: actionable.length, critical: critical.length, overdue: totalOverdue, today: totalToday });
  } catch (err) {
    console.error(err);
    return errorResponse((err as Error).message);
  }
});
