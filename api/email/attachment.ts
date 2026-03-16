import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ImapFlow } from 'imapflow';

const GMAIL_USER = process.env.GMAIL_USER || 'tc@myredeal.com';
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { uid, filename, folder = 'INBOX' } = req.query;
  if (!uid || !filename) return res.status(400).json({ error: 'Missing uid or filename' });

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder as string);

    try {
      const msg = await client.fetchOne(uid as string, { source: true });
      if (!msg) return res.status(404).json({ error: 'Message not found' });

      const source = msg.source?.toString('utf-8') || '';

      // Find attachment part matching filename
      const boundaryMatch = source.match(/boundary="?([^"\r\n;]+)"?/i);
      if (!boundaryMatch) return res.status(404).json({ error: 'No attachments found' });

      const boundary = boundaryMatch[1].trim();
      const parts = source.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?\r?\n`));

      for (const part of parts) {
        const nameMatch = part.match(/(?:filename|name)="?([^"\r\n;]+)"?/i);
        if (!nameMatch || nameMatch[1] !== decodeURIComponent(filename as string)) continue;

        const encMatch = part.match(/Content-Transfer-Encoding:\s*(\S+)/i);
        const ctMatch = part.match(/Content-Type:\s*([^;\r\n]+)/i);
        const encoding = encMatch ? encMatch[1].trim().toLowerCase() : '7bit';
        const contentType = ctMatch ? ctMatch[1].trim() : 'application/octet-stream';

        const bodyStart = part.indexOf('\r\n\r\n');
        if (bodyStart === -1) continue;
        const rawBody = part.substring(bodyStart + 4).replace(/\r?\n$/, '');

        let fileBuffer: Buffer;
        if (encoding === 'base64') {
          fileBuffer = Buffer.from(rawBody.replace(/\s/g, ''), 'base64');
        } else {
          fileBuffer = Buffer.from(rawBody, 'utf-8');
        }

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${nameMatch[1]}"`);
        res.setHeader('Content-Length', fileBuffer.length);
        return res.status(200).send(fileBuffer);
      }

      return res.status(404).json({ error: 'Attachment not found' });
    } finally {
      lock.release();
    }
  } catch (err: any) {
    console.error('Attachment error:', err);
    try { await client.logout(); } catch {}
    return res.status(500).json({ error: err.message });
  }
}
