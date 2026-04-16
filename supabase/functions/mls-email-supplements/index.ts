import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GMAIL_CLIENT_ID = Deno.env.get("GMAIL_CLIENT_ID")!;
const GMAIL_CLIENT_SECRET = Deno.env.get("GMAIL_CLIENT_SECRET")!;
const GMAIL_REFRESH_TOKEN = Deno.env.get("GMAIL_REFRESH_TOKEN")!;
const FROM_EMAIL = "tc@myredeal.com";

// RFC 2047 encode for UTF-8 subjects
function encodeSubject(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let b64 = "";
  const chunk = 3;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.slice(i, i + chunk);
    b64 += btoa(String.fromCharCode(...slice));
  }
  return `=?UTF-8?B?${b64}?=`;
}

// Build MIME message with optional PDF attachments
function buildMimeMessage(opts: {
  to: string;
  subject: string;
  bodyText: string;
  files: { name: string; data: string; mimeType: string }[];
}): string {
  const boundary = "----=_Part_" + Math.random().toString(36).substring(2);
  const lines: string[] = [];

  lines.push(`From: TC Command <${FROM_EMAIL}>`);
  lines.push(`To: ${opts.to}`);
  lines.push(`Subject: ${encodeSubject(opts.subject)}`);
  lines.push("MIME-Version: 1.0");
  lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  lines.push("");

  // Text body
  lines.push(`--${boundary}`);
  lines.push("Content-Type: text/plain; charset=UTF-8");
  lines.push("Content-Transfer-Encoding: base64");
  lines.push("");
  const bodyBytes = new TextEncoder().encode(opts.bodyText);
  let bodyB64 = "";
  for (let i = 0; i < bodyBytes.length; i += 3) {
    bodyB64 += btoa(String.fromCharCode(...bodyBytes.slice(i, i + 3)));
  }
  lines.push(bodyB64);
  lines.push("");

  // Attachments
  for (const file of opts.files) {
    const ct = file.mimeType || "application/octet-stream";
    const encodedName = encodeSubject(file.name);
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: ${ct}; name="${encodedName}"`);
    lines.push("Content-Transfer-Encoding: base64");
    lines.push(`Content-Disposition: attachment; filename="${encodedName}"`);
    lines.push("");
    const b64 = file.data.replace(/\s/g, "");
    for (let i = 0; i < b64.length; i += 76) {
      lines.push(b64.slice(i, i + 76));
    }
    lines.push("");
  }

  lines.push(`--${boundary}--`);
  return lines.join("\r\n");
}

// Get Gmail access token via OAuth2 refresh
async function getAccessToken(): Promise<string> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error("Failed to get Gmail access token: " + JSON.stringify(tokenData));
  }
  return tokenData.access_token;
}

// Send one email via Gmail API
async function sendEmail(accessToken: string, to: string, subject: string, bodyText: string, files: { name: string; data: string; mimeType: string }[]): Promise<string> {
  const mimeMsg = buildMimeMessage({ to, subject, bodyText, files });
  const b64url = btoa(mimeMsg).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const sendRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: b64url }),
    }
  );
  const sendData = await sendRes.json();
  if (!sendRes.ok) {
    throw new Error("Gmail send failed: " + JSON.stringify(sendData));
  }
  return sendData.id;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" } });
  }

  try {
    const body = await req.json();
    const { mlsNumber, emailTo, toEmails: toEmailsRaw, files, cookiesExpired } = body;

    if (!mlsNumber) {
      return new Response(JSON.stringify({ error: "mlsNumber required" }), { status: 400 });
    }

    // Resolve recipients — accept toEmails (array) or emailTo (string), fallback to TC
    const recipients: string[] = Array.isArray(toEmailsRaw) && toEmailsRaw.length > 0
      ? toEmailsRaw
      : [emailTo || FROM_EMAIL];

    const toAddress = recipients.join(", ");

    // ── Cookie expiry notification ────────────────────────────────────────────
    if (cookiesExpired) {
      const accessToken = await getAccessToken();
      const subject = `⚠️ Matrix Session Expired — MLS# ${mlsNumber} supplements not fetched`;
      const bodyText = [
        `Your Matrix MLS session has expired.`,
        ``,
        `Supplements could not be automatically fetched for MLS# ${mlsNumber}.`,
        ``,
        `To fix this:`,
        `1. Log into Matrix at https://hmls.mlsmatrix.com (your normal 2FA login)`,
        `2. Open DevTools → Application → Cookies → hmls.mlsmatrix.com`,
        `3. Run this in the Console tab to copy all cookies:`,
        `   document.cookie`,
        `4. Paste the result into the TC Command chat`,
        ``,
        `TC Command will update the scraper automatically — takes about 30 seconds.`,
      ].join("\n");

      await sendEmail(accessToken, FROM_EMAIL, subject, bodyText, []);
      return new Response(JSON.stringify({ success: true, notificationType: "cookiesExpired" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── Normal supplement delivery ─────────────────────────────────────────────
    let pdfFiles: { name: string; data: string; mimeType: string }[] = files || [];

    // Fallback: scrape if no files provided (edge fn called directly)
    if (!files || files.length === 0) {
      const RAILWAY_URL = "https://mls-scraper-production-79d9.up.railway.app/scrape";
      const scrapeRes = await fetch(RAILWAY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mlsNumber }),
        signal: AbortSignal.timeout(90000),
      });
      if (!scrapeRes.ok) throw new Error(`Scraper error: ${scrapeRes.status}`);
      const scrapeData = await scrapeRes.json();
      if (!scrapeData.success) throw new Error(scrapeData.error || "Scraper returned failure");
      pdfFiles = scrapeData.files || [];
    }

    if (pdfFiles.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "No documents found for this MLS#" }), { status: 200 });
    }

    const accessToken = await getAccessToken();

    const docCount = pdfFiles.length;
    const subject = `MLS Supplements - ${mlsNumber} (${docCount} doc${docCount !== 1 ? "s" : ""})`;
    const bodyText = [
      `MLS Supplements — ${mlsNumber}`,
      "",
      `${docCount} document${docCount !== 1 ? "s" : ""} attached:`,
      ...pdfFiles.map((f, i) => `  ${i + 1}. ${f.name}`),
      "",
      "Fetched automatically from Heartland Matrix.",
      "Upload these to the transaction folder for this deal.",
    ].join("\n");

    // Send to all recipients in one email (comma-separated To: header)
    const messageId = await sendEmail(accessToken, toAddress, subject, bodyText, pdfFiles);

    return new Response(
      JSON.stringify({
        success: true,
        mlsNumber,
        pdfCount: pdfFiles.length,
        emailSent: true,
        emailTo: toAddress,
        messageId,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
