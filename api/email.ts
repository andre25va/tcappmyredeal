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
    return res.status(200).json({ threads: threads.sort((a, b) => Number(b.internalDate) - Number(a.internalDate)) });
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
  return handleThreads(req, res);
}
