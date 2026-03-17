import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── OpenAI Responses API with structured outputs ──────────────────────────────
// All AI logic lives here. Browser code calls these endpoints via fetch().
// The openai npm package is NOT used — we call the API directly to avoid
// bundling issues and keep the serverless function lean.

const OPENAI_API = 'https://api.openai.com/v1/chat/completions';

async function callOpenAI(apiKey: string, systemPrompt: string, userContent: string, schema: object, schemaName: string) {
  const res = await fetch(OPENAI_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: schemaName,
          strict: true,
          schema,
        },
      },
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'OpenAI API error');
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('No content in OpenAI response');
  return JSON.parse(content);
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const classificationSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    shouldAttach: { type: 'boolean' },
    confidence: { type: 'number' },
    reason: { type: 'string' },
    category: {
      type: 'string',
      enum: ['contract', 'inspection', 'appraisal', 'title', 'lender', 'closing', 'compliance', 'general', 'unrelated'],
    },
    extractedSignals: { type: 'array', items: { type: 'string' } },
  },
  required: ['shouldAttach', 'confidence', 'reason', 'category', 'extractedSignals'],
};

const summarySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    keyUpdates: { type: 'array', items: { type: 'string' } },
    actionItems: { type: 'array', items: { type: 'string' } },
    riskFlags: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'keyUpdates', 'actionItems', 'riskFlags'],
};

const tasksSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          dueDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          suggestedOwnerRole: { type: 'string', enum: ['agent', 'tc', 'admin', 'lender', 'title', 'compliance'] },
        },
        required: ['title', 'description', 'dueDate', 'priority', 'suggestedOwnerRole'],
      },
    },
  },
  required: ['tasks'],
};

const complianceSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['pass', 'watch', 'fail'] },
    missingItems: { type: 'array', items: { type: 'string' } },
    inconsistentItems: { type: 'array', items: { type: 'string' } },
    notes: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['status', 'missingItems', 'inconsistentItems', 'notes', 'summary'],
};

const dealChatSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    answer: { type: 'string' },
    confidence: { type: 'number' },
    factsUsed: { type: 'array', items: { type: 'string' } },
    suggestedActions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: {
            type: 'string',
            enum: ['create_task', 'add_note', 'draft_email', 'flag_compliance_issue', 'suggest_stage_update'],
          },
          title: { type: 'string' },
          description: { type: 'string' },
          dueDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'watch', 'fail', 'none'] },
          targetRole: { type: 'string' },
          confidence: { type: 'number' },
          rationale: { type: 'string' },
        },
        required: ['type', 'title', 'description', 'dueDate', 'priority', 'targetRole', 'confidence', 'rationale'],
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
  },
  required: ['answer', 'confidence', 'factsUsed', 'suggestedActions', 'warnings'],
};

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleClassifyEmail(apiKey: string, body: any) {
  const { email, deal, deterministicScore, deterministicSignals } = body;
  if (!email || !deal) throw new Error('Missing email or deal');

  const systemPrompt = `You are classifying whether an email belongs to a specific real estate transaction file.
Be conservative. If unclear, return shouldAttach=false. Prefer precision over recall.
Only attach when the email clearly belongs to this file.`;

  const userContent = `DEAL
propertyAddress: ${deal.propertyAddress}
addressVariants: ${JSON.stringify(deal.addressVariants || [])}
mlsNumber: ${deal.mlsNumber || ''}
clientNames: ${JSON.stringify(deal.clientNames || [])}
participantEmails: ${JSON.stringify(deal.participantEmails || [])}
linkedThreadIds: ${JSON.stringify(deal.linkedThreadIds || [])}

EMAIL
threadId: ${email.threadId}
subject: ${email.subject}
from: ${email.from}
to: ${JSON.stringify(email.to || [])}
cc: ${JSON.stringify(email.cc || [])}
receivedAt: ${email.receivedAt}
attachmentNames: ${JSON.stringify(email.attachmentNames || [])}
snippet: ${email.snippet || ''}
bodyText: ${(email.bodyText || '').slice(0, 8000)}

RULE SIGNALS
deterministicScore: ${deterministicScore}
deterministicSignals: ${JSON.stringify(deterministicSignals)}

Return whether this email should be attached to the deal, your confidence (0-1), the reason, the transaction category, and extracted signals.`;

  const result = await callOpenAI(apiKey, systemPrompt, userContent, classificationSchema, 'email_classification');

  // Safety rails: if AI says attach but confidence < 0.7, downgrade
  if (!result.shouldAttach || result.confidence < 0.7) {
    return { ...result, shouldAttach: false, category: 'unrelated' };
  }
  return result;
}

async function handleSummarizeThread(apiKey: string, body: any) {
  const { thread } = body;
  if (!thread || !thread.emails) throw new Error('Missing thread data');

  const systemPrompt = `You are summarizing a real estate transaction email thread for a transaction coordinator.
Return a short summary, key updates, action items, and risk flags.
Be concrete. Do not invent facts. If the thread is vague, say so.`;

  const content = thread.emails.slice(0, 8).map((e: any, i: number) => `
EMAIL ${i + 1}
from: ${e.from}
subject: ${e.subject}
receivedAt: ${e.receivedAt}
snippet: ${e.snippet || ''}
bodyText: ${(e.bodyText || '').slice(0, 4000)}
attachments: ${JSON.stringify(e.attachmentNames || [])}`).join('\n');

  return callOpenAI(apiKey, systemPrompt, `THREAD CONTENT\n${content}`, summarySchema, 'thread_summary');
}

async function handleExtractTasks(apiKey: string, body: any) {
  const { email } = body;
  if (!email) throw new Error('Missing email');

  const systemPrompt = `You are extracting operational tasks from a real estate transaction email.
Rules:
- Only return real, actionable tasks.
- Do not create tasks for pure FYI messages unless follow-up is clearly needed.
- dueDate can be null if not stated.
- suggestedOwnerRole should be the best-fit team role.`;

  const userContent = `EMAIL
from: ${email.from}
subject: ${email.subject}
receivedAt: ${email.receivedAt}
snippet: ${email.snippet || ''}
bodyText: ${(email.bodyText || '').slice(0, 8000)}
attachments: ${JSON.stringify(email.attachmentNames || [])}`;

  const result = await callOpenAI(apiKey, systemPrompt, userContent, tasksSchema, 'suggested_tasks');
  return result.tasks || [];
}

async function handleCompliancePrecheck(apiKey: string, body: any) {
  const { deal, relatedThreads } = body;
  if (!deal) throw new Error('Missing deal');

  const systemPrompt = `You are doing a pre-check on a real estate transaction file before human compliance review.
Your job: flag likely missing items, flag likely inconsistencies.
Do NOT invent legal requirements. Base your output only on the provided file data and thread summaries.
Be conservative and practical.`;

  const dealSnapshot = {
    id: deal.id,
    propertyAddress: deal.propertyAddress,
    stage: deal.stage,
    closingDate: deal.closingDate,
    complianceItems: deal.complianceItems || [],
    dueDiligenceItems: deal.dueDiligenceItems || [],
    tasks: deal.tasks || [],
  };

  const threadSummaries = (relatedThreads || []).slice(0, 5).map((t: any) => ({
    threadId: t.threadId,
    latestSubject: t.latest?.subject,
    latestFrom: t.latest?.from,
    latestAt: t.latest?.receivedAt,
    latestSnippet: t.latest?.snippet || '',
  }));

  const userContent = `DEAL SNAPSHOT
${JSON.stringify(dealSnapshot, null, 2)}

RELATED THREAD SUMMARIES
${JSON.stringify(threadSummaries, null, 2)}`;

  return callOpenAI(apiKey, systemPrompt, userContent, complianceSchema, 'compliance_precheck');
}

async function handleDealChat(apiKey: string, body: any) {
  const { question, context, history } = body;
  if (!question || !context) throw new Error('Missing question or context');

  const systemPrompt = `You are a deal assistant for a real estate transaction coordinator (TC).
You answer questions about ONE specific transaction file based on the provided context.

RULES:
- Only answer from the provided deal context. Do not invent facts.
- Be concise and practical. TCs are busy.
- If you see missing items, overdue tasks, or risks, proactively mention them.
- When suggesting actions, only suggest what's clearly useful based on the context.
- For create_task: fill title, description, dueDate (or null), priority, targetRole (who should do it)
- For add_note: fill title=note summary, description=full note, priority="none", targetRole=""
- For draft_email: fill title=subject, description=email body, targetRole=recipient role
- For flag_compliance_issue: fill title=issue label, description=details, priority=severity (watch/fail)
- For suggest_stage_update: fill title=new stage, description=rationale, targetRole=""
- confidence should be 0.0-1.0 reflecting how sure you are
- factsUsed should cite specific data points from the context

Today's date: ${new Date().toISOString().split('T')[0]}`;

  const contextStr = JSON.stringify(context, null, 1);

  // Build conversation with context in first message
  const messages: Array<{role: string; content: string}> = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `DEAL CONTEXT:\n${contextStr}` },
    { role: 'assistant', content: 'I have the deal context loaded. What would you like to know?' },
  ];

  // Add conversation history (last 6 turns max to save tokens)
  if (history && Array.isArray(history)) {
    for (const msg of history.slice(-6)) {
      messages.push({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content });
    }
  }

  // Add current question
  messages.push({ role: 'user', content: question });

  const res = await fetch(OPENAI_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature: 0.2,
      messages,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'deal_chat_response',
          strict: true,
          schema: dealChatSchema,
        },
      },
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'OpenAI API error');
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('No content in OpenAI response');

  const parsed = JSON.parse(content);

  // Convert flat action fields into typed payload objects for the client
  if (parsed.suggestedActions) {
    parsed.suggestedActions = parsed.suggestedActions.map((a: any) => ({
      type: a.type,
      payload: {
        title: a.title,
        description: a.description,
        dueDate: a.dueDate,
        priority: a.priority,
        targetRole: a.targetRole,
      },
      confidence: a.confidence,
      rationale: a.rationale,
    }));
  }

  return parsed;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });

  // Route based on action query param or request body
  const action = (req.query.action as string) || req.body?.action;
  if (!action) return res.status(400).json({ error: 'Missing action parameter' });

  try {
    let result: any;
    switch (action) {
      case 'classify-email':
        result = await handleClassifyEmail(apiKey, req.body);
        break;
      case 'summarize-thread':
        result = await handleSummarizeThread(apiKey, req.body);
        break;
      case 'extract-tasks':
        result = await handleExtractTasks(apiKey, req.body);
        break;
      case 'compliance-precheck':
        result = await handleCompliancePrecheck(apiKey, req.body);
        break;
      case 'deal-chat':
        result = await handleDealChat(apiKey, req.body);
        break;
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
    return res.status(200).json(result);
  } catch (err: any) {
    console.error(`AI ${action} error:`, err);
    return res.status(500).json({ error: err.message || 'AI processing failed' });
  }
}
