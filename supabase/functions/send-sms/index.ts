// send-sms Edge Function
// Sends SMS via Twilio REST API

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { getSupabaseClient, corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase.ts';

interface SendSmsRequest {
  to: string;       // E.164 phone number
  body: string;     // SMS body text
  dealId?: string;
  nudgeLogId?: string;
  sentBy?: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload: SendSmsRequest = await req.json();

    // Validate required fields
    if (!payload.to || !payload.body) {
      return errorResponse('Missing required fields: to, body', 400);
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!accountSid || !authToken || !fromNumber) {
      return errorResponse('Twilio credentials not configured', 500);
    }

    // Send via Twilio REST API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const formBody = new URLSearchParams({
      To: payload.to,
      From: fromNumber,
      Body: payload.body,
    });

    const twilioRes = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody.toString(),
    });

    const twilioData = await twilioRes.json();

    if (!twilioRes.ok) {
      console.error('Twilio error:', twilioData);
      return errorResponse(`Twilio error: ${twilioData.message || 'Unknown error'}`, 502);
    }

    // Log to Supabase if nudgeLogId provided (optional tracking)
    if (payload.nudgeLogId) {
      try {
        const supabase = getSupabaseClient();
        await supabase.from('nudge_log').update({
          delivery_status: 'delivered',
        }).eq('id', payload.nudgeLogId);
      } catch (logErr) {
        console.error('Failed to update nudge_log:', logErr);
      }
    }

    return jsonResponse({
      success: true,
      messageSid: twilioData.sid,
      status: twilioData.status,
    });
  } catch (error) {
    console.error('send-sms error:', error);
    return errorResponse(error.message);
  }
});
