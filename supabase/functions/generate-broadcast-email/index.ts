import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUGGESTION_SYSTEM_PROMPTS: Record<string, string> = {
  closing_reminder: "closing reminder — remind all parties of the upcoming closing date, what to bring, and what to expect",
  document_request: "document request — professionally request outstanding documents needed to move the transaction forward",
  availability: "availability update — inform parties of updated availability or scheduling for inspections, walkthroughs, or signings",
  new_listing: "new listing announcement — announce a new property listing to a group of agents or clients",
  payment_due: "payment due notice — remind parties that earnest money, option fee, or other payment is due soon",
  status_update: "transaction status update — provide a clear, friendly update on where the deal currently stands",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { prompt, suggestion_type } = await req.json();

    if (!prompt && !suggestion_type) {
      return new Response(JSON.stringify({ error: "prompt or suggestion_type is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAiKey) {
      return new Response(JSON.stringify({ error: "OpenAI API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build the description — use suggestion label if no custom prompt
    const intentDescription = prompt?.trim() ||
      (suggestion_type ? SUGGESTION_SYSTEM_PROMPTS[suggestion_type] : null) ||
      "a general professional real estate update";

    const systemPrompt = `You are a professional real estate transaction coordinator (TC) writing emails on behalf of a TC team.

Write a professional, warm, concise email for the following intent:
${intentDescription}

Rules:
- Subject line: clear, specific, professional (no emojis)
- Body: 2-4 short paragraphs, friendly but professional tone
- Sign off as: TC Team | tc@myredeal.com
- Do NOT include placeholder brackets like [NAME] or [DATE] — write complete sentences using generic references (e.g., "the closing date", "your agent", "our team")
- Do NOT include a greeting salutation line (no "Hi [Name]") — start directly with the message
- Return ONLY valid JSON with exactly two fields: "subject" (string) and "body_html" (string with basic HTML: <p>, <strong>, <br> tags only, no inline styles)`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate the email now.` },
        ],
        temperature: 0.7,
        max_tokens: 600,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI error:", errText);
      return new Response(JSON.stringify({ error: "OpenAI request failed", detail: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const openAiData = await response.json();
    const rawContent = openAiData.choices?.[0]?.message?.content ?? "{}";

    let parsed: { subject?: string; body_html?: string } = {};
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      return new Response(JSON.stringify({ error: "Failed to parse OpenAI response", raw: rawContent }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subject = parsed.subject?.trim() ?? "";
    const body_html = parsed.body_html?.trim() ?? "";

    if (!subject || !body_html) {
      return new Response(JSON.stringify({ error: "Incomplete response from AI", raw: rawContent }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ subject, body_html }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("generate-broadcast-email error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
