import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_URL") ?? "https://tcapp.myredeal.com";

function wrapBodyHtml(body: string, confirmUrl?: string, declineUrl?: string): string {
  const buttons = (confirmUrl || declineUrl) ? `
    <div style="margin: 32px 0; text-align: center;">
      ${confirmUrl ? `<a href="${confirmUrl}" style="display:inline-block;margin:0 8px;padding:12px 28px;background-color:#22c55e;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">✅ Confirm</a>` : ""}
      ${declineUrl ? `<a href="${declineUrl}" style="display:inline-block;margin:0 8px;padding:12px 28px;background-color:#ef4444;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">❌ Decline</a>` : ""}
    </div>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background-color:#ffffff;color:#1a1a1a;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;background-color:#ffffff;color:#1a1a1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;">
    <div style="border-bottom:2px solid #e5e7eb;padding-bottom:16px;margin-bottom:24px;">
      <span style="font-size:18px;font-weight:700;color:#1a1a1a;">MyReDeal</span>
    </div>
    <div style="color:#1a1a1a;">
      ${body}
    </div>
    ${buttons}
    <div style="margin-top:40px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;text-align:center;">
      TC Team &nbsp;·&nbsp; <a href="mailto:tc@myredeal.com" style="color:#6b7280;">tc@myredeal.com</a>
    </div>
  </div>
</body>
</html>`;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const {
      subject,
      body_html,
      include_confirm = false,
      include_decline = false,
      blast_type = "general",
      deal_id = null,
      sent_by = null,
      recipients, // Array of { name, email }
    } = body;

    if (!subject || !body_html || !recipients?.length) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create the blast record
    const { data: blast, error: blastError } = await supabase
      .from("email_blasts")
      .insert({
        subject,
        body_html,
        include_confirm,
        include_decline,
        blast_type,
        deal_id,
        sent_by,
      })
      .select()
      .single();

    if (blastError) throw blastError;

    // Create recipient rows with tokens
    const recipientRows = recipients.map((r: { name?: string; email: string }) => ({
      blast_id: blast.id,
      name: r.name ?? null,
      email: r.email,
    }));

    const { data: insertedRecipients, error: recipError } = await supabase
      .from("email_blast_recipients")
      .insert(recipientRows)
      .select();

    if (recipError) throw recipError;

    // Send emails
    const trackBase = `${SUPABASE_URL}/functions/v1/track-email`;
    const sendResults: { email: string; success: boolean; error?: string }[] = [];

    for (const recipient of insertedRecipients) {
      const pixelUrl = `${trackBase}/open?token=${recipient.token}`;
      const confirmUrl = include_confirm ? `${trackBase}/confirm?token=${recipient.token}` : undefined;
      const declineUrl = include_decline ? `${trackBase}/decline?token=${recipient.token}` : undefined;

      const htmlWithTracking = wrapBodyHtml(body_html, confirmUrl, declineUrl)
        .replace("</body>", `<img src="${pixelUrl}" width="1" height="1" style="display:none;" alt="" /></body>`);

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "TC Team <tc@myredeal.com>",
          to: [recipient.email],
          subject,
          html: htmlWithTracking,
        }),
      });

      if (res.ok) {
        await supabase
          .from("email_blast_recipients")
          .update({ sent_at: new Date().toISOString() })
          .eq("id", recipient.id);
        sendResults.push({ email: recipient.email, success: true });
      } else {
        const err = await res.text();
        sendResults.push({ email: recipient.email, success: false, error: err });
      }
    }

    return new Response(
      JSON.stringify({ blast_id: blast.id, results: sendResults }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-group-email error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
