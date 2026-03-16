import type { VercelRequest, VercelResponse } from '@vercel/node';

const GMAIL_USER = 'tc@myredeal.com';
const FROM_NAME = 'TC Command';

async function getAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

function encodeBase64Url(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function buildRawEmail({
  to,
  cc,
  subject,
  body,
  threadId,
  inReplyTo,
  references,
}: {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const lines: string[] = [];
  lines.push(`From: ${FROM_NAME} <${GMAIL_USER}>`);
  lines.push(`To: ${to}`);
  if (cc) lines.push(`Cc: ${cc}`);
  lines.push(`Subject: ${subject}`);
  lines.push(`MIME-Version: 1.0`);
  lines.push(`Content-Type: text/plain; charset="UTF-8"`);
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`);
  if (references) lines.push(`References: ${references}`);
  lines.push('');
  lines.push(body);
  return encodeBase64Url(lines.join('\r\n'));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { to, cc, subject, body, thread_id, in_reply_to, references } = req.body || {};

  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'Missing required fields: to, subject, body' });
  }

  try {
    const accessToken = await getAccessToken();
    const raw = buildRawEmail({ to, cc, subject, body, threadId: thread_id, inReplyTo: in_reply_to, references });

    const payload: any = { raw };
    if (thread_id) payload.threadId = thread_id;

    const sendRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/${GMAIL_USER}/messages/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!sendRes.ok) {
      const err = await sendRes.text();
      throw new Error(`Gmail send failed: ${err}`);
    }

    const data = await sendRes.json();
    return res.status(200).json({ success: true, message_id: data.id, thread_id: data.threadId });
  } catch (err: any) {
    console.error('[email/send] error:', err);
    return res.status(500).json({ error: err.message || 'Failed to send email' });
  }
}
