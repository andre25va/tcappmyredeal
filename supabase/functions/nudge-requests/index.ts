import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const NUDGE_1_HOURS = 24;
const NUDGE_2_HOURS = 48;
const ALERT_HOURS = 72;

const TYPE_LABELS: Record<string, string> = {
  earnest_money_receipt: "Earnest Money Receipt",
  inspection_complete: "Inspection Complete",
  repair_request: "Repair Request",
  seller_credit_change: "Seller Credit Change",
};
function getTypeLabel(t: string) { return TYPE_LABELS[t] || t; }

Deno.serve(async (_req: Request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase    = createClient(supabaseUrl, serviceKey);
  const now         = new Date();

  // ── 1. Fetch all waiting requests with recipients + deal address ────────────
  const { data: waitingReqs, error } = await supabase
    .from("requests")
    .select("*, request_recipients(*), deals(property_address, city, state)")
    .eq("status", "waiting");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const results = { nudge1: 0, nudge2: 0, alerts: 0, skipped: 0 };

  for (const req of waitingReqs ?? []) {
    // Use updated_at as a proxy for "time since sent" (it's updated when status -> waiting)
    const sentAt         = new Date(req.updated_at);
    const hoursSinceSent = (now.getTime() - sentAt.getTime()) / 3_600_000;
    const nudgeCount     = req.nudge_count ?? 0;

    // Only track recipients that haven't resolved
    const activeRecips = (req.request_recipients ?? []).filter(
      (r: any) => !["accepted", "replied"].includes(r.status)
    );
    if (activeRecips.length === 0) { results.skipped++; continue; }

    const dealAddress = (req as any).deals?.property_address ?? "the property";

    // ── 72h: alert TC and mark overdue ───────────────────────────────────────
    if (hoursSinceSent >= ALERT_HOURS && nudgeCount >= 2) {
      const recipList = activeRecips.map((r: any) => r.email).join(", ");
      await fetch(`${supabaseUrl}/functions/v1/alert-tc`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({
          subject: `⚠️ No response 72h+ — ${getTypeLabel(req.request_type)} · ${dealAddress}`,
          body: [
            `A request has gone unanswered for over 72 hours.`,
            ``,
            `Request: ${getTypeLabel(req.request_type)}`,
            `Property: ${dealAddress}`,
            `Recipient(s): ${recipList}`,
            `Token: ${req.subject_token ?? ""}`,
            ``,
            `Please follow up directly — this request is now marked Overdue.`,
          ].join("\n"),
        }),
      });
      await supabase.from("requests")
        .update({ status: "overdue", updated_at: now.toISOString() })
        .eq("id", req.id);
      await supabase.from("request_events").insert({
        request_id: req.id, event_type: "status_changed",
        description: "Auto-marked Overdue at 72h with no response", actor: "System",
      });
      results.alerts++;

    // ── 48h: nudge #2 ────────────────────────────────────────────────────────
    } else if (hoursSinceSent >= NUDGE_2_HOURS && nudgeCount === 1) {
      await sendNudges(supabase, supabaseUrl, serviceKey, req, activeRecips, dealAddress, 2, now);
      await supabase.from("requests")
        .update({ nudge_count: 2, last_nudged_at: now.toISOString(), updated_at: now.toISOString() })
        .eq("id", req.id);
      results.nudge2++;

    // ── 24h: nudge #1 ────────────────────────────────────────────────────────
    } else if (hoursSinceSent >= NUDGE_1_HOURS && nudgeCount === 0) {
      await sendNudges(supabase, supabaseUrl, serviceKey, req, activeRecips, dealAddress, 1, now);
      await supabase.from("requests")
        .update({ nudge_count: 1, last_nudged_at: now.toISOString(), updated_at: now.toISOString() })
        .eq("id", req.id);
      results.nudge1++;

    } else {
      results.skipped++;
    }
  }

  return new Response(JSON.stringify({ success: true, processed: waitingReqs?.length ?? 0, ...results }), {
    headers: { "Content-Type": "application/json" },
  });
});

// ── Helper: send a reminder email to each active recipient ────────────────────
async function sendNudges(
  supabase: any,
  supabaseUrl: string,
  serviceKey: string,
  req: any,
  recipients: any[],
  dealAddress: string,
  nudgeNum: number,
  now: Date,
) {
  for (const recip of recipients) {
    const subject = `[Reminder #${nudgeNum}] ${getTypeLabel(req.request_type)} — ${req.subject_token ?? ""}`;
    const lines = [
      `Hi ${recip.name ?? "there"},`,
      ``,
      `This is follow-up reminder #${nudgeNum} regarding our request for **${getTypeLabel(req.request_type)}** for ${dealAddress}.`,
      ``,
      `We haven't received a response yet. Could you please reply or provide the requested information at your earliest convenience?`,
      ``,
      `Thank you,`,
      `Transaction Coordinator`,
    ];
    const bodyHtml = lines.map(l => l.trim() ? `<p style="margin:0 0 8px 0;">${l}</p>` : "<br/>").join("");

    await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        to: [recip.email], cc: [], bcc: [],
        subject, bodyHtml,
        dealId: req.deal_id,
        emailType: "deal",
        sentBy: `System (auto-nudge #${nudgeNum})`,
        requestId: req.id,
      }),
    });

    await supabase.from("request_events").insert({
      request_id: req.id,
      event_type: "reminder_sent",
      description: `Auto-nudge #${nudgeNum} sent to ${recip.email}`,
      actor: "System",
    });
  }
}
