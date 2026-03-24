import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const sb = () =>
  createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!
  );

/**
 * POST /api/callbacks/dial-complete
 * Twilio <Dial> action — fires when the dial (child) leg ends.
 * Records the outcome (DialCallStatus, DialCallDuration) in call_logs.
 * Must return valid TwiML so Twilio knows what to do next.
 *
 * Twilio posts: CallSid, DialCallStatus, DialCallSid, DialCallDuration
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const body = req.body || {};

  const callSid         = (body.CallSid          || '') as string;
  const dialCallStatus  = (body.DialCallStatus    || '') as string;
  const dialDuration    = body.DialCallDuration ? parseInt(body.DialCallDuration, 10) : null;

  console.log(`Dial complete: parent=${callSid}, dialStatus=${dialCallStatus}, dur=${dialDuration}s`);

  if (callSid) {
    try {
      const supabase = sb();
      const update: Record<string, unknown> = {
        dial_call_status: dialCallStatus,
        updated_at:       new Date().toISOString(),
      };
      if (dialDuration !== null) update.duration = dialDuration;

      const { error } = await supabase
        .from('call_logs')
        .update(update)
        .eq('call_sid', callSid);

      if (error) console.error('call_logs dial-complete update error:', error.message);
    } catch (err: any) {
      console.error('Dial-complete DB error:', err?.message);
    }
  }

  // Hang up gracefully after dial ends
  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<Response><Hangup/></Response>`
  );
}
