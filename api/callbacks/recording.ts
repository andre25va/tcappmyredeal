import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const sb = () =>
  createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!
  );

/**
 * POST /api/callbacks/recording
 * Twilio fires this when a call recording is available.
 * Downloads the MP3, transcribes with Whisper, summarises with GPT-4o mini,
 * then persists transcript + summary to call_logs and auto-creates a call_note.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ACK immediately — Twilio expects a 200 before we do heavy work
  res.status(200).send('');

  const { CallSid, RecordingSid, RecordingUrl } = req.body || {};

  if (!CallSid || !RecordingUrl) {
    console.error('[recording] missing CallSid or RecordingUrl');
    return;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const authToken  = process.env.TWILIO_AUTH_TOKEN!;
  const openaiKey  = process.env.OPENAI_API_KEY!;

  if (!openaiKey) {
    console.error('[recording] OPENAI_API_KEY not configured');
    return;
  }

  try {
    // ── 1. Download MP3 from Twilio ──────────────────────────────────────────
    const mp3Url = `${RecordingUrl}.mp3`;
    const auth   = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const audioRes = await fetch(mp3Url, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (!audioRes.ok) {
      console.error(`[recording] download failed: ${audioRes.status}`);
      return;
    }

    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

    // ── 2. Transcribe with Whisper ───────────────────────────────────────────
    const form = new FormData();
    const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
    form.append('file', blob, 'call.mp3');
    form.append('model', 'whisper-1');

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method:  'POST',
      headers: { Authorization: `Bearer ${openaiKey}` },
      body:    form,
    });

    if (!whisperRes.ok) {
      console.error('[recording] Whisper failed:', await whisperRes.text());
      return;
    }

    const { text: transcript } = (await whisperRes.json()) as { text: string };

    if (!transcript || transcript.trim().length < 15) {
      console.log('[recording] transcript too short, skipping summary');
      return;
    }

    // ── 3. Summarise with GPT-4o mini ────────────────────────────────────────
    const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role:    'system',
            content: `You are a real estate transaction coordinator assistant.
Summarise this call transcript in 3–5 concise bullet points.
Focus on: decisions made, action items, deadlines mentioned, and any issues raised.
Use plain text bullets starting with "• ".`,
          },
          { role: 'user', content: transcript },
        ],
        max_tokens:  400,
        temperature: 0.2,
      }),
    });

    if (!gptRes.ok) {
      console.error('[recording] GPT failed:', await gptRes.text());
      return;
    }

    const gptData  = (await gptRes.json()) as any;
    const aiSummary = gptData.choices?.[0]?.message?.content?.trim() ?? '';

    // ── 4. Update call_logs ──────────────────────────────────────────────────
    const supabase = sb();

    const { data: logRow, error: updateErr } = await supabase
      .from('call_logs')
      .update({
        recording_sid:       RecordingSid ?? null,
        recording_url:       mp3Url,
        transcript,
        ai_summary:          aiSummary,
        summary_created_at:  new Date().toISOString(),
      })
      .eq('call_sid', CallSid)
      .select('id, deal_id, contact_id')
      .single();

    if (updateErr) {
      console.error('[recording] call_logs update error:', updateErr.message);
    }

    // ── 5. Auto-create call note with AI summary ────────────────────────────
    if (logRow && aiSummary) {
      const { error: noteErr } = await supabase.from('call_notes').insert({
        call_log_id: logRow.id,
        deal_id:     logRow.deal_id    ?? null,
        contact_id:  logRow.contact_id ?? null,
        raw_notes:   `AI Summary:\n\n${aiSummary}`,
        ai_summary:  aiSummary,
      });

      if (noteErr) {
        console.error('[recording] call_notes insert error:', noteErr.message);
      }
    }

    console.log(
      `[recording] ✓ CallSid=${CallSid} | transcript=${transcript.length} chars | summary saved`
    );
  } catch (err: any) {
    console.error('[recording] unhandled error:', err?.message);
  }
}
