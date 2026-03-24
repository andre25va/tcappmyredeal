import { createClient } from '@supabase/supabase-js';

// Vercel serverless function — handles AI chat for TC Command
// Deployed at /api/chat

const SYSTEM_PROMPT = `You are TC Command AI, an expert real estate transaction coordinator assistant built into the TC Command app. You help transaction coordinators manage their deals, tasks, contacts, and compliance.

You have access to the following tools to query and modify the database:

CAPABILITIES:
- Look up active deals, deal details, closing dates, statuses
- Filter deals by state (any US state abbreviation) or city
- Find overdue tasks or tasks due today
- Create new tasks on deals
- Search contacts in the directory
- Check compliance status and missing documents
- Provide TC best practices and advice
- Draft follow-up emails
- Navigate the user directly to a specific deal in the app
- Search through Gmail emails by property address - shows a special popup with all matching emails + attachments
- Search through SMS and WhatsApp conversations

PERSONALITY:
- Professional but friendly
- Concise and actionable
- Always reference specific deal addresses and dates
- Proactively flag risks or concerns
- Use emoji sparingly for visual clarity

NAVIGATION RULES:
- When a user says "show me", "take me to", "open", "go to", "navigate to", or "pull up" a deal → ALWAYS call navigate_to_deal
- After navigating, briefly describe what they'll see in the deal workspace
- You can also navigate to app views (contacts, dashboard, compliance) using navigate_to_view

EMAIL SEARCH RULES:
- When user asks to "show emails for", "pull up emails about", "find emails related to", "search emails for", or "what emails do we have on" a property address → ALWAYS call search_property_emails
- For duplex/multi-unit properties, extract BOTH addresses and pass them all
- After calling search_property_emails, tell the user what you found and that they can browse the emails in the popup
- The popup will have TWO tabs: all emails on one tab, all attachments on another

IMPORTANT RULES:
- When creating tasks, always confirm what you created
- When looking up deals, reference them by address
- Format dates in readable format (e.g., "March 20, 2026")
- If you don't have enough info, ask clarifying questions
- Never make up data — only reference what's in the database
- When data is empty (no deals, no tasks, etc.), tell the user in a helpful way — e.g., "You don't have any active deals yet. Add a deal in TC Command to get started!"
- NEVER say "there is an issue" when data is simply empty — empty is normal for new accounts
- When user asks for deals in a state like "TX deals" or "California deals", use get_active_deals with the state filter`;

const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_active_deals',
      description: 'Get all active deals with their details including address, close date, status, stage, agent, and contacts. Can filter by any US state abbreviation or city. Returns empty array if no deals exist yet.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max deals to return (default 20)' },
          state: { type: 'string', description: 'Filter by state abbreviation e.g. TX, CA, NY (optional)' },
          city: { type: 'string', description: 'Filter by city name (optional)' },
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
      name: 'navigate_to_deal',
      description: 'Navigate the user directly to a specific deal workspace in the app. Use this when the user says "show me", "take me to", "open", "go to", "pull up", or "navigate to" a specific deal. This opens the full deal workspace with all details, tasks, documents, and contacts.',
      parameters: {
        type: 'object',
        properties: {
          deal_search: { type: 'string', description: 'Address or partial address of the deal to open' },
        },
        required: ['deal_search'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'navigate_to_view',
      description: 'Navigate the user to a specific section of the app (e.g., contacts directory, dashboard, compliance manager)',
      parameters: {
        type: 'object',
        properties: {
          view: {
            type: 'string',
            enum: ['dashboard', 'transactions', 'contacts', 'compliance', 'mls', 'settings'],
            description: 'The app section to navigate to',
          },
        },
        required: ['view'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_closing_soon',
      description: 'Get deals closing within the next N days. Returns empty array if no deals are closing soon.',
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
      description: 'Get all overdue tasks across all deals. Returns empty array if nothing is overdue.',
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
      description: 'Get all tasks due today across all deals. Returns empty array if nothing is due today.',
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
      description: 'Search the contact directory by name, role, or company. Returns empty if no matches found.',
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
      name: 'search_property_emails',
      description: 'Search Gmail for ALL emails related to a specific property address. Use when user asks to show emails for a property, pull up emails about an address, or find email history for a deal. For duplex/multi-unit properties, include both unit addresses. Opens a special popup with all emails and attachments organized by tabs.',
      parameters: {
        type: 'object',
        properties: {
          addresses: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of property address(es) to search for. For a duplex, include both unit addresses e.g. ["123 Oak St", "125 Oak St"]. Always include street number and street name at minimum.',
          },
          label: {
            type: 'string',
            description: 'Human-readable label for the search e.g. "123 & 125 Oak St" or "4521 Maple Ave"',
          },
        },
        required: ['addresses'],
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
  try {
    switch (name) {
      case 'get_active_deals': {
        const limit = (args.limit as number) || 20;
        const stateFilter = args.state as string | undefined;
        const cityFilter = args.city as string | undefined;

        let query = supabase
          .from('deals')
          .select('id, property_address, city, state, status, pipeline_stage, closing_date, purchase_price, transaction_type, agent_name, created_at')
          .order('closing_date', { ascending: true })
          .limit(limit);

        if (stateFilter) {
          query = query.ilike('state', stateFilter.trim());
        }
        if (cityFilter) {
          query = query.ilike('city', `%${cityFilter.trim()}%`);
        }

        const { data, error } = await query;
        if (error) return JSON.stringify({ error: error.message });
        if (!data || data.length === 0) {
          const filterMsg = stateFilter ? ` in ${stateFilter.toUpperCase()}` : cityFilter ? ` in ${cityFilter}` : '';
          return JSON.stringify({ deals: [], message: `No deals found${filterMsg}. Add your first deal in TC Command to get started!` });
        }
        const deals = data.map((r: any) => {
          return {
            id: r.id,
            address: r.property_address || 'No address',
            city: r.city,
            state: r.state,
            status: r.status,
            stage: r.pipeline_stage,
            closeDate: r.closing_date,
            purchasePrice: r.purchase_price,
            agentName: r.agent_name,
            transactionType: r.transaction_type,
          };
        });
        return JSON.stringify({ deals, total: deals.length });
      }

      case 'get_deal_details': {
        const search = (args.search as string).toLowerCase();
        const { data, error } = await supabase
          .from('deals')
          .select('id, property_address, city, state, zip, mls_number, deal_type, transaction_type, status, pipeline_stage, contract_date, closing_date, purchase_price, earnest_money, agent_name, notes');
        if (error) return JSON.stringify({ error: error.message });
        if (!data || data.length === 0) return JSON.stringify({ error: 'No deals found. Add deals in TC Command first.' });
        const match = data.find((r: any) => {
          return (r.property_address || '').toLowerCase().includes(search) ||
                 (r.city || '').toLowerCase().includes(search) ||
                 r.id === search;
        });
        if (!match) return JSON.stringify({ error: `No deal found matching "${args.search}". Try a different address or check your deals list.` });
        return JSON.stringify({
          id: match.id,
          address: match.property_address,
          city: match.city,
          state: match.state,
          zip: match.zip,
          mlsNumber: match.mls_number,
          status: match.status,
          stage: match.pipeline_stage,
          dealType: match.transaction_type,
          contractDate: match.contract_date,
          closingDate: match.closing_date,
          purchasePrice: match.purchase_price,
          earnestMoney: match.earnest_money,
          agentName: match.agent_name,
          notes: match.notes,
        });
      }

      case 'navigate_to_deal': {
        const search = (args.deal_search as string).toLowerCase();
        const { data, error } = await supabase
          .from('deals')
          .select('id, property_address, city, state, pipeline_stage, closing_date');
        if (error) return JSON.stringify({ error: error.message });
        if (!data || data.length === 0) return JSON.stringify({ error: 'No deals found. Add a deal first.' });

        const match = data.find((r: any) => {
          return (r.property_address || '').toLowerCase().includes(search) ||
                 (r.city || '').toLowerCase().includes(search);
        });
        if (!match) return JSON.stringify({ error: `No deal found matching "${args.deal_search}". Check the address and try again.` });

        return JSON.stringify({
          navigate: true,
          dealId: match.id,
          address: match.property_address,
          city: match.city,
          state: match.state,
          stage: match.pipeline_stage,
          closingDate: match.closing_date,
        });
      }

      case 'navigate_to_view': {
        const view = args.view as string;
        const viewLabels: Record<string, string> = {
          dashboard: 'Dashboard',
          transactions: 'Transactions / Deals',
          contacts: 'Contacts Directory',
          compliance: 'Compliance Manager',
          mls: 'MLS Directory',
          settings: 'Settings',
        };
        return JSON.stringify({
          navigate: true,
          view,
          label: viewLabels[view] || view,
        });
      }

      case 'get_closing_soon': {
        const days = (args.days as number) || 14;
        const today = new Date().toISOString().slice(0, 10);
        const futureDate = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
        const { data, error } = await supabase
          .from('deals')
          .select('property_address, city, state, status, pipeline_stage, closing_date')
          .gte('closing_date', today)
          .lte('closing_date', futureDate)
          .order('closing_date', { ascending: true });
        if (error) return JSON.stringify({ error: error.message });
        if (!data || data.length === 0) {
          return JSON.stringify({ closing: [], message: `No deals closing in the next ${days} days.` });
        }
        const closing = data.map((r: any) => {
          const cd = r.closing_date;
          const daysLeft = Math.ceil((new Date(cd).getTime() - Date.now()) / 86400000);
          return {
            address: r.property_address,
            city: r.city,
            state: r.state,
            closingDate: cd,
            daysLeft,
            status: r.status,
            stage: r.pipeline_stage,
          };
        });
        return JSON.stringify({ closing, total: closing.length });
      }

      case 'get_overdue_tasks': {
        const today = new Date().toISOString().slice(0, 10);
        const { data: structuredTasks, error: stError } = await supabase
          .from('tasks')
          .select('id, title, due_date, priority, category, status, deal_id, deals(id, property_address, city, state)')
          .lt('due_date', today)
          .neq('status', 'completed')
          .order('due_date', { ascending: true });

        if (stError) return JSON.stringify({ error: stError.message });

        const overdue: any[] = (structuredTasks || []).map((t: any) => ({
          task: t.title,
          dueDate: t.due_date,
          priority: t.priority,
          category: t.category,
          address: t.deals?.property_address,
          city: t.deals?.city,
          state: t.deals?.state,
          deal_id: t.deal_id,
          daysOverdue: Math.ceil((Date.now() - new Date(t.due_date).getTime()) / 86400000),
        }));

        if (overdue.length === 0) {
          return JSON.stringify({ overdue: [], message: 'No overdue tasks — you\'re all caught up! 🎉' });
        }
        return JSON.stringify({ overdue, total: overdue.length });
      }

      case 'get_tasks_due_today': {
        const today = new Date().toISOString().slice(0, 10);
        const { data: structuredTasks, error: stError } = await supabase
          .from('tasks')
          .select('id, title, due_date, priority, category, status, deal_id, deals(id, property_address, city, state)')
          .eq('due_date', today)
          .neq('status', 'completed');

        if (stError) return JSON.stringify({ error: stError.message });

        const dueToday: any[] = (structuredTasks || []).map((t: any) => ({
          task: t.title,
          priority: t.priority,
          category: t.category,
          address: t.deals?.property_address,
          city: t.deals?.city,
          state: t.deals?.state,
          deal_id: t.deal_id,
        }));

        if (dueToday.length === 0) {
          return JSON.stringify({ tasks: [], message: 'No tasks due today. Enjoy the breathing room! ☕' });
        }
        return JSON.stringify({ tasks: dueToday, total: dueToday.length });
      }

      case 'create_task': {
        const search = (args.deal_search as string).toLowerCase();
        const { data, error } = await supabase
          .from('deals')
          .select('id, property_address, city, state');
        if (error) return JSON.stringify({ error: error.message });
        if (!data || data.length === 0) return JSON.stringify({ error: 'No deals exist yet. Create a deal first, then add tasks to it.' });

        const match = data.find((r: any) => {
          return (r.property_address || '').toLowerCase().includes(search)
        });
        if (!match) return JSON.stringify({ error: `No deal found matching "${args.deal_search}". Check the address and try again.` });

        const { error: insertError, data: inserted } = await supabase
          .from('tasks')
          .insert({
            deal_id: match.id,
            title: args.title as string,
            due_date: args.due_date as string,
            priority: (args.priority as string) || 'medium',
            category: (args.category as string) || 'Follow-up',
            status: 'pending',
            description: (args.notes as string) || '',
          })
          .select()
          .single();

        if (insertError) return JSON.stringify({ error: insertError.message });
        return JSON.stringify({
          success: true,
          task: inserted,
          dealAddress: match.property_address || match.property_address,
          city: match.city,
          state: match.state,
          deal_id: match.id,
        });
      }

      case 'search_contacts': {
        const query = (args.query as string).toLowerCase();
        const { data: contacts, error: cError } = await supabase
          .from('contacts')
          .select('first_name, last_name, email, phone, contact_type, company');

        const matches: any[] = [];

        if (!cError && contacts) {
          contacts.forEach((c: any) => {
            const fullName = `${c.first_name || ''} ${c.last_name || ''}`.trim().toLowerCase();
            if (fullName.includes(query) || (c.email || '').toLowerCase().includes(query) ||
                (c.company || '').toLowerCase().includes(query) || (c.contact_type || '').toLowerCase().includes(query)) {
              matches.push({ name: `${c.first_name || ''} ${c.last_name || ''}`.trim(), email: c.email, phone: c.phone, role: c.contact_type, company: c.company });
            }
          });
        }


        if (matches.length === 0) {
          return JSON.stringify({ contacts: [], message: `No contacts found matching "${args.query}". Try a different search term or add contacts in your directory.` });
        }
        return JSON.stringify({ contacts: matches, total: matches.length });
      }

      case 'get_deal_summary': {
        const { data, error } = await supabase
          .from('deals')
          .select('status, pipeline_stage, purchase_price, closing_date, state');
        if (error) return JSON.stringify({ error: error.message });
        if (!data || data.length === 0) {
          return JSON.stringify({
            totalDeals: 0,
            totalActive: 0,
            totalValue: 0,
            byStage: {},
            byState: {},
            message: 'No deals in your portfolio yet. Add your first deal to get started!'
          });
        }
        const active = data.filter((d: any) => d.status !== 'closed');
        const totalValue = active.reduce((sum: number, d: any) => sum + (Number(d.purchase_price) || 0), 0);
        const byStage: Record<string, number> = {};
        const byState: Record<string, number> = {};
        active.forEach((d: any) => {
          const stage = d.pipeline_stage || 'unknown';
          byStage[stage] = (byStage[stage] || 0) + 1;
          if (d.state) byState[d.state] = (byState[d.state] || 0) + 1;
        });
        return JSON.stringify({
          totalDeals: data.length,
          totalActive: active.length,
          totalValue,
          byStage,
          byState,
        });
      }

      case 'search_property_emails': {
        const addresses = args.addresses as string[];
        const label = (args.label as string) || addresses.join(' & ');
        // Return marker for frontend to open property email modal
        return JSON.stringify({
          propertyEmailSearch: true,
          addresses,
          label,
          message: `Searching emails for: ${label}`,
        });
      }

      case 'draft_email': {
        const search = (args.deal_search as string).toLowerCase();
        const { data } = await supabase
          .from('deals')
          .select('property_address, city, state, zip, closing_date, purchase_price, status, pipeline_stage');
        if (!data || data.length === 0) return JSON.stringify({ error: 'No deals found. Add a deal first.' });
        const match = data.find((r: any) => {
          return (r.property_address || '').toLowerCase().includes(search)
        });
        if (!match) return JSON.stringify({ error: `No deal found matching "${args.deal_search}"` });

        const recipient = args.recipient_role as string;
        const purpose = args.purpose as string;
        const address = match.property_address;
        const city = match.city;
        const state = match.state;
        const price = match.purchase_price;
        const closingDate = match.closing_date;

        const emailPrompt = `Draft a professional real estate transaction coordinator email.

Deal: ${address}, ${city}, ${state}
Contract Price: $${price ? Number(price).toLocaleString() : 'N/A'}
Closing Date: ${closingDate || 'TBD'}
Status: ${match.status} / ${match.pipeline_stage}

Recipient: ${recipient}
Purpose: ${purpose}

Write a concise, professional email with subject line, body, and sign-off as "TC Command - Transaction Coordinator".

Format:
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
        return JSON.stringify({ dealAddress: address, recipient, purpose, draft: emailDraft });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err: any) {
    console.error(`Tool ${name} error:`, err);
    return JSON.stringify({ error: `Tool execution error: ${err.message}` });
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const openaiKey = process.env.OPENAI_API_KEY;
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!openaiKey || !supabaseUrl || !supabaseKey) {
    console.error('Missing env vars:', { hasOpenAI: !!openaiKey, hasSupabaseUrl: !!supabaseUrl, hasSupabaseKey: !!supabaseKey });
    return res.status(500).json({ error: 'Server configuration error — missing environment variables.' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const fullMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ];

    // Track any navigation actions the AI triggers
    let navigateTo: { type: 'deal'; dealId: string; address: string; city?: string; state?: string } |
                    { type: 'view'; view: string; label: string } | null = null;

    let propertyEmailSearch: { addresses: string[]; label: string } | null = null;

    // Track task tool results for auto-navigation post-processing
    const taskToolResults: string[] = [];

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
    if (data.error) {
      console.error('OpenAI API error:', data.error);
      return res.status(500).json({ error: `AI error: ${data.error.message || 'Unknown error'}` });
    }
    let message = data.choices?.[0]?.message;

    let rounds = 0;
    while (message?.tool_calls && rounds < 3) {
      rounds++;
      fullMessages.push(message);

      for (const toolCall of message.tool_calls) {
        const fnName = toolCall.function.name;
        let fnArgs: Record<string, unknown> = {};
        try { fnArgs = JSON.parse(toolCall.function.arguments || '{}'); } catch (e) { fnArgs = {}; }
        const result = await executeTool(fnName, fnArgs, supabase, openaiKey);

        // Capture explicit navigation actions
        if (fnName === 'navigate_to_deal' || fnName === 'navigate_to_view') {
          try {
            const parsed = JSON.parse(result);
            if (parsed.navigate) {
              if (fnName === 'navigate_to_deal' && parsed.dealId) {
                navigateTo = { type: 'deal', dealId: parsed.dealId, address: parsed.address, city: parsed.city, state: parsed.state };
              } else if (fnName === 'navigate_to_view' && parsed.view) {
                navigateTo = { type: 'view', view: parsed.view, label: parsed.label };
              }
            }
          } catch (e) {}
        }


        // Capture property email search actions
        if (fnName === 'search_property_emails') {
          try {
            const parsed = JSON.parse(result);
            if (parsed.propertyEmailSearch) {
              propertyEmailSearch = { addresses: parsed.addresses, label: parsed.label };
            }
          } catch (e) {}
        }

        // Collect task tool results for auto-navigation
        if (fnName === 'get_tasks_due_today' || fnName === 'get_overdue_tasks') {
          taskToolResults.push(result);
        }

        fullMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: result } as any);
      }

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
      if (data.error) { console.error('OpenAI error round ' + rounds + ':', data.error); break; }
      message = data.choices?.[0]?.message;
    }

    // ── Auto-inject navigation for task queries ──────────────────────────────
    // If AI didn't explicitly navigate but returned tasks, smart-navigate based on context:
    // - All tasks from one deal → show button to open that deal
    // - Tasks from multiple deals → show button to open Transactions view
    if (!navigateTo && taskToolResults.length > 0) {
      try {
        const allTaskItems: any[] = [];
        for (const result of taskToolResults) {
          const parsed = JSON.parse(result);
          const items = parsed.tasks || parsed.overdue || [];
          allTaskItems.push(...items);
        }

        if (allTaskItems.length > 0) {
          const uniqueDealIds = [...new Set(allTaskItems.map((t: any) => t.deal_id).filter(Boolean))] as string[];

          if (uniqueDealIds.length === 1) {
            // All tasks from same deal — look it up and navigate there
            const { data: dealRow } = await supabase
              .from('deals')
              .select('id, property_address, city, state')
              .eq('id', uniqueDealIds[0])
              .single();
            if (dealRow) {
              navigateTo = {
                type: 'deal',
                dealId: dealRow.id,
                address: dealRow.property_address,
                city: dealRow.city,
                state: dealRow.state,
              };
            }
          } else if (uniqueDealIds.length > 1) {
            // Tasks span multiple deals — navigate to Transactions view
            navigateTo = { type: 'view', view: 'transactions', label: 'All Transactions' };
          }
        }
      } catch (e) {
        // Auto-nav failed silently — no button, no crash
      }
    }

    const reply = message?.content || 'I encountered an issue processing your request. Please try again.';

    supabase.from('activity_log').insert({
      action: 'chat_message',
      entity_type: 'ai_chat',
      description: `AI Chat: ${messages[messages.length - 1]?.content?.substring(0, 200)}`,
      metadata: JSON.stringify({ toolsUsed: rounds > 0, rounds, navigated: !!navigateTo }),
    }).then(() => {}).catch(() => {});

    return res.status(200).json({ reply, toolsUsed: rounds > 0, navigateTo, propertyEmailSearch });
  } catch (err: any) {
    console.error('Chat API error:', err);
    return res.status(500).json({ error: 'Failed to process chat request. Please try again.' });
  }
}
