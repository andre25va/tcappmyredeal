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
    // RFC 2047 encode the filename
    const encodedName = encodeSubject(file.name);
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: ${ct}; name="${encodedName}"`);
    lines.push("Content-Transfer-Encoding: base64");
    lines.push(`Content-Disposition: attachment; filename="${encodedName}"`);
    lines.push("");
    // Chunk base64 at 76 chars per line (MIME standard)
    const b64 = file.data.replace(/\s/g, "");
    for (let i = 0; i < b64.length; i += 76) {
      lines.push(b64.slice(i, i + 76));
    }
    lines.push("");
  }

  lines.push(`--${boundary}--`);
  return lines.join("\r\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" } });
  }

  try {
    const body = await req.json();
    const { mlsNumber, emailTo, files } = body;

    if (!mlsNumber) {
      return new Response(JSON.stringify({ error: "mlsNumber required" }), { status: 400 });
    }

    const toEmail = emailTo || FROM_EMAIL;

    // If files not provided, call Railway scraper to fetch them
    let pdfFiles: { name: string; data: string; mimeType: string }[] = files || [];

    if (!files || files.length === 0) {
      const RAILWAY_URL = "https://mls-scraper-production-79d9.up.railway.app/scrape";
      const scrapeRes = await fetch(RAILWAY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mlsNumber }),
        signal: AbortSignal.timeout(90000),
      });
      if (!scrapeRes.ok) {
        throw new Error(`Scraper error: ${scrapeRes.status}`);
      }
      const scrapeData = await scrapeRes.json();
      if (!scrapeData.success) {
        throw new Error(scrapeData.error || "Scraper returned failure");
      }
      pdfFiles = scrapeData.files || [];
    }

    if (pdfFiles.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "No documents found for this MLS#" }), { status: 200 });
    }

    // Get Gmail access token
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

    const mimeMsg = buildMimeMessage({ to: toEmail, subject, bodyText, files: pdfFiles });

    // Base64url encode for Gmail API
    const mimeBytes = new TextEncoder().encode(mimeMsg);
    let b64url = "";
    for (let i = 0; i < mimeBytes.length; i += 3) {
      b64url += btoa(String.fromCharCode(...mimeBytes.slice(i, i + 3)));
    }
    b64url = b64url.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    const sendRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: b64url }),
      }
    );
    const sendData = await sendRes.json();

    if (!sendRes.ok) {
      throw new Error("Gmail send failed: " + JSON.stringify(sendData));
    }

    return new Response(
      JSON.stringify({
        success: true,
        mlsNumber,
        pdfCount: pdfFiles.length,
        emailSent: true,
        emailTo: toEmail,
        messageId: sendData.id,
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
