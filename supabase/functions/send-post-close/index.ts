import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendViaGmail } from "../_shared/gmail.ts";

// ── HTML email template ──────────────────────────────────────────────────────
function buildEmailHtml(opts: {
  firstName: string;
  address: string;
  agentName: string;
  googleReviewUrl?: string | null;
  zillowReviewUrl?: string | null;
}): string {
  const { firstName, address, agentName, googleReviewUrl, zillowReviewUrl } = opts;

  const reviewButtons: string[] = [];
  if (googleReviewUrl) {
    reviewButtons.push(
      `<a href="${googleReviewUrl}" style="display:inline-block;background:#4285F4;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;margin:6px;">⭐ Leave a Google Review</a>`
    );
  }
  if (zillowReviewUrl) {
    reviewButtons.push(
      `<a href="${zillowReviewUrl}" style="display:inline-block;background:#006AFF;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;margin:6px;">🏡 Leave a Zillow Review</a>`
    );
  }

  const reviewSection =
    reviewButtons.length > 0
      ? `<p style="margin:20px 0 8px;color:#374151;font-size:15px;">
          If ${agentName} made this process smoother, it would mean the world to them if you shared your experience:
        </p>
        <div style="text-align:center;margin:20px 0;">
          ${reviewButtons.join("\n          ")}
        </div>`
      : `<p style="margin:20px 0;color:#374151;font-size:15px;">
          We hope ${agentName} made this process as smooth as possible for you!
        </p>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#1d4ed8,#2563eb);padding:28px 32px;">
            <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">🎉 Congratulations on your closing!</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0 0 16px;font-size:16px;color:#111827;">Hi ${firstName},</p>
            <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
              Congratulations on your closing at <strong>${address}</strong>! 🏠 It was a pleasure working on this transaction for you, and we wish you all the best in this exciting new chapter.
            </p>
            ${reviewSection}
            <p style="margin:24px 0 0;font-size:15px;color:#374151;">
              Wishing you every happiness ahead!
            </p>
            <p style="margin:8px 0 0;font-size:15px;color:#6b7280;">— The MyReDeal TC Team</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              MyReDeal · Transaction Coordination · <a href="https://myredeal.com" style="color:#6b7280;">myredeal.com</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (_req: Request) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Find deals closed 1–3 days ago, not yet emailed, not archived
    const today = new Date();
    const daysAgo1 = new Date(today);
    daysAgo1.setDate(today.getDate() - 1);
    const daysAgo3 = new Date(today);
    daysAgo3.setDate(today.getDate() - 3);

    const { data: deals, error: dealsError } = await supabase
      .from("deals")
      .select("id, property_address, closing_date")
      .is("archived_at", null)
      .is("post_close_email_sent_at", null)
      .gte("closing_date", daysAgo3.toISOString().split("T")[0])
      .lte("closing_date", daysAgo1.toISOString().split("T")[0]);

    if (dealsError) throw dealsError;

    if (!deals || deals.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No deals to process", sent: 0 }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    let totalSent = 0;
    const results: Record<string, unknown>[] = [];

    for (const deal of deals) {
      try {
        // Get all non-deleted participants for this deal
        const { data: participants, error: pError } = await supabase
          .from("deal_participants")
          .select(`
            id,
            side,
            deal_role,
            is_client_side,
            contacts (
              id,
              first_name,
              last_name,
              full_name,
              email,
              google_review_url,
              zillow_review_url
            )
          `)
          .eq("deal_id", deal.id)
          .is("deleted_at", null);

        if (pError || !participants || participants.length === 0) {
          results.push({ deal_id: deal.id, skipped: "no participants" });
          continue;
        }

        // Represented side only
        const clientSide = participants.filter((p: any) => p.is_client_side);
        if (clientSide.length === 0) {
          results.push({ deal_id: deal.id, skipped: "no client-side participants" });
          // Stamp so we don't retry
          await supabase.from("deals")
            .update({ post_close_email_sent_at: new Date().toISOString() })
            .eq("id", deal.id);
          continue;
        }

        // Find agent on client side → get their review links
        const agentP = clientSide.find((p: any) => {
          const role = (p.deal_role || "").toLowerCase();
          return role.includes("agent") || role.includes("realtor");
        });
        const agentContact = (agentP as any)?.contacts;
        const agentName =
          agentContact?.full_name ||
          [agentContact?.first_name, agentContact?.last_name].filter(Boolean).join(" ") ||
          "your agent";
        const googleReviewUrl = agentContact?.google_review_url ?? null;
        const zillowReviewUrl = agentContact?.zillow_review_url ?? null;

        // Find buyer/seller clients to email (not agents/TC/title/lender)
        const skipRoles = ["agent", "realtor", "tc", "title", "lender", "attorney", "escrow"];
        const clientContacts = clientSide.filter((p: any) => {
          const role = (p.deal_role || "").toLowerCase();
          return (
            !skipRoles.some((r) => role.includes(r)) &&
            (p as any).contacts?.email
          );
        });

        if (clientContacts.length === 0) {
          results.push({ deal_id: deal.id, skipped: "no client emails" });
          await supabase.from("deals")
            .update({ post_close_email_sent_at: new Date().toISOString() })
            .eq("id", deal.id);
          continue;
        }

        let dealSent = 0;
        let dealFailed = 0;

        for (const p of clientContacts) {
          const c = (p as any).contacts;
          if (!c?.email) continue;

          const firstName =
            c.first_name ||
            (c.full_name ? c.full_name.split(" ")[0] : null) ||
            "there";

          const html = buildEmailHtml({
            firstName,
            address: deal.property_address || "your property",
            agentName,
            googleReviewUrl,
            zillowReviewUrl,
          });

          const gmailResult = await sendViaGmail({
            to: [c.email],
            subject: `🎉 Congratulations on your closing — ${deal.property_address || "your property"}!`,
            bodyHtml: html,
          });

          if (gmailResult.success) {
            dealSent++;
            totalSent++;
          } else {
            console.error(`Email failed to ${c.email}:`, gmailResult.error);
            dealFailed++;
          }
        }

        // Stamp regardless — prevents infinite retry
        await supabase.from("deals")
          .update({ post_close_email_sent_at: new Date().toISOString() })
          .eq("id", deal.id);

        results.push({
          deal_id: deal.id,
          address: deal.property_address,
          sent: dealSent,
          failed: dealFailed,
          agent: agentName,
          has_google: !!googleReviewUrl,
          has_zillow: !!zillowReviewUrl,
        });
      } catch (dealErr) {
        results.push({ deal_id: deal.id, error: String(dealErr) });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        deals_processed: deals.length,
        emails_sent: totalSent,
        results,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-post-close error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
