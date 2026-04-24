// pre-close-digest Edge Function v1
// Finds deals closing in exactly 3 days → sends TC a pre-close checklist email
// Called daily by n8n at 8am CST (N2)

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
    // Target date: exactly 3 days from now (in CT)
    const targetDate = new Date(today.getTime() + 3 * 86400000).toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];

    // 1. Find deals closing in 3 days (active, not archived)
    const { data: deals, error: dealsErr } = await supabase
      .from('deals')
      .select('id, property_address, city, state, closing_date, buyer_name, seller_name, loan_type, purchase_price, title_company_name, org_id')
      .eq('closing_date', targetDate)
      .is('archived_at', null);

    if (dealsErr) throw new Error('Deal fetch failed: ' + dealsErr.message);

    if (!deals || deals.length === 0) {
      return jsonResponse({ success: true, skipped: true, reason: `No deals closing on ${targetDate}` });
    }

    const dealIds = deals.map((d: any) => d.id);

    // 2. Fetch all timeline milestones for these deals
    const { data: milestones, error: msErr } = await supabase
      .from('deal_timeline')
      .select('deal_id, milestone, label, due_date, status')
      .in('deal_id', dealIds)
      .order('due_date', { ascending: true });

    if (msErr) throw new Error('Timeline fetch failed: ' + msErr.message);

    // 3. Fetch open tasks for these deals
    const { data: tasks, error: tasksErr } = await supabase
      .from('tasks')
      .select('deal_id, title, status, due_date, priority')
      .in('deal_id', dealIds)
      .not('status', 'in', '(complete,completed,done)');

    if (tasksErr) throw new Error('Tasks fetch failed: ' + tasksErr.message);

    // 4. Fetch open requests for these deals
    const { data: requests, error: reqErr } = await supabase
      .from('requests')
      .select('deal_id, title, status, due_by')
      .in('deal_id', dealIds)
      .not('status', 'in', '(completed,received,cancelled)');

    if (reqErr) throw new Error('Requests fetch failed: ' + reqErr.message);

    // Group milestones, tasks, requests by deal
    const msMap = new Map<string, any[]>();
    for (const m of (milestones || [])) {
      if (!msMap.has(m.deal_id)) msMap.set(m.deal_id, []);
      msMap.get(m.deal_id)!.push(m);
    }

    const taskMap = new Map<string, any[]>();
    for (const t of (tasks || [])) {
      if (!taskMap.has(t.deal_id)) taskMap.set(t.deal_id, []);
      taskMap.get(t.deal_id)!.push(t);
    }

    const reqMap = new Map<string, any[]>();
    for (const r of (requests || [])) {
      if (!reqMap.has(r.deal_id)) reqMap.set(r.deal_id, []);
      reqMap.get(r.deal_id)!.push(r);
    }

    const dateStr = today.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'America/Chicago',
    });

    const closingDateFormatted = new Date(targetDate + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });

    // Build email HTML
    let emailHtml = `<!DOCTYPE html><html><body style="background-color:#f1f5f9;padding:32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:640px;margin:0 auto;padding:0 16px;">

<!-- Header -->
<div style="text-align:center;padding:24px 0 20px 0;">
  <div style="font-size:24px;font-weight:800;color:#0f172a;">🏁 Pre-Close Checklist</div>
  <div style="font-size:13px;color:#64748b;margin-top:4px;">${dateStr}</div>
  <div style="background:#dc2626;color:#ffffff;font-size:14px;font-weight:700;padding:8px 20px;border-radius:20px;display:inline-block;margin-top:10px;">
    ${deals.length} deal${deals.length !== 1 ? 's' : ''} closing in 3 days — ${closingDateFormatted}
  </div>
</div>`;

    for (const deal of deals) {
      const dms = msMap.get(deal.id) || [];
      const openTasks = taskMap.get(deal.id) || [];
      const openReqs = reqMap.get(deal.id) || [];

      // Categorize milestones
      const completed = dms.filter((m: any) => m.status === 'complete' || m.status === 'completed' || m.status === 'n/a');
      const overdue = dms.filter((m: any) => m.due_date < todayStr && m.status !== 'complete' && m.status !== 'completed' && m.status !== 'n/a');
      const pending = dms.filter((m: any) => m.due_date >= todayStr && m.status !== 'complete' && m.status !== 'completed' && m.status !== 'n/a');

      const totalMs = dms.length;
      const completedCount = completed.length;
      const pct = totalMs > 0 ? Math.round((completedCount / totalMs) * 100) : 0;
      const barColor = pct === 100 ? '#16a34a' : pct >= 75 ? '#d97706' : '#dc2626';

      const address = [deal.property_address, deal.city, deal.state].filter(Boolean).join(', ');
      const price = deal.purchase_price ? `$${Number(deal.purchase_price).toLocaleString()}` : '';

      emailHtml += `
<div style="background:#ffffff;border-radius:10px;margin-bottom:20px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
  
  <!-- Deal Header -->
  <div style="background:#1e3a5f;padding:14px 18px;">
    <div style="font-size:15px;font-weight:700;color:#ffffff;">${address}</div>
    <div style="font-size:12px;color:#93c5fd;margin-top:3px;">
      ${deal.buyer_name ? `Buyer: ${deal.buyer_name}` : ''}${deal.buyer_name && deal.seller_name ? ' · ' : ''}${deal.seller_name ? `Seller: ${deal.seller_name}` : ''}${price ? ` · ${price}` : ''}
    </div>
    ${deal.title_company_name ? `<div style="font-size:11px;color:#7dd3fc;margin-top:2px;">Title: ${deal.title_company_name}</div>` : ''}
  </div>

  <!-- Progress Bar -->
  <div style="padding:12px 18px 4px 18px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <div style="font-size:12px;font-weight:600;color:#475569;">Milestone Progress</div>
      <div style="font-size:12px;font-weight:700;color:${barColor};">${completedCount}/${totalMs} complete (${pct}%)</div>
    </div>
    <div style="background:#e2e8f0;border-radius:4px;height:8px;overflow:hidden;">
      <div style="background:${barColor};height:100%;width:${pct}%;border-radius:4px;"></div>
    </div>
  </div>

  <div style="padding:8px 18px 14px 18px;">`;

      // Overdue milestones (most urgent)
      if (overdue.length > 0) {
        emailHtml += `
    <div style="margin-top:10px;">
      <div style="font-size:11px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">⚠️ Overdue (${overdue.length})</div>`;
        for (const m of overdue) {
          emailHtml += `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:#fef2f2;border-radius:6px;margin-bottom:4px;">
        <div style="font-size:13px;font-weight:600;color:#991b1b;">🔴 ${m.label || m.milestone}</div>
        <div style="font-size:11px;color:#dc2626;white-space:nowrap;margin-left:12px;">Was due ${m.due_date}</div>
      </div>`;
        }
        emailHtml += `    </div>`;
      }

      // Pending milestones
      if (pending.length > 0) {
        emailHtml += `
    <div style="margin-top:10px;">
      <div style="font-size:11px;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">⏳ Pending (${pending.length})</div>`;
        for (const m of pending) {
          const daysUntil = Math.ceil((new Date(m.due_date).getTime() - today.getTime()) / 86400000);
          const dueTxt = daysUntil === 0 ? 'Due today' : daysUntil === 1 ? 'Due tomorrow' : `Due ${m.due_date}`;
          emailHtml += `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:#fffbeb;border-radius:6px;margin-bottom:4px;">
        <div style="font-size:13px;font-weight:600;color:#78350f;">🟡 ${m.label || m.milestone}</div>
        <div style="font-size:11px;color:#d97706;white-space:nowrap;margin-left:12px;">${dueTxt}</div>
      </div>`;
        }
        emailHtml += `    </div>`;
      }

      // Completed milestones (collapsed-style summary)
      if (completed.length > 0) {
        emailHtml += `
    <div style="margin-top:10px;">
      <div style="font-size:11px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">✅ Complete (${completed.length})</div>
      <div style="padding:7px 10px;background:#f0fdf4;border-radius:6px;">
        <div style="font-size:12px;color:#166534;">${completed.map((m: any) => m.label || m.milestone).join(' · ')}</div>
      </div>
    </div>`;
      }

      // Open tasks
      if (openTasks.length > 0) {
        emailHtml += `
    <div style="margin-top:12px;border-top:1px solid #f1f5f9;padding-top:10px;">
      <div style="font-size:11px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">📋 Open Tasks (${openTasks.length})</div>`;
        for (const t of openTasks.slice(0, 5)) {
          emailHtml += `
      <div style="font-size:12px;color:#4c1d95;padding:3px 0;">• ${t.title}${t.due_date ? ` <span style="color:#94a3b8;">(due ${t.due_date})</span>` : ''}</div>`;
        }
        if (openTasks.length > 5) {
          emailHtml += `<div style="font-size:11px;color:#94a3b8;margin-top:3px;">+ ${openTasks.length - 5} more tasks</div>`;
        }
        emailHtml += `    </div>`;
      }

      // Open requests
      if (openReqs.length > 0) {
        emailHtml += `
    <div style="margin-top:12px;border-top:1px solid #f1f5f9;padding-top:10px;">
      <div style="font-size:11px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">📬 Pending Document Requests (${openReqs.length})</div>`;
        for (const r of openReqs.slice(0, 5)) {
          emailHtml += `
      <div style="font-size:12px;color:#0c4a6e;padding:3px 0;">• ${r.title}${r.due_by ? ` <span style="color:#94a3b8;">(due ${r.due_by.split('T')[0]})</span>` : ''}</div>`;
        }
        if (openReqs.length > 5) {
          emailHtml += `<div style="font-size:11px;color:#94a3b8;margin-top:3px;">+ ${openReqs.length - 5} more requests</div>`;
        }
        emailHtml += `    </div>`;
      }

      // All clear
      if (overdue.length === 0 && pending.length === 0 && openTasks.length === 0 && openReqs.length === 0) {
        emailHtml += `
    <div style="margin-top:10px;text-align:center;padding:12px;background:#f0fdf4;border-radius:8px;">
      <div style="font-size:14px;font-weight:700;color:#16a34a;">🎉 All clear — ready to close!</div>
    </div>`;
      }

      emailHtml += `
  </div>
</div>`;
    }

    emailHtml += `
<div style="text-align:center;padding:16px 0 8px 0;">
  <div style="font-size:11px;color:#94a3b8;">TC Command · MyReDeal · ${dateStr}</div>
</div>
</div></body></html>`;

    const subject = `🏁 Pre-Close Check — ${deals.length} deal${deals.length !== 1 ? 's' : ''} closing ${closingDateFormatted}`;
    const result = await sendViaGmail({ to: ['tc@myredeal.com'], subject, bodyHtml: emailHtml });

    if (!result.success) throw new Error('Email send failed: ' + result.error);

    console.log('pre-close-digest: sent for', deals.length, 'deals closing on', targetDate);

    return jsonResponse({
      success: true,
      deals_found: deals.length,
      closing_date: targetDate,
      messageId: result.messageId,
    });
  } catch (err: any) {
    console.error('pre-close-digest error:', err);
    return errorResponse(err.message);
  }
});
