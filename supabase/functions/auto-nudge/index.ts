import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function resolveMergeTags(
  template: string,
  vars: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value ?? "");
  }
  return result;
}

function wrapHtml(body: string): string {
  const bodyWithBr = body.replace(/\n/g, "<br>");
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <div style="border-bottom:2px solid #2563eb;padding-bottom:12px;margin-bottom:20px;">
    <strong style="color:#2563eb;font-size:18px;">MyReDeal</strong>
  </div>
  <div style="line-height:1.6;color:#333;">${bodyWithBr}</div>
  <div style="margin-top:30px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
    Sent via MyReDeal Transaction Coordinator
  </div>
</div>`;
}

const DEFAULT_SUBJECT = "Follow-up needed: {{task_name}}";
const DEFAULT_BODY = `Hi {{client_name}},

This is a friendly reminder regarding {{task_name}} for the property at {{property_address}} ({{deal_ref}}).

The due date is {{due_date}}. Please let us know if you need any assistance.

Best regards,
MyReDeal Team`;

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry_run") === "true";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const requestBody = await req.json();
    const { dealId, riskSummary, topRisk, recommendations, context } = requestBody;

    if (context === "manual_summary_send" && dealId && riskSummary) {
      // Handle manual AI Summary send
      try {
        // Fetch deal details
        const { data: deal, error: dealError } = await supabase
          .from("deals")
          .select("id, deal_ref, property_address, org_id")
          .eq("id", dealId)
          .single();

        if (dealError || !deal) {
          console.error(`Deal not found for manual summary send: ${dealId}`);
          return new Response(
            JSON.stringify({ error: "Deal not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Find primary agent contact
        const { data: participants, error: partError } = await supabase
          .from("deal_participants")
          .select("contact_id, contacts(id, email, first_name, last_name)")
          .eq("deal_id", deal.id)
          .in("deal_role", ["buyers_agent", "listing_agent"])
          .eq("is_primary", true)
          .limit(1);

        if (partError || !participants || participants.length === 0) {
          console.error(`No primary agent found for deal: ${deal.id}`);
          return new Response(
            JSON.stringify({ error: "No primary agent found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const contact = (participants[0] as any).contacts;
        if (!contact || !contact.email) {
          console.error(`Primary agent contact email not found for deal: ${deal.id}`);
          return new Response(
            JSON.stringify({ error: "Primary agent email not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const agentName = contact.first_name ? `${contact.first_name} ${contact.last_name}` : contact.email;
        const subject = `AI Summary for ${deal.deal_ref} - ${deal.property_address}`;
        let body = `Hi ${agentName},

Here is an AI-generated summary for your deal at ${deal.property_address} (${deal.deal_ref}):

Risk Summary: ${riskSummary}
`;

        if (topRisk) {
          body += `\nTop Risk: ${topRisk}\n`;
        }
        if (recommendations && recommendations.length > 0) {
          body += `\nRecommendations:\n- ${recommendations.join("\n- ")}\n`;
        }

        body += `\nBest regards,\nMyReDeal Team`;

        // Call send-email function
        const emailRes = await fetch(
          `${supabaseUrl}/functions/v1/send-email`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({
              to: contact.email,
              subject: subject,
              body: body,
              html: wrapHtml(body),
              dealId: deal.id,
              templateName: "AI Summary",
              emailType: "ai_summary",
              sentBy: "AI",
            }),
          }
        );

        if (!emailRes.ok) {
          const errText = await emailRes.text();
          console.error(`send-email failed for AI Summary:`, errText);
          return new Response(
            JSON.stringify({ error: "Failed to send AI Summary email", details: errText }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(JSON.stringify({ message: "AI Summary sent successfully" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      } catch (err) {
        console.error("Error processing manual AI Summary send:", err);
        return new Response(
          JSON.stringify({ error: "Internal server error", details: String(err) }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Existing logic for scheduled nudges
    // 1. Query tasks that need nudging
    const { data: tasks, error: tasksError } = await supabase
      .from("task_nudge_status")
      .select("*")
      .eq("needs_nudge", true);

    if (tasksError) {
      console.error("Error querying task_nudge_status:", tasksError);
      return new Response(
        JSON.stringify({ error: "Failed to query tasks", details: tasksError }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const summary = {
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      dry_run: dryRun,
      details: [] as Record<string, unknown>[],
    };

    if (!tasks || tasks.length === 0) {
      return new Response(JSON.stringify(summary), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Process each task sequentially
    for (const task of tasks) {
      summary.processed++;
      const taskDetail: Record<string, unknown> = {
        task_id: task.task_id,
        task_name: task.task_name,
      };

      try {
        // 2a. Get deal info
        const { data: deal, error: dealError } = await supabase
          .from("deals")
          .select("id, deal_ref, property_address, org_id")
          .eq("id", task.deal_id)
          .single();

        if (dealError || !deal) {
          console.warn(`No deal found for task ${task.task_id}, deal_id ${task.deal_id}`);
          taskDetail.status = "skipped";
          taskDetail.reason = "deal_not_found";
          summary.skipped++;
          summary.details.push(taskDetail);
          continue;
        }

        // 2b. Find primary agent contact
        const { data: participants, error: partError } = await supabase
          .from("deal_participants")
          .select("contact_id, contacts(id, email, phone, first_name, last_name)")
          .eq("deal_id", deal.id)
          .in("deal_role", ["buyers_agent", "listing_agent"])
          .eq("is_primary", true)
          .limit(1);

        if (partError || !participants || participants.length === 0) {
          console.warn(`No primary agent contact for task ${task.task_id}, deal ${deal.id}`);
          taskDetail.status = "skipped";
          taskDetail.reason = "no_primary_agent";
          summary.skipped++;
          summary.details.push(taskDetail);
          continue;
        }

        // contacts comes back as a joined object (single, not array, due to FK)
        const contact = (participants[0] as any).contacts;
        if (!contact) {
          console.warn(`Contact join returned null for task ${task.task_id}`);
          taskDetail.status = "skipped";
          taskDetail.reason = "contact_not_found";
          summary.skipped++;
          summary.details.push(taskDetail);
          continue;
        }

        // 2d. Pick a template — prefer org-scoped over global
        const { data: templates } = await supabase
          .from("nudge_templates")
          .select("*")
          .eq("is_active", true)
          .or(`org_id.eq.${deal.org_id},org_id.is.null`)
          .order("org_id", { ascending: false, nullsFirst: false });

        let templateId: string | null = null;
        let subjectTemplate = DEFAULT_SUBJECT;
        let bodyTemplate = DEFAULT_BODY;
        let channel = "email";

        if (templates && templates.length > 0) {
          const tpl = templates[0]; // org-scoped first due to ordering
          templateId = tpl.id;
          subjectTemplate = tpl.subject || DEFAULT_SUBJECT;
          bodyTemplate = tpl.body || DEFAULT_BODY;
          channel = tpl.channel || "email";
        }

        // 2f. Resolve merge tags
        const clientName = contact.last_name
          ? `${contact.first_name} ${contact.last_name}`
          : contact.first_name || "there";

        const mergeVars: Record<string, string> = {
          task_name: task.task_name || "",
          due_date: task.due_date ? formatDate(task.due_date) : "N/A",
          property_address: deal.property_address || "",
          deal_ref: deal.deal_ref || "",
          client_name: clientName,
        };

        const resolvedSubject = resolveMergeTags(subjectTemplate, mergeVars);
        const resolvedBody = resolveMergeTags(bodyTemplate, mergeVars);

        taskDetail.channel = channel;
        taskDetail.template_id = templateId;
        taskDetail.recipient = contact.email || contact.phone;

        // 2g-i. Send based on channel
        const channels: string[] =
          channel === "both" ? ["email", "sms"] : [channel];

        for (const ch of channels) {
          let deliveryStatus = "delivered";

          if (!dryRun) {
            try {
              if (ch === "email" && contact.email) {
                const emailRes = await fetch(
                  `${supabaseUrl}/functions/v1/send-email`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${serviceRoleKey}`,
                    },
                    body: JSON.stringify({
                      to: contact.email,
                      subject: resolvedSubject,
                      body: resolvedBody,
                      html: wrapHtml(resolvedBody),
                    }),
                  }
                );
                if (!emailRes.ok) {
                  const errText = await emailRes.text();
                  console.error(`send-email failed for task ${task.task_id}:`, errText);
                  deliveryStatus = "failed";
                }
              } else if (ch === "sms" && contact.phone) {
                const smsRes = await fetch(
                  `${supabaseUrl}/functions/v1/send-sms`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${serviceRoleKey}`,
                    },
                    body: JSON.stringify({
                      to: contact.phone,
                      body: resolvedBody,
                    }),
                  }
                );
                if (!smsRes.ok) {
                  const errText = await smsRes.text();
                  console.error(`send-sms failed for task ${task.task_id}:`, errText);
                  deliveryStatus = "failed";
                }
              } else {
                // Missing contact info for this channel
                console.warn(
                  `No ${ch} contact info for task ${task.task_id}, contact ${contact.id}`
                );
                deliveryStatus = "failed";
              }
            } catch (sendErr) {
              console.error(`Send error (${ch}) for task ${task.task_id}:`, sendErr);
              deliveryStatus = "failed";
            }
          } else {
            deliveryStatus = "dry_run";
          }

          // 2j. Log to nudge_log
          const { error: logError } = await supabase
            .from("nudge_log")
            .insert({
              task_id: task.task_id,
              deal_id: task.deal_id,
              template_id: templateId,
              recipient_id: contact.id,
              sent_by: null, // automated
              channel: ch,
              subject: resolvedSubject,
              body: resolvedBody,
              delivery_status: dryRun ? "delivered" : deliveryStatus,
              sent_at: new Date().toISOString(),
            });

          if (logError) {
            console.error(`nudge_log insert failed for task ${task.task_id}:`, logError);
          }

          if (deliveryStatus === "failed") {
            summary.failed++;
          } else {
            summary.sent++;
          }

          taskDetail.status = deliveryStatus;
        }

        summary.details.push(taskDetail);
      } catch (taskErr) {
        console.error(`Error processing task ${task.task_id}:`, taskErr);
        taskDetail.status = "error";
        taskDetail.error = String(taskErr);
        summary.failed++;
        summary.details.push(taskDetail);
      }
    }

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unhandled error in auto-nudge:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
