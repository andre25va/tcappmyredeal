// client-portal-auth Edge Function — v16
// v16: adds contactId, contactEmail, contactCompany to all response paths
// Rewritten to use direct jsr imports (no _shared dependency)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 500): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatStatus(status: string): string {
  const map: Record<string, string> = {
    contract: "Under Contract",
    under_contract: "Under Contract",
    contract_received: "Under Contract",
    active: "Under Contract",
    pending: "Pending",
    emd_due: "EMD Due",
    due_diligence: "Due Diligence",
    inspection_period: "Inspection Period",
    clear_to_close: "Clear to Close",
    ctc: "Clear to Close",
    closed: "Closed",
    terminated: "Terminated",
    cancelled: "Cancelled",
    withdrawn: "Withdrawn",
    archived: "Archived",
  };
  return map[status?.toLowerCase()] ?? status ?? "Active";
}

function formatRole(role: string): string {
  const map: Record<string, string> = {
    lead_agent: "Lead Agent",
    buyers_agent: "Buyer's Agent",
    listing_agent: "Listing Agent",
    buyer: "Buyer",
    seller: "Seller",
    title_officer: "Title Officer",
    lender: "Lender",
    inspector: "Inspector",
    attorney: "Attorney",
  };
  return map[role] ?? role ?? "";
}

function normPhone(p: string): string {
  return (p ?? "").replace(/\D/g, "").slice(-10);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { phone, pin } = await req.json();

    if (!phone || !pin) {
      return jsonResponse({ error: "Phone and PIN are required." }, 400);
    }

    const userPhone10 = normPhone(phone);
    if (userPhone10.length < 10) {
      return jsonResponse({ error: "Please enter a valid 10-digit phone number." }, 400);
    }
    if (!/^\d{4,6}$/.test(pin)) {
      return jsonResponse({ error: "Please enter your PIN." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: settingsRows } = await supabase
      .from("settings")
      .select("key, value")
      .in("key", [
        "portal_allowed_roles",
        "portal_show_status",
        "portal_show_closing_date",
        "portal_show_next_item",
        "portal_request_types",
        "portal_welcome_message",
      ]);

    const cfg: Record<string, unknown> = {};
    for (const row of settingsRows ?? []) cfg[row.key] = row.value;

    const allowedRoles = Array.isArray(cfg.portal_allowed_roles)
      ? (cfg.portal_allowed_roles as string[])
      : null;

    const showNextItem = cfg.portal_show_next_item !== false;
    const requestTypes = Array.isArray(cfg.portal_request_types)
      ? (cfg.portal_request_types as string[])
      : ["Document Request", "Milestone Status", "General Question", "Deal Sheet", "Special Task Request"];
    const welcomeMessage = typeof cfg.portal_welcome_message === "string" ? cfg.portal_welcome_message : "";

    // v16: select email, company for agent info passthrough
    const { data: contacts, error: contactErr } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, phone, email, company, contact_type")
      .eq("pin", pin)
      .is("deleted_at", null);

    if (contactErr) {
      console.error("Contact lookup error:", contactErr);
      return errorResponse("Lookup failed. Please try again.", 500);
    }

    const contact = (contacts ?? []).find((c: any) => normPhone(c.phone ?? "") === userPhone10);

    if (!contact) {
      return jsonResponse({ error: "No account found for this phone number and PIN." }, 404);
    }

    const contactName = `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim();
    const isAgent = contact.contact_type === "agent";

    let dpQuery = supabase.from("deal_participants").select("deal_id, deal_role").eq("contact_id", contact.id);
    if (allowedRoles && allowedRoles.length > 0) dpQuery = dpQuery.in("deal_role", allowedRoles);

    const { data: participations, error: dpErr } = await dpQuery;
    if (dpErr) {
      console.error("Participants lookup error:", dpErr);
      return errorResponse("Lookup failed. Please try again.", 500);
    }

    // Always return contactType + agent info even with no deals
    if (!participations || participations.length === 0) {
      return jsonResponse({
        contactName,
        contactId: contact.id,
        contactEmail: contact.email ?? null,
        contactCompany: contact.company ?? null,
        contactType: isAgent ? "agent" : "client",
        deals: [],
        welcomeMessage,
        requestTypes,
        stats: isAgent ? { activeDealCount: 0, pipelineVolume: 0, closedDealCount: 0, closedVolume: 0 } : undefined,
      });
    }

    const dealIds = [...new Set(participations.map((p: any) => p.deal_id))];

    let dealsQuery = supabase
      .from("deals")
      .select(`
        id, property_address, city, state, status, closing_date, deal_ref,
        purchase_price, earnest_money, loan_type, loan_amount, down_payment, seller_concessions,
        property_type, mls_number, contract_date, earnest_money_due_date, possession_date, deal_data
      `)
      .in("id", dealIds);

    if (!isAgent) {
      dealsQuery = dealsQuery.not("status", "in", "(closed,terminated,cancelled,withdrawn,archived)");
    }

    const { data: deals, error: dealsErr } = await dealsQuery;

    if (dealsErr) {
      console.error("Deals lookup error:", dealsErr);
      return errorResponse("Lookup failed. Please try again.", 500);
    }

    if (!deals || deals.length === 0) {
      return jsonResponse({
        contactName,
        contactId: contact.id,
        contactEmail: contact.email ?? null,
        contactCompany: contact.company ?? null,
        contactType: isAgent ? "agent" : "client",
        deals: [],
        welcomeMessage,
        requestTypes,
        stats: isAgent ? { activeDealCount: 0, pipelineVolume: 0, closedDealCount: 0, closedVolume: 0 } : undefined,
      });
    }

    const CLOSED_STATUSES = ["closed", "terminated", "cancelled", "withdrawn", "archived"];
    const yearStart = `${new Date().getFullYear()}-01-01`;

    const activeDeals = deals.filter((d: any) => !CLOSED_STATUSES.includes(d.status ?? ""));
    const closedThisYear = deals.filter(
      (d: any) => d.status === "closed" && d.closing_date && d.closing_date >= yearStart
    );

    const stats = {
      activeDealCount: activeDeals.length,
      pipelineVolume: activeDeals.reduce((sum: number, d: any) => sum + (Number(d.purchase_price) || 0), 0),
      closedDealCount: closedThisYear.length,
      closedVolume: closedThisYear.reduce((sum: number, d: any) => sum + (Number(d.purchase_price) || 0), 0),
    };

    const dealsToShow = isAgent ? deals : activeDeals;
    const dealIdsToShow = dealsToShow.map((d: any) => d.id);

    const { data: allTimelines } = await supabase
      .from("deal_timeline")
      .select("deal_id, milestone, label, status, due_date, sort_order")
      .in("deal_id", dealIdsToShow)
      .order("sort_order", { ascending: true });

    const timelinesMap: Record<string, any[]> = {};
    for (const row of allTimelines ?? []) {
      if (!timelinesMap[row.deal_id]) timelinesMap[row.deal_id] = [];
      timelinesMap[row.deal_id].push({
        milestone: row.milestone,
        label: row.label,
        status: row.status,
        due_date: row.due_date ?? null,
        sort_order: row.sort_order,
      });
    }

    const { data: allParticipants } = await supabase
      .from("deal_participants")
      .select("deal_id, deal_role, is_client_side, is_primary, contacts(first_name, last_name, phone, email, company)")
      .in("deal_id", dealIdsToShow);

    const { data: allTasks } = await supabase.from("tasks").select("deal_id, status").in("deal_id", dealIdsToShow);

    const taskCountsMap: Record<string, { completed: number; total: number }> = {};
    for (const task of allTasks ?? []) {
      if (!taskCountsMap[task.deal_id]) taskCountsMap[task.deal_id] = { completed: 0, total: 0 };
      taskCountsMap[task.deal_id].total++;
      if (task.status === "completed") taskCountsMap[task.deal_id].completed++;
    }

    const tasksMap: Record<string, { title: string; dueDate: string | null }> = {};
    if (showNextItem) {
      const { data: tasks } = await supabase
        .from("tasks")
        .select("deal_id, title, due_date")
        .in("deal_id", dealIdsToShow)
        .not("status", "in", "(completed,cancelled)")
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      for (const task of tasks ?? []) {
        if (!tasksMap[task.deal_id]) tasksMap[task.deal_id] = { title: task.title, dueDate: task.due_date ?? null };
      }
    }

    const { data: allComplianceChecks } = await supabase
      .from("compliance_checks")
      .select("deal_id, passed_count, warning_count, violation_count, run_at")
      .in("deal_id", dealIdsToShow)
      .order("run_at", { ascending: false });

    const complianceMap: Record<string, any> = {};
    for (const cc of allComplianceChecks ?? []) {
      if (!complianceMap[cc.deal_id]) {
        complianceMap[cc.deal_id] = {
          passed: cc.passed_count ?? 0,
          warnings: cc.warning_count ?? 0,
          violations: cc.violation_count ?? 0,
          lastCheckedAt: cc.run_at,
        };
      }
    }

    const { data: allContracts } = await supabase
      .from("contract_submissions")
      .select("deal_id, status, submitted_data, pdf_url, sent_at, signed_at, updated_at")
      .in("deal_id", dealIdsToShow)
      .order("updated_at", { ascending: false });

    const contractsMap: Record<string, any> = {};
    for (const row of allContracts ?? []) {
      if (!contractsMap[row.deal_id]) {
        contractsMap[row.deal_id] = {
          status: row.status ?? "draft",
          contract_uid: (row.submitted_data as any)?.contract_uid ?? null,
          pdf_url: row.pdf_url ?? null,
          sent_at: row.sent_at ?? null,
          signed_at: row.signed_at ?? null,
        };
      }
    }

    const clientDeals = dealsToShow.map((d: any) => {
      const dd = (d.deal_data ?? {}) as Record<string, any>;

      const earnestMoneyDueDate = dd.earnestMoneyDueDate ?? dd.earnest_money_due_date ?? d.earnest_money_due_date ?? null;
      const inspectionDate = dd.inspectionDate ?? dd.inspection_date ?? null;
      const financeDeadline = dd.financeDeadline ?? dd.finance_deadline ?? null;
      const milestone = dd.milestone ?? null;

      const participantsForDeal = (allParticipants ?? [])
        .filter((p: any) => p.deal_id === d.id)
        .map((p: any) => {
          const c = p.contacts ?? {};
          const fullName = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company || "";
          return {
            name: fullName,
            role: formatRole(p.deal_role ?? ""),
            phone: c.phone ?? null,
            email: c.email ?? null,
            is_client_side: p.is_client_side === true,
            _isClientLeadAgent: p.deal_role === "lead_agent" && p.is_client_side === true,
          };
        })
        .sort((a: any, b: any) => {
          if (a._isClientLeadAgent && !b._isClientLeadAgent) return -1;
          if (!a._isClientLeadAgent && b._isClientLeadAgent) return 1;
          return 0;
        })
        .map(({ _isClientLeadAgent: _, ...p }: any) => p);

      const taskCounts = taskCountsMap[d.id] ?? { completed: 0, total: 0 };

      return {
        id: d.id,
        address: [d.property_address, d.city, d.state].filter(Boolean).join(", "),
        city: d.city ?? "",
        state: d.state ?? "",
        closingDate: d.closing_date ?? null,
        status: formatStatus(milestone ?? d.status),
        dealRef: d.deal_ref ?? null,
        nextItem: showNextItem ? (tasksMap[d.id] ?? null) : null,
        purchasePrice: d.purchase_price ?? null,
        earnestMoney: d.earnest_money ?? null,
        loanType: d.loan_type ?? null,
        loanAmount: d.loan_amount ?? null,
        downPaymentPct: d.down_payment ?? null,
        sellerConcessions: d.seller_concessions ?? null,
        propertyType: d.property_type ?? null,
        mlsNumber: d.mls_number ?? null,
        contractDate: d.contract_date ?? null,
        earnestMoneyDueDate,
        inspectionDate,
        financeDeadline,
        possessionDate: d.possession_date ?? null,
        milestone,
        participants: participantsForDeal,
        milestones: timelinesMap[d.id] ?? [],
        tasksCompleted: taskCounts.completed,
        tasksTotal: taskCounts.total,
        latestContract: contractsMap[d.id] ?? null,
        complianceSummary: complianceMap[d.id] ?? null,
      };
    });

    return jsonResponse({
      contactName,
      contactId: contact.id,
      contactEmail: contact.email ?? null,
      contactCompany: contact.company ?? null,
      contactType: isAgent ? "agent" : "client",
      deals: clientDeals,
      welcomeMessage,
      requestTypes,
      stats: isAgent ? stats : undefined,
      portalSettings: {
        showStatus: cfg.portal_show_status !== false,
        showClosingDate: cfg.portal_show_closing_date !== false,
        showNextItem,
      },
    });
  } catch (err: any) {
    console.error("client-portal-auth error:", err);
    return errorResponse("An error occurred. Please try again.", 500);
  }
});
