import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const sb = () =>
  createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!
  );

/**
 * POST /api/callbacks/status
 * Twilio StatusCallback — receives parent-call lifecycle events.
 * Updates call_logs row with status, duration, and ended_at.
 *
 * Twilio posts form-encoded: CallSid, CallStatus, CallDuration, etc.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Twilio sends POST with form body
  const body = req.body || {};

  const callSid      = (body.CallSid      || '') as string;
  const callStatus   = (body.CallStatus   || '') as string;
  const callDuration = body.CallDuration   ? parseInt(body.CallDuration, 10) : null;

  if (!callSid) {
    return res.status(400).send('Missing CallSid');
  }

  console.log(`Status callback: ${callSid} → ${callStatus} (${callDuration}s)`);

  const terminalStatuses = ['completed', 'busy', 'no-answer', 'canceled', 'failed'];
  const isTerminal = terminalStatuses.includes(callStatus);

  try {
    const supabase = sb();
    const update: Record<string, unknown> = {
      status:     callStatus,
      updated_at: new Date().toISOString(),
    };

    if (callDuration !== null) update.duration = callDuration;
    if (isTerminal)             update.ended_at = new Date().toISOString();

    const { error } = await supabase
      .from('call_logs')
      .update(update)
      .eq('call_sid', callSid);

    if (error) console.error('call_logs status update error:', error.message);
  } catch (err: any) {
    console.error('Status callback DB error:', err?.message);
  }

  // Twilio expects a 200 response — no body needed
  return res.status(200).send('');
}
