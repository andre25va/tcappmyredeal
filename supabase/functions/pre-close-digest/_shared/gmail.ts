// Shared Gmail API helper for all Edge Functions
// Uses OAuth2 refresh token to get access tokens and send emails

const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

interface GmailCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface EmailAttachment {
  filename: string;
  content: string;
  mimeType: string;
}

interface EmailPayload {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  from?: string;
  attachments?: EmailAttachment[];
}

interface GmailSendResult {
  success: boolean;
  messageId?: string;
  threadId?: string;
  error?: string;
}

function getCredentials(): GmailCredentials {
  const clientId = Deno.env.get('GMAIL_CLIENT_ID');
  const clientSecret = Deno.env.get('GMAIL_CLIENT_SECRET');
  const refreshToken = Deno.env.get('GMAIL_REFRESH_TOKEN');
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Gmail OAuth credentials in environment secrets');
  }
  return { clientId, clientSecret, refreshToken };
}

async function getAccessToken(creds: GmailCredentials): Promise<string> {
  const response = await fetch(GMAIL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to refresh access token: ${err}`);
  }
  const data = await response.json();
  return data.access_token;
}

function buildMimeMessage(email: EmailPayload): string {
  const fromAddr = email.from || 'tc@myredeal.com';
  const hasAttachments = email.attachments && email.attachments.length > 0;
  const htmlBodyB64 = btoa(unescape(encodeURIComponent(email.bodyHtml)));
  const lines: string[] = [`From: ${fromAddr}`, `To: ${email.to.join(', ')}` ];
  if (email.cc?.length) lines.push(`Cc: ${email.cc.join(', ')}`);
  if (email.bcc?.length) lines.push(`Bcc: ${email.bcc.join(', ')}`);
  const subjectEncoded = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(email.subject)))}?=`;
  lines.push(`Subject: ${subjectEncoded}`);
  lines.push('MIME-Version: 1.0');
  if (hasAttachments) {
    const outerBoundary = `mixed_${crypto.randomUUID().replace(/-/g, '')}`;
    lines.push(`Content-Type: multipart/mixed; boundary="${outerBoundary}"`);
    lines.push('');
    lines.push(`--${outerBoundary}`);
    lines.push('Content-Type: text/html; charset="UTF-8"');
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(htmlBodyB64);
    lines.push('');
    for (const att of email.attachments!) {
      lines.push(`--${outerBoundary}`);
      lines.push(`Content-Type: ${att.mimeType}; name="${att.filename}"`);
      lines.push('Content-Transfer-Encoding: base64');
      lines.push(`Content-Disposition: attachment; filename="${att.filename}"`);
      lines.push('');
      lines.push(att.content);
      lines.push('');
    }
    lines.push(`--${outerBoundary}--`);
  } else {
    const altBoundary = `alt_${crypto.randomUUID().replace(/-/g, '')}`;
    lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    lines.push('');
    lines.push(`--${altBoundary}`);
    lines.push('Content-Type: text/html; charset="UTF-8"');
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(htmlBodyB64);
    lines.push(`--${altBoundary}--`);
  }
  return lines.join('\r\n');
}

function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sendViaGmail(email: EmailPayload): Promise<GmailSendResult> {
  try {
    const creds = getCredentials();
    const accessToken = await getAccessToken(creds);
    const mime = buildMimeMessage(email);
    const encodedMessage = base64UrlEncode(mime);
    const response = await fetch(GMAIL_SEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: encodedMessage }),
    });
    if (!response.ok) {
      const err = await response.text();
      return { success: false, error: `Gmail API error (${response.status}): ${err}` };
    }
    const result = await response.json();
    return { success: true, messageId: result.id, threadId: result.threadId };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
