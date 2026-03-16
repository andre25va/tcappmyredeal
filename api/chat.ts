import { createClient } from '@supabase/supabase-js';

// Vercel serverless function — handles AI chat for TC Command
// Deployed at /api/chat

const SYSTEM_PROMPT = `You are TC Command AI, an expert real estate transaction coordinator assistant built into the TC Command app. You help transaction coordinators manage their deals, tasks, contacts, and compliance.

You have access to the following tools to query and modify the database:

CAPABILITIES:
- Look up active deals, deal details, closing dates, statuses
- Find overdue tasks or tasks due today
- Create new tasks on deals
- Search contacts in the directory
- Check compliance status and missing documents
- Provide TC best practices and advice
- Draft follow-up emails

PERSONALITY:
- Professional but friendly
- Concise and actionable
- Always reference specific deal addresses and dates
- Proactively flag risks or concerns
- Use emoji sparingly for visual clarity

IMPORTANT RULES:
- When creating tasks, always confirm what you created
- When looking up deals, reference them by address
- Format dates in readable format (e.g., "March 20, 2026")
- If you don't have enough info, ask clarifying questions
- Never make up data — only reference what's in the database`;

const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_active_deals',
      description: 'Get all active deals with their details including address, close date, status, stage, agent, and contacts',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max deals to return (default 20)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_deal_details',
      description: 'Get full details for a specific deal by searching address or deal ID',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Address or partial address to search for' },
        },
        required: ['search'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_closing_soon',
      description: 'Get deals closing within the next N days',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Number of days to look ahead (default 14)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_overdue_tasks',
      description: 'Get all overdue tasks across all deals',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_tasks_due_today',
      description: 'Get all tasks due today across all deals',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_task',
      description: 'Create a new task on a specific deal. Returns the created task details.',
      parameters: {
        type: 'object',
        properties: {
          deal_search: { type: 'string', description: 'Address or partial address of the deal to add the task to' },
          title: { type: 'string', description: 'Task title' },
          due_date: { type: 'string', description: 'Due date in YYYY-MM-DD format' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Task priority' },
          category: { type: 'string', description: 'Task category (e.g., Financial, Legal, Compliance, Follow-up)' },
          notes: { type: 'string', description: 'Optional notes for the task' },
        },
        required: ['deal_search', 'title', 'due_date', 'priority', 'category'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_contacts',
      description: 'Search the contact directory by name, role, or company',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query (name, email, company, or role)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_deal_summary',
      description: 'Get a portfolio-level summary: total active deals, by stage, total value, etc.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'draft_email',
      description: 'Draft a professional follow-up email for a deal. Returns the draft text.',
      parameters: {
        type: 'object',
        properties: {
          deal_search: { type: 'string', description: 'Address of the deal this email is about' },
          recipient_role: { type: 'string', description: 'Who the email is to (e.g., lender, title company, agent, buyer, seller)' },
          purpose: { type: 'string', description: 'What the email should accomplish (e.g., follow up on missing docs, request update, closing reminder)' },
        },
        required: ['deal_search', 'recipient_role', 'purpose'],
      },
    },
  },
];

// ── Tool execution ──────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
  openaiKey: string,
): Promise<string> {
  switch (name) {
    case 'get_active_deals': {
      const limit = (args.limit as number) || 20;
      const { data, error } = await supabase
        .from('deals')
        .select('id, deal_data')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) return JSON.stringify({ error: error.message });
      const deals = (data ?? []).map((r: any) => {
        const d = r.deal_data;
        return {
          id: r.id,
          address: d?.address,
          city: d?.city,
          state: d?.state,
          status: d?.status,
          milestone: d?.milestone,
          closeDate: d?.closingDate,
          contractPrice: d?.contractPrice,
          agentName: d?.agentName,
          transactionSide: d?.transactionSide,
          taskCount: d?.tasks?.length ?? 0,
          overdueTasks: (d?.tasks ?? []).filter((t: any) => t.completedAt == null && t.dueDate < new Date().toISOString().slice(0, 10)).length,
        };
      });
      return JSON.stringify(deals);
    }

    case 'get_deal_details': {
      const search = (args.search as string).toLowerCase();
      const { data, error } = await supabase.from('deals').select('deal_data');
      if (error) return JSON.stringify({ error: error.message });
      const match = (data ?? []).find((r: any) => {
        const d = r.deal_data;
        return d?.address?.toLowerCase().includes(search) || d?.id === search;
      });
      if (!match) return JSON.stringify({ error: `No deal found matching "${args.search}"` });
      const d = match.deal_data as any;
      return JSON.stringify({
        id: d.id,
        address: d.address,
        city: d.city,
        state: d.state,
        zipCode: d.zipCode,
        mlsNumber: d.mlsNumber,
        status: d.status,
        milestone: d.milestone,
        transactionSide: d.transactionSide,
        contractDate: d.contractDate,
        closingDate: d.closingDate,
        contractPrice: d.contractPrice,
        listPrice: d.listPrice,
        agentName: d.agentName,
        contacts: (d.contacts ?? []).map((c: any) => ({ name: c.name, role: c.role, email: c.email, phone: c.phone })),
        tasks: (d.tasks ?? []).map((t: any) => ({ title: t.title, dueDate: t.dueDate, priority: t.priority, completed: !!t.completedAt })),
        dueDiligenceChecklist: (d.dueDiligenceChecklist ?? []).map((c: any) => ({ title: c.title, completed: c.completed })),
        documentRequests: (d.documentRequests ?? []).map((dr: any) => ({ label: dr.label, status: dr.status, urgency: dr.urgency })),
        notes: d.notes,
      });
    }

    case 'get_closing_soon': {
      const days = (args.days as number) || 14;
      const today = new Date().toISOString().slice(0, 10);
      const futureDate = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
      const { data, error } = await supabase.from('deals').select('deal_data');
      if (error) return JSON.stringify({ error: error.message });
      const closing = (data ?? [])
        .filter((r: any) => {
          const cd = r.deal_data?.closingDate;
          return cd && cd >= today && cd <= futureDate;
        })
        .map((r: any) => {
          const d = r.deal_data;
          const daysLeft = Math.ceil((new Date(d.closingDate).getTime() - Date.now()) / 86400000);
          return { address: d.address, closingDate: d.closingDate, daysLeft, status: d.status, milestone: d.milestone, agentName: d.agentName };
        })
        .sort((a: any, b: any) => a.daysLeft - b.daysLeft);
      return JSON.stringify(closing);
    }

    case 'get_overdue_tasks': {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase.from('deals').select('deal_data');
      if (error) return JSON.stringify({ error: error.message });
      const overdue: any[] = [];
      (data ?? []).forEach((r: any) => {
        const d = r.deal_data;
        (d?.tasks ?? []).forEach((t: any) => {
          if (!t.completedAt && t.dueDate < today) {
            overdue.push({ address: d.address, task: t.title, dueDate: t.dueDate, priority: t.priority, daysOverdue: Math.ceil((Date.now() - new Date(t.dueDate).getTime()) / 86400000) });
          }
        });
      });
      overdue.sort((a, b) => b.daysOverdue - a.daysOverdue);
      return JSON.stringify(overdue);
    }

    case 'get_tasks_due_today': {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase.from('deals').select('deal_data');
      if (error) return JSON.stringify({ error: error.message });
      const dueToday: any[] = [];
      (data ?? []).forEach((r: any) => {
        const d = r.deal_data;
        (d?.tasks ?? []).forEach((t: any) => {
          if (!t.completedAt && t.dueDate === today) {
            dueToday.push({ address: d.address, task: t.title, priority: t.priority, category: t.category });
          }
        });
      });
      return JSON.stringify(dueToday);
    }

    case 'create_task': {
      const search = (args.deal_search as string).toLowerCase();
      const { data, error } = await supabase.from('deals').select('id, deal_data');
      if (error) return JSON.stringify({ error: error.message });
      const match = (data ?? []).find((r: any) => r.deal_data?.address?.toLowerCase().includes(search));
      if (!match) return JSON.stringify({ error: `No deal found matching "${args.deal_search}"` });

      const deal = match.deal_data as any;
      const newTask = {
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: args.title as string,
        dueDate: args.due_date as string,
        priority: (args.priority as string) || 'medium',
        category: (args.category as string) || 'Follow-up',
        milestone: deal.milestone || 'contract-received',
        autoGenerated: false,
        notes: (args.notes as string) || '',
      };

      const updatedTasks = [...(deal.tasks || []), newTask];
      const updatedDeal = { ...deal, tasks: updatedTasks, updatedAt: new Date().toISOString() };

      const { error: updateError } = await supabase
        .from('deals')
        .update({ deal_data: updatedDeal, updated_at: new Date().toISOString() })
        .eq('id', match.id);

      if (updateError) return JSON.stringify({ error: updateError.message });
      return JSON.stringify({ success: true, task: newTask, dealAddress: deal.address });
    }

    case 'search_contacts': {
      const query = (args.query as string).toLowerCase();
      const { data, error } = await supabase.from('directory_contacts').select('data');
      if (error) return JSON.stringify({ error: error.message });
      const matches = (data ?? [])
        .map((r: any) => r.data)
        .filter((c: any) => {
          return (
            c?.name?.toLowerCase().includes(query) ||
            c?.email?.toLowerCase().includes(query) ||
            c?.company?.toLowerCase().includes(query) ||
            c?.role?.toLowerCase().includes(query)
          );
        })
        .map((c: any) => ({ name: c.name, email: c.email, phone: c.phone, role: c.role, company: c.company }));
      return JSON.stringify(matches.length > 0 ? matches : { message: `No contacts found matching "${args.query}"` });
    }

    case 'get_deal_summary': {
      const { data, error } = await supabase.from('deals').select('deal_data');
      if (error) return JSON.stringify({ error: error.message });
      const deals = (data ?? []).map((r: any) => r.deal_data);
      const active = deals.filter((d: any) => d?.milestone !== 'archived' && d?.milestone !== 'closed');
      const totalValue = active.reduce((sum: number, d: any) => sum + (d?.contractPrice || 0), 0);
      const byStage: Record<string, number> = {};
      active.forEach((d: any) => {
        const stage = d?.milestone || 'unknown';
        byStage[stage] = (byStage[stage] || 0) + 1;
      });
      const today = new Date().toISOString().slice(0, 10);
      const overdueTasks = deals.reduce((count: number, d: any) => {
        return count + (d?.tasks ?? []).filter((t: any) => !t.completedAt && t.dueDate < today).length;
      }, 0);
      return JSON.stringify({
        totalActive: active.length,
        totalClosed: deals.filter((d: any) => d?.milestone === 'closed').length,
        totalValue,
        byStage,
        overdueTasks,
        totalDeals: deals.length,
      });
    }

    case 'draft_email': {
      const search = (args.deal_search as string).toLowerCase();
      const { data } = await supabase.from('deals').select('deal_data');
      const match = (data ?? []).find((r: any) => r.deal_data?.address?.toLowerCase().includes(search));
      if (!match) return JSON.stringify({ error: `No deal found matching "${args.deal_search}"` });

      const deal = match.deal_data as any;
      const recipient = args.recipient_role as string;
      const purpose = args.purpose as string;

      // Use OpenAI to draft the email
      const emailPrompt = `Draft a professional real estate transaction coordinator email.

Deal: ${deal.address}, ${deal.city}, ${deal.state} ${deal.zipCode}
Contract Price: $${deal.contractPrice?.toLocaleString() ?? 'N/A'}
Closing Date: ${deal.closingDate || 'TBD'}
Status: ${deal.status} / ${deal.milestone}
Agent: ${deal.agentName || 'N/A'}
Transaction Side: ${deal.transactionSide}

Recipient: ${recipient}
Purpose: ${purpose}

Write a concise, professional email with:
1. Clear subject line
2. Professional greeting
3. Purpose stated in first sentence
4. Any relevant deal details
5. Clear call to action
6. Professional sign-off as "TC Command - Transaction Coordinator"

Format as:
SUBJECT: ...
---
[email body]`;

      const emailRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: emailPrompt }],
          max_tokens: 500,
          temperature: 0.7,
        }),
      });

      const emailData = await emailRes.json();
      const emailDraft = emailData.choices?.[0]?.message?.content || 'Failed to generate email draft.';
      return JSON.stringify({ dealAddress: deal.address, recipient, purpose, draft: emailDraft });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const openaiKey = process.env.OPENAI_API_KEY;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!openaiKey || !supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server configuration error — missing env vars' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    // Build conversation with system prompt
    const fullMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ];

    // First call — may trigger tool use
    let response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: fullMessages,
        tools: TOOLS,
        tool_choice: 'auto',
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    let data = await response.json();
    let message = data.choices?.[0]?.message;

    // Handle tool calls (up to 3 rounds)
    let rounds = 0;
    while (message?.tool_calls && rounds < 3) {
      rounds++;
      fullMessages.push(message);

      // Execute all tool calls
      for (const toolCall of message.tool_calls) {
        const fnName = toolCall.function.name;
        const fnArgs = JSON.parse(toolCall.function.arguments || '{}');
        const result = await executeTool(fnName, fnArgs, supabase, openaiKey);

        fullMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        } as any);
      }

      // Call OpenAI again with tool results
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: fullMessages,
          tools: TOOLS,
          tool_choice: 'auto',
          max_tokens: 1000,
          temperature: 0.7,
        }),
      });

      data = await response.json();
      message = data.choices?.[0]?.message;
    }

    const reply = message?.content || 'I encountered an issue processing your request. Please try again.';

    // Log the chat interaction
    await supabase.from('activity_log').insert({
      entity_type: 'ai_chat',
      action: 'chat_message',
      details: JSON.stringify({
        userMessage: messages[messages.length - 1]?.content?.substring(0, 200),
        toolsUsed: message?.tool_calls?.map((tc: any) => tc.function.name) ?? [],
        rounds,
      }),
      created_at: new Date().toISOString(),
    }).then(() => {}).catch(() => {});

    return res.status(200).json({ reply, toolsUsed: rounds > 0 });
  } catch (err: any) {
    console.error('Chat API error:', err);
    return res.status(500).json({ error: 'Failed to process chat request' });
  }
}
