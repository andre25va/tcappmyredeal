import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Field presence helper ─────────────────────────────────────────────────────
function isDealFieldPresent(deal: Record<string, any>, fieldKey: string): boolean {
  if (fieldKey in deal) {
    const val = deal[fieldKey];
    if (val === null || val === undefined || val === "" || val === 0) return false;
    return true;
  }
  const dd = deal.deal_data || {};
  if (fieldKey in dd) {
    const val = dd[fieldKey];
    if (val === null || val === undefined || val === "" || val === 0) return false;
    return true;
  }
  return false;
}

function isExtractedFieldPresent(extractedFields: Record<string, any> | null, fieldKey: string): boolean {
  if (!extractedFields) return false;
  if (fieldKey in extractedFields) {
    const val = extractedFields[fieldKey];
    if (val === null || val === undefined || val === "" || val === "null") return false;
    return true;
  }
  return false;
}

function safeDate(val: any): Date | null {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function evaluateRule(
  rule: Record<string, any>,
  deal: Record<string, any>,
  extractedFields: Record<string, any> | null,
  latestSigCheck: Record<string, any> | null
): { status: "pass" | "warning" | "fail"; detail: string } {
  const cfg = rule.config || {};
  const checkType: string = rule.check_type;
  const severity: string = rule.severity;

  if (checkType === "field_present") {
    const field: string = cfg.field || "";
    const present = isDealFieldPresent(deal, field) || isExtractedFieldPresent(extractedFields, field);
    if (present) return { status: "pass", detail: `${field} is present` };
    if (severity === "error") return { status: "fail", detail: `${field} is missing — required field` };
    return { status: "warning", detail: `${field} is missing` };
  }

  if (checkType === "field_value") {
    const field: string = cfg.field || "";
    const expected = cfg.expected_value;
    const actual = deal[field] ?? (deal.deal_data || {})[field] ?? (extractedFields || {})[field];
    if (actual === null || actual === undefined) {
      if (severity === "error") return { status: "fail", detail: `${field} is missing` };
      return { status: "warning", detail: `${field} is missing` };
    }
    const matches = String(actual).toLowerCase() === String(expected).toLowerCase();
    if (matches) return { status: "pass", detail: `${field} matches expected value` };
    if (severity === "error") return { status: "fail", detail: `${field} = "${actual}", expected "${expected}"` };
    return { status: "warning", detail: `${field} = "${actual}", expected "${expected}"` };
  }

  if (checkType === "signature_present") {
    if (!latestSigCheck || !latestSigCheck.results) {
      return { status: "warning", detail: "Signature check not run yet — upload contract and run signature check" };
    }
    const sigResults = latestSigCheck.results;
    const party: string = (cfg.party || "").toLowerCase();
    const sigType: string = (cfg.type || "signature").toLowerCase();
    const targetPage: number | null = cfg.page ? Number(cfg.page) : null;
    const fields: any[] = sigResults.fields || sigResults.results || [];
    let relevantFields = fields.filter((f: any) => {
      const fParty = (f.party || "").toLowerCase();
      if (party && !fParty.includes(party)) return false;
      if (sigType === "initial" && !f.is_initial) return false;
      if (sigType === "signature" && (f.is_initial || !f.is_signature)) return false;
      if (targetPage !== null && f.page_num !== targetPage) return false;
      return true;
    });
    if (relevantFields.length === 0) {
      return { status: "warning", detail: `No ${sigType} fields found for ${party} — may need signature check rerun` };
    }
    const unsigned = relevantFields.filter((f: any) => !f.signed && f.signed !== undefined);
    if (unsigned.length === 0) {
      return { status: "pass", detail: `All ${party} ${sigType}s present (${relevantFields.length} field${relevantFields.length > 1 ? "s" : ""})` };
    }
    const pct = Math.round(((relevantFields.length - unsigned.length) / relevantFields.length) * 100);
    if (severity === "error") {
      return { status: "fail", detail: `${unsigned.length} ${party} ${sigType}${unsigned.length > 1 ? "s" : ""} missing (${pct}% complete)` };
    }
    return { status: "warning", detail: `${unsigned.length} ${party} ${sigType}${unsigned.length > 1 ? "s" : ""} missing` };
  }

  if (checkType === "addendum_required") {
    return { status: "warning", detail: "Addendum check requires document review — verify manually" };
  }

  if (checkType === "custom") {
    const customRule: string = cfg.rule || "";
    const field: string = cfg.field || "";
    if (customRule === "after_contract_date") {
      const closingD = safeDate(deal.closing_date);
      const contractD = safeDate(deal.contract_date);
      if (!closingD) return { status: "warning", detail: "closing_date not set — cannot validate" };
      if (!contractD) return { status: "warning", detail: "contract_date not set — cannot validate closing date order" };
      if (closingD > contractD) return { status: "pass", detail: `Closing (${deal.closing_date}) is after contract date (${deal.contract_date})` };
      return { status: severity === "error" ? "fail" : "warning", detail: "Closing date is NOT after contract date" };
    }
    if (customRule === "before_closing") {
      const closingD = safeDate(deal.closing_date);
      const inspectionEnd = safeDate(deal[field] ?? (deal.deal_data || {})[field]);
      if (!closingD) return { status: "warning", detail: "closing_date not set" };
      if (!inspectionEnd) return { status: "warning", detail: `${field} not set — cannot validate inspection period` };
      if (inspectionEnd < closingD) return { status: "pass", detail: "Inspection end is before closing" };
      return { status: "warning", detail: "Inspection end is after or same as closing date" };
    }
    return { status: "warning", detail: `Custom rule "${customRule}" — manual review required` };
  }

  return { status: "warning", detail: `Unknown check type "${checkType}" — manual review` };
}

function inferFormType(deal: Record<string, any>): string {
  const dd = deal.deal_data || {};
  if (dd.form_type) return dd.form_type;
  return "residential-sale-contract";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Auth: validate user JWT ──────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();

    if (!token) {
      console.error("[run-compliance] No auth token provided");
      return new Response(JSON.stringify({ error: "Unauthorized — no token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !user) {
      console.error("[run-compliance] auth.getUser failed:", userErr?.message);
      // Fallback: decode user ID from JWT payload
      let userId: string | null = null;
      try {
        const parts = token.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
          userId = payload.sub || null;
        }
      } catch {
        // ignore
      }
      if (!userId) {
        return new Response(JSON.stringify({ error: "Unauthorized", detail: userErr?.message }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log("[run-compliance] Using userId from JWT payload fallback:", userId);
      return await runCompliance(req, supabase, userId);
    }

    return await runCompliance(req, supabase, user.id);
  } catch (err: any) {
    console.error("[run-compliance] Uncaught error:", err.message, err.stack);
    return new Response(JSON.stringify({ error: err.message || "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function runCompliance(req: Request, supabase: any, userId: string): Promise<Response> {
  let body: any = {};
  try { body = await req.json(); } catch {}

  const deal_id: string = body.deal_id;

  if (!deal_id) {
    return new Response(JSON.stringify({ error: "deal_id required" }), {
      status: 400,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
    });
  }

  const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

  console.log("[run-compliance] Running for deal:", deal_id, "user:", userId);

  // ── Fetch deal ────────────────────────────────────────────────────────────
  const { data: deal, error: dealErr } = await supabase
    .from("deals")
    .select("id, state, contract_date, closing_date, purchase_price, property_address, earnest_money, inspection_waived, transaction_type, deal_data, org_id")
    .eq("id", deal_id)
    .single();

  if (dealErr || !deal) {
    console.error("[run-compliance] Deal not found:", dealErr?.message);
    return new Response(JSON.stringify({ error: "Deal not found", detail: dealErr?.message }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const dealState = (deal.state || "").toUpperCase();
  const formType = inferFormType(deal);
  console.log("[run-compliance] dealState:", dealState, "formType:", formType);

  // ── Fetch latest extraction (optional) ────────────────────────────────────
  let extractedFields: Record<string, any> | null = null;
  let usedExtractionId: string | null = null;

  const { data: extractionRows } = await supabase
    .from("extraction_results")
    .select("id, extracted_fields, form_type, extraction_mode")
    .eq("deal_id", deal_id)
    .order("extracted_at", { ascending: false })
    .limit(1);

  if (extractionRows && extractionRows.length > 0) {
    extractedFields = extractionRows[0].extracted_fields || null;
    usedExtractionId = extractionRows[0].id;
  }

  // ── Fetch latest signature check (optional — safe JSONB filter) ───────────
  const { data: sigChecks, error: sigErr } = await supabase
    .from("compliance_checks")
    .select("results, run_at")
    .eq("deal_id", deal_id)
    .not("results", "is", null)
    .order("run_at", { ascending: false })
    .limit(5);

  if (sigErr) console.warn("[run-compliance] sigChecks query warning:", sigErr.message);

  // Find a check that has a 'fields' key in results (signature check)
  const latestSigCheck = (sigChecks || []).find((c: any) => c.results?.fields) ?? null;

  // ── Fetch compliance rules ─────────────────────────────────────────────────
  let rulesQuery = supabase
    .from("compliance_rules")
    .select("id, rule_code, rule_name, description, severity, check_type, config, form_type")
    .eq("is_active", true)
    .order("severity", { ascending: true });

  if (dealState) {
    rulesQuery = rulesQuery.or(`state.eq.${dealState},state.is.null`);
  }

  const { data: rules, error: rulesErr } = await rulesQuery;

  if (rulesErr) {
    console.error("[run-compliance] Rules fetch error:", rulesErr.message);
    return new Response(JSON.stringify({ error: "Failed to fetch compliance rules", detail: rulesErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log("[run-compliance] Rules fetched:", (rules || []).length);

  // ── Dedupe rules (prefer state-specific over generic) ─────────────────────
  const ruleMap = new Map<string, any>();
  for (const rule of (rules || [])) {
    const key = rule.rule_code;
    if (!ruleMap.has(key) || (rule.form_type === formType && ruleMap.get(key).form_type !== formType)) {
      ruleMap.set(key, rule);
    }
  }
  const dedupedRules = Array.from(ruleMap.values());

  // ── Evaluate rules ─────────────────────────────────────────────────────────
  const ruleResults: any[] = [];
  let passedCount = 0;
  let warningCount = 0;
  let violationCount = 0;

  for (const rule of dedupedRules) {
    const { status, detail } = evaluateRule(rule, deal, extractedFields, latestSigCheck);
    ruleResults.push({
      rule_id: rule.id,
      rule_code: rule.rule_code,
      rule_name: rule.rule_name,
      description: rule.description,
      severity: rule.severity,
      check_type: rule.check_type,
      status,
      detail,
    });
    if (status === "pass") passedCount++;
    else if (status === "warning") warningCount++;
    else violationCount++;
  }

  console.log("[run-compliance] Results: pass=", passedCount, "warn=", warningCount, "fail=", violationCount);

  // ── Save compliance check ──────────────────────────────────────────────────
  const { data: saved, error: saveErr } = await supabase
    .from("compliance_checks")
    .insert({
      deal_id,
      extraction_id: usedExtractionId,
      run_by: userId,
      run_at: new Date().toISOString(),
      state: dealState || null,
      form_type: formType,
      total_rules_checked: dedupedRules.length,
      passed_count: passedCount,
      warning_count: warningCount,
      violation_count: violationCount,
      results: { rules: ruleResults, has_extraction: !!extractedFields, has_signature_check: !!latestSigCheck },
    })
    .select()
    .single();

  if (saveErr) {
    console.error("[run-compliance] Save error:", saveErr.message, saveErr.details, saveErr.hint);
    return new Response(JSON.stringify({ error: "Failed to save compliance check", detail: saveErr.message, hint: saveErr.hint }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log("[run-compliance] Saved check id:", saved?.id);

  return new Response(JSON.stringify({ success: true, check: saved }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
