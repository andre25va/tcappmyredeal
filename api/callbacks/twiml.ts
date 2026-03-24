import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * GET|POST /api/callbacks/twiml
 * Returns TwiML XML that Twilio executes when the TC answers.
 * Dials the contact and bridges the two call legs.
 * The <Dial> action URL fires when the dial leg completes.
 *
 * Query: { contactPhone, contactName? }
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  const { contactPhone, contactName } = req.query as {
    contactPhone?: string;
    contactName?: string;
  };

  res.setHeader('Content-Type', 'text/xml');

  if (!contactPhone) {
    return res.status(200).send(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response><Say>Error: missing contact phone number.</Say></Response>`
    );
  }

  const callerId  = process.env.TWILIO_PHONE_NUMBER || '';
  const name      = contactName ? decodeURIComponent(contactName) : 'your contact';
  const baseUrl   = 'https://tcappmyredeal.vercel.app';
  const actionUrl = `${baseUrl}/api/callbacks/dial-complete`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Connecting you to ${name} now.</Say>
  <Dial callerId="${callerId}" timeout="30" action="${actionUrl}" method="POST">
    <Number>${decodeURIComponent(contactPhone)}</Number>
  </Dial>
</Response>`;

  return res.status(200).send(twiml);
}
