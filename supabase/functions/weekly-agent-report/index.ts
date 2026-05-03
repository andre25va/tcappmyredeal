import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendViaGmail } from "./_shared/gmail.ts";

// v2: Fixed status value — app writes 'completed' not 'complete'
// Milestones completed query and upcoming closings query both updated

const TC_EMAIL = "tc@myredeal.com";

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function weekLabel(): string {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 6);
  return `${fmtDate(start.toISOString())} – ${fmtDate(now.toISOString())}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoISO = sevenDaysAgo.toISOString();

    const sevenDaysAhead = new Date();
    sevenDaysAhead.setDate(sevenDaysAhead.getDate() + 7);
    const sevenDaysAheadISO = sevenDaysAhead.toISOString();
    const todayISO = new Date().toISOString();

    // 1. New deals this week
    const { data: newDeals } = await supabase
      .from("deals")
      .select("id, property_address, pipeline_stage, created_at")
      .gte("created_at", sevenDaysAgoISO)
      .is("archived_at", null)
      .order("created_at", { ascending: false });

    // 2. Total active deals + pipeline breakdown
    const { data: activeDeals } = await supabase
      .from("deals")
      .select("id, pipeline_stage")
      .is("archived_at", null);

    const pipelineMap: Record<string, number> = {};
    for (const d of (activeDeals || [])) {
      const s = d.pipeline_stage || "Unknown";
      pipelineMap[s] = (pipelineMap[s] || 0) + 1;
    }

    // 3. Milestones completed this week (fixed: 'completed' not 'complete')
    const { data: completedMilestones } = await supabase
      .from("deal_timeline")
      .select("id, label, due_date, updated_at, deal_id, deals(property_address)")
      .eq("status", "completed")
      .gte("updated_at", sevenDaysAgoISO)
      .order("updated_at", { ascending: false });

    // 4. Compliance checks this week
    const { data: compChecks } = await supabase
      .from("compliance_checks")
      .select("id, status, created_at")
      .gte("created_at", sevenDaysAgoISO);

    const compPass = (compChecks || []).filter(c => c.status === "pass").length;
    const compFail = (compChecks || []).filter(c => c.status === "fail").length;
    const compTotal = (compChecks || []).length;

    // 5. NW1 escalations created this week
    const { data: escalations } = await supabase
      .from("tasks")
      .select("id, title, created_at, deal_id, deals(property_address)")
      .ilike("title", "⚠️ Overdue:%")
      .gte("created_at", sevenDaysAgoISO)
      .order("created_at", { ascending: false });

    // 6. Extraction corrections this week
    const { data: corrections } = await supabase
      .from("extraction_corrections")
      .select("id, field_name, created_at")
      .gte("created_at", sevenDaysAgoISO);

    // Group corrections by field
    const correctionsByField: Record<string, number> = {};
    for (const c of (corrections || [])) {
      correctionsByField[c.field_name] = (correctionsByField[c.field_name] || 0) + 1;
    }
    const topCorrectedFields = Object.entries(correctionsByField)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // 7. Requests this week
    const { data: requestsThisWeek } = await supabase
      .from("requests")
      .select("id, status, created_at")
      .gte("created_at", sevenDaysAgoISO);

    const reqSent = (requestsThisWeek || []).length;
    const reqReceived = (requestsThisWeek || []).filter(r => r.status === "received").length;
    const reqOverdue = (requestsThisWeek || []).filter(r => r.status === "overdue").length;

    // 8. Upcoming closings in next 7 days (fixed: 'completed' not 'complete')
    const { data: upcomingClosings } = await supabase
      .from("deal_timeline")
      .select("id, label, due_date, deal_id, deals(property_address, pipeline_stage)")
      .ilike("label", "%clos%")
      .neq("status", "completed")
      .gte("due_date", todayISO)
      .lte("due_date", sevenDaysAheadISO)
      .order("due_date", { ascending: true });

    // 9. Field history changes this week (manual TC edits)
    const { data: fieldChanges } = await supabase
      .from("deal_field_history")
      .select("id, field_name, changed_at, source")
      .gte("changed_at", sevenDaysAgoISO);

    const totalFieldChanges = (fieldChanges || []).length;
    const amendmentChanges = (fieldChanges || []).filter(f => f.source?.startsWith("amendment")).length;

    // ── Build HTML ────────────────────────────────────────────────────────────
    const totalActive = (activeDeals || []).length;
    const newDealsCount = (newDeals || []).length;
    const milestonesCompleted = (completedMilestones || []).length;
    const escalationsCount = (escalations || []).length;
    const correctionsCount = (corrections || []).length;

    const pipelineRows = Object.entries(pipelineMap)
      .sort((a, b) => b[1] - a[1])
      .map(([stage, count]) => `
        <tr>
          <td style="padding:6px 12px;color:#374151;">${stage}</td>
          <td style="padding:6px 12px;text-align:right;font-weight:600;color:#111827;">${count}</td>
        </tr>`).join("");

    const newDealRows = (newDeals || []).slice(0, 5).map(d => `
      <tr>
        <td style="padding:5px 12px;color:#374151;">${d.property_address || "—"}</td>
        <td style="padding:5px 12px;color:#6B7280;">${d.pipeline_stage || "—"}</td>
        <td style="padding:5px 12px;color:#6B7280;">${fmtDate(d.created_at)}</td>
      </tr>`).join("");

    const milestoneRows = (completedMilestones || []).slice(0, 8).map((m: any) => `
      <tr>
        <td style="padding:5px 12px;color:#374151;">${m.deals?.property_address || "—"}</td>
        <td style="padding:5px 12px;color:#374151;">${m.label}</td>
        <td style="padding:5px 12px;color:#6B7280;">${fmtDate(m.updated_at)}</td>
      </tr>`).join("");

    const escalationRows = (escalations || []).slice(0, 5).map((e: any) => `
      <tr>
        <td style="padding:5px 12px;color:#374151;">${(e.deals as any)?.property_address || "—"}</td>
        <td style="padding:5px 12px;color:#DC2626;">${e.title}</td>
        <td style="padding:5px 12px;color:#6B7280;">${fmtDate(e.created_at)}</td>
      </tr>`).join("");

    const closingRows = (upcomingClosings || []).map((c: any) => `
      <tr>
        <td style="padding:6px 12px;color:#374151;">${(c.deals as any)?.property_address || "—"}</td>
        <td style="padding:6px 12px;color:#374151;">${c.label}</td>
        <td style="padding:6px 12px;font-weight:600;color:#059669;">${fmtDate(c.due_date)}</td>
      </tr>`).join("");

    const correctionFieldRows = topCorrectedFields.map(([field, count]) => `
      <tr>
        <td style="padding:5px 12px;color:#374151;">${field}</td>
        <td style="padding:5px 12px;text-align:right;font-weight:600;color:#D97706;">${count}x</td>
      </tr>`).join("");

    const statCard = (emoji: string, label: string, value: string | number, color = "#111827") =>
      `<td style="width:25%;padding:0 8px;">
        <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:24px;margin-bottom:4px;">${emoji}</div>
          <div style="font-size:28px;font-weight:700;color:${color};">${value}</div>
          <div style="font-size:12px;color:#6B7280;margin-top:2px;">${label}</div>
        </div>
      </td>`;

    const sectionHeader = (title: string) =>
      `<h3 style="margin:28px 0 10px;font-size:15px;font-weight:600;color:#111827;border-bottom:2px solid #E5E7EB;padding-bottom:8px;">${title}</h3>`;

    const table = (headers: string[], rows: string) =>
      `<table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#F3F4F6;">
            ${headers.map(h => `<th style="padding:8px 12px;text-align:left;font-weight:600;color:#374151;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">${h}</th>`).join("")}
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="${headers.length}" style="padding:12px;color:#9CA3AF;text-align:center;font-style:italic;">None this week</td></tr>`}</tbody>
      </table>`;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:640px;margin:32px auto;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1D4ED8 0%,#4F46E5 100%);padding:28px 32px;">
      <div style="color:rgba(255,255,255,0.75);font-size:12px;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">Weekly Agent Report</div>
      <h1 style="margin:0;color:#FFFFFF;font-size:22px;font-weight:700;">TC Command Center 🤖</h1>
      <div style="color:rgba(255,255,255,0.8);font-size:13px;margin-top:6px;">${weekLabel()}</div>
    </div>

    <div style="padding:24px 32px;">

      <!-- Top Stats -->
      <table style="width:100%;border-collapse:separate;border-spacing:0;">
        <tr>
          ${statCard("🏠", "Active Deals", totalActive)}
          ${statCard("✅", "Milestones Done", milestonesCompleted, "#059669")}
          ${statCard("⚠️", "Escalations", escalationsCount, escalationsCount > 0 ? "#DC2626" : "#111827")}
          ${statCard("✏️", "AI Corrections", correctionsCount, correctionsCount > 0 ? "#D97706" : "#111827")}
        </tr>
      </table>

      <!-- New Deals -->
      ${newDealsCount > 0 ? `
      ${sectionHeader(`🆕 New Deals This Week (${newDealsCount})`)}
      ${table(["Property", "Stage", "Created"], newDealRows)}
      ` : ""}

      <!-- Pipeline Snapshot -->
      ${sectionHeader("📊 Active Pipeline Snapshot")}
      ${table(["Stage", "Count"], pipelineRows)}

      <!-- Upcoming Closings -->
      ${sectionHeader("📅 Closings in Next 7 Days")}
      ${table(["Property", "Milestone", "Date"], closingRows)}

      <!-- Milestones Completed -->
      ${milestonesCompleted > 0 ? `
      ${sectionHeader(`✅ Milestones Completed (${milestonesCompleted})`)}
      ${table(["Property", "Milestone", "Completed"], milestoneRows)}
      ` : ""}

      <!-- Compliance -->
      ${sectionHeader("🛡️ Compliance Activity")}
      <div style="display:flex;gap:12px;margin-bottom:4px;">
        <div style="flex:1;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:14px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:#059669;">${compPass}</div>
          <div style="font-size:12px;color:#065F46;margin-top:2px;">Passed</div>
        </div>
        <div style="flex:1;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:14px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:#DC2626;">${compFail}</div>
          <div style="font-size:12px;color:#991B1B;margin-top:2px;">Failed</div>
        </div>
        <div style="flex:1;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:14px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:#374151;">${compTotal}</div>
          <div style="font-size:12px;color:#6B7280;margin-top:2px;">Total Checks</div>
        </div>
      </div>

      <!-- Requests -->
      ${sectionHeader("📋 Requests")}
      <div style="display:flex;gap:12px;margin-bottom:4px;">
        <div style="flex:1;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:14px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:#1D4ED8;">${reqSent}</div>
          <div style="font-size:12px;color:#1E40AF;margin-top:2px;">Sent</div>
        </div>
        <div style="flex:1;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:14px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:#059669;">${reqReceived}</div>
          <div style="font-size:12px;color:#065F46;margin-top:2px;">Received</div>
        </div>
        <div style="flex:1;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:14px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:#DC2626;">${reqOverdue}</div>
          <div style="font-size:12px;color:#991B1B;margin-top:2px;">Overdue</div>
        </div>
      </div>

      <!-- NW1 Escalations -->
      ${escalationsCount > 0 ? `
      ${sectionHeader(`⚠️ Milestone Escalations Triggered (${escalationsCount})`)}
      ${table(["Property", "Task", "Created"], escalationRows)}
      ` : ""}

      <!-- AI Accuracy -->
      ${sectionHeader("🤖 AI Extraction Accuracy")}
      <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:16px;margin-bottom:4px;">
        <div style="font-size:13px;color:#374151;margin-bottom:10px;">
          <strong>${correctionsCount}</strong> extraction field${correctionsCount !== 1 ? "s" : ""} corrected by TC this week.
          ${totalFieldChanges > 0 ? ` <strong>${totalFieldChanges}</strong> total deal field change${totalFieldChanges !== 1 ? "s" : ""} logged${amendmentChanges > 0 ? ` (${amendmentChanges} from amendments)` : ""}.` : ""}
        </div>
        ${topCorrectedFields.length > 0 ? `
        <div style="font-size:12px;color:#6B7280;margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Most-Corrected Fields</div>
        ${table(["Field", "Corrections"], correctionFieldRows)}
        ` : `<div style="font-size:13px;color:#059669;">✅ No corrections needed — AI nailed it this week!</div>`}
      </div>

    </div>

    <!-- Footer -->
    <div style="background:#F9FAFB;padding:16px 32px;text-align:center;border-top:1px solid #E5E7EB;">
      <p style="margin:0;font-size:12px;color:#9CA3AF;">TC Command Center · Weekly Agent Report · Automated by Tasklet</p>
    </div>
  </div>
</body>
</html>`;

    const week = weekLabel();
    const result = await sendViaGmail({
      to: [TC_EMAIL],
      subject: `📊 Weekly Agent Report — ${week}`,
      bodyHtml: html,
    });

    if (!result.success) {
      console.error("Gmail error:", result.error);
      return new Response(JSON.stringify({ error: result.error }), { status: 500 });
    }

    return new Response(
      JSON.stringify({
        success: true,
        week,
        stats: {
          active_deals: totalActive,
          new_deals: newDealsCount,
          milestones_completed: milestonesCompleted,
          compliance_checks: compTotal,
          escalations: escalationsCount,
          corrections: correctionsCount,
          requests_sent: reqSent,
          upcoming_closings: (upcomingClosings || []).length,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("weekly-agent-report error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
