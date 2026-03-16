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

  const { action, uid, thread_id, folder = 'INBOX' } = req.query;

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    logger: false,
  });

  try {
    await client.connect();

    // Fetch single message by UID
    if ((action === 'message' || thread_id) && (uid || thread_id)) {
      const targetUid = (uid || thread_id) as string;
      const lock = await client.getMailboxLock(folder as string);
      try {
        const msg = await client.fetchOne(targetUid, {
          envelope: true,
          bodyStructure: true,
          source: true,
        });
        if (!msg) return res.status(404).json({ error: 'Message not found' });

        const source = msg.source?.toString() || '';
        const textMatch = source.match(/Content-Type: text\/plain[\s\S]*?\r\n\r\n([\s\S]*?)(\r\n--|\r\n\r\n--|---=-)/i);
        const htmlMatch = source.match(/Content-Type: text\/html[\s\S]*?\r\n\r\n([\s\S]*?)(\r\n--|---=-)/i);
        const body = textMatch
          ? textMatch[1].trim()
          : htmlMatch
          ? htmlMatch[1].replace(/<[^>]*>/g, '').trim()
          : source.replace(/.*\r\n\r\n/s, '').substring(0, 2000);

        const msgDate = msg.envelope?.date ? new Date(msg.envelope.date) : new Date();
        return res.status(200).json({
          messages: [{
            id: msg.uid.toString(),
            threadId: msg.uid.toString(),
            subject: msg.envelope?.subject || '(no subject)',
            from: msg.envelope?.from?.[0]
              ? `${msg.envelope.from[0].name || ''} <${msg.envelope.from[0].address || ''}>`.trim()
              : '',
            to: msg.envelope?.to?.map((a: any) => a.address).join(', ') || '',
            cc: msg.envelope?.cc?.map((a: any) => a.address).join(', ') || '',
            date: msgDate.toISOString(),
            internalDate: msgDate.getTime().toString(),
            body,
            snippet: body.substring(0, 150),
          }],
        });
      } finally {
        lock.release();
      }
    }

    // List inbox threads
    const lock = await client.getMailboxLock(folder as string);
    const threads: any[] = [];
    try {
      const messages = await client.search({ all: true }, { uid: true });
      const recent = messages.slice(-50).reverse(); // last 50 msgs

      for await (const msg of client.fetch(recent.join(','), {
        envelope: true,
        flags: true,
        uid: true,
        internalDate: true,
      })) {
        const msgDate = (msg as any).internalDate
          ? new Date((msg as any).internalDate)
          : msg.envelope?.date
          ? new Date(msg.envelope.date)
          : new Date();

        const fromAddr = msg.envelope?.from?.[0];
        const fromStr = fromAddr
          ? `${fromAddr.name ? fromAddr.name + ' ' : ''}<${fromAddr.address || ''}>`.trim()
          : '';

        threads.push({
          id: msg.uid.toString(),
          subject: msg.envelope?.subject || '(no subject)',
          from: fromStr,
          to: msg.envelope?.to?.map((a: any) => a.address).join(', ') || '',
          snippet: msg.envelope?.subject || '',
          // internalDate as millisecond string — matches what Inbox.tsx expects
          internalDate: msgDate.getTime().toString(),
          messageCount: 1,
          isUnread: !msg.flags?.has('\\Seen'),
          labelIds: [],
        });
      }
    } finally {
      lock.release();
    }

    await client.logout();
    return res.status(200).json({
      threads: threads.sort((a, b) => Number(b.internalDate) - Number(a.internalDate)),
    });
  } catch (err: any) {
    console.error('IMAP error:', err);
    try { await client.logout(); } catch {}
    return res.status(500).json({ error: err.message || 'Failed to fetch emails' });
  }
}
