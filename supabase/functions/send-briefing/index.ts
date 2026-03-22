// send-briefing Edge Function - v17 (fixed box layout)
// Daily morning briefing - queries deals data and sends summary email

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { sendViaGmail } from './_shared/gmail.ts';
import { getSupabaseClient, corsHeaders, jsonResponse, errorResponse } from './_shared/supabase.ts';

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
    const { data: rawDeals, error: queryError } = await supabase
      .from('deals')
      .select('id, property_address, closing_date, status, pipeline_stage, deal_data, purchase_price, buyer_name, seller_name');

    if (queryError) {
      console.error('Deals query error:', queryError);
      return errorResponse('Failed to query deals: ' + queryError.message);
    }

    // Filter to active deals in application code
    const allDeals = (rawDeals || []).filter(d => 
      d.status !== 'closed' && 
      d.status !== 'archived' && 
      d.status !== 'cancelled'
    );

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
        const status = deal.status?.toLowerCase() || '';
        const stage = deal.pipeline_stage?.toLowerCase() || '';
        
        if (status.includes('contract') || stage.includes('contract')) {
          stageCounts.under_contract++;
        } else if (status.includes('clear') || stage.includes('clear')) {
          stageCounts.clear_to_close++;
        } else if (status.includes('diligence') || stage.includes('diligence')) {
          stageCounts.due_diligence++;
        }
      }
    }

    // Get all tasks
    const { data: allTasks } = await supabase
      .from('tasks')
      .select('id, deal_id, title, status, priority, due_date');

    // Get all documents
    const { data: allDocuments } = await supabase
      .from('documents')
      .select('id, deal_id, name, status');

    // Find overdue tasks
    const overdueTasks: { title: string; address: string; urgency: string; daysOverdue: number }[] = [];
    if (allTasks && allDeals) {
      for (const task of allTasks) {
        if (task.status !== 'completed' && task.due_date && task.due_date < today) {
          const dealMatch = allDeals.find(d => d.id === task.deal_id);
          if (dealMatch) {
            const daysOverdue = Math.floor(
              (new Date(today).getTime() - new Date(task.due_date).getTime()) / (1000 * 60 * 60 * 24)
            );
            overdueTasks.push({
              title: task.title,
              address: dealMatch.property_address,
              urgency: task.priority?.toUpperCase() || 'HIGH',
              daysOverdue,
            });
          }
        }
      }
    }
    overdueTasks.sort((a, b) => b.daysOverdue - a.daysOverdue);

    // Find tasks due today
    const dueTodayTasks: { title: string; address: string; urgency: string }[] = [];
    if (allTasks && allDeals) {
      for (const task of allTasks) {
        if (task.status !== 'completed' && task.due_date === today) {
          const dealMatch = allDeals.find(d => d.id === task.deal_id);
          if (dealMatch) {
            dueTodayTasks.push({
              title: task.title,
              address: dealMatch.property_address,
              urgency: task.priority?.toUpperCase() || 'HIGH',
            });
          }
        }
      }
    }

    // Find pending/missing documents
    const pendingDocs: { deal_id: string; address: string; docName: string }[] = [];
    if (allDocuments && allDeals) {
      for (const doc of allDocuments) {
        if (doc.status === 'pending' || doc.status === 'missing') {
          const dealMatch = allDeals.find(d => d.id === doc.deal_id);
          if (dealMatch) {
            pendingDocs.push({
              deal_id: doc.deal_id,
              address: dealMatch.property_address,
              docName: doc.name,
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
      const color = urgency === 'URGENT' ? '#dc2626' : '#d97706';
      const bgColor = urgency === 'URGENT' ? '#fef2f2' : '#fffbeb';
      return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:${bgColor};color:${color};margin-left:6px;">${urgency}</span>`;
    };

    // Build the email HTML
    let emailHtml = `<!DOCTYPE html><html><body style="background-color:#f8f9fa;padding:32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"><div style="max-width:640px;margin:0 auto;padding:0 16px;"><div style="text-align:center;padding:28px 0 20px 0;border-bottom:1px solid #e5e7eb;"><div style="font-size:20px;font-weight:700;color:#1a1a1a;letter-spacing:-0.3px;">TC Command - Daily Briefing</div><div style="font-size:14px;color:#6b7280;margin-top:4px;">${dateStr}</div></div><div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;margin-top:24px;box-shadow:0 1px 2px rgba(0,0,0,0.04);"><div style="font-size:16px;font-weight:700;color:#374151;margin-bottom:16px;">What Needs Your Attention</div>`;
    
    if (overdueTasks.length > 0) {
      emailHtml += `<div style="margin-bottom:14px;font-size:14px;color:#1a1a1a;line-height:1.6;"><strong>Urgent:</strong> You have ${overdueTasks.length} overdue task${overdueTasks.length !== 1 ? 's' : ''} requiring immediate attention. The oldest is overdue by ${overdueTasks[0].daysOverdue} day${overdueTasks[0].daysOverdue !== 1 ? 's' : ''}.</div>`;
    }

    if (closingSoon.length > 0) {
      emailHtml += `<div style="margin-bottom:14px;font-size:14px;color:#1a1a1a;line-height:1.6;"><strong>Priority:</strong> ${closingSoon.length} deal${closingSoon.length !== 1 ? 's' : ''} closing within the next 14 days. Ensure all documentation and inspections are on track.</div>`;
    }

    if (dueTodayTasks.length > 0) {
      emailHtml += `<div style="margin-bottom:14px;font-size:14px;color:#1a1a1a;line-height:1.6;"><strong>Tip:</strong> Today has ${dueTodayTasks.length} task${dueTodayTasks.length !== 1 ? 's' : ''} due. Prioritize these to maintain deal momentum.</div>`;
    }

    if (pendingDocs.length > 0) {
      emailHtml += `<div style="font-size:14px;color:#1a1a1a;line-height:1.6;"><strong>Portfolio Insight:</strong> ${pendingDocs.length} document${pendingDocs.length !== 1 ? 's' : ''} pending across active deals. Follow up with parties to ensure timely submission.</div>`;
    }

    if (overdueTasks.length === 0 && closingSoon.length === 0 && dueTodayTasks.length === 0 && pendingDocs.length === 0) {
      emailHtml += `<div style="font-size:14px;color:#1a1a1a;line-height:1.6;">All clear! Your pipeline is well-organized with no immediate blockers.</div>`;
    }

    emailHtml += `</div><div style="margin-top:24px;"><div style="font-size:16px;font-weight:700;color:#374151;margin-bottom:16px;">Active Deals Summary</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;text-align:center;box-shadow:0 1px 2px rgba(0,0,0,0.04);"><div style="font-size:32px;font-weight:700;color:#2563eb;">${stageCounts.total_active}</div><div style="font-size:11px;color:#6b7280;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px;">Total Active</div></div>
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;text-align:center;box-shadow:0 1px 2px rgba(0,0,0,0.04);"><div style="font-size:32px;font-weight:700;color:#6b7280;">${stageCounts.under_contract}</div><div style="font-size:11px;color:#6b7280;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px;">Under Contract</div></div>
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;text-align:center;box-shadow:0 1px 2px rgba(0,0,0,0.04);"><div style="font-size:32px;font-weight:700;color:#059669;">${stageCounts.clear_to_close}</div><div style="font-size:11px;color:#6b7280;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px;">Clear to Close</div></div>
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;text-align:center;box-shadow:0 1px 2px rgba(0,0,0,0.04);"><div style="font-size:32px;font-weight:700;color:#d97706;">${stageCounts.due_diligence}</div><div style="font-size:11px;color:#6b7280;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px;">Due Diligence</div></div>
    </div></div>`;

    // Closing soon section
    if (closingSoon.length > 0) {
      emailHtml += `<div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;margin-top:24px;box-shadow:0 1px 2px rgba(0,0,0,0.04);"><div style="font-size:16px;font-weight:700;color:#374151;margin-bottom:16px;">Closing Soon - Next 14 Days</div><table style="width:100%;border-collapse:collapse;font-size:14px;"><tr style="background:#f3f4f6;"><th style="text-align:left;padding:10px 12px;color:#374151;font-weight:600;border-bottom:1px solid #e5e7eb;">Address</th><th style="text-align:left;padding:10px 12px;color:#374151;font-weight:600;border-bottom:1px solid #e5e7eb;">Close Date</th><th style="text-align:left;padding:10px 12px;color:#374151;font-weight:600;border-bottom:1px solid #e5e7eb;">Days Left</th><th style="text-align:left;padding:10px 12px;color:#374151;font-weight:600;border-bottom:1px solid #e5e7eb;">Stage</th></tr>`;
      for (const d of closingSoon) {
        emailHtml += `<tr><td style="padding:10px 12px;color:#1a1a1a;border-bottom:1px solid #f3f4f6;">${d.property_address}</td><td style="padding:10px 12px;color:#1a1a1a;border-bottom:1px solid #f3f4f6;">${d.closing_date}</td><td style="padding:10px 12px;color:#1a1a1a;border-bottom:1px solid #f3f4f6;">${calculateDaysLeft(d.closing_date)} days</td><td style="padding:10px 12px;color:#1a1a1a;border-bottom:1px solid #f3f4f6;">${d.pipeline_stage || 'N/A'}</td></tr>`;
      }
      emailHtml += `</table></div>`;
    }

    // Full pipeline
    if (allDeals && allDeals.length > 0) {
      emailHtml += `<div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;margin-top:24px;box-shadow:0 1px 2px rgba(0,0,0,0.04);"><div style="font-size:16px;font-weight:700;color:#374151;margin-bottom:16px;">Full Pipeline</div><table style="width:100%;border-collapse:collapse;font-size:13px;"><tr style="background:#f3f4f6;"><th style="text-align:left;padding:10px 12px;color:#374151;font-weight:600;border-bottom:1px solid #e5e7eb;">Address</th><th style="text-align:left;padding:10px 12px;color:#374151;font-weight:600;border-bottom:1px solid #e5e7eb;">Close Date</th><th style="text-align:left;padding:10px 12px;color:#374151;font-weight:600;border-bottom:1px solid #e5e7eb;">Days Left</th><th style="text-align:left;padding:10px 12px;color:#374151;font-weight:600;border-bottom:1px solid #e5e7eb;">Stage</th></tr>`;
      for (const d of allDeals) {
        if (d.closing_date) {
          emailHtml += `<tr><td style="padding:10px 12px;color:#1a1a1a;border-bottom:1px solid #f3f4f6;">${d.property_address}</td><td style="padding:10px 12px;color:#1a1a1a;border-bottom:1px solid #f3f4f6;">${d.closing_date}</td><td style="padding:10px 12px;color:#1a1a1a;border-bottom:1px solid #f3f4f6;">${calculateDaysLeft(d.closing_date)} days</td><td style="padding:10px 12px;color:#1a1a1a;border-bottom:1px solid #f3f4f6;">${d.pipeline_stage || 'N/A'}</td></tr>`;
        }
      }
      emailHtml += `</table></div>`;
    }

    // Overdue tasks
    if (overdueTasks.length > 0) {
      emailHtml += `<div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;margin-top:24px;box-shadow:0 1px 2px rgba(0,0,0,0.04);"><div style="font-size:16px;font-weight:700;color:#374151;margin-bottom:16px;">Overdue Tasks - ${overdueTasks.length} Task${overdueTasks.length !== 1 ? 's' : ''}</div>`;
      for (let idx = 0; idx < overdueTasks.length; idx++) {
        const task = overdueTasks[idx];
        emailHtml += `<div style="padding:12px 0;${idx < overdueTasks.length - 1 ? 'border-bottom:1px solid #f3f4f6;' : ''}"><div style="font-size:14px;font-weight:600;color:#1a1a1a;">${task.title}${urgencyBadge(task.urgency)}</div><div style="font-size:13px;color:#6b7280;margin-top:4px;">${task.address} - ${task.daysOverdue} day${task.daysOverdue !== 1 ? 's' : ''} overdue</div></div>`;
      }
      emailHtml += `</div>`;
    }

    // Due today
    if (dueTodayTasks.length > 0) {
      emailHtml += `<div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;margin-top:24px;box-shadow:0 1px 2px rgba(0,0,0,0.04);"><div style="font-size:16px;font-weight:700;color:#374151;margin-bottom:16px;">Due Today - ${dueTodayTasks.length} Task${dueTodayTasks.length !== 1 ? 's' : ''}</div>`;
      for (let idx = 0; idx < dueTodayTasks.length; idx++) {
        const task = dueTodayTasks[idx];
        emailHtml += `<div style="padding:12px 0;${idx < dueTodayTasks.length - 1 ? 'border-bottom:1px solid #f3f4f6;' : ''}"><div style="font-size:14px;font-weight:600;color:#1a1a1a;">${task.title}${urgencyBadge(task.urgency)}</div><div style="font-size:13px;color:#6b7280;margin-top:4px;">${task.address}</div></div>`;
      }
      emailHtml += `</div>`;
    }

    // Calendar section
    emailHtml += `<div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;margin-top:24px;box-shadow:0 1px 2px rgba(0,0,0,0.04);"><div style="font-size:16px;font-weight:700;color:#374151;margin-bottom:16px;">Today's Calendar</div><div style="font-size:14px;color:#6b7280;">No events scheduled</div></div>`;

    // Missing documents
    emailHtml += `<div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;margin-top:24px;box-shadow:0 1px 2px rgba(0,0,0,0.04);"><div style="font-size:16px;font-weight:700;color:#374151;margin-bottom:16px;">Missing Documents</div><div style="font-size:14px;color:${pendingDocs.length === 0 ? '#059669' : '#dc2626'};">${pendingDocs.length === 0 ? 'All deals have documents' : 'Pending documents: ' + pendingDocs.length}</div></div>`;
    
    // Footer
    emailHtml += `<div style="text-align:center;padding:24px 0 8px 0;margin-top:24px;border-top:1px solid #e5e7eb;"><div style="font-size:12px;color:#9ca3af;">TC Command - MyReDeal</div><div style="font-size:11px;color:#9ca3af;margin-top:4px;">Generated ${dateStr} at ${new Date().toLocaleTimeString('en-US', { timeZone: config.timezone })} CT</div></div></div></body></html>`;

    // Send to recipients
    const recipients = config.to_addresses || ['tc@myredeal.com'];
    const subject = 'TC Command Briefing - ' + dateStr;

    const result = await sendViaGmail({
      to: recipients,
      subject: subject,
      bodyHtml: emailHtml,
    });

    if (!result.success) {
      return errorResponse('Failed to send briefing: ' + result.error);
    }

    // Log the send
    await supabase.from('email_send_log').insert({
      deal_id: null,
      template_id: null,
      template_name: 'Morning Briefing',
      to_addresses: recipients,
      cc_addresses: [],
      subject: subject,
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
      deals_found: allDeals?.length || 0,
      tasks_found: allTasks?.length || 0,
      documents_found: allDocuments?.length || 0,
      overdue_tasks: overdueTasks.length,
      closing_soon: closingSoon.length,
      pending_docs: pendingDocs.length,
    });
  } catch (error) {
    console.error('send-briefing error:', error);
    return errorResponse(error.message);
  }
});
