import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  // Twilio sends form-encoded POST data
  const formData = await req.formData();
  const callSid    = formData.get('CallSid')    as string;
  const from       = formData.get('From')       as string;
  const to         = formData.get('To')         as string;
  const callStatus = formData.get('CallStatus') as string;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Look up contact by phone number (normalize formatting)
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, org_id, first_name, last_name')
    .or(`phone.eq.${from},phone.eq.${from.replace('+1','')}`)
    .maybeSingle();

  // Find most recent deal for this contact
  let dealId: string | null = null;
  if (contact) {
    const { data: participant } = await supabase
      .from('deal_participants')
      .select('deal_id')
      .eq('contact_id', contact.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    dealId = participant?.deal_id ?? null;
  }

  // Log the inbound call immediately
  await supabase.from('call_logs').insert({
    call_sid: callSid,
    from_number: from,
    to_number: to,
    direction: 'inbound',
    status: callStatus,
    contact_id: contact?.id ?? null,
    deal_id: dealId,
    org_id: contact?.org_id ?? null,
    created_at: new Date().toISOString(),
  });

  // Recording callback URL (same Supabase project)
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const recordingCallback = `${supabaseUrl}/functions/v1/voice-recording`;

  // TwiML: greet + record + transcribe
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hi, you've reached MyReDeal. Please leave a message and a transaction coordinator will return your call shortly.</Say>
  <Record
    maxLength="120"
    transcribe="true"
    transcribeCallback="${recordingCallback}"
    action="${recordingCallback}?event=completed"
    playBeep="true"
  />
  <Say voice="alice">Thank you for your message. Goodbye.</Say>
</Response>`;

  return new Response(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  });
});
