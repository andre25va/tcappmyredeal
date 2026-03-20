// send-email Edge Function
// Called by frontend "Send Now" button - sends email via Gmail API immediately
// Also handles inserting into scheduled_emails table for "Schedule" button

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { sendViaGmail } from '../_shared/gmail.ts';
import { getSupabaseClient, corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase.ts';

interface SendEmailRequest {
  // For immediate send
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  // Metadata
  dealId?: string;
  templateId?: string;
  templateName?: string;
  emailType?: string; // 'deal' | 'briefing' | 'manual'
  sentBy?: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload: SendEmailRequest = await req.json();

    // Validate required fields
    if (!payload.to?.length || !payload.subject || !payload.bodyHtml) {
      return errorResponse('Missing required fields: to, subject, bodyHtml', 400);
    }

    // Send via Gmail API
    const result = await sendViaGmail({
      to: payload.to,
      cc: payload.cc,
      bcc: payload.bcc,
      subject: payload.subject,
      bodyHtml: payload.bodyHtml,
    });

    if (!result.success) {
      // Log the failure
      const supabase = getSupabaseClient();
      await supabase.from('email_send_log').insert({
        deal_id: payload.dealId || null,
        template_id: payload.templateId || null,
        template_name: payload.templateName || null,
        to_addresses: payload.to,
        cc_addresses: payload.cc || [],
        subject: payload.subject,
        body_html: payload.bodyHtml,
        email_type: payload.emailType || 'deal',
        sent_by: payload.sentBy || 'system',
        gmail_message_id: null,
        gmail_thread_id: null,
      });

      return errorResponse(`Failed to send email: ${result.error}`, 502);
    }

    // Log successful send
    const supabase = getSupabaseClient();
    const { error: logError } = await supabase.from('email_send_log').insert({
      deal_id: payload.dealId || null,
      template_id: payload.templateId || null,
      template_name: payload.templateName || null,
      to_addresses: payload.to,
      cc_addresses: payload.cc || [],
      subject: payload.subject,
      body_html: payload.bodyHtml,
      gmail_message_id: result.messageId,
      gmail_thread_id: result.threadId,
      email_type: payload.emailType || 'deal',
      sent_by: payload.sentBy || 'system',
    });

    if (logError) {
      console.error('Failed to log email send:', logError);
    }

    return jsonResponse({
      success: true,
      messageId: result.messageId,
      threadId: result.threadId,
    });
  } catch (error) {
    console.error('send-email error:', error);
    return errorResponse(error.message);
  }
});
