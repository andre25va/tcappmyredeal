// Shared Gmail API helper for all Edge Functions
// Uses OAuth2 refresh token to get access tokens and send emails

const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

interface GmailCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

interface EmailPayload {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  from?: string;
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
  const boundary = `boundary_${crypto.randomUUID().replace(/-/g, '')}`;

  const headers = [
    `From: ${fromAddr}`,
    `To: ${email.to.join(', ')}`,
  ];

  if (email.cc?.length) {
    headers.push(`Cc: ${email.cc.join(', ')}`);
  }
  if (email.bcc?.length) {
    headers.push(`Bcc: ${email.bcc.join(', ')}`);
  }

  headers.push(
    `Subject: ${email.subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    btoa(unescape(encodeURIComponent(email.bodyHtml))),
    `--${boundary}--`,
  );

  return headers.join('\r\n');
}

// Base64url encode (RFC 4648)
function base64UrlEncode(str: string): string {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function sendViaGmail(email: EmailPayload): Promise<GmailSendResult> {
  try {
    const creds = getCredentials();
    const accessToken = await getAccessToken(creds);
    const mime = buildMimeMessage(email);

    // Gmail API expects base64url-encoded raw message
    const encodedMessage = base64UrlEncode(mime);

    const response = await fetch(GMAIL_SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encodedMessage }),
    });

    if (!response.ok) {
      const err = await response.text();
      return { success: false, error: `Gmail API error (${response.status}): ${err}` };
    }

    const result = await response.json();
    return {
      success: true,
      messageId: result.id,
      threadId: result.threadId,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
