import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';

const GMAIL_USER = process.env.GMAIL_USER || 'tc@myredeal.com';
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || '';

function decodeBody(raw: string, encoding: string): string {
  try {
    if (encoding?.toLowerCase() === 'base64') {
      return Buffer.from(raw.replace(/\s/g, ''), 'base64').toString('utf-8');
    } else if (encoding?.toLowerCase() === 'quoted-printable') {
      const joined = raw.replace(/=\r?\n/g, '');
      return joined.replace(/((?:=[0-9A-F]{2})+)/gi, (match) => {
        const bytes = match.split('=').filter(Boolean).map(h => parseInt(h, 16));
        return Buffer.from(bytes).toString('utf-8');
      });
    }
    return raw;
  } catch { return raw; }
}

function extractPartsFromSource(source: string): { text: string; html: string; attachments: any[] } {
  const result = { text: '', html: '', attachments: [] as any[] };
  const boundaryMatch = source.match(/boundary="?([^"\r\n;]+)"?/i);
  if (!boundaryMatch) {
    const headerEnd = source.indexOf('\r\n\r\n');
    if (headerEnd === -1) return result;
    const headers = source.substring(0, headerEnd);
    const body = source.substring(headerEnd + 4);
    const encMatch = headers.match(/Content-Transfer-Encoding:\s*(\S+)/i);
    const encoding = encMatch ? encMatch[1] : '7bit';
    const decoded = decodeBody(body, encoding);
    if (headers.toLowerCase().includes('text/html')) { result.html = decoded; } else { result.text = decoded; }
    return result;
  }
  const boundary = boundaryMatch[1].trim();
  const parts = source.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?\r?\n`));
  for (const part of parts) {
    if (!part.trim() || part.trim() === '--') continue;
    const partHeaderEnd = part.indexOf('\r\n\r\n');
    if (partHeaderEnd === -1) continue;
    const partHeaders = part.substring(0, partHeaderEnd);
    const partBody = part.substring(partHeaderEnd + 4).replace(/\r?\n$/, '');
    const ctMatch = partHeaders.match(/Content-Type:\s*([^;\r\n]+)/i);
    const encMatch = partHeaders.match(/Content-Transfer-Encoding:\s*(\S+)/i);
    const dispMatch = partHeaders.match(/Content-Disposition:\s*([^;\r\n]+)/i);
    const nameMatch = partHeaders.match(/(?:filename|name)="?([^"\r\n;]+)"?/i);
    const contentType = ctMatch ? ctMatch[1].trim().toLowerCase() : '';
    const encoding = encMatch ? encMatch[1].trim() : '7bit';
    const disposition = dispMatch ? dispMatch[1].trim().toLowerCase() : '';
    if (disposition === 'attachment' || nameMatch) {
      const filename = nameMatch ? nameMatch[1] : 'attachment';
      const cidMatch = partHeaders.match(/Content-ID:\s*<([^>]+)>/i);
      result.attachments.push({
        filename, contentType: ctMatch ? ctMatch[1].trim() : 'application/octet-stream',
        size: Math.round(partBody.length * 0.75), contentId: cidMatch ? cidMatch[1] : null,
        data: encoding.toLowerCase() === 'base64' ? partBody.replace(/\s/g, '') : null,
      });
    } else if (contentType.includes('text/html') && !result.html) {
      result.html = decodeBody(partBody, encoding);
    } else if (contentType.includes('text/plain') && !result.text) {
      result.text = decodeBody(partBody, encoding);
    }
  }
  return result;
}

function stripHtml(html: string): string {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ').trim();
}


async function handleSearch(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!GMAIL_APP_PASSWORD) return res.status(500).json({ error: 'Gmail not configured' });

  const addressParam = req.query.addresses as string;
  if (!addressParam) return res.status(400).json({ error: 'addresses param required' });

  let addresses: string[];
  try { addresses = JSON.parse(addressParam); }
  catch { addresses = addressParam.split(',').map((a: string) => a.trim()).filter(Boolean); }
  if (!addresses.length) return res.status(400).json({ error: 'No addresses provided' });

  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD }, logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    const uidSet = new Set<number>();
    try {
      for (const addr of addresses) {
        const uids1 = await (client.search as any)({ text: addr }, { uid: true });
        for (const uid of (uids1 as number[])) uidSet.add(uid);
        const words = addr.split(' ').slice(0, 3).join(' ');
        const uids2 = await (client.search as any)({ subject: words }, { uid: true });
        for (const uid of (uids2 as number[])) uidSet.add(uid);
      }
    } catch (searchErr) { console.error('IMAP search error:', searchErr); }

    const emails: any[] = [];
    const uidList = Array.from(uidSet).slice(0, 40);
    for (const uid of uidList) {
      try {
        const msg = await client.fetchOne(uid.toString(), { envelope: true, source: true });
        if (!msg) continue;
        const source = msg.source?.toString('utf-8') || '';
        const { text, html, attachments } = extractPartsFromSource(source);
        const bodyText = text || (html ? stripHtml(html) : '');
        const msgDate = msg.envelope?.date ? new Date(msg.envelope.date) : new Date();
        const fromAddr = msg.envelope?.from?.[0];
        emails.push({
          id: msg.uid.toString(),
          subject: msg.envelope?.subject || '(no subject)',
          from: fromAddr ? `${fromAddr.name || ''} <${fromAddr.address || ''}>`.trim() : '',
          to: msg.envelope?.to?.map((a: any) => a.address).join(', ') || '',
          date: msgDate.toISOString(),
          internalDate: msgDate.getTime().toString(),
          snippet: bodyText.substring(0, 200),
          bodyHtml: html || '',
          body: bodyText,
          attachments: attachments.map((a: any) => ({
            filename: a.filename, contentType: a.contentType, size: a.size,
            downloadUrl: `/api/email/attachment?uid=${msg.uid}&filename=${encodeURIComponent(a.filename)}&folder=INBOX`,
          })),
        });
      } catch (fetchErr) { console.error(`Failed to fetch UID ${uid}:`, fetchErr); }
    }
    lock.release();
    await client.logout();
    emails.sort((a, b) => Number(b.internalDate) - Number(a.internalDate));
    return res.status(200).json({ emails, total: emails.length, addresses });
  } catch (err: any) {
    console.error('Email search error:', err);
    try { await client.logout(); } catch {}
    return res.status(500).json({ error: err.message || 'Search failed' });
  }
}


async function classifyEmailsWithAI(threads: any[]): Promise<Map<string, boolean>> {
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY || threads.length === 0) return new Map();
  try {
    const emailList = threads.map(t => ({
      id: t.id,
      subject: (t.subject || '(no subject)').substring(0, 80),
      from: (t.from || '').substring(0, 60),
      snippet: (t.snippet || '').substring(0, 120),
    }));
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 600,
        messages: [
          {
            role: 'system',
            content: `You are an email triage assistant for a real estate transaction coordinator (TC).
Classify each email as priority:true or priority:false.
PRIORITY=true: closing deadlines, contract issues, inspection requests, lender/title/agent direct messages, docs needed, urgent requests, date changes, earnest money, appraisal, escrow, wire instructions, buyer/seller communications.
PRIORITY=false: newsletters, marketing, automated system notifications, promotions, general FYI, subscription emails, app alerts.
Return ONLY a valid JSON array with no markdown: [{"id":"...","priority":true},{"id":"...","priority":false}]`,
          },
          { role: 'user', content: JSON.stringify(emailList) },
        ],
      }),
    });
    if (!resp.ok) return new Map();
    const result = await resp.json();
    const text = (result.choices?.[0]?.message?.content || '[]').trim();
    const jsonText = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed: { id: string; priority: boolean }[] = JSON.parse(jsonText);
    const map = new Map<string, boolean>();
    for (const item of parsed) map.set(item.id, !!item.priority);
    return map;
  } catch { return new Map(); }
}

async function handleThreads(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!GMAIL_APP_PASSWORD) return res.status(500).json({ error: 'Gmail not configured' });

  const { uid, thread_id, folder = 'INBOX' } = req.query;
  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD }, logger: false,
  });
  try {
    await client.connect();
    if ((uid || thread_id)) {
      const targetUid = (uid || thread_id) as string;
      const lock = await client.getMailboxLock(folder as string);
      try {
        const msg = await client.fetchOne(targetUid, { envelope: true, source: true });
        if (!msg) return res.status(404).json({ error: 'Message not found' });
        const source = msg.source?.toString('utf-8') || '';
        const { text, html, attachments } = extractPartsFromSource(source);
        const bodyHtml = html || '';
        const bodyText = text || (html ? stripHtml(html) : '');
        const msgDate = msg.envelope?.date ? new Date(msg.envelope.date) : new Date();
        return res.status(200).json({
          messages: [{
            id: msg.uid.toString(), threadId: msg.uid.toString(),
            subject: msg.envelope?.subject || '(no subject)',
            from: msg.envelope?.from?.[0] ? `${msg.envelope.from[0].name || ''} <${msg.envelope.from[0].address || ''}>`.trim() : '',
            to: msg.envelope?.to?.map((a: any) => a.address).join(', ') || '',
            cc: msg.envelope?.cc?.map((a: any) => a.address).join(', ') || '',
            date: msgDate.toISOString(), internalDate: msgDate.getTime().toString(),
            bodyHtml, body: bodyText, snippet: bodyText.substring(0, 200),
            attachments: attachments.map(a => ({
              filename: a.filename, contentType: a.contentType, size: a.size,
              downloadUrl: `/api/email/attachment?uid=${msg.uid}&filename=${encodeURIComponent(a.filename)}&folder=${folder}`,
            })),
          }],
        });
      } finally { lock.release(); }
    }
    const lock = await client.getMailboxLock(folder as string);
    const threads: any[] = [];
    try {
      const messages = await client.search({ all: true }, { uid: true });
      const recent = messages.slice(-50).reverse();
      for await (const msg of client.fetch(recent.join(','), {
        envelope: true, flags: true, uid: true, internalDate: true, bodyStructure: true,
      })) {
        const msgDate = (msg as any).internalDate ? new Date((msg as any).internalDate)
          : msg.envelope?.date ? new Date(msg.envelope.date) : new Date();
        const fromAddr = msg.envelope?.from?.[0];
        const fromStr = fromAddr ? `${fromAddr.name ? fromAddr.name + ' ' : ''}<${fromAddr.address || ''}>`.trim() : '';
        const hasAttachment = JSON.stringify((msg as any).bodyStructure || {}).toLowerCase().includes('"attachment"');
        threads.push({
          id: msg.uid.toString(), subject: msg.envelope?.subject || '(no subject)',
          from: fromStr, to: msg.envelope?.to?.map((a: any) => a.address).join(', ') || '',
          snippet: msg.envelope?.subject || '', internalDate: msgDate.getTime().toString(),
          messageCount: 1, isUnread: !msg.flags?.has('\\Seen'), hasAttachment, labelIds: [],
        });
      }
    } finally { lock.release(); }
    await client.logout();
    const sorted = threads.sort((a, b) => Number(b.internalDate) - Number(a.internalDate));
    const priorityMap = await classifyEmailsWithAI(sorted);
    for (const t of sorted) { t.priority = priorityMap.get(t.id) ?? false; }
    return res.status(200).json({ threads: sorted });
  } catch (err: any) {
    console.error('IMAP error:', err);
    try { await client.logout(); } catch {}
    return res.status(500).json({ error: err.message || 'Failed to fetch emails' });
  }
}

async function handleSend(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!GMAIL_APP_PASSWORD) return res.status(500).json({ error: 'Gmail not configured' });
  const { to, cc, bcc, subject, body, replyTo, inReplyTo, references } = req.body;
  if (!to || !subject || !body) return res.status(400).json({ error: 'Missing required fields: to, subject, body' });
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 587, secure: false,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
  try {
    const mailOptions: any = {
      from: `TC Command <${GMAIL_USER}>`, to, subject,
      text: body,
      html: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.5;">${body.replace(/\n/g, '<br/>')}</div>`,
    };
    if (cc && cc.trim()) mailOptions.cc = cc;
    if (bcc && bcc.trim()) mailOptions.bcc = bcc;
    if (replyTo) mailOptions.replyTo = replyTo;
    if (inReplyTo) mailOptions.inReplyTo = inReplyTo;
    if (references) mailOptions.references = references;
    const info = await transporter.sendMail(mailOptions);
    return res.status(200).json({ success: true, messageId: info.messageId });
  } catch (err: any) {
    console.error('SMTP error:', err);
    return res.status(500).json({ error: err.message || 'Failed to send email' });
  }
}

async function handleAttachment(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { uid, filename, folder = 'INBOX' } = req.query;
  if (!uid || !filename) return res.status(400).json({ error: 'Missing uid or filename' });
  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD }, logger: false,
  });
  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder as string);
    try {
      const msg = await client.fetchOne(uid as string, { source: true });
      if (!msg) return res.status(404).json({ error: 'Message not found' });
      const source = msg.source?.toString('utf-8') || '';
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
        if (encoding === 'base64') { fileBuffer = Buffer.from(rawBody.replace(/\s/g, ''), 'base64'); }
        else { fileBuffer = Buffer.from(rawBody, 'utf-8'); }
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${nameMatch[1]}"`);
        res.setHeader('Content-Length', fileBuffer.length);
        return res.status(200).send(fileBuffer);
      }
      return res.status(404).json({ error: 'Attachment not found' });
    } finally { lock.release(); }
  } catch (err: any) {
    console.error('Attachment error:', err);
    try { await client.logout(); } catch {}
    return res.status(500).json({ error: err.message });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel rewrite passes path segment as query param:
  // /api/email/threads -> action='threads', /api/email/send -> action='send', /api/email/attachment -> action='attachment'
  const action = req.query.action as string;
  if (action === 'send') return handleSend(req, res);
  if (action === 'attachment') return handleAttachment(req, res);
  if (action === 'search') return handleSearch(req, res);
  return handleThreads(req, res);
}
