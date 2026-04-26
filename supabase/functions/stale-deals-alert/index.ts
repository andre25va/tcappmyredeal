import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendViaGmail } from "./_shared/gmail.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const TC_EMAIL = "tc@myredeal.com";

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

Deno.serve(async () => {
  try {
    // Find deals where closing_date was 3+ days ago and still not archived
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const cutoff = threeDaysAgo.toISOString().split("T")[0];

    // FIX #1: use property_address (not address)
    // FIX #2: filter by pipeline_stage (not status)
    const { data: staleDeals, error } = await supabase
      .from("deals")
      .select("id, property_address, closing_date, pipeline_stage")
      .lte("closing_date", cutoff)
      .neq("pipeline_stage", "archived")
      .order("closing_date", { ascending: true });

    if (error) {
      console.error("DB error:", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    if (!staleDeals || staleDeals.length === 0) {
      return new Response(JSON.stringify({ sent: false, reason: "No stale deals" }), { status: 200 });
    }

    const rows = staleDeals
      .map(
        (d) => `
        <tr>
          <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-weight:500;color:#111;">${d.property_address || "—"}</td>
          <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;color:#dc2626;font-weight:600;">${formatDate(d.closing_date)}</td>
          <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;">
            <span style="background:#fef9c3;color:#854d0e;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;">Needs Review</span>
          </td>
        </tr>`
      )
      .join("");

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0;padding:0;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.08);overflow:hidden;">
    <div style="background:#b91c1c;padding:24px 32px;">
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">Stale Deal Alert</h1>
      <p style="margin:6px 0 0;color:#fecaca;font-size:14px;">${staleDeals.length} deal${staleDeals.length > 1 ? "s" : ""} passed closing date with no confirmation</p>
    </div>
    <div style="padding:24px 32px;">
      <p style="color:#374151;font-size:14px;margin:0 0 20px;">
        The following deal${staleDeals.length > 1 ? "s" : ""} ${staleDeals.length > 1 ? "have" : "has"} a closing date more than 3 days in the past
        but ${staleDeals.length > 1 ? "have" : "has"} not been confirmed or archived.
        Please review each deal and either <strong>Confirm Closing</strong> or <strong>Archive</strong> it.
      </p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Address</th>
            <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Closing Date</th>
            <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <div style="margin-top:24px;text-align:center;">
        <a href="https://tcappmyredeal.vercel.app" style="display:inline-block;background:#1d4ed8;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
          Open TC App &rarr;
        </a>
      </div>
    </div>
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">MyRedeal TC Command &middot; Stale Deal Alert</p>
    </div>
  </div>
</body>
</html>`;

    // FIX #3: Use Gmail (not Resend)
    const subject = `${staleDeals.length} Deal${staleDeals.length > 1 ? "s" : ""} Past Closing - No Confirmation`;
    const result = await sendViaGmail({ to: [TC_EMAIL], subject, bodyHtml: html });

    if (!result.success) {
      console.error("Email send error:", result.error);
      return new Response(JSON.stringify({ error: result.error }), { status: 500 });
    }

    return new Response(
      JSON.stringify({ sent: true, count: staleDeals.length }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
