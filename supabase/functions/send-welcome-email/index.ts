import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendViaGmail } from "./_shared/gmail.ts";

const PORTAL_BASE_URL = Deno.env.get("PORTAL_BASE_URL") ?? "https://portal.myredeal.com";
const TC_NAME = Deno.env.get("TC_NAME") ?? "TC Team";

// ─── Email HTML builders ───────────────────────────────────────────────────

function buildWelcomeEmailHtml(opts: {
  propertyAddress: string;
  closingDate: string | null;
  tcName: string;
  portalUrl: string;
  recipientFirstName: string;
}): string {
  const { propertyAddress, closingDate, tcName, portalUrl, recipientFirstName } = opts;
  const closingStr = closingDate
    ? new Date(closingDate + "T00:00:00").toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric",
      })
    : "TBD";

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#1a56db;padding:32px 40px;">
            <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">Welcome to Your Transaction!</h1>
            <p style="margin:8px 0 0;color:#bfdbfe;font-size:14px;">${propertyAddress}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 16px;color:#374151;font-size:16px;">Hi ${recipientFirstName},</p>
            <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
              I'm <strong>${tcName}</strong>, your Transaction Coordinator for <strong>${propertyAddress}</strong>.
              I'll be managing all the details of your transaction from contract to closing so you can focus on the exciting part.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;margin:24px 0;">
              <tr><td style="padding:20px 24px;">
                <p style="margin:0 0 8px;color:#0369a1;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">Your Transaction</p>
                <p style="margin:0 0 6px;color:#1e293b;font-size:14px;"><strong>Property:</strong> ${propertyAddress}</p>
                <p style="margin:0 0 6px;color:#1e293b;font-size:14px;"><strong>Closing Date:</strong> ${closingStr}</p>
                <p style="margin:0;color:#1e293b;font-size:14px;"><strong>Your TC:</strong> ${tcName} — tc@myredeal.com</p>
              </td></tr>
            </table>
            <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
              Track your transaction progress in real time through your personal portal:
            </p>
            <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
              <tr>
                <td style="background:#1a56db;border-radius:8px;padding:14px 28px;">
                  <a href="${portalUrl}" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">View Your Transaction Portal →</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px;color:#374151;font-size:15px;"><strong>What to expect:</strong></p>
            <ul style="margin:0 0 24px;padding-left:20px;color:#374151;font-size:14px;line-height:1.8;">
              <li>I coordinate all deadlines, inspections, and paperwork</li>
              <li>You'll receive updates at every major milestone</li>
              <li>I'm your single point of contact — reach me anytime at tc@myredeal.com</li>
            </ul>
            <p style="margin:0;color:#374151;font-size:15px;line-height:1.6;">Looking forward to a smooth closing!</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">${tcName} · Transaction Coordinator · tc@myredeal.com</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildContractThreadHtml(opts: {
  propertyAddress: string;
  closingDate: string | null;
  tcName: string;
  dealId: string;
}): string {
  const { propertyAddress, closingDate, tcName, dealId } = opts;
  const closingStr = closingDate
    ? new Date(closingDate + "T00:00:00").toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric",
      })
    : "TBD";

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#065f46;padding:32px 40px;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Contract Thread</h1>
            <p style="margin:8px 0 0;color:#a7f3d0;font-size:15px;font-weight:600;">${propertyAddress}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 16px;color:#374151;font-size:16px;">Hello everyone,</p>
            <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
              My name is <strong>${tcName}</strong> and I am the Transaction Coordinator for the above-referenced property.
              I am reaching out to introduce myself and establish our communication thread for this transaction.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin:24px 0;">
              <tr><td style="padding:20px 24px;">
                <p style="margin:0 0 8px;color:#15803d;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">Transaction Summary</p>
                <p style="margin:0 0 6px;color:#1e293b;font-size:14px;"><strong>Property:</strong> ${propertyAddress}</p>
                <p style="margin:0 0 6px;color:#1e293b;font-size:14px;"><strong>Projected Closing:</strong> ${closingStr}</p>
                <p style="margin:0;color:#1e293b;font-size:14px;"><strong>TC:</strong> ${tcName} · tc@myredeal.com</p>
              </td></tr>
            </table>
            <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
              Please use <strong>Reply All</strong> to keep everyone on the thread informed.
              I will be coordinating all deadlines and documents throughout this transaction.
            </p>
            <p style="margin:0 0 8px;color:#374151;font-size:15px;"><strong>My role:</strong></p>
            <ul style="margin:0 0 24px;padding-left:20px;color:#374151;font-size:14px;line-height:1.8;">
              <li>Track all contract deadlines and contingency dates</li>
              <li>Coordinate document collection and delivery</li>
              <li>Communicate status updates to all parties</li>
              <li>Facilitate a smooth path to closing</li>
            </ul>
            <p style="margin:0;color:#374151;font-size:15px;line-height:1.6;">Thank you — looking forward to working with you all!</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">
              ${tcName} · Transaction Coordinator · tc@myredeal.com<br/>
              Reference ID: ${dealId}
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Main handler ──────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    const { deal_id, tc_name } = body;

    if (!deal_id) {
      return new Response(JSON.stringify({ error: "deal_id required" }), { status: 400 });
    }

    // 1. Fetch deal
    const { data: deal, error: dealErr } = await supabase
      .from("deals")
      .select("id, property_address, closing_date, org_id, welcome_email_sent_at")
      .eq("id", deal_id)
      .single();

    if (dealErr || !deal) {
      return new Response(JSON.stringify({ error: "Deal not found" }), { status: 404 });
    }

    // Idempotency — skip if already sent
    if (deal.welcome_email_sent_at) {
      return new Response(JSON.stringify({ skipped: true, reason: "already_sent" }), { status: 200 });
    }

    const tcName = tc_name || TC_NAME;
    const portalUrl = `${PORTAL_BASE_URL}/deals/${deal_id}`;

    // 2. Fetch all deal participants (not deleted)
    const { data: participants } = await supabase
      .from("deal_participants")
      .select("contact_id, is_client_side, deal_role")
      .eq("deal_id", deal_id)
      .is("deleted_at", null);

    if (!participants || participants.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: "no_participants" }), { status: 200 });
    }

    const contactIds = [...new Set(participants.map((p: any) => p.contact_id).filter(Boolean))];

    // 3. Fetch contacts with emails
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, first_name, full_name, email")
      .in("id", contactIds)
      .is("deleted_at", null)
      .not("email", "is", null);

    if (!contacts || contacts.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: "no_contacts_with_email" }), { status: 200 });
    }

    const contactMap = new Map(contacts.map((c: any) => [c.id, c]));

    // 4. Build recipient lists
    const clientSideRecipients: Array<{ email: string; firstName: string }> = [];
    const allEmails: string[] = [];
    const seenEmails = new Set<string>();

    for (const p of participants) {
      const contact = contactMap.get(p.contact_id);
      if (!contact?.email) continue;
      const email = (contact.email as string).toLowerCase().trim();

      if (!seenEmails.has(email)) {
        seenEmails.add(email);
        allEmails.push(contact.email);
      }

      if (p.is_client_side && !clientSideRecipients.some(r => r.email.toLowerCase() === email)) {
        clientSideRecipients.push({
          email: contact.email,
          firstName: contact.first_name || (contact.full_name as string)?.split(" ")[0] || "there",
        });
      }
    }

    const results: any[] = [];

    // 5. Send Welcome Email — individually personalized to each client-side contact
    for (const recipient of clientSideRecipients) {
      const html = buildWelcomeEmailHtml({
        propertyAddress: deal.property_address,
        closingDate: deal.closing_date,
        tcName,
        portalUrl,
        recipientFirstName: recipient.firstName,
      });

      const result = await sendViaGmail({
        to: [recipient.email],
        subject: `Welcome to Your Transaction — ${deal.property_address}`,
        bodyHtml: html,
      });

      results.push({ type: "welcome", to: recipient.email, ...result });
    }

    // 6. Send Contract Thread — one email to all parties
    if (allEmails.length > 0) {
      const html = buildContractThreadHtml({
        propertyAddress: deal.property_address,
        closingDate: deal.closing_date,
        tcName,
        dealId: deal_id,
      });

      const result = await sendViaGmail({
        to: allEmails,
        subject: `Contract Thread for ${deal.property_address}`,
        bodyHtml: html,
      });

      results.push({ type: "contract_thread", to: allEmails, ...result });
    }

    // 7. Stamp deal + log to events
    const anySent = results.some((r) => r.success);
    if (anySent) {
      await supabase
        .from("deals")
        .update({ welcome_email_sent_at: new Date().toISOString() })
        .eq("id", deal_id);
    }

    // events table columns: id, type, payload, deal_id, status, source, created_at, processed_at
    // NO agent or result columns — those don't exist
    await supabase.from("events").insert({
      type: "welcome_email_sent",
      deal_id,
      payload: {
        client_side_recipients: clientSideRecipients.map((r) => r.email),
        all_recipients: allEmails,
        property_address: deal.property_address,
        results,
      },
      status: anySent ? "processed" : "failed",
      source: "system",
      processed_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[send-welcome-email] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
