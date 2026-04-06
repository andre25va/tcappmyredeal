// approve-notification Edge Function
// Sends a queued pending_notification by email and marks it as sent.
// Called from the Outbox tab when TC hits "Send".

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { getSupabaseClient, corsHeaders, jsonResponse, errorResponse } from './_shared/supabase.ts';
import { sendViaGmail } from './_shared/gmail.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const { notificationId, subject: overrideSubject, body: overrideBody } = await req.json();

    if (!notificationId) {
      return errorResponse('notificationId is required', 400);
    }

    const supabase = getSupabaseClient();

    // Fetch the notification — must still be pending
    const { data: notification, error: fetchErr } = await supabase
      .from('pending_notifications')
      .select('*')
      .eq('id', notificationId)
      .eq('status', 'pending')
      .single();

    if (fetchErr || !notification) {
      return errorResponse('Notification not found or already processed', 404);
    }

    const subject = overrideSubject || notification.subject;
    const body = overrideBody || notification.body;

    // Convert plain text body to minimal HTML
    const escapedBody = body
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');

    const bodyHtml = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;color:#111;max-width:600px;margin:0 auto;padding:24px;line-height:1.6">
  ${escapedBody}
</body>
</html>`;

    // Send via Gmail
    const sendResult = await sendViaGmail({
      to: [notification.recipient_email],
      subject,
      bodyHtml,
    });

    if (!sendResult.success) {
      return errorResponse(`Failed to send email: ${sendResult.error}`, 502);
    }

    // Mark as sent and save any edits
    const { error: updateErr } = await supabase
      .from('pending_notifications')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        subject,
        body,
      })
      .eq('id', notificationId);

    if (updateErr) {
      console.error('Failed to update status:', updateErr);
    }

    return jsonResponse({ success: true, messageId: sendResult.messageId });
  } catch (err) {
    console.error('approve-notification error:', err);
    return errorResponse(err.message);
  }
});
