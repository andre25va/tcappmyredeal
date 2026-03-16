import type { VercelRequest, VercelResponse } from '@vercel/node';

const GMAIL_USER = 'tc@myredeal.com';

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
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }
  const data = await res.json();
  return data.access_token;
}

function decodeBase64(str: string): string {
  try {
    return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

function getHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function extractBody(payload: any): string {
  if (!payload) return '';

  // Direct body
  if (payload.body?.data) {
    return decodeBase64(payload.body.data);
  }

  // Multipart - prefer text/plain, fallback to text/html
  if (payload.parts) {
    const textPart = payload.parts.find((p: any) => p.mimeType === 'text/plain');
    if (textPart?.body?.data) return decodeBase64(textPart.body.data);

    const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html');
    if (htmlPart?.body?.data) {
      // Strip HTML tags for plain text display
      return decodeBase64(htmlPart.body.data)
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }

    // Nested multipart (multipart/alternative inside multipart/mixed)
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }

  return '';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const accessToken = await getAccessToken();
    const authHeader = `Bearer ${accessToken}`;
    const baseUrl = 'https://gmail.googleapis.com/gmail/v1';

    const { thread_id, label = 'INBOX', max_results = '20', page_token } = req.query as any;

    // ── Fetch a single thread ────────────────────────────────────────────────
    if (thread_id) {
      const tRes = await fetch(`${baseUrl}/users/${GMAIL_USER}/threads/${thread_id}?format=full`, {
        headers: { Authorization: authHeader },
      });
      if (!tRes.ok) throw new Error(`Thread fetch failed: ${await tRes.text()}`);
      const thread = await tRes.json();

      const messages = (thread.messages || []).map((msg: any) => {
        const hdrs = msg.payload?.headers || [];
        return {
          id: msg.id,
          threadId: msg.threadId,
          labelIds: msg.labelIds || [],
          snippet: msg.snippet || '',
          subject: getHeader(hdrs, 'Subject'),
          from: getHeader(hdrs, 'From'),
          to: getHeader(hdrs, 'To'),
          cc: getHeader(hdrs, 'Cc'),
          date: getHeader(hdrs, 'Date'),
          internalDate: msg.internalDate,
          body: extractBody(msg.payload),
        };
      });

      return res.status(200).json({ thread_id, messages });
    }

    // ── List threads ─────────────────────────────────────────────────────────
    let listUrl = `${baseUrl}/users/${GMAIL_USER}/threads?maxResults=${max_results}&labelIds=${label}`;
    if (page_token) listUrl += `&pageToken=${page_token}`;

    const listRes = await fetch(listUrl, { headers: { Authorization: authHeader } });
    if (!listRes.ok) throw new Error(`Thread list failed: ${await listRes.text()}`);
    const listData = await listRes.json();

    const threadIds: string[] = (listData.threads || []).map((t: any) => t.id);

    // Fetch thread metadata in parallel (snippet format = faster)
    const threadDetails = await Promise.all(
      threadIds.map(async (id) => {
        const r = await fetch(`${baseUrl}/users/${GMAIL_USER}/threads/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`, {
          headers: { Authorization: authHeader },
        });
        if (!r.ok) return null;
        const t = await r.json();
        const firstMsg = t.messages?.[0];
        const lastMsg = t.messages?.[t.messages.length - 1];
        const hdrs = lastMsg?.payload?.headers || [];
        return {
          id: t.id,
          snippet: lastMsg?.snippet || '',
          messageCount: t.messages?.length || 1,
          labelIds: lastMsg?.labelIds || [],
          subject: getHeader(hdrs, 'Subject') || '(no subject)',
          from: getHeader(hdrs, 'From'),
          to: getHeader(hdrs, 'To'),
          date: getHeader(hdrs, 'Date'),
          internalDate: lastMsg?.internalDate || firstMsg?.internalDate,
          isUnread: (lastMsg?.labelIds || []).includes('UNREAD'),
        };
      })
    );

    return res.status(200).json({
      threads: threadDetails.filter(Boolean),
      nextPageToken: listData.nextPageToken || null,
      resultSizeEstimate: listData.resultSizeEstimate || 0,
    });
  } catch (err: any) {
    console.error('[email/threads] error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
