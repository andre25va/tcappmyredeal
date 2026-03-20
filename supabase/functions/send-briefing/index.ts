// send-briefing Edge Function
// Daily morning briefing - queries deals data and sends summary email
// Triggered by cron job at configured time

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

    // Check if already sent today (prevent duplicates)
    if (config.last_sent_at) {
      const lastSent = new Date(config.last_sent_at);
      const now = new Date();
      // Convert to configured timezone for date comparison
      const lastSentDate = lastSent.toLocaleDateString('en-US', { timeZone: config.timezone });
      const todayDate = now.toLocaleDateString('en-US', { timeZone: config.timezone });
      if (lastSentDate === todayDate) {
        return jsonResponse({ skipped: true, reason: 'Already sent today' });
      }
    }

    // Gather briefing data
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    const sections: string[] = [];

    // --- Overdue Tasks ---
    if (config.include_overdue_tasks) {
      const { data: deals } = await supabase
        .from('deals')
        .select('id, property_address, closing_date, status, deal_data')
        .eq('status', 'active');

      const overdueTasks: { address: string; task: string; dueDate: string }[] = [];

      if (deals) {
        for (const deal of deals) {
          const dealData = deal.deal_data || {};
          const tasks = dealData.tasks || [];
          const reminders = dealData.reminders || [];
          const checklists = dealData.checklists || [];

          // Check tasks
          for (const task of tasks) {
            if (!task.completed && task.dueDate && task.dueDate < today) {
              overdueTasks.push({
                address: deal.property_address,
                task: task.title || 'Untitled task',
                dueDate: task.dueDate,
              });
            }
          }

          // Check reminders
          for (const reminder of reminders) {
            if (!reminder.completed && reminder.dueDate && reminder.dueDate < today) {
              overdueTasks.push({
                address: deal.property_address,
                task: `Reminder: ${reminder.message || 'No description'}`,
                dueDate: reminder.dueDate,
              });
            }
          }

          // Check checklist items
          for (const checklist of checklists) {
            const items = checklist.items || [];
            for (const item of items) {
              if (!item.completed && item.dueDate && item.dueDate < today) {
                overdueTasks.push({
                  address: deal.property_address,
                  task: `Checklist: ${item.label || item.name || 'Untitled'}`,
                  dueDate: item.dueDate,
                });
              }
            }
          }
        }
      }

      if (overdueTasks.length > 0) {
        sections.push(`
          <div style="margin-bottom: 24px;">
            <h2 style="color: #dc2626; font-size: 18px; margin-bottom: 12px;">🚨 Overdue Tasks (${overdueTasks.length})</h2>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr style="background: #fef2f2; text-align: left;">
                <th style="padding: 8px; border-bottom: 2px solid #fecaca;">Property</th>
                <th style="padding: 8px; border-bottom: 2px solid #fecaca;">Task</th>
                <th style="padding: 8px; border-bottom: 2px solid #fecaca;">Due</th>
              </tr>
              ${overdueTasks.map(t => `
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #f3f4f6;">${t.address}</td>
                  <td style="padding: 8px; border-bottom: 1px solid #f3f4f6;">${t.task}</td>
                  <td style="padding: 8px; border-bottom: 1px solid #f3f4f6; color: #dc2626;">${t.dueDate}</td>
                </tr>
              `).join('')}
            </table>
          </div>
        `);
      }
    }

    // --- Upcoming Closes ---
    if (config.include_upcoming_closes) {
      const { data: upcomingDeals } = await supabase
        .from('deals')
        .select('property_address, closing_date, buyer_name, seller_name, purchase_price, status')
        .eq('status', 'active')
        .gte('closing_date', today)
        .lte('closing_date', nextWeek)
        .order('closing_date', { ascending: true });

      if (upcomingDeals?.length) {
        sections.push(`
          <div style="margin-bottom: 24px;">
            <h2 style="color: #d97706; font-size: 18px; margin-bottom: 12px;">📅 Upcoming Closes - Next 7 Days (${upcomingDeals.length})</h2>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr style="background: #fffbeb; text-align: left;">
                <th style="padding: 8px; border-bottom: 2px solid #fde68a;">Property</th>
                <th style="padding: 8px; border-bottom: 2px solid #fde68a;">Close Date</th>
                <th style="padding: 8px; border-bottom: 2px solid #fde68a;">Price</th>
                <th style="padding: 8px; border-bottom: 2px solid #fde68a;">Buyer</th>
              </tr>
              ${upcomingDeals.map(d => `
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #f3f4f6;">${d.property_address}</td>
                  <td style="padding: 8px; border-bottom: 1px solid #f3f4f6; font-weight: 600;">${d.closing_date}</td>
                  <td style="padding: 8px; border-bottom: 1px solid #f3f4f6;">$${Number(d.purchase_price || 0).toLocaleString()}</td>
                  <td style="padding: 8px; border-bottom: 1px solid #f3f4f6;">${d.buyer_name || 'N/A'}</td>
                </tr>
              `).join('')}
            </table>
          </div>
        `);
      }
    }

    // --- Pending Documents ---
    if (config.include_pending_docs) {
      const { data: deals } = await supabase
        .from('deals')
        .select('id, property_address, deal_data')
        .eq('status', 'active');

      const pendingDocs: { address: string; doc: string; urgency: string }[] = [];

      if (deals) {
        for (const deal of deals) {
          const dealData = deal.deal_data || {};
          const docRequests = dealData.documentRequests || dealData.documents || [];
          for (const doc of docRequests) {
            if (doc.status === 'pending') {
              pendingDocs.push({
                address: deal.property_address,
                doc: doc.name || doc.title || 'Untitled document',
                urgency: doc.urgency || 'medium',
              });
            }
          }
        }
      }

      if (pendingDocs.length > 0) {
        const urgencyColor: Record<string, string> = {
          high: '#dc2626',
          medium: '#d97706',
          low: '#6b7280',
        };

        sections.push(`
          <div style="margin-bottom: 24px;">
            <h2 style="color: #7c3aed; font-size: 18px; margin-bottom: 12px;">📄 Pending Documents (${pendingDocs.length})</h2>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr style="background: #f5f3ff; text-align: left;">
                <th style="padding: 8px; border-bottom: 2px solid #ddd6fe;">Property</th>
                <th style="padding: 8px; border-bottom: 2px solid #ddd6fe;">Document</th>
                <th style="padding: 8px; border-bottom: 2px solid #ddd6fe;">Urgency</th>
              </tr>
              ${pendingDocs.map(d => `
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #f3f4f6;">${d.address}</td>
                  <td style="padding: 8px; border-bottom: 1px solid #f3f4f6;">${d.doc}</td>
                  <td style="padding: 8px; border-bottom: 1px solid #f3f4f6; color: ${urgencyColor[d.urgency] || '#6b7280'}; font-weight: 600;">${d.urgency.toUpperCase()}</td>
                </tr>
              `).join('')}
            </table>
          </div>
        `);
      }
    }

    // --- Deal Pipeline Summary ---
    const { data: allActiveDeals } = await supabase
      .from('deals')
      .select('id, status, pipeline_stage')
      .eq('status', 'active');

    const totalActive = allActiveDeals?.length || 0;
    const stageGroups: Record<string, number> = {};
    if (allActiveDeals) {
      for (const d of allActiveDeals) {
        const stage = d.pipeline_stage || 'unknown';
        stageGroups[stage] = (stageGroups[stage] || 0) + 1;
      }
    }

    const stageLabels: Record<string, string> = {
      contract_received: 'Contract Received',
      option_period: 'Option Period',
      pending: 'Pending',
      clear_to_close: 'Clear to Close',
      closed: 'Closed',
    };

    sections.unshift(`
      <div style="margin-bottom: 24px; padding: 16px; background: #f0f9ff; border-radius: 8px; border: 1px solid #bae6fd;">
        <h2 style="color: #0369a1; font-size: 18px; margin: 0 0 12px 0;">📊 Pipeline Overview</h2>
        <p style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #0c4a6e;">${totalActive} Active Deals</p>
        <div style="font-size: 14px; color: #475569;">
          ${Object.entries(stageGroups).map(([stage, count]) => 
            `<span style="margin-right: 16px;">${stageLabels[stage] || stage}: <strong>${count}</strong></span>`
          ).join('')}
        </div>
      </div>
    `);

    // Build the full email
    const dateStr = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: config.timezone,
    });

    const noItems = sections.length <= 1; // Only pipeline overview

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 680px; margin: 0 auto; padding: 20px; color: #1e293b; background: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #e2e8f0;">
          <h1 style="font-size: 24px; color: #0f172a; margin: 0 0 4px;">☀️ Morning Briefing</h1>
          <p style="color: #64748b; margin: 0; font-size: 14px;">${dateStr}</p>
        </div>
        
        ${sections.join('')}
        
        ${noItems ? '<p style="text-align: center; color: #22c55e; font-size: 16px; padding: 20px;">✅ All clear! No overdue tasks, upcoming closes, or pending documents.</p>' : ''}
        
        <div style="text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
          <a href="https://tcappmyredeal.vercel.app" 
             style="display: inline-block; background: #2563eb; color: #ffffff; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
            Open TC Command →
          </a>
          <p style="color: #94a3b8; font-size: 12px; margin-top: 12px;">
            TC Command by Andre Vargas Team • Automated Daily Briefing
          </p>
        </div>
      </body>
      </html>
    `;

    // Send to all configured recipients
    const recipients = config.to_addresses || ['tc@myredeal.com'];

    const result = await sendViaGmail({
      to: recipients,
      subject: `☀️ TC Morning Briefing — ${dateStr}`,
      bodyHtml: emailHtml,
    });

    if (!result.success) {
      return errorResponse(`Failed to send briefing: ${result.error}`);
    }

    // Log the send
    await supabase.from('email_send_log').insert({
      deal_id: null,
      template_id: null,
      template_name: 'Morning Briefing',
      to_addresses: recipients,
      cc_addresses: [],
      subject: `☀️ TC Morning Briefing — ${dateStr}`,
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
      sectionsIncluded: sections.length,
    });
  } catch (error) {
    console.error('send-briefing error:', error);
    return errorResponse(error.message);
  }
});
