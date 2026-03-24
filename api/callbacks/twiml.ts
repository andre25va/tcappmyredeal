import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * GET|POST /api/callbacks/twiml
 * Returns TwiML executed when the TC answers.
 * Dials the contact, bridges the legs, and records both channels.
 * The recording webhook → /api/callbacks/recording (Whisper + GPT summary).
 * The <Dial> action URL → /api/callbacks/dial-complete (captures dial outcome).
 *
 * Query: { contactPhone, contactName? }
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  const { contactPhone, contactName } = req.query as {
    contactPhone?: string;
    contactName?:  string;
  };

  res.setHeader('Content-Type', 'text/xml');

  if (!contactPhone) {
    return res.status(200).send(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response><Say>Error: missing contact phone number.</Say></Response>`
    );
  }

  const callerId     = process.env.TWILIO_PHONE_NUMBER || '';
  const name         = contactName ? decodeURIComponent(contactName) : 'your contact';
  const baseUrl      = 'https://tcappmyredeal.vercel.app';
  const actionUrl    = `${baseUrl}/api/callbacks/dial-complete`;
  const recordingCb  = `${baseUrl}/api/callbacks/recording`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Connecting you to ${name} now.</Say>
  <Dial
    callerId="${callerId}"
    timeout="30"
    action="${actionUrl}"
    method="POST"
    record="record-from-answer-dual"
    recordingStatusCallback="${recordingCb}"
    recordingStatusCallbackMethod="POST"
  >
    <Number>${decodeURIComponent(contactPhone)}</Number>
  </Dial>
</Response>`;

  return res.status(200).send(twiml);
}
