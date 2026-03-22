// send-briefing Edge Function
// Daily morning briefing - queries deals data and sends summary email
// Triggered by cron job at configured time
// Updated to match March 17 2026 format with all sections

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { sendViaGmail } from '../_shared/gmail.ts';
import { getSupabaseClient, corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase.ts';

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseClient();

    // Get briefing config
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

    // Check if already sent today
    if (config.last_sent_at) {
      const lastSent = new Date(config.last_sent_at);
      const now = new Date();
      const lastSentDate = lastSent.toLocaleDateString('en-US', { timeZone: config.timezone });
      const todayDate = now.toLocaleDateString('en-US', { timeZone: config.timezone });
      if (lastSentDate === todayDate) {
        return jsonResponse({ skipped: true, reason: 'Already sent today' });
      }
    }

    // Get all active deals
    const { data: allDeals } = await supabase
      .from('deals')
      .select('id, property_address, closing_date, status, pipeline_stage, deal_data, purchase_price, buyer_name, seller_name')
      .eq('status', 'active')
      .order('closing_date', { ascending: true });

    const today = new Date().toISOString().split('T')[0];
    const twoWeeksFromNow = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

    // Calculate deal stage counts
    const stageCounts = {
      total_active: allDeals?.length || 0,
      under_contract: 0,
      clear_to_close: 0,
      due_diligence: 0,
    };

    if (allDeals) {
      for (const deal of allDeals) {
        const stage = deal.pipeline_stage?.toLowerCase() || '';
        if (stage.includes('contract') || stage.includes('under contract')) {
          stageCounts.under_contract++;
        } else if (stage.includes('clear') || stage.includes('close')) {
          stageCounts.clear_to_close++;
        } else if (stage.includes('due diligence') || stage.includes('option')) {
          stageCounts.due_diligence++;
        }
      }
    }

    // Get overdue tasks
    const overdueTasks: { title: string; address: string; urgency: string; daysOverdue: number }[] = [];
    if (allDeals) {
      for (const deal of allDeals) {
        const dealData = deal.deal_data || {};
        const tasks = dealData.tasks || [];
        for (const task of tasks) {
          if (!task.completed && task.dueDate && task.dueDate < today) {
            const daysOverdue = Math.floor(
              (new Date(today).getTime() - new Date(task.dueDate).getTime()) / (1000 * 60 * 60 * 24)
            );
            overdueTasks.push({
              title: task.title || 'Untitled task',
              address: deal.property_address,
              urgency: task.priority || 'high',
              daysOverdue,
            });
          }
        }
      }
    }
    overdueTasks.sort((a, b) => b.daysOverdue - a.daysOverdue);

    // Get due today tasks
    const dueTodayTasks: { title: string; address: string; urgency: string }[] = [];
    if (allDeals) {
      for (const deal of allDeals) {
        const dealData = deal.deal_data || {};
        const tasks = dealData.tasks || [];
        for (const task of tasks) {
          if (!task.completed && task.dueDate === today) {
            dueTodayTasks.push({
              title: task.title || 'Untitled task',
              address: deal.property_address,
              urgency: task.priority || 'high',
            });
          }
        }
      }
    }

    // Get missing/pending documents
    const pendingDocs: { deal_id: string; address: string; docName: string }[] = [];
    if (allDeals) {
      for (const deal of allDeals) {
        const dealData = deal.deal_data || {};
        const docs = dealData.documents || [];
        for (const doc of docs) {
          if (doc.status === 'pending' || doc.status === 'missing') {
            pendingDocs.push({
              deal_id: deal.id,
              address: deal.property_address,
              docName: doc.name || doc.title || 'Untitled',
            });
          }
        }
      }
    }

    // Deals closing soon (next 14 days)
    const closingSoon = allDeals?.filter(
      d => d.closing_date && d.closing_date >= today && d.closing_date <= twoWeeksFromNow
    ) || [];

    // Calculate days left for each deal
    const calculateDaysLeft = (closeDate: string): number => {
      return Math.ceil((new Date(closeDate).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24));
    };

    // Format date
    const dateStr = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: config.timezone,
    });

    // Helper to format urgency badge
    const urgencyBadge = (urgency: string) => {
      const color = urgency.toLowerCase() === 'urgent' ? '#dc2626' : '#d97706';
      const bgColor = urgency.toLowerCase() === 'urgent' ? '#fef2f2' : '#fffbeb';
      return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:${bgColor};color:${color};margin-left:6px;">${urgency.toUpperCase()}</span>`;
    };

    // Build the email HTML
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <body style="background-color:#f8f9fa;padding:32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="max-width:640px;margin:0 auto;padding:0 16px;">

        <!-- HEADER -->
        <div style="text-align:center;padding:28px 0 20px 0;border-bottom:1px solid #e5e7eb;">
          <div style="font-size:20px;font-weight:700;color:#1a1a1a;letter-spacing:-0.3px;">TC Command · Daily Briefing</div>
          <div style="font-size:14px;color:#6b7280;margin-top:4px;">${dateStr}</div>
        </div>

        <!-- AI INSIGHTS -->
        <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;margin-top:24px;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
          <div style="font-size:16px;font-weight:700;color:#374151;margin-bottom:16px;">🧠 What Needs Your Attention</div>
          
          ${overdueTasks.length > 0 ? `
            <div style="margin-bottom:14px;font-size:14px;color:#1a1a1a;line-height:1.6;">
              <strong>Urgent:</strong> You have ${overdueTasks.length} overdue task${overdueTasks.length !== 1 ? 's' : ''} requiring immediate attention. The oldest is overdue by ${overdueTasks[0].daysOverdue} day${overdueTasks[0].daysOverdue !== 1 ? 's' : ''}.
            </div>
          ` : ''}

          ${closingSoon.length > 0 ? `
            <div style="margin-bottom:14px;font-size:14px;color:#1a1a1a;line-height:1.6;">
              <strong>Priority:</strong> ${closingSoon.length} deal${closingSoon.length !== 1 ? 's' : ''} closing within the next 14 days. Ensure all documentation and inspections are on track.
            </div>
          ` : ''}

          ${dueTodayTasks.length > 0 ? `
            <div style="margin-bottom:14px;font-size:14px;color:#1a1a1a;line-height:1.6;">
              <strong>Tip:</strong> Today has ${dueTodayTasks.length} task${dueTodayTasks.length !== 1 ? 's' : ''} due. Prioritize these to maintain deal momentum.
            </div>
          ` : ''}

          ${pendingDocs.length > 0 ? `
            <div style="font-size:14px;color:#1a1a1a;line-height:1.6;">
              <strong>Portfolio Insight:</strong> ${pendingDocs.length} document${pendingDocs.length !== 1 ? 's' : ''} pending across active deals. Follow up with parties to ensure timely submission.
            </div>
          ` : ''}

          ${overdueTasks.length === 0 && closingSoon.length === 0 && dueTodayTasks.length === 0 && pendingDocs.length === 0 ? `
            <div style="font-size:14px;color:#1a1a1a;line-height:1.6;">
              ✅ All clear! Your pipeline is well-organized with no immediate blockers.
            </div>
          ` : ''}
        </div>

        <!-- ACTIVE DEALS SUMMARY -->
        <div style="margin-top:24px;">
          <div style="font-size:16px;font-weight:700;color:#374151;margin-bottom:12px;">Active Deals Summary</div>
          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            <div style="display:inline-block;min-width:148px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;text-align:center;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
              <div style="font-size:28px;font-weight:700;color:#2563eb;">${stageCounts.total_active}</div>
              <div style="font-size:11px;color:#6b7280;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px;">Total Active</div>
            </div>
            <div style="display:inline-block;min-width:148px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;text-align:center;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
              <div style="font-size:28px;font-weight:700;color:#6b7280;">${stageCounts.under_contract}</div>
              <div style="font-size:11px;color:#6b7280;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px;">Under Contract</div>
            </div>
            <div style="display:inline-block;min-width:148px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;text-align:center;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
              <div style="font-size:28px;font-weight:700;color:#059669;">${stageCounts.clear_to_close}</div>
              <div style="font-size:11px;color:#6b7280;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px;">Clear to Close</div>
            </div>
            <div style="display:inline-block;min-width:148px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;text-align:center;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
              <div style="font-size:28px;font-weight:700;color:#d97706;">${stageCounts.due_diligence}</div>
              <div style="font-size:11px;color:#6b7280;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px;">Due Diligence</div>
            </div>
          </div>
        </div>

        <!-- CLOSING SOON -->
        ${closingSoon.length > 0 ? `
          <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;margin-top:24px;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
            <div style="font-size:16px;font-weight:700;color:#374151;margin-bottom:16px;">Closing Soon — Next 14 Days</div>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr style="background:#f3f4f6;">
                <th style="text-align:left;padding:10px 12px;color:#374151;font-weight:600;border-bottom:1px solid #e5e7eb;">Address</th>
                <th style="text-align:left;padding:10px 12px;color:#374151;font-weight:600;border-bottom:1px solid #e5e7eb;">Close Date</th>
                <th style="text-align:left;padding:10px 12px;color:#374151;font-weight:600;border-bottom:1px solid #e5e7eb;">Days Left</th>
                <th style="text-align:left;padding:10px 12px;color:#374151;font-weight:600;border-bottom:1px solid #e5e7eb;">Stage</th>
              </tr>
              ${closingSoon.map(d => `
                <tr>
                  <td style="padding:10px 12px;color:#1a1a1a;border-bottom:1px solid #f3f4f6;">${d.property_address}</td>
                  <td style="padding:10px 12px;color:#1a1a1a;border-bottom:1px solid #f3f4f6;">${d.closing_date}</td>
                  <td style="padding:10px 12px;color:#1a1a1a;border-bottom:1px solid #f3f4f6;">${calculateDaysLeft(d.closing_date)} days</td>
                  <td style="padding:10px 12px;color:#1a1a1a;border-bottom:1px solid #f3f4f6;">${d.pipeline_stage || 'N/A'}</td>
                </tr>
              `).join('')}
            </table>
          </div>
        ` : ''}

        <!-- FULL PIPELINE -->
        ${allDeals && allDeals.length > 0 ? `
          <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;margin-top:24px;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
            <div style="font-size:16px;font-weight:700;color:#374151;margin-bottom:16px;">Full Pipeline</div>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <tr style="background:#f3f4f6;">
                <th style="text-align:left;padding:10px 12px;color:#374151;font-weight:600;border-bottom:1px solid #e5e7eb;">Address</th>
                <th style="text-align:left;padding:10px 12px;color:#374151;font-weight:600;border-bottom:1px solid #e5e7eb;">Close Date</th>
                <th style="text-align:left;padding:10px 12px;color:#374151;font-weight:600;border-bottom:1px solid #e5e7eb;">Days Left</th>
                <th style="text-align:left;padding:10px 12px;color:#374151;font-weight:600;border-bottom:1px solid #e5e7eb;">Stage</th>
              </tr>
              ${allDeals.map(d => d.closing_date ? `
                <tr>
                  <td style="padding:10px 12px;color:#1a1a1a;border-bottom:1px solid #f3f4f6;">${d.property_address}</td>
                  <td style="padding:10px 12px;color:#1a1a1a;border-bottom:1px solid #f3f4f6;">${d.closing_date}</td>
                  <td style="padding:10px 12px;color:#1a1a1a;border-bottom:1px solid #f3f4f6;">${calculateDaysLeft(d.closing_date)} days</td>
                  <td style="padding:10px 12px;color:#1a1a1a;border-bottom:1px solid #f3f4f6;">${d.pipeline_stage || 'N/A'}</td>
                </tr>
              ` : '').join('')}
            </table>
          </div>
        ` : ''}

        <!-- OVERDUE TASKS -->
        ${overdueTasks.length > 0 ? `
          <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;margin-top:24px;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
            <div style="font-size:16px;font-weight:700;color:#374151;margin-bottom:16px;">Overdue Tasks — ${overdueTasks.length} Task${overdueTasks.length !== 1 ? 's' : ''}</div>
            ${overdueTasks.map((task, idx) => `
              <div style="padding:12px 0;${idx < overdueTasks.length - 1 ? 'border-bottom:1px solid #f3f4f6;' : ''}">
                <div style="font-size:14px;font-weight:600;color:#1a1a1a;">
                  ${task.title}
                  ${urgencyBadge(task.urgency)}
                </div>
                <div style="font-size:13px;color:#6b7280;margin-top:4px;">${task.address} · <span style="color:#dc2626;">${task.daysOverdue} day${task.daysOverdue !== 1 ? 's' : ''} overdue</span></div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <!-- DUE TODAY -->
        ${dueTodayTasks.length > 0 ? `
          <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;margin-top:24px;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
            <div style="font-size:16px;font-weight:700;color:#374151;margin-bottom:16px;">Due Today — ${dueTodayTasks.length} Task${dueTodayTasks.length !== 1 ? 's' : ''}</div>
            ${dueTodayTasks.map((task, idx) => `
              <div style="padding:12px 0;${idx < dueTodayTasks.length - 1 ? 'border-bottom:1px solid #f3f4f6;' : ''}">
                <div style="font-size:14px;font-weight:600;color:#1a1a1a;">
                  ${task.title}
                  ${urgencyBadge(task.urgency)}
                </div>
                <div style="font-size:13px;color:#6b7280;margin-top:4px;">${task.address}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <!-- CALENDAR -->
        <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;margin-top:24px;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
          <div style="font-size:16px;font-weight:700;color:#374151;margin-bottom:16px;">Today's Calendar</div>
          <div style="font-size:14px;color:#6b7280;">No events scheduled</div>
        </div>

        <!-- MISSING DOCUMENTS -->
        <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;margin-top:24px;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
          <div style="font-size:16px;font-weight:700;color:#374151;margin-bottom:16px;">Missing Documents</div>
          ${pendingDocs.length === 0 ? `
            <div style="font-size:14px;color:#059669;">All deals have documents ✓</div>
          ` : `
            <div style="font-size:14px;color:#dc2626;">Pending documents: ${pendingDocs.length}</div>
          `}
        </div>

        <!-- FOOTER -->
        <div style="text-align:center;padding:24px 0 8px 0;margin-top:24px;border-top:1px solid #e5e7eb;">
          <div style="font-size:12px;color:#9ca3af;">TC Command · MyReDeal</div>
          <div style="font-size:11px;color:#9ca3af;margin-top:4px;">Generated ${dateStr} at ${new Date().toLocaleTimeString('en-US', { timeZone: config.timezone })} CT</div>
        </div>

      </div>
      </body>
      </html>
    `;

    // Send to recipients
    const recipients = config.to_addresses || ['tc@myredeal.com'];

    const result = await sendViaGmail({
      to: recipients,
      subject: \`☀️ TC Morning Briefing — \${dateStr}\`,
      bodyHtml: emailHtml,
    });

    if (!result.success) {
      return errorResponse(\`Failed to send briefing: \${result.error}\`);
    }

    // Log the send
    await supabase.from('email_send_log').insert({
      deal_id: null,
      template_id: null,
      template_name: 'Morning Briefing',
      to_addresses: recipients,
      cc_addresses: [],
      subject: \`☀️ TC Morning Briefing — \${dateStr}\`,
      body_html: emailHtml,
      gmail_message_id: result.messageId,
      gmail_thread_id: result.threadId,
      email_type: 'briefing',
      sent_by: 'system',
    });

    // Update last_sent_at
    await supabase
      .from('briefing_config')
      .update({ last_sent_at: new Date().toISOString() })
      .eq('id', config.id);

    return jsonResponse({
      success: true,
      messageId: result.messageId,
      recipients,
    });
  } catch (error) {
    console.error('send-briefing error:', error);
    return errorResponse(error.message);
  }
});
