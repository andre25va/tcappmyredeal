import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ImapFlow } from 'imapflow';

const GMAIL_USER = process.env.GMAIL_USER || 'tc@myredeal.com';
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!GMAIL_APP_PASSWORD) {
    return res.status(500).json({ error: 'Gmail not configured' });
  }

  const { action, uid, folder = 'INBOX' } = req.query;

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    logger: false,
  });

  try {
    await client.connect();

    // Fetch single message
    if (action === 'message' && uid) {
      const lock = await client.getMailboxLock(folder as string);
      try {
        const msg = await client.fetchOne(uid as string, {
          envelope: true,
          bodyStructure: true,
          source: true,
        });
        if (!msg) return res.status(404).json({ error: 'Message not found' });

        const source = msg.source?.toString() || '';
        // Extract plain text body
        const textMatch = source.match(/Content-Type: text\/plain[\s\S]*?\r\n\r\n([\s\S]*?)(\r\n--|\r\n\r\n--|--=-)/i);
        const htmlMatch = source.match(/Content-Type: text\/html[\s\S]*?\r\n\r\n([\s\S]*?)(\r\n--|--=-)/i);
        const body = textMatch ? textMatch[1].trim() : (htmlMatch ? htmlMatch[1].replace(/<[^>]*>/g, '').trim() : '');

        return res.status(200).json({
          uid: msg.uid,
          subject: msg.envelope?.subject || '(no subject)',
          from: msg.envelope?.from?.[0]?.address || '',
          fromName: msg.envelope?.from?.[0]?.name || '',
          to: msg.envelope?.to?.map((a: any) => a.address).join(', ') || '',
          date: msg.envelope?.date?.toISOString() || '',
          body,
        });
      } finally {
        lock.release();
      }
    }

    // List threads (inbox)
    const lock = await client.getMailboxLock(folder as string);
    const threads: any[] = [];
    try {
      const messages = await client.search({ all: true }, { uid: true });
      const recent = messages.slice(-50).reverse(); // last 50 msgs

      for await (const msg of client.fetch(recent.join(','), {
        envelope: true,
        flags: true,
        uid: true,
      })) {
        threads.push({
          id: msg.uid.toString(),
          uid: msg.uid,
          subject: msg.envelope?.subject || '(no subject)',
          from: msg.envelope?.from?.[0]?.address || '',
          fromName: msg.envelope?.from?.[0]?.name || '',
          to: msg.envelope?.to?.map((a: any) => a.address).join(', ') || '',
          date: msg.envelope?.date?.toISOString() || new Date().toISOString(),
          unread: !msg.flags?.has('\\Seen'),
          snippet: msg.envelope?.subject || '',
        });
      }
    } finally {
      lock.release();
    }

    await client.logout();
    return res.status(200).json({ threads: threads.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) });
  } catch (err: any) {
    console.error('IMAP error:', err);
    try { await client.logout(); } catch {}
    return res.status(500).json({ error: err.message || 'Failed to fetch emails' });
  }
}
