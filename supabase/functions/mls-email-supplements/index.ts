// mls-email-supplements Edge Function v2
// Calls Railway MLS scraper → sends PDFs via Gmail API to tc@myredeal.com

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const RAILWAY_SCRAPER_URL = 'https://mls-scraper-production-79d9.up.railway.app/scrape';
const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function getAccessToken(): Promise<string> {
  const res = await fetch(GMAIL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GMAIL_CLIENT_ID')!,
      client_secret: Deno.env.get('GMAIL_CLIENT_SECRET')!,
      refresh_token: Deno.env.get('GMAIL_REFRESH_TOKEN')!,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

// UTF-8 safe base64 encoding (handles emoji, em-dash, etc.)
function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Gmail API requires base64url (not standard base64)
function toBase64Url(str: string): string {
  return toBase64(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildMimeWithAttachments(
  to: string[],
  subject: string,
  htmlBody: string,
  attachments: { filename: string; data: string; mimeType: string }[]
): string {
  const outerB = `outer_${crypto.randomUUID().replace(/-/g, '')}`;
  const innerB = `inner_${crypto.randomUUID().replace(/-/g, '')}`;

  // Encode subject as RFC 2047 to handle non-ASCII safely
  const encodedSubject = `=?UTF-8?B?${toBase64(subject)}?=`;

  const lines: string[] = [
    `From: TC Command <tc@myredeal.com>`,
    `To: ${to.join(', ')}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${outerB}"`,
    '',
    `--${outerB}`,
    `Content-Type: multipart/alternative; boundary="${innerB}"`,
    '',
    `--${innerB}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    toBase64(htmlBody),
    `--${innerB}--`,
  ];

  for (const att of attachments) {
    lines.push(
      `--${outerB}`,
      `Content-Type: ${att.mimeType}; name="${att.filename}"`,
      `Content-Disposition: attachment; filename="${att.filename}"`,
      'Content-Transfer-Encoding: base64',
      '',
      att.data, // already base64 from scraper
      '',
    );
  }

  lines.push(`--${outerB}--`);
  return lines.join('\r\n');
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { mlsNumber, toEmail } = body;

    if (!mlsNumber) return jsonResponse({ error: 'mlsNumber required' }, 400);

    const recipient = toEmail || 'tc@myredeal.com';

    // Step 1: Call Railway scraper
    console.log(`Calling scraper for MLS# ${mlsNumber}...`);
    const scraperRes = await fetch(RAILWAY_SCRAPER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mlsNumber }),
      signal: AbortSignal.timeout(100000),
    });

    if (!scraperRes.ok) {
      return jsonResponse({ success: false, error: `Scraper HTTP ${scraperRes.status}` }, 502);
    }

    const scraperData = await scraperRes.json();
    console.log(`Scraper result: success=${scraperData.success}, pdfCount=${scraperData.pdfCount}`);

    if (scraperData.cookiesExpired) {
      return jsonResponse({
        success: false,
        cookiesExpired: true,
        message: 'Matrix session cookies expired - refresh MATRIX_COOKIES in Railway',
      });
    }

    if (!scraperData.success) {
      return jsonResponse({ success: false, message: scraperData.message || 'Scraper failed' });
    }

    const files: { name: string; data: string; mimeType: string }[] = scraperData.files || [];

    if (files.length === 0) {
      return jsonResponse({ success: true, pdfCount: 0, emailSent: false, message: 'No supplement PDFs found for this listing' });
    }

    // Step 2: Send email via Gmail API
    console.log(`Sending email to ${recipient} with ${files.length} attachment(s)...`);

    const attachments = files.map(f => ({
      filename: f.name,
      data: f.data,
      mimeType: f.mimeType || 'application/pdf',
    }));

    const pdfCount = files.length;
    const htmlBody = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
        <div style="background:#0f172a;border-radius:10px;padding:20px 24px;margin-bottom:24px;">
          <div style="font-size:20px;font-weight:800;color:#fff;">TC Command</div>
          <div style="font-size:13px;color:#94a3b8;margin-top:4px;">MLS Supplement Documents</div>
        </div>
        <h2 style="color:#0f172a;margin:0 0 8px;">MLS# ${mlsNumber}</h2>
        <p style="color:#475569;margin:0 0 16px;">
          Found <strong>${pdfCount}</strong> supplement document${pdfCount !== 1 ? 's' : ''} attached to this listing:
        </p>
        <ol style="color:#334155;padding-left:20px;">
          ${files.map(f => `<li style="margin-bottom:6px;">${f.name}</li>`).join('')}
        </ol>
        <p style="color:#94a3b8;font-size:12px;margin-top:24px;">Sent automatically by TC Command - tc@myredeal.com</p>
      </div>
    `;

    const subject = `MLS Supplements - ${mlsNumber} (${pdfCount} doc${pdfCount !== 1 ? 's' : ''})`;

    let accessToken: string;
    try {
      accessToken = await getAccessToken();
    } catch (e) {
      return jsonResponse({ success: true, pdfCount, emailSent: false, emailError: `Auth: ${(e as Error).message}` });
    }

    const mimeMessage = buildMimeWithAttachments([recipient], subject, htmlBody, attachments);
    const encodedMessage = toBase64Url(mimeMessage);

    const sendRes = await fetch(GMAIL_SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encodedMessage }),
    });

    if (!sendRes.ok) {
      const errText = await sendRes.text();
      console.error('Gmail API error:', errText);
      return jsonResponse({ success: true, pdfCount, emailSent: false, emailError: `Gmail API (${sendRes.status}): ${errText}` });
    }

    const sendData = await sendRes.json();
    console.log(`Email sent! messageId=${sendData.id}`);

    return jsonResponse({
      success: true,
      mlsNumber,
      pdfCount,
      emailSent: true,
      emailTo: recipient,
      messageId: sendData.id,
    });

  } catch (err) {
    console.error('Edge function error:', err);
    return jsonResponse({ success: false, error: (err as Error).message }, 500);
  }
});
