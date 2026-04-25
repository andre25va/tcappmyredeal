// n8n-health-digest Edge Function v1
// Accepts pre-built {subject, html} from n8n workflow and sends via Gmail to TC
// Called weekly every Monday 8am CST by R5 n8n workflow

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { sendViaGmail } from './_shared/gmail.ts';
import { corsHeaders, jsonResponse, errorResponse } from './_shared/supabase.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { subject, html } = body;

    if (!subject || !html) {
      return errorResponse('subject and html are required', 400);
    }

    await sendViaGmail({
      to: 'tc@myredeal.com',
      subject,
      html,
    });

    return jsonResponse({ success: true, sent_to: 'tc@myredeal.com' });
  } catch (err: any) {
    console.error('n8n-health-digest error:', err);
    return errorResponse(err.message || 'Unknown error', 500);
  }
});
