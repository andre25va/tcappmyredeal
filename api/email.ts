import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ImapFlow } from 'imapflow';

const GMAIL_USER = process.env.GMAIL_USER || 'tc@myredeal.com';
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';

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
  if (!GMAIL_APP_PASSWORD) return res.status(200).json({
    emails: [],
    total: 0,
    addresses: [],
    stats: { hardAccepted: 0, grayZone: 0, aiAccepted: 0, hardRejected: 0, totalScanned: 0 },
    warning: 'Gmail not configured on this server.',
  });

  const addressParam = req.query.addresses as string;
  if (!addressParam) return res.status(400).json({ error: 'addresses param required' });

  let addresses: string[];
  try { addresses = JSON.parse(addressParam); }
  catch { addresses = addressParam.split(',').map((a: string) => a.trim()).filter(Boolean); }
  if (!addresses.length) return res.status(400).json({ error: 'No addresses provided' });

  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD }, logger: false,
    connectionTimeout: 8000,
    socketTimeout: 8000,
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
    const uidList = Array.from(uidSet).slice(0, 15);
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
            content: `You are an email triage assistant for a real estate transaction coordinator (TC).\nClassify each email as priority:true or priority:false.\nPRIORITY=true: closing deadlines, contract issues, inspection requests, lender/title/agent direct messages, docs needed, urgent requests, date changes, earnest money, appraisal, escrow, wire instructions, home warranty, buyer/seller communications.\nPRIORITY=false: newsletters, marketing, automated system notifications, promotions, general FYI, subscription emails, app alerts.\nReturn ONLY a valid JSON array with no markdown: [{"id":"...","priority":true},{"id":"...","priority":false}]`,
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
  if (!GMAIL_APP_PASSWORD) return res.status(200).json({
    emails: [],
    total: 0,
    addresses: [],
    stats: { hardAccepted: 0, grayZone: 0, aiAccepted: 0, hardRejected: 0, totalScanned: 0 },
    warning: 'Gmail not configured on this server.',
  });

  const { uid, thread_id, folder = 'INBOX' } = req.query;
  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD }, logger: false,
    connectionTimeout: 8000,
    socketTimeout: 8000,
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
  if (!RESEND_API_KEY) return res.status(500).json({ error: 'Resend not configured' });
  const { to, cc, bcc, subject, body, replyTo, inReplyTo, references } = req.body;
  if (!to || !subject || !body) return res.status(400).json({ error: 'Missing required fields: to, subject, body' });
  try {
    const payload: Record<string, any> = {
      from: `TC Command <tc@myredeal.com>`,
      to: Array.isArray(to) ? to : [to],
      subject,
      text: body,
      html: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.5;">${body.replace(/\n/g, '<br/>')}</div>`,
    };
    if (cc && cc.trim()) payload.cc = Array.isArray(cc) ? cc : [cc];
    if (bcc && bcc.trim()) payload.bcc = Array.isArray(bcc) ? bcc : [bcc];
    if (replyTo) payload.reply_to = replyTo;
    if (inReplyTo) payload.headers = { ...(payload.headers || {}), 'In-Reply-To': `<${inReplyTo}>` };
    if (references) payload.headers = { ...(payload.headers || {}), 'References': references };

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const result = await resp.json() as { id?: string; message?: string };
    if (!resp.ok) {
      console.error('Resend error:', result);
      return res.status(resp.status).json({ error: result.message || 'Failed to send email' });
    }
    return res.status(200).json({ success: true, messageId: result.id });
  } catch (err: any) {
    console.error('Resend send error:', err);
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
    connectionTimeout: 8000,
    socketTimeout: 8000,
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


// ═══════════════════════════════════════════════════════════════════
// SMART EMAIL CLASSIFIER  –  3-layer: rules → deterministic → AI
// ═══════════════════════════════════════════════════════════════════

interface DealEmailContext {
  dealId: string;
  propertyAddress: string;
  addressVariants: string[];
  mlsNumber?: string;
  clientNames: string[];
  participantEmails: string[];
  linkedThreadIds: string[];
}

interface EmailClassificationResult {
  id: string;
  shouldAttach: boolean;
  confidence: number;
  category: 'contract'|'inspection'|'appraisal'|'title'|'lender'|'closing'|'compliance'|'general'|'unrelated';
  reason: string;
  extractedSignals: string[];
  source: 'deterministic'|'ai';
}

function normTxt(s: string): string {
  return (s || '').toLowerCase().replace(/[^\w\s#-]/g,' ').replace(/\s+/g,' ').trim();
}

function matchAny(hay: string, needles: string[]): string[] {
  const h = normTxt(hay);
  return needles.filter(n => n && n.length > 2 && h.includes(normTxt(n)));
}

function buildAddressVariants(addr: string): string[] {
  if (!addr) return [];
  const base = addr.trim();
  const variants = new Set<string>();
  variants.add(base);
  variants.add(base.toLowerCase());
  const abbrevMap: Record<string,string> = {
    'street':'st','avenue':'ave','boulevard':'blvd','drive':'dr',
    'road':'rd','lane':'ln','court':'ct','place':'pl','trafficway':'twy',
    'highway':'hwy','parkway':'pkwy','circle':'cir','terrace':'ter',
  };
  let abbrev = base.toLowerCase();
  for (const [full, short] of Object.entries(abbrevMap)) {
    abbrev = abbrev.replace(new RegExp(`\\b${full}\\b`,'gi'), short);
  }
  variants.add(abbrev);
  const words = base.split(/\s+/).slice(0,4).join(' ');
  if (words !== base) variants.add(words);
  const numMatch = base.match(/^(\d+)/);
  if (numMatch) variants.add(numMatch[1]);
  return Array.from(variants).filter(v => v.length > 3);
}

function extractEmailHeaders(source: string): { messageId?: string; inReplyTo?: string; cc?: string } {
  const headerEnd = source.indexOf('\r\n\r\n');
  if (headerEnd === -1) return {};
  const sec = source.substring(0, headerEnd).replace(/\r\n([ \t])/g,' ');
  const get = (name: string) => {
    const m = sec.match(new RegExp(`^${name}:\\s*(.+)$`,'im'));
    return m ? m[1].trim() : undefined;
  };
  return {
    messageId: get('Message-ID')?.replace(/[<>]/g,''),
    inReplyTo: get('In-Reply-To')?.replace(/[<>]/g,''),
    cc: get('Cc'),
  };
}

function buildThreadGroups(emails: any[]): Map<string,string> {
  const byMsgId = new Map<string,any>();
  for (const e of emails) { if (e.messageId) byMsgId.set(e.messageId, e); }
  function findRoot(e: any, depth=0): string {
    if (depth > 15 || !e.inReplyTo) return e.messageId || e.id;
    const parent = byMsgId.get(e.inReplyTo);
    if (!parent || parent.id === e.id) return e.messageId || e.id;
    return findRoot(parent, depth+1);
  }
  const result = new Map<string,string>();
  for (const e of emails) result.set(e.id, findRoot(e));
  return result;
}

function deterministicScore(email: any, deal: DealEmailContext): { score: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];
  const subject = email.subject || '';
  const body = email.bodyText || email.snippet || '';
  const from = email.from || '';
  const attNames: string[] = email.attachmentNames || [];

  if (deal.linkedThreadIds.includes(email.threadGroupId || email.id)) {
    score += 100; signals.push('linked_thread');
  }
  if (matchAny(subject, deal.addressVariants).length) { score += 40; signals.push('addr_subject'); }
  if (matchAny(body, deal.addressVariants).length)    { score += 25; signals.push('addr_body'); }
  if (deal.mlsNumber && matchAny(`${subject} ${body}`, [deal.mlsNumber]).length) {
    score += 35; signals.push('mls_match');
  }
  if (matchAny(`${subject} ${body}`, deal.clientNames).length) { score += 15; signals.push('client_name'); }
  const fromNorm = normTxt(from);
  if (deal.participantEmails.find(p => fromNorm.includes(normTxt(p)))) {
    score += 25; signals.push('participant_email');
  }
  const attKw = ['contract','inspection','appraisal','closing','disclosure','addendum','title','hoa','earnest'];
  if (attNames.some(a => attKw.some(k => normTxt(a).includes(k)))) {
    score += 10; signals.push('attachment_keyword');
  }
  return { score, signals };
}

async function classifyBatchWithAI(
  grayEmails: any[],
  deal: DealEmailContext,
  signalsMap: Map<string,string[]>
): Promise<Map<string,EmailClassificationResult>> {
  const result = new Map<string,EmailClassificationResult>();
  const KEY = process.env.OPENAI_API_KEY;
  if (!KEY || grayEmails.length === 0) return result;
  try {
    const emailList = grayEmails.map(e => ({
      id: e.id,
      subject: (e.subject||'').substring(0,100),
      from: (e.from||'').substring(0,80),
      snippet: (e.snippet||'').substring(0,200),
      attachmentNames: (e.attachmentNames||[]).slice(0,5),
      deterministicSignals: signalsMap.get(e.id)||[],
    }));
    const systemPrompt = `You are classifying emails for a real estate transaction coordinator.\nProperty: ${deal.propertyAddress}${deal.mlsNumber ? ` (MLS# ${deal.mlsNumber})` : ''}\nParticipants: ${deal.participantEmails.join(', ')||'none'}\nClient names: ${deal.clientNames.join(', ')||'none'}\nClassify each email: does it belong to this transaction file?\nPrefer precision over recall. When unclear, set shouldAttach=false.\nCategories: contract, inspection, appraisal, title, lender, closing, compliance, general, unrelated`;

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'email_batch_classification',
            strict: true,
            schema: {
              type: 'object', additionalProperties: false,
              properties: {
                classifications: {
                  type: 'array',
                  items: {
                    type: 'object', additionalProperties: false,
                    properties: {
                      id:               { type: 'string' },
                      shouldAttach:     { type: 'boolean' },
                      confidence:       { type: 'number' },
                      category:         { type: 'string', enum: ['contract','inspection','appraisal','title','lender','closing','compliance','general','unrelated'] },
                      reason:           { type: 'string' },
                      extractedSignals: { type: 'array', items: { type: 'string' } },
                    },
                    required: ['id','shouldAttach','confidence','category','reason','extractedSignals'],
                  },
                },
              },
              required: ['classifications'],
            },
          },
        },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Classify these ${emailList.length} emails:\n${JSON.stringify(emailList,null,2)}` },
        ],
      }),
    });
    if (!resp.ok) { console.error('OpenAI batch classify HTTP error:', resp.status); return result; }
    const data = await resp.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{"classifications":[]}');
    for (const item of (parsed.classifications||[])) {
      result.set(item.id, {
        id: item.id,
        shouldAttach: item.shouldAttach && item.confidence >= 0.65,
        confidence: Math.max(0, Math.min(1, item.confidence)),
        category: item.category,
        reason: item.reason,
        extractedSignals: item.extractedSignals||[],
        source: 'ai',
      });
    }
  } catch(err) { console.error('AI batch classify error:', err); }
  return result;
}

async function handleSearchClassify(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!GMAIL_APP_PASSWORD) return res.status(200).json({
    emails: [],
    total: 0,
    addresses: [],
    stats: { hardAccepted: 0, grayZone: 0, aiAccepted: 0, hardRejected: 0, totalScanned: 0 },
    warning: 'Gmail not configured on this server.',
  });

  const params = req.method === 'POST' ? req.body : req.query;
  // Support both POST (arrays already parsed) and GET (strings to parse)
  let addresses: string[];
  if (Array.isArray(params.addresses)) {
    addresses = params.addresses;
  } else {
    const addressParam = params.addresses as string;
    if (!addressParam) return res.status(400).json({ error: 'addresses param required' });
    try { addresses = JSON.parse(addressParam); }
    catch { addresses = addressParam.split(',').map((a:string)=>a.trim()).filter(Boolean); }
  }

  const mlsNumber = (params.mlsNumber as string)||'';
  const dealId    = (params.dealId    as string)||'';
  const clientNames:       string[] = Array.isArray(params.clientNames)       ? params.clientNames       : (() => { try { return JSON.parse(params.clientNames       as string||'[]'); } catch { return []; } })();
  const participantEmails: string[] = Array.isArray(params.participantEmails) ? params.participantEmails : (() => { try { return JSON.parse(params.participantEmails as string||'[]'); } catch { return []; } })();
  const linkedThreadIds:   string[] = Array.isArray(params.linkedThreadIds)   ? params.linkedThreadIds   : (() => { try { return JSON.parse(params.linkedThreadIds   as string||'[]'); } catch { return []; } })();

  const allVariants: string[] = [];
  for (const addr of addresses) allVariants.push(...buildAddressVariants(addr));

  const deal: DealEmailContext = {
    dealId: dealId||'unknown',
    propertyAddress: addresses[0]||'',
    addressVariants: [...new Set(allVariants)],
    mlsNumber: mlsNumber||undefined,
    clientNames, participantEmails, linkedThreadIds,
  };

  // ── IMAP Search ────────────────────────────────────────────────────────────
  const client = new ImapFlow({
    host:'imap.gmail.com', port:993, secure:true,
    auth:{ user:GMAIL_USER, pass:GMAIL_APP_PASSWORD }, logger:false,
    connectionTimeout: 8000,
    socketTimeout: 8000,
  });
  const rawEmails: any[] = [];
  const TIMEOUT_MS = 8500;

  try {
    await Promise.race([
      (async () => {
        await client.connect();
        const lock = await client.getMailboxLock('INBOX');
        const uidSet = new Set<number>();
        try {
          for (const addr of addresses) {
            const u1 = await (client.search as any)({ text: addr }, { uid:true });
            for (const u of (u1 as number[])) uidSet.add(u);
            const words = addr.split(' ').slice(0,3).join(' ');
            const u2 = await (client.search as any)({ subject: words }, { uid:true });
            for (const u of (u2 as number[])) uidSet.add(u);
          }
        } catch(e) { console.error('IMAP search error:', e); }
        const uidList = Array.from(uidSet).slice(0,15);
        for (const uid of uidList) {
          try {
            const msg = await client.fetchOne(uid.toString(), { envelope:true, source:true });
            if (!msg) continue;
            const source = msg.source?.toString('utf-8')||'';
            const { text, html, attachments } = extractPartsFromSource(source);
            const bodyText = text||(html ? stripHtml(html) : '');
            const msgDate  = msg.envelope?.date ? new Date(msg.envelope.date) : new Date();
            const fromAddr = msg.envelope?.from?.[0];
            const hdrs     = extractEmailHeaders(source);
            rawEmails.push({
              id: msg.uid.toString(),
              messageId: hdrs.messageId,
              inReplyTo: hdrs.inReplyTo,
              subject: msg.envelope?.subject||'(no subject)',
              from: fromAddr ? `${fromAddr.name||''} <${fromAddr.address||''}>`.trim() : '',
              to: msg.envelope?.to?.map((a:any)=>a.address).join(', ')||'',
              cc: hdrs.cc||msg.envelope?.cc?.map((a:any)=>a.address).join(', ')||'',
              date: msgDate.toISOString(),
              internalDate: msgDate.getTime().toString(),
              snippet: bodyText.substring(0,200),
              bodyHtml: html||'',
              body: bodyText,
              attachmentNames: attachments.map((a:any)=>a.filename),
              attachments: attachments.map((a:any)=>({
                filename:a.filename, contentType:a.contentType, size:a.size,
                downloadUrl:`/api/email/attachment?uid=${msg.uid}&filename=${encodeURIComponent(a.filename)}&folder=INBOX`,
              })),
            });
          } catch(e) { console.error(`Fetch UID ${uid} error:`, e); }
        }
        lock.release();
        await client.logout();
      })(),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('IMAP_TIMEOUT')), TIMEOUT_MS)
      ),
    ]);
  } catch(err:any) {
    try { await client.logout(); } catch {}
    if (err.message === 'IMAP_TIMEOUT') {
      // Return whatever we managed to collect before timeout
      if (rawEmails.length === 0) {
        return res.status(200).json({
          emails: [],
          total: 0,
          addresses,
          stats: { hardAccepted: 0, grayZone: 0, aiAccepted: 0, hardRejected: 0, totalScanned: 0 },
          warning: 'Email search timed out. Try again or check Gmail connectivity.',
        });
      }
      // Fall through with partial results
    } else {
      console.error('Email search-classify error:', err);
      return res.status(500).json({ error: err.message||'Search failed' });
    }
  }

  // ── Thread grouping ────────────────────────────────────────────────────────
  const threadGroupMap = buildThreadGroups(rawEmails);
  for (const e of rawEmails) e.threadGroupId = threadGroupMap.get(e.id)||e.id;

  // ── 3-layer classification ─────────────────────────────────────────────────
  const hardAccept: any[] = [];
  const hardReject: any[] = [];
  const grayZone:   any[] = [];
  const signalsMap  = new Map<string,string[]>();

  for (const e of rawEmails) {
    const { score, signals } = deterministicScore(e, deal);
    signalsMap.set(e.id, signals);
    e._score = score;
    if      (score >= 80) hardAccept.push(e);
    else if (score <  20) hardReject.push(e);
    else                  grayZone.push(e);
  }

  const aiResults = await classifyBatchWithAI(grayZone, deal, signalsMap);

  // ── Assemble results ───────────────────────────────────────────────────────
  const results: any[] = [];

  for (const e of hardAccept) {
    const conf = Math.min(0.99, 0.90 + (e._score - 80) * 0.001);
    results.push({ ...e, classification: {
      shouldAttach:     true,
      confidence:       conf,
      category:         'general',
      reason:           'High-confidence rule match',
      extractedSignals: signalsMap.get(e.id)||[],
      source:           'deterministic',
    }});
  }

  for (const e of grayZone) {
    const ai = aiResults.get(e.id);
    if (ai?.shouldAttach) {
      results.push({ ...e, classification: ai });
    }
  }

  results.sort((a,b) => {
    const cd = b.classification.confidence - a.classification.confidence;
    if (Math.abs(cd) > 0.05) return cd;
    return Number(b.internalDate) - Number(a.internalDate);
  });

  return res.status(200).json({
    emails: results,
    total:  results.length,
    addresses,
    stats: {
      hardAccepted: hardAccept.length,
      grayZone:     grayZone.length,
      aiAccepted:   [...aiResults.values()].filter(r=>r.shouldAttach).length,
      hardRejected: hardReject.length,
      totalScanned: rawEmails.length,
    },
  });
}


// ── Inbound email webhook (called by Gmail trigger) ───────────────────────────
async function handleInboundWebhook(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { subject, body: emailBody, from: fromEmail, hasAttachment } = req.body as {
    subject: string;
    body: string;
    from: string;
    hasAttachment: boolean;
  };

  const content = `From: ${fromEmail}\nSubject: ${subject}\nHas Attachment: ${hasAttachment}\n\nBody:\n${(emailBody || '').substring(0, 1000)}`;

  try {
    const wfRes = await fetch(`${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://tcappmyredeal.vercel.app'}/api/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        triggerType: 'email_inbound',
        content,
        context: {
          from: fromEmail,
          subject,
          hasAttachment,
          channel: 'email',
        },
      }),
    });
    const result = await wfRes.json();
    return res.json({ ok: true, workflows: result });
  } catch (e) {
    console.error('Workflow engine error:', e);
    return res.status(500).json({ error: 'Workflow engine failed' });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel rewrite passes path segment as query param:
  // /api/email/threads -> action='threads', /api/email/send -> action='send', /api/email/attachment -> action='attachment'
  const action = req.query.action as string;
  if (action === 'send') return handleSend(req, res);
  if (action === 'attachment') return handleAttachment(req, res);
  if (action === 'search') return handleSearch(req, res);
  if (action === 'search-classify') return handleSearchClassify(req, res);
  if (action === 'inbound-webhook') return handleInboundWebhook(req, res);
  return handleThreads(req, res);
}
