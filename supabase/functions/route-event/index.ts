import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// OpenAI Assistant IDs (created 2026-04-26)
const ASSISTANTS = {
  doc_agent:        "asst_GnpUtUpJe6uVqbMiksFyJ6fS",
  compliance_agent: "asst_V6U770UTnbdMQjaCHCRc5xEH",
  email_classifier: "asst_TBQjZvZH9LptlFl7UVOBReV4",
  followup_agent:   "asst_ZEyiD6HTB5mxs3GemA8UnvnW",
} as const;

// Event type → assistant mapping
const EVENT_ROUTE: Record<string, keyof typeof ASSISTANTS> = {
  doc_uploaded:          "doc_agent",
  compliance_requested:  "compliance_agent",
  email_received:        "email_classifier",
  followup_needed:       "followup_agent",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Read OpenAI key from Supabase Vault (or env var)
async function getOpenAIKey(supabase: ReturnType<typeof createClient>): Promise<string> {
  const envKey = Deno.env.get("OPENAI_API_KEY");
  if (envKey) return envKey;

  const { data, error } = await supabase
    .schema("vault")
    .from("decrypted_secrets")
    .select("decrypted_secret")
    .eq("name", "OPENAI_API_KEY")
    .single();

  if (error || !data?.decrypted_secret) {
    throw new Error("OPENAI_API_KEY not found in env or Vault");
  }
  return data.decrypted_secret;
}

async function callAssistant(assistantId: string, userMessage: string, openAIKey: string): Promise<string> {
  const headers = {
    "Authorization": `Bearer ${openAIKey}`,
    "Content-Type":  "application/json",
    "OpenAI-Beta":   "assistants=v2",
  };

  // 1. Create thread
  const threadRes = await fetch("https://api.openai.com/v1/threads", {
    method: "POST", headers, body: JSON.stringify({}),
  });
  const thread = await threadRes.json();
  const threadId = thread.id;

  // 2. Add message
  await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
    method: "POST", headers,
    body: JSON.stringify({ role: "user", content: userMessage }),
  });

  // 3. Run assistant
  const runRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
    method: "POST", headers,
    body: JSON.stringify({ assistant_id: assistantId }),
  });
  const run = await runRes.json();
  const runId = run.id;

  // 4. Poll until complete (max 30s)
  let status = run.status;
  let attempts = 0;
  while (status !== "completed" && status !== "failed" && status !== "cancelled" && attempts < 30) {
    await new Promise(r => setTimeout(r, 1000));
    const pollRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, { headers });
    const pollData = await pollRes.json();
    status = pollData.status;
    attempts++;
  }

  if (status !== "completed") throw new Error(`Assistant run ended with status: ${status}`);

  // 5. Get response
  const msgRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages?order=desc&limit=1`, { headers });
  const msgData = await msgRes.json();
  const content = msgData.data?.[0]?.content?.[0];
  if (content?.type === "text") return content.text.value;
  throw new Error("No text response from assistant");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  let eventId: string | undefined;

  try {
    const body = await req.json();

    // ── ACTION: list_pending ────────────────────────────────────────
    // Called by n8n every 5 min to get pending events without needing service key
    if (body.action === "list_pending") {
      const { data: events, error } = await supabase
        .from("events")
        .select("id, type, deal_id, source, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(20);

      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ events: events || [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── ACTION: route event ─────────────────────────────────────────
    eventId = body.event_id;
    if (!eventId) {
      return new Response(JSON.stringify({ error: "event_id or action required" }), { status: 400 });
    }

    const openAIKey = await getOpenAIKey(supabase);

    // 1. Fetch the event
    const { data: event, error: fetchErr } = await supabase
      .from("events").select("*").eq("id", eventId).single();

    if (fetchErr || !event) {
      return new Response(JSON.stringify({ error: "Event not found", detail: fetchErr?.message }), { status: 404 });
    }

    if (event.status === "processed") {
      return new Response(JSON.stringify({ ok: true, message: "Already processed" }), { status: 200 });
    }

    // 2. Mark as processing
    await supabase.from("events").update({ status: "processing" }).eq("id", eventId);

    // 3. Route to assistant
    const agentRole = EVENT_ROUTE[event.type];
    if (!agentRole) {
      await supabase.from("events").update({
        status: "failed",
        processed_at: new Date().toISOString(),
        payload: { ...event.payload, error: `No route for event type: ${event.type}` },
      }).eq("id", eventId);
      return new Response(JSON.stringify({ error: `No route for event type: ${event.type}` }), { status: 400 });
    }

    const assistantId = ASSISTANTS[agentRole];
    const userMessage = JSON.stringify({
      event_type: event.type,
      deal_id: event.deal_id,
      payload: event.payload,
    }, null, 2);

    // 4. Call the assistant
    const result = await callAssistant(assistantId, userMessage, openAIKey);

    // 5. Parse result
    let parsedResult: unknown = result;
    try {
      const cleaned = result.replace(/^```json\n?/i, "").replace(/^```\n?/i, "").replace(/\n?```$/i, "").trim();
      parsedResult = JSON.parse(cleaned);
    } catch { /* keep as string */ }

    // 6. Mark processed
    await supabase.from("events").update({
      status: "processed",
      processed_at: new Date().toISOString(),
      payload: {
        ...event.payload,
        agent_result: parsedResult,
        agent_role: agentRole,
        assistant_id: assistantId,
      },
    }).eq("id", eventId);

    // 7. Write back to Supabase tables based on event type

    // email_received: if classified as confirmation/document received → mark request received_at
    if (event.type === "email_received" && event.payload?.request_id) {
      const classification = typeof parsedResult === "object" && parsedResult !== null
        ? (parsedResult as Record<string, string>).classification
        : null;
      if (classification === "confirmation_reply" || classification === "document_received") {
        const newStatus = classification === "document_received" ? "document_received" : "reply_received";
        await supabase.from("requests").update({
          status: newStatus,
          received_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", event.payload.request_id);
      }
    }

    if (event.type === "compliance_requested" && event.deal_id && Array.isArray(parsedResult)) {
      for (const check of parsedResult as Array<{rule_id: string; status: string; explanation: string}>) {
        await supabase.from("compliance_checks").upsert({
          deal_id: event.deal_id,
          rule_id: check.rule_id,
          status: check.status,
          notes: check.explanation,
          checked_at: new Date().toISOString(),
        }, { onConflict: "deal_id,rule_id" });
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      event_id: eventId,
      event_type: event.type,
      agent_role: agentRole,
      result: parsedResult,
    }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("route-event error:", message);

    if (eventId) {
      await createClient(SUPABASE_URL, SUPABASE_KEY).from("events").update({
        status: "failed",
        processed_at: new Date().toISOString(),
        payload: { error: message },
      }).eq("id", eventId);
    }

    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});
