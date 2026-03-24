import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

// ── Supabase helper ───────────────────────────────────────────────────────────
async function sbFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Prefer: 'return=representation',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${path}: ${res.status} ${err}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── OpenAI classification ─────────────────────────────────────────────────────
async function classifyWithAI(prompt: string, content: string): Promise<Record<string, unknown>> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 300,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI: ${res.status}`);
  const data = await res.json();
  try {
    return JSON.parse(data.choices[0].message.content);
  } catch {
    return {};
  }
}

// ── Action executor ───────────────────────────────────────────────────────────
async function executeActions(
  actions: Array<{ type: string; [k: string]: unknown }>,
  context: Record<string, unknown>
) {
  const taken: string[] = [];

  for (const action of actions) {
    try {
      if (action.type === 'create_comm_task') {
        await sbFetch('/comm_tasks', {
          method: 'POST',
          body: JSON.stringify({
            title: (action.title as string) || 'New Task',
            priority: (action.priority as string) || 'medium',
            status: 'pending',
            channel: (context.channel as string) || 'email',
            contact_id: context.contactId || null,
            deal_id: context.dealId || null,
            body: context.summary || null,
            metadata: context,
          }),
        });
        taken.push(`create_comm_task: ${action.title}`);
      }

      if (action.type === 'create_notification') {
        // Notify all admin/active users
        const users = await sbFetch('/profiles?select=id&limit=10');
        if (Array.isArray(users)) {
          for (const u of users) {
            await sbFetch('/notifications', {
              method: 'POST',
              body: JSON.stringify({
                user_id: u.id,
                type: context.triggerType || 'workflow',
                title: action.title,
                body: action.body || context.summary || '',
                link: (context.link as string) || null,
                is_read: false,
              }),
            });
          }
        }
        taken.push(`create_notification: ${action.title}`);
      }
    } catch (e: unknown) {
      console.error('Action failed:', action.type, e);
    }
  }

  return taken;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { triggerType, content, context = {} } = req.body as {
    triggerType: string;
    content: string;
    context: Record<string, unknown>;
  };

  if (!triggerType || !content) {
    return res.status(400).json({ error: 'triggerType and content required' });
  }

  try {
    // 1. Load active rules for this trigger type
    const rules = await sbFetch(
      `/workflow_rules?trigger_type=eq.${triggerType}&is_active=eq.true&select=*`
    ) as Array<{
      id: string;
      name: string;
      ai_classification_prompt: string | null;
      conditions: Record<string, unknown>;
      actions: Array<{ type: string; [k: string]: unknown }>;
    }>;

    if (!rules || rules.length === 0) {
      return res.json({ matched: 0, executions: [] });
    }

    const executions: unknown[] = [];

    for (const rule of rules) {
      let aiResult: Record<string, unknown> = {};
      let shouldFire = false;

      // 2. Run AI classification if rule has a prompt
      if (rule.ai_classification_prompt) {
        aiResult = await classifyWithAI(rule.ai_classification_prompt, content);

        // Determine if AI says this is a match based on trigger type
        if (triggerType === 'email_inbound') {
          // Fire if rule is "Contract Email Detection" and isContract, OR "Document Request" and isClientRequest
          if (rule.name === 'Contract Email Detection' && aiResult.isContract === true && (aiResult.confidence as number) >= 60) {
            shouldFire = true;
          } else if (rule.name === 'Document Request from Client' && aiResult.isClientRequest === true && (aiResult.confidence as number) >= 60) {
            shouldFire = true;
          }
        } else if (triggerType === 'sms_inbound') {
          if (aiResult.isNewContract === true && (aiResult.confidence as number) >= 65) {
            shouldFire = true;
          }
        }
      } else {
        // No AI prompt — fire based on conditions only
        if (triggerType === 'deal_inactivity' || triggerType === 'new_contact') {
          shouldFire = true;
        }
      }

      if (!shouldFire) {
        // Log as skipped
        await sbFetch('/workflow_executions', {
          method: 'POST',
          body: JSON.stringify({
            rule_id: rule.id,
            rule_name: rule.name,
            trigger_type: triggerType,
            trigger_data: { content: content.substring(0, 500), context },
            ai_classification: aiResult,
            actions_taken: [],
            status: 'skipped',
          }),
        });
        continue;
      }

      // 3. Execute actions
      const mergedContext = {
        ...context,
        ...aiResult,
        triggerType,
        summary: (aiResult.summary as string) || content.substring(0, 200),
      };

      const taken = await executeActions(rule.actions, mergedContext);

      // 4. Log execution
      await sbFetch('/workflow_executions', {
        method: 'POST',
        body: JSON.stringify({
          rule_id: rule.id,
          rule_name: rule.name,
          trigger_type: triggerType,
          trigger_data: { content: content.substring(0, 500), context },
          ai_classification: aiResult,
          actions_taken: taken,
          status: taken.length > 0 ? 'success' : 'partial',
        }),
      });

      executions.push({ rule: rule.name, aiResult, taken });
    }

    return res.json({ matched: executions.length, executions });
  } catch (err: unknown) {
    console.error('Workflow engine error:', err);
    return res.status(500).json({ error: 'Workflow engine failed' });
  }
}
