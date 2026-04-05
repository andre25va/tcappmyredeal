import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  const formData = await req.formData();
  const callSid             = formData.get('CallSid')           as string;
  const recordingUrl        = formData.get('RecordingUrl')      as string | null;
  const recordingDuration   = formData.get('RecordingDuration') as string | null;
  const transcriptionText   = formData.get('TranscriptionText') as string | null;
  const transcriptionStatus = formData.get('TranscriptionStatus') as string | null;
  const event               = new URL(req.url).searchParams.get('event');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  if (event === 'completed') {
    // Call ended — update status and save recording URL + duration
    const updates: Record<string, unknown> = {
      status: 'completed',
      updated_at: new Date().toISOString(),
    };
    if (recordingUrl)      updates.recording_url = recordingUrl + '.mp3';
    if (recordingDuration) updates.duration = parseInt(recordingDuration, 10);

    await supabase
      .from('call_logs')
      .update(updates)
      .eq('call_sid', callSid);

  } else if (transcriptionText && transcriptionStatus === 'completed') {
    // Transcription ready — update transcript + generate AI summary
    const updates: Record<string, unknown> = {
      transcript: transcriptionText,
      updated_at: new Date().toISOString(),
    };

    // Generate AI summary if OpenAI key is available
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (openaiKey && transcriptionText.trim().length > 10) {
      try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: 'You are a real estate transaction coordinator assistant. Summarize this voicemail in 1-2 sentences. Note any action items, urgency, or key information. Be concise.',
              },
              { role: 'user', content: transcriptionText },
            ],
            max_tokens: 150,
            temperature: 0.3,
          }),
        });
        const json = await res.json();
        updates.ai_summary = json.choices?.[0]?.message?.content?.trim() ?? null;
      } catch (_) {
        // Silently continue without AI summary
      }
    }

    await supabase
      .from('call_logs')
      .update(updates)
      .eq('call_sid', callSid);

    // Also write to voice_deal_updates for TC review queue
    const { data: callLog } = await supabase
      .from('call_logs')
      .select('deal_id, contact_id, org_id, ai_summary')
      .eq('call_sid', callSid)
      .maybeSingle();

    if (callLog?.deal_id) {
      await supabase.from('voice_deal_updates').insert({
        deal_id: callLog.deal_id,
        contact_id: callLog.contact_id,
        org_id: callLog.org_id,
        transcript: transcriptionText,
        ai_summary: callLog.ai_summary ?? updates.ai_summary ?? null,
        review_status: 'pending',
        created_at: new Date().toISOString(),
      });
    }
  }

  // Return empty TwiML so Twilio doesn't error
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { 'Content-Type': 'text/xml' },
  });
});
