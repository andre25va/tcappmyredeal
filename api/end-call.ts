import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * POST /api/end-call
 * Terminates an active Twilio call by setting its status to "completed".
 * Body: { callSid: string }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { callSid } = req.body || {};

  if (!callSid || callSid === 'call-initiated') {
    // No real SID to end — just acknowledge
    return res.status(200).json({ status: 'no_sid' });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    console.error('end-call: missing Twilio credentials in env');
    return res.status(500).json({ error: 'Twilio credentials not configured' });
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${callSid}.json`;

  const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  const twilioRes = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'Status=completed',
  });

  if (!twilioRes.ok) {
    const errText = await twilioRes.text();
    console.error('Twilio hangup failed:', twilioRes.status, errText);
    // Still return 200 — we don't want to block the UI from dismissing
    return res.status(200).json({ status: 'twilio_error', code: twilioRes.status });
  }

  const data = await twilioRes.json();
  console.log(`Call ${callSid} terminated. Status: ${data.status}`);
  return res.status(200).json({ status: 'ended', twilioStatus: data.status });
}
