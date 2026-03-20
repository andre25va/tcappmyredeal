// process-scheduled Edge Function
// Cron job that runs every minute to process pending scheduled emails
// Picks up emails where scheduled_at <= now() and status = 'pending'

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { sendViaGmail } from '../_shared/gmail.ts';
import { getSupabaseClient, corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase.ts';

const MAX_RETRIES = 3;

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseClient();

    // Fetch pending emails that are due
    const { data: pendingEmails, error: fetchError } = await supabase
      .from('scheduled_emails')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .lt('retry_count', MAX_RETRIES)
      .order('scheduled_at', { ascending: true })
      .limit(10); // Process in batches of 10

    if (fetchError) {
      return errorResponse(`Failed to fetch scheduled emails: ${fetchError.message}`);
    }

    if (!pendingEmails?.length) {
      return jsonResponse({ processed: 0, message: 'No pending emails' });
    }

    const results = { sent: 0, failed: 0, errors: [] as string[] };

    for (const email of pendingEmails) {
      // Mark as processing to prevent duplicate sends
      await supabase
        .from('scheduled_emails')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', email.id)
        .eq('status', 'pending'); // Optimistic lock

      try {
        const sendResult = await sendViaGmail({
          to: email.to_addresses,
          cc: email.cc_addresses || [],
          bcc: email.bcc_addresses || [],
          subject: email.subject,
          bodyHtml: email.body_html,
        });

        if (sendResult.success) {
          // Mark as sent
          await supabase
            .from('scheduled_emails')
            .update({
              status: 'sent',
              updated_at: new Date().toISOString(),
            })
            .eq('id', email.id);

          // Log to email_send_log
          await supabase.from('email_send_log').insert({
            deal_id: email.deal_id,
            template_id: email.template_id,
            template_name: null,
            to_addresses: email.to_addresses,
            cc_addresses: email.cc_addresses || [],
            subject: email.subject,
            body_html: email.body_html,
            gmail_message_id: sendResult.messageId,
            gmail_thread_id: sendResult.threadId,
            email_type: email.email_type || 'deal',
            sent_by: email.created_by || 'system',
          });

          results.sent++;
        } else {
          // Increment retry count
          await supabase
            .from('scheduled_emails')
            .update({
              status: email.retry_count + 1 >= MAX_RETRIES ? 'failed' : 'pending',
              retry_count: email.retry_count + 1,
              error_message: sendResult.error,
              updated_at: new Date().toISOString(),
            })
            .eq('id', email.id);

          results.failed++;
          results.errors.push(`Email ${email.id}: ${sendResult.error}`);
        }
      } catch (err) {
        // Revert to pending with incremented retry
        await supabase
          .from('scheduled_emails')
          .update({
            status: email.retry_count + 1 >= MAX_RETRIES ? 'failed' : 'pending',
            retry_count: email.retry_count + 1,
            error_message: err.message,
            updated_at: new Date().toISOString(),
          })
          .eq('id', email.id);

        results.failed++;
        results.errors.push(`Email ${email.id}: ${err.message}`);
      }
    }

    return jsonResponse({
      processed: pendingEmails.length,
      sent: results.sent,
      failed: results.failed,
      errors: results.errors.length ? results.errors : undefined,
    });
  } catch (error) {
    console.error('process-scheduled error:', error);
    return errorResponse(error.message);
  }
});
