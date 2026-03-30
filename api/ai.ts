import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Module-level Supabase client (avoids multiple GoTrueClient instances)
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// ── OpenAI Responses API with structured outputs ──────────────────────────────
// All AI logic lives here. Browser code calls these endpoints via fetch().
// The openai npm package is NOT used — we call the API directly to avoid
// bundling issues and keep the serverless function lean.

const OPENAI_API = 'https://api.openai.com/v1/chat/completions';

async function callOpenAI(apiKey: string, systemPrompt: string, userContent: string, schema: object, schemaName: string, model = 'gpt-4o') {
  const res = await fetch(OPENAI_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
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

// Shared action item schema used by deal-chat and voice
const actionItemSchema = {
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
};

// Transform flat OpenAI action fields into typed payload objects
function transformActions(actions: any[]): any[] {
  if (!actions) return [];
  return actions.map((a: any) => ({
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
    suggestedActions: { type: 'array', items: actionItemSchema },
    warnings: { type: 'array', items: { type: 'string' } },
  },
  required: ['answer', 'confidence', 'factsUsed', 'suggestedActions', 'warnings'],
};

const searchInterpretationSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    interpretedQuery: {
      type: 'object',
      additionalProperties: false,
      properties: {
        stage: { anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }] },
        closingDateRange: {
          anyOf: [
            {
              type: 'object',
              additionalProperties: false,
              properties: {
                start: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                end: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              },
              required: ['start', 'end'],
            },
            { type: 'null' },
          ],
        },
        missingCompliance: { anyOf: [{ type: 'boolean' }, { type: 'null' }] },
        overdueTasks: { anyOf: [{ type: 'boolean' }, { type: 'null' }] },
        participantRoleMissing: { anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }] },
        dealType: { anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }] },
        staleDaysGreaterThan: { anyOf: [{ type: 'number' }, { type: 'null' }] },
        transactionType: { anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }] },
        textSearch: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        hasAmberAlerts: { anyOf: [{ type: 'boolean' }, { type: 'null' }] },
      },
      required: ['stage', 'closingDateRange', 'missingCompliance', 'overdueTasks', 'participantRoleMissing', 'dealType', 'staleDaysGreaterThan', 'transactionType', 'textSearch', 'hasAmberAlerts'],
    },
    explanation: { type: 'string' },
    assumptions: { type: 'array', items: { type: 'string' } },
    warnings: { type: 'array', items: { type: 'string' } },
  },
  required: ['interpretedQuery', 'explanation', 'assumptions', 'warnings'],
};

const voiceInterpretationSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    transcript: { type: 'string' },
    summary: { type: 'string' },
    suggestedActions: { type: 'array', items: actionItemSchema },
    mentionedEntities: { type: 'array', items: { type: 'string' } },
    detectedDates: { type: 'array', items: { type: 'string' } },
    warnings: { type: 'array', items: { type: 'string' } },
  },
  required: ['transcript', 'summary', 'suggestedActions', 'mentionedEntities', 'detectedDates', 'warnings'],
};

// ── Voice Recording Analysis Schema (Phase 5C) ───────────────────────────────

const voiceRecordingAnalysisSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    callerIntent: {
      type: 'string',
      enum: ['deal_update', 'question', 'complaint', 'callback_request', 'document_request', 'general_inquiry', 'unknown'],
    },
    mentionedEntities: { type: 'array', items: { type: 'string' } },
    mentionedDates: { type: 'array', items: { type: 'string' } },
    mentionedAddresses: { type: 'array', items: { type: 'string' } },
    sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative', 'urgent'] },
    containsChangeRequest: { type: 'boolean' },
    changeRequestDetails: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    suggestedFollowUp: { type: 'string' },
    priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
    keyPoints: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'callerIntent', 'mentionedEntities', 'mentionedDates', 'mentionedAddresses', 'sentiment', 'containsChangeRequest', 'changeRequestDetails', 'suggestedFollowUp', 'priority', 'keyPoints'],
};

const voiceAnalysisSystemPrompt = `You are analyzing a voice recording transcript from a caller to a real estate transaction coordination service (My ReDeal).

Your job:
1. Summarize what the caller said in 1-2 sentences.
2. Determine the caller's intent (deal update, question, complaint, etc.)
3. Extract any mentioned people, companies, dates, or property addresses.
4. Assess sentiment and urgency.
5. If the caller is requesting a change to their deal (closing date change, price change, etc.), set containsChangeRequest=true and describe the change.
6. Suggest what the team should do next (suggestedFollowUp).
7. Set priority based on urgency and content.
8. Extract key points as bullet items.

Rules:
- Dates should be in MM/DD/YYYY format when possible.
- Be concise and factual.
- If the transcript is garbled or unclear, note that in the summary.
- Do not invent information not in the transcript.`;

// ── Deal Health AI Schema ─────────────────────────────────────────────────────

const dealHealthAISchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    riskSummary: { type: 'string' },
    recommendations: { type: 'array', items: { type: 'string' } },
    nextMilestone: { type: 'string' },
    estimatedDaysToClose: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    topRisk: { type: 'string' },
    overallAssessment: { type: 'string', enum: ['on-track', 'needs-attention', 'at-risk', 'critical'] },
  },
  required: ['riskSummary', 'recommendations', 'nextMilestone', 'estimatedDaysToClose', 'topRisk', 'overallAssessment'],
};

// ── Timeline Schema (Tier 2) ─────────────────────────────────────────────────

const timelineSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          date: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          category: { type: 'string', enum: ['contract', 'inspection', 'appraisal', 'title', 'lender', 'closing', 'compliance', 'task', 'communication', 'milestone'] },
          importance: { type: 'string', enum: ['high', 'medium', 'low'] },
          source: { type: 'string' },
        },
        required: ['date', 'title', 'description', 'category', 'importance', 'source'],
      },
    },
    summary: { type: 'string' },
    nextKeyDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    nextKeyDateLabel: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
  required: ['events', 'summary', 'nextKeyDate', 'nextKeyDateLabel'],
};

// ── Follow-Up Schema (Tier 2) ────────────────────────────────────────────────

const followUpSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    subject: { type: 'string' },
    body: { type: 'string' },
    toRole: { type: 'string' },
    urgency: { type: 'string', enum: ['routine', 'important', 'urgent'] },
    notes: { type: 'string' },
  },
  required: ['subject', 'body', 'toRole', 'urgency', 'notes'],
};

// ── Guided Review Schema (Tier 2 - Feature #8) ──────────────────────────────

const guidedReviewSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          field: { type: 'string' },
          issue: { type: 'string' },
          suggestion: { type: 'string' },
          severity: { type: 'string', enum: ['info', 'warning', 'error'] },
        },
        required: ['field', 'issue', 'suggestion', 'severity'],
      },
    },
    summary: { type: 'string' },
    readyToCreate: { type: 'boolean' },
  },
  required: ['suggestions', 'summary', 'readyToCreate'],
};

// ── Smart Checklist Suggestions Schema (Tier 2 - Feature #10) ────────────────

const suggestChecklistSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    dueDiligenceItems: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          reason: { type: 'string' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['title', 'reason', 'priority'],
      },
    },
    complianceItems: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          reason: { type: 'string' },
          required: { type: 'boolean' },
        },
        required: ['title', 'reason', 'required'],
      },
    },
    explanation: { type: 'string' },
  },
  required: ['dueDiligenceItems', 'complianceItems', 'explanation'],
};



// ── Extract Deal Schema (Deal Wizard AI Upload) ──────────────────────────────

const extractDealSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    address: { type: 'string' },
    city: { type: 'string' },
    state: { type: 'string' },
    zipCode: { type: 'string' },
    listPrice: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    contractPrice: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    mlsNumber: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    contractDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    closingDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    inspectionDeadline: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    loanCommitmentDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    possessionDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    earnestMoney: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    earnestMoneyDueDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    sellerConcessions: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    commission: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    loanType: { anyOf: [{ type: 'string', enum: ['conventional', 'fha', 'va', 'usda', 'cash', 'other'] }, { type: 'null' }] },
    loanAmount: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    downPaymentAmount: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    downPaymentPercent: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    sellerCredit: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    buyerAgentCommission: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    listingAgentCommission: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    buyerNames: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    sellerNames: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    titleCompany: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    loanOfficer: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    transactionType: { type: 'string', enum: ['buyer', 'seller'] },
    propertyType: { type: 'string', enum: ['single-family', 'multi-family', 'duplex', 'condo', 'townhouse', 'land', 'commercial'] },
    asIsSale: { type: 'boolean' },
    inspectionWaived: { type: 'boolean' },
    homeWarranty: { type: 'boolean' },
    homeWarrantyCompany: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    legalDescription: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    confidence: { type: 'number' },
    extractedFields: { type: 'array', items: { type: 'string' } },
  },
  required: ['address', 'city', 'state', 'zipCode', 'listPrice', 'contractPrice', 'mlsNumber',
    'contractDate', 'closingDate', 'inspectionDeadline', 'loanCommitmentDate', 'possessionDate',
    'earnestMoney', 'earnestMoneyDueDate', 'sellerConcessions', 'commission', 'loanType', 'loanAmount',
    'downPaymentAmount', 'downPaymentPercent', 'sellerCredit', 'buyerAgentCommission', 'listingAgentCommission',
    'buyerNames', 'sellerNames', 'titleCompany', 'loanOfficer',
    'transactionType', 'propertyType', 'asIsSale', 'inspectionWaived', 'homeWarranty',
    'homeWarrantyCompany', 'legalDescription', 'confidence', 'extractedFields'],
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
  parsed.suggestedActions = transformActions(parsed.suggestedActions);

  return parsed;
}



async function handleInterpretSearch(apiKey: string, body: any) {
  const { query } = body;
  if (!query) throw new Error('Missing query');

  const systemPrompt = `You are a search query interpreter for a real estate transaction coordinator app.
Convert the user's plain-English query into structured search filters.

AVAILABLE FIELDS:
- stage: array of deal stages. Valid values: "contract", "due-diligence", "clear-to-close", "closed", "terminated"
- closingDateRange: { start: "YYYY-MM-DD" | null, end: "YYYY-MM-DD" | null }
- missingCompliance: true if user asks about missing/incomplete compliance items
- overdueTasks: true if user asks about overdue/late tasks
- participantRoleMissing: array of missing roles. Valid: "lender", "title", "attorney", "inspector", "agent", "buyer", "seller"
- dealType: array of property types. Valid: "single-family", "multi-family", "condo", "townhouse", "land", "commercial"
- staleDaysGreaterThan: number of days with no activity
- transactionType: array of "buyer" or "seller"
- textSearch: free text to match against address, agent name, or MLS number
- hasAmberAlerts: true if user asks about pending alerts/document requests

RULES:
- Set fields to null if not mentioned in the query
- Be conservative — only set filters the user clearly intended
- "this week" means next 7 days from today
- "this month" means the current calendar month
- "stale" or "no activity" → staleDaysGreaterThan
- "problem files" or "at risk" → missingCompliance=true AND/OR overdueTasks=true
- If the query is just a name or address, use textSearch
- Include assumptions about ambiguous terms
- Include warnings if the query is vague

Today's date: ${new Date().toISOString().split('T')[0]}`;

  return callOpenAI(apiKey, systemPrompt, `Search query: "${query}"`, searchInterpretationSchema, 'search_interpretation');
}


async function handleInterpretVoiceUpdate(apiKey: string, body: any) {
  const { transcript, dealContext } = body;
  if (!transcript) throw new Error('Missing transcript');

  const systemPrompt = `You are a voice update interpreter for a real estate transaction coordinator (TC).
The TC has just spoken a quick update about a deal. Your job is to extract structured information from the transcript.

RULES:
- Extract all mentioned tasks, notes, timeline updates, and compliance flags.
- Detect any dates mentioned (inspection dates, closing dates, deadlines, etc.) and return them in detectedDates as YYYY-MM-DD when possible.
- Identify mentioned people, companies, or roles in mentionedEntities.
- For create_task: fill title, description, dueDate (or null), priority, targetRole (who should do it)
- For add_note: fill title=note summary, description=full note, priority="none", targetRole=""
- For draft_email: fill title=subject, description=email body, targetRole=recipient role
- For flag_compliance_issue: fill title=issue label, description=details, priority=severity (watch/fail)
- For suggest_stage_update: fill title=new stage, description=rationale, targetRole=""
- confidence should be 0.0-1.0 reflecting how sure you are about each action
- Only create actions that are clearly implied by the transcript — do not invent tasks
- Return the original transcript cleaned up (minor grammar fixes OK, keep meaning exact)
- Summary should be 1-2 sentences max
- If the transcript is unclear or too short, add a warning

Today's date: ${new Date().toISOString().split('T')[0]}`;

  const userContent = `DEAL CONTEXT:\n${JSON.stringify(dealContext, null, 1)}\n\nVOICE TRANSCRIPT:\n"${transcript}"`;

  const result = await callOpenAI(apiKey, systemPrompt, userContent, voiceInterpretationSchema, 'voice_interpretation');

  // Convert flat action fields into typed payload objects
  result.suggestedActions = transformActions(result.suggestedActions);

  return result;
}


// ── Process Recording Handler (Phase 5C) ─────────────────────────────────────

async function handleProcessRecording(apiKey: string, body: any) {
  const { recordingSid, recordingUrl, callerContactId, dealId, phoneE164, callSid } = body;
  if (!recordingSid || !recordingUrl) throw new Error('Missing recordingSid or recordingUrl');

  const sb = supabase;

  // 1. Fetch recording MP3 from Twilio (authenticated)
  const audioUrl = `${recordingUrl}.mp3`;
  const audioResp = await fetch(audioUrl, {
    headers: {
      Authorization: 'Basic ' + Buffer.from(
        `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
      ).toString('base64'),
    },
  });

  if (!audioResp.ok) {
    throw new Error(`Failed to fetch recording: ${audioResp.status} ${audioResp.statusText}`);
  }

  const audioBuffer = await audioResp.arrayBuffer();

  // 2. Transcribe with Whisper API
  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'recording.mp3');
  formData.append('model', 'whisper-1');
  formData.append('language', 'en');
  formData.append('response_format', 'text');

  const whisperResp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!whisperResp.ok) {
    throw new Error(`Whisper API error: ${whisperResp.status} ${whisperResp.statusText}`);
  }

  const transcript = (await whisperResp.text()).trim();

  // 3. Analyze transcript with GPT-4o-mini
  const analysisResp = await fetch(OPENAI_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: voiceAnalysisSystemPrompt },
        { role: 'user', content: `TRANSCRIPT: "${transcript}"` },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'voice_recording_analysis', strict: true, schema: voiceRecordingAnalysisSchema },
      },
    }),
  });

  const analysisData = await analysisResp.json();
  if (analysisData.error) throw new Error(analysisData.error.message || 'OpenAI analysis error');
  const analysis = JSON.parse(analysisData.choices[0].message.content);

  // 4. Save to voice_deal_updates table
  const { data: voiceUpdate, error: insertErr } = await sb
    .from('voice_deal_updates')
    .insert({
      deal_id: dealId || null,
      contact_id: callerContactId || null,
      recording_sid: recordingSid,
      recording_url: recordingUrl,
      transcript,
      ai_analysis: analysis,
      caller_intent: analysis.callerIntent,
      sentiment: analysis.sentiment,
      priority: analysis.priority,
      phone_e164: phoneE164 || null,
      call_sid: callSid || null,
      status: 'pending_review',
    })
    .select()
    .single();

  if (insertErr) {
    console.error('voice_deal_updates insert error:', insertErr);
  }

  // 5. Create communication event
  await sb.from('communication_events').insert({
    contact_id: callerContactId || null,
    deal_id: dealId || null,
    channel: 'voice',
    direction: 'inbound',
    event_type: 'voice_recording_processed',
    summary: analysis.summary,
    source_ref: callSid || recordingSid,
    metadata: {
      recordingSid,
      transcript: transcript.substring(0, 500),
      callerIntent: analysis.callerIntent,
      sentiment: analysis.sentiment,
      priority: analysis.priority,
    },
  });

  // 6. If contains change request, create one
  if (analysis.containsChangeRequest && analysis.changeRequestDetails) {
    await sb.from('change_requests').insert({
      deal_id: dealId || null,
      contact_id: callerContactId || null,
      source: 'voice_recording',
      source_ref: recordingSid,
      description: analysis.changeRequestDetails,
      priority: analysis.priority,
      status: 'open',
    });
  }

  return {
    transcript,
    analysis,
    voiceDealUpdateId: voiceUpdate?.id || null,
  };
}


// ── Deal Health AI Handler ────────────────────────────────────────────────────

async function handleDealHealthAI(apiKey: string, body: any) {
  const { deal } = body;
  if (!deal) throw new Error('Missing deal data');

  const systemPrompt = `You are analyzing a real estate transaction file's health for a transaction coordinator. Be concise, specific, and actionable. Base all analysis on the provided deal data — never invent facts.

Today's date: ${new Date().toISOString().split('T')[0]}`;

  const dealSnapshot = {
    id: deal.id,
    propertyAddress: deal.propertyAddress || deal.property_address,
    stage: deal.stage || deal.pipeline_stage,
    closingDate: deal.closingDate || deal.closing_date,
    contractPrice: deal.contractPrice || deal.contract_price,
    transactionType: deal.transactionType || deal.transaction_type,
    agentName: deal.agentName || deal.agent_name,
    mlsNumber: deal.mlsNumber || deal.mls_number,
    complianceItems: deal.complianceItems || deal.compliance_items || [],
    dueDiligenceItems: deal.dueDiligenceItems || deal.due_diligence_items || [],
    tasks: deal.tasks || [],
    lastActivityAt: deal.lastActivityAt || deal.last_activity_at || deal.updated_at,
    participants: deal.participants || [],
    staleWarnings: deal.staleWarnings || [],
    missingItems: deal.missingItems || [],
    overdueTasks: deal.overdueTasks || [],
  };

  const userContent = `DEAL DATA:\n${JSON.stringify(dealSnapshot, null, 2)}`;

  return callOpenAI(apiKey, systemPrompt, userContent, dealHealthAISchema, 'deal_health_ai_response', 'gpt-4o-mini');
}


// ── Build Timeline Handler (Tier 2) ──────────────────────────────────────────

async function handleBuildTimeline(apiKey: string, body: any) {
  const { deal } = body;
  if (!deal) throw new Error('Missing deal data');

  const systemPrompt = `You are building a chronological timeline of key events for a real estate transaction. Analyze the provided deal data (tasks, activity log, checklists, emails) and produce a clean timeline of important events.

Rules:
- Return events sorted by date ascending (oldest first).
- Use MM/DD/YYYY date format for all dates.
- Be factual — only include events supported by the data.
- Assign appropriate categories and importance levels.
- Source should indicate where the data came from (e.g., "activity log", "task", "checklist", "contract data").
- Include a 1-2 sentence summary of the deal's timeline.
- If there's an upcoming key date (closing, inspection deadline, etc.), populate nextKeyDate and nextKeyDateLabel.

Today's date: ${new Date().toISOString().split('T')[0]}`;

  const dealContext = {
    id: deal.id,
    propertyAddress: deal.propertyAddress,
    stage: deal.stage,
    milestone: deal.milestone,
    closingDate: deal.closingDate,
    contractDate: deal.contractDate,
    contractPrice: deal.contractPrice,
    transactionType: deal.transactionType,
    agentName: deal.agentName,
    tasks: (deal.tasks || []).slice(0, 30),
    activityLog: (deal.activityLog || []).slice(0, 40),
    complianceItems: deal.complianceItems || [],
    dueDiligenceItems: deal.dueDiligenceItems || [],
    checklists: deal.checklists || [],
    reminders: deal.reminders || [],
    documentRequests: deal.documentRequests || [],
  };

  const userContent = `DEAL DATA:\n${JSON.stringify(dealContext, null, 2)}`;

  return callOpenAI(apiKey, systemPrompt, userContent, timelineSchema, 'deal_timeline', 'gpt-4o-mini');
}


// ── Generate Follow-Up Handler (Tier 2) ──────────────────────────────────────

async function handleGenerateFollowUp(apiKey: string, body: any) {
  const { deal, followUpType, customPrompt } = body;
  if (!deal) throw new Error('Missing deal data');
  if (!followUpType) throw new Error('Missing followUpType');

  const systemPrompt = `You are drafting a professional follow-up email for a real estate transaction coordinator. Based on the deal context and the requested follow-up type, generate a ready-to-send email. Be professional, concise, and specific to this deal. Include relevant deal details (address, dates, names) in the email.

Rules:
- Use MM/DD/YYYY date format for all dates in the email body.
- The body should be the full email text (greeting through sign-off).
- toRole should describe who the email is addressed to (e.g., "Lender", "Title Company", "Listing Agent").
- Set urgency based on how time-sensitive the follow-up is.
- notes should contain any tips or context for the TC about this email.

Today's date: ${new Date().toISOString().split('T')[0]}`;

  const dealContext = {
    propertyAddress: deal.propertyAddress,
    city: deal.city,
    state: deal.state,
    zipCode: deal.zipCode,
    mlsNumber: deal.mlsNumber,
    closingDate: deal.closingDate,
    contractDate: deal.contractDate,
    contractPrice: deal.contractPrice,
    stage: deal.stage,
    milestone: deal.milestone,
    transactionType: deal.transactionType,
    agentName: deal.agentName,
    buyerAgent: deal.buyerAgent,
    sellerAgent: deal.sellerAgent,
    tasks: (deal.tasks || []).filter((t: any) => !t.completedAt).slice(0, 10),
    complianceItems: deal.complianceItems || [],
    documentRequests: deal.documentRequests || [],
  };

  const userContent = `DEAL CONTEXT:\n${JSON.stringify(dealContext, null, 2)}\n\nFOLLOW-UP TYPE: ${followUpType}\n${customPrompt ? `CUSTOM INSTRUCTIONS: ${customPrompt}` : ''}`;

  return callOpenAI(apiKey, systemPrompt, userContent, followUpSchema, 'follow_up_draft', 'gpt-4o-mini');
}


// ── Guided Review Handler (Tier 2 - Feature #8) ─────────────────────────────

async function handleGuidedReview(apiKey: string, body: any) {
  const { dealData } = body;
  if (!dealData) throw new Error('Missing dealData');

  const systemPrompt = `You are a transaction coordinator assistant reviewing new deal data before creation. Check for:
- Missing required fields (address, city, agent name, closing date)
- Unusual pricing (contract price > list price by large margin, or very low values)
- State code validation (flag as info if state seems unusual for the deal context)
- Dates that are in the past (contract date in far past, closing date already passed)
- Closing date before contract date
- Missing MLS number (info level)
- Missing list price or contract price (info level)
- Property type considerations (multi-family needs addendum, condo needs HOA docs)

Return actionable suggestions. Be helpful, not alarming. Use MM/DD/YYYY date format.

Today's date: ${new Date().toISOString().split('T')[0]}`;

  const userContent = `NEW DEAL DATA:
${JSON.stringify(dealData, null, 2)}`;

  return callOpenAI(apiKey, systemPrompt, userContent, guidedReviewSchema, 'guided_review', 'gpt-4o-mini');
}


// ── Smart Checklist Suggestions Handler (Tier 2 - Feature #10) ───────────────

async function handleSuggestChecklist(apiKey: string, body: any) {
  const { deal, existingDDTitles, existingCompTitles } = body;
  if (!deal) throw new Error('Missing deal data');

  const systemPrompt = `You are a real estate transaction coordinator expert. Based on the deal type and characteristics, suggest additional due diligence and compliance checklist items.

Focus on state-specific requirements for the deal's jurisdiction and include general best practices. Consider:
- Property type: condo needs HOA items (docs, dues, restrictions, master insurance), multi-family needs rent rolls, lease reviews, unit inspections
- Transaction side: buyer side needs inspection, appraisal, lender items; seller side needs disclosure, title, staging items
- Financing type: financed deals need lender requirements (appraisal, loan commitment, clear to close from lender); cash deals skip lender items
- Price range: higher-priced properties may need additional insurance reviews
- Contract to closing timeline: tight timelines need expedited items flagged
- Home warranty: ALWAYS include home warranty verification as a critical item — confirm ordered, coverage scope, cost allocation, and warranty company contact info. This is a MUST-HAVE before closing.

IMPORTANT: Only suggest items NOT already in the deal's checklists. The existing items are provided below.
Return practical, actionable items with clear reasons. Limit to 5-8 suggestions total across both categories.

Today's date: ${new Date().toISOString().split('T')[0]}`;

  const userContent = `DEAL CHARACTERISTICS:
${JSON.stringify(deal, null, 2)}

EXISTING DUE DILIGENCE ITEMS:
${JSON.stringify(existingDDTitles || [], null, 2)}

EXISTING COMPLIANCE ITEMS:
${JSON.stringify(existingCompTitles || [], null, 2)}`;

  return callOpenAI(apiKey, systemPrompt, userContent, suggestChecklistSchema, 'suggest_checklist', 'gpt-4o-mini');
}




// ── Extract Deal Handler (Deal Wizard AI Upload) ─────────────────────────────

async function handleExtractDeal(apiKey: string, body: any) {
  const { fileBase64, fileName } = body;
  if (!fileBase64) throw new Error('Missing fileBase64');

  const systemPrompt = `You are extracting real estate transaction data from a purchase agreement or contract document.

Extract all available fields. For dates, return YYYY-MM-DD format. For prices/amounts, return numeric strings without formatting (e.g., "550000" not "$550,000"). For state, return the 2-letter abbreviation.

For transactionType: if this is a buyer's purchase offer/agreement, return "buyer". If listing/seller-side document, return "seller". Default to "buyer".
For buyerAgentCommission and listingAgentCommission: extract each agent's commission as written on the contract. If shown as a percentage (e.g. "3%"), return the string "3%". If shown as a dollar amount (e.g. "$4,950"), return the numeric string "4950". If both are stated, return the percentage (e.g. "3%"). Return null if not found.
For downPaymentPercent: extract the down payment percentage if explicitly stated (e.g. "5%", "20%"). Return the string including the % sign. Return null if only the dollar amount is stated.
For sellerCredit: extract any explicit seller credit or seller contribution toward buyer closing costs as a numeric string without formatting (e.g. "5000" not "$5,000"). Return null if not found.
For propertyType: infer from property description. Default to "single-family".
Return null for any field not found in the document.
Set confidence 0.0-1.0 based on how clearly the document is a real estate purchase agreement.
Set extractedFields to an array of field names that had non-null values found.`;

  const res = await fetch(OPENAI_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            {
              type: 'file',
              file: {
                filename: fileName || 'contract.pdf',
                file_data: `data:application/pdf;base64,${fileBase64}`,
              },
            },
            { type: 'text', text: 'Extract all real estate transaction details from this document.' },
          ],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'extract_deal', strict: true, schema: extractDealSchema },
      },
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'OpenAI API error');
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('No content in OpenAI response');
  return JSON.parse(content);
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
      case 'interpret-search':
        result = await handleInterpretSearch(apiKey, req.body);
        break;
      case 'interpret-voice-update':
        result = await handleInterpretVoiceUpdate(apiKey, req.body);
        break;
      case 'process-recording':
        result = await handleProcessRecording(apiKey, req.body);
        break;
      case 'deal-health-ai':
        result = await handleDealHealthAI(apiKey, req.body);
        break;
      case 'build-timeline':
        result = await handleBuildTimeline(apiKey, req.body);
        break;
      case 'generate-followup':
        result = await handleGenerateFollowUp(apiKey, req.body);
        break;
      case 'guided-review':
        result = await handleGuidedReview(apiKey, req.body);
        break;
      case 'suggest-checklist':
        result = await handleSuggestChecklist(apiKey, req.body);
        break;
      case 'extract-deal':
        result = await handleExtractDeal(apiKey, req.body);
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
