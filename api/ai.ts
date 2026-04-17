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
    // ── Property ─────────────────────────────────────────────────────────────
    address: { type: 'string' },
    city: { type: 'string' },
    state: { type: 'string' },
    zipCode: { type: 'string' },
    propertyType: { type: 'string', enum: ['single-family', 'multi-family', 'duplex', 'condo', 'townhouse', 'land', 'commercial'] },
    mlsNumber: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    mlsBoard: { anyOf: [{ type: 'string' }, { type: 'null' }] },         // primary (replaces mlsBoardName)
    mlsBoardName: { anyOf: [{ type: 'string' }, { type: 'null' }] },    // kept for backward compat — same value as mlsBoard
    legalDescription: { anyOf: [{ type: 'string' }, { type: 'null' }] },

    // ── Transaction ───────────────────────────────────────────────────────────
    transactionType: { type: 'string', enum: ['buyer', 'seller'] },
    listPrice: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    contractPrice: { anyOf: [{ type: 'string' }, { type: 'null' }] },   // primary (replaces purchasePrice)
    purchasePrice: { anyOf: [{ type: 'string' }, { type: 'null' }] },   // kept for backward compat — same value as contractPrice
    earnestMoney: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    earnestMoneyHolder: { anyOf: [{ type: 'string' }, { type: 'null' }] }, // who holds the EM (same as emHeldWith)
    emHeldWith: { anyOf: [{ type: 'string' }, { type: 'null' }] },      // kept for backward compat — same as earnestMoneyHolder
    additionalEarnestMoney: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    sellerCredit: { anyOf: [{ type: 'string' }, { type: 'null' }] },    // primary (replaces sellerConcessions)
    sellerConcessions: { anyOf: [{ type: 'string' }, { type: 'null' }] }, // kept for backward compat — same value as sellerCredit
    sellerPaidClosingCosts: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    repairsNotToExceed: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    downPaymentAmount: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    downPaymentPercent: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    commissionReceived: { anyOf: [{ type: 'string' }, { type: 'null' }] }, // primary (replaces commissionAmount)
    commissionAmount: { anyOf: [{ type: 'string' }, { type: 'null' }] },  // kept for backward compat — same as commissionReceived
    buyerAgentCommission: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    listingAgentCommission: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    buyerNames: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    sellerNames: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    buyerIsCompany: { type: 'boolean' },
    sellerIsCompany: { type: 'boolean' },
    buyerCompanyName: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    sellerCompanyName: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    titleCompany: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    asIsSale: { type: 'boolean' },
    inspectionWaived: { type: 'boolean' },
    homeWarranty: { type: 'boolean' },
    homeWarrantyCompany: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    homeWarrantyPaidBy: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    homeWarrantyAmount: { anyOf: [{ type: 'string' }, { type: 'null' }] },

    // ── Financing ─────────────────────────────────────────────────────────────
    loanType: { anyOf: [{ type: 'string', enum: ['conventional', 'fha', 'va', 'usda', 'cash', 'other'] }, { type: 'null' }] },
    loanAmount: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    loanOfficer: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    loanOfficerCompany: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    loanApplicationDue: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    finalLoanApprovalDue: { anyOf: [{ type: 'string' }, { type: 'null' }] },

    // ── Key Dates ─────────────────────────────────────────────────────────────
    contractDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    closingDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    possessionDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    surveyDeadline: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    earnestMoneyDueDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    additionalEarnestMoneyDue: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    listingExpirationDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },

    // ── Inspection ────────────────────────────────────────────────────────────
    inspectionDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    buyerInspectionNoticeDue: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    renegotiationPeriod: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    financeDeadline: { anyOf: [{ type: 'string' }, { type: 'null' }] },

    // ── Appraisal ─────────────────────────────────────────────────────────────
    appraisalDeliveryDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    appraisalDueToSeller: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    appraisalNegotiationPeriod: { anyOf: [{ type: 'string' }, { type: 'null' }] },

    // ── Title & HOA ───────────────────────────────────────────────────────────
    titleCommitmentDeliveryDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    titleObjectionPeriod: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    hoaDocumentDeliveryDeadline: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    buyerHoaReviewDeadline: { anyOf: [{ type: 'string' }, { type: 'null' }] },

    // ── Parties ───────────────────────────────────────────────────────────────
    buyerAgentName: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    sellerAgentName: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    listingLicenseeName: { anyOf: [{ type: 'string' }, { type: 'null' }] },  // raw label copy (Heartland)
    sellingLicenseeName: { anyOf: [{ type: 'string' }, { type: 'null' }] }, // raw label copy (Heartland)

    // ── Contract meta ─────────────────────────────────────────────────────────
    contractType: { type: 'string', enum: ['residential_sale_contract', 'loi', 'addendum', 'other'] },
    // licenseeSectionRaw: raw two-column extraction for label-based role resolution in code
    licenseeSectionRaw: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            leftColumn: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name:        { anyOf: [{ type: 'string' }, { type: 'null' }] },
                email:       { anyOf: [{ type: 'string' }, { type: 'null' }] },
                phone:       { anyOf: [{ type: 'string' }, { type: 'null' }] },
                columnLabel: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              },
              required: ['name', 'email', 'phone', 'columnLabel'],
            },
            rightColumn: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name:        { anyOf: [{ type: 'string' }, { type: 'null' }] },
                email:       { anyOf: [{ type: 'string' }, { type: 'null' }] },
                phone:       { anyOf: [{ type: 'string' }, { type: 'null' }] },
                columnLabel: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              },
              required: ['name', 'email', 'phone', 'columnLabel'],
            },
          },
          required: ['leftColumn', 'rightColumn'],
        },
        { type: 'null' },
      ],
    },

    // ── Meta ─────────────────────────────────────────────────────────────────
    confidence: { type: 'number' },
    extractedFields: { type: 'array', items: { type: 'string' } },
  },
  required: [
    // Property
    'address', 'city', 'state', 'zipCode', 'propertyType', 'mlsNumber', 'mlsBoard', 'mlsBoardName', 'legalDescription',
    // Transaction
    'transactionType', 'listPrice', 'contractPrice', 'purchasePrice', 'earnestMoney', 'earnestMoneyHolder', 'emHeldWith',
    'additionalEarnestMoney', 'sellerCredit', 'sellerConcessions', 'sellerPaidClosingCosts', 'repairsNotToExceed',
    'downPaymentAmount', 'downPaymentPercent', 'commissionReceived', 'commissionAmount', 'buyerAgentCommission', 'listingAgentCommission',
    'buyerNames', 'sellerNames', 'buyerIsCompany', 'sellerIsCompany', 'buyerCompanyName', 'sellerCompanyName',
    'titleCompany', 'asIsSale', 'inspectionWaived', 'homeWarranty', 'homeWarrantyCompany', 'homeWarrantyPaidBy', 'homeWarrantyAmount',
    // Financing
    'loanType', 'loanAmount', 'loanOfficer', 'loanOfficerCompany', 'loanApplicationDue', 'finalLoanApprovalDue',
    // Key Dates
    'contractDate', 'closingDate', 'possessionDate', 'surveyDeadline', 'earnestMoneyDueDate', 'additionalEarnestMoneyDue', 'listingExpirationDate',
    // Inspection
    'inspectionDate', 'buyerInspectionNoticeDue', 'renegotiationPeriod', 'financeDeadline',
    // Appraisal
    'appraisalDeliveryDate', 'appraisalDueToSeller', 'appraisalNegotiationPeriod',
    // Title & HOA
    'titleCommitmentDeliveryDate', 'titleObjectionPeriod', 'hoaDocumentDeliveryDeadline', 'buyerHoaReviewDeadline',
    // Parties
    'buyerAgentName', 'sellerAgentName', 'listingLicenseeName', 'sellingLicenseeName',
    // Contract meta
    'contractType', 'licenseeSectionRaw',
    // Meta
    'confidence', 'extractedFields',
  ],
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

  const systemPrompt = `You are extracting real estate transaction data from a purchase agreement or contract document. You are operating in VISION MODE — GPT-4o renders each PDF page as an image, giving you the ability to see all visual content including checkboxes, handwriting, underlines, signatures, and stamps.

VISION MODE — CRITICAL VISUAL INSPECTION RULES:

CHECKBOXES (most important — text extraction frequently misses these):
- Visually identify WHICH checkboxes are physically marked/checked vs empty.
- Checked indicators: ☑ [X] [✓] (X) filled circle • or any box/circle with ink or marks inside.
- Unchecked indicators: ☐ □ [ ] ( ) — empty box or circle with nothing inside.
- loanType: Look for which financing type checkbox is physically checked — Conventional, FHA, VA, USDA, Cash, or Other. Return ONLY the visually checked option. Never guess from context alone.
- asIsSale: Return true ONLY if an "as-is" or "as is" sale checkbox is visually checked.
- inspectionWaived: Return true ONLY if a "buyer waives inspection" or "no inspection period" checkbox is visually checked.
- homeWarranty: Return true ONLY if a home warranty INCLUSION checkbox is checked. If waived or excluded, return false.

UNDERLINED / BLANK LINE FIELDS:
- Most contract fields use a printed label followed by a blank underline where values are handwritten or typed.
- The VALUE is whatever appears ON the underline — not the label before it.
- If a blank line is truly empty with nothing on it, return null for that field.
- Look carefully for lightly handwritten or small-font typed text on blank lines (e.g., "4/14/26" for a date, cursive names, dollar amounts).

HANDWRITTEN TEXT:
- Read handwritten dates, names, dollar amounts, and numbers wherever they appear.
- If handwriting is hard to read, make your best interpretation and reduce your overall confidence score.

SIGNATURES & INITIALS:
- Observe which signature/initial lines appear signed vs blank as context for your confidence score.
- Signed = handwritten marks, typed name, DocuSign stamp, or DotLoop signature image present on the line.
- Blank = empty line with nothing on it.
- This does NOT affect which fields you extract — it informs your confidence score only.

Extract all available fields. For dates, return YYYY-MM-DD format. For prices/amounts, return numeric strings without formatting (e.g., "550000" not "$550,000"). For state, return the 2-letter abbreviation.
For relative deadline fields: when a deadline is expressed as "X calendar/business days after/before [event]", return that formula verbatim (e.g., "11 calendar days after Effective Date", "5 calendar days before Closing Date"). If the document states an explicit date instead, return YYYY-MM-DD.

For transactionType: if this is a buyer's purchase offer/agreement, return "buyer". If listing/seller-side document, return "seller". Default to "buyer".
For contractType: identify the document type. Return "residential_sale_contract" for a standard purchase agreement or sale contract, "loi" for a Letter of Intent, "addendum" for an addendum or amendment to an existing contract, "other" for anything else.
For propertyType: infer from property description. Default to "single-family".

FIELD ALIASES — return the SAME value for both names in each pair:
- contractPrice AND purchasePrice: the agreed sale/purchase price (numeric string, no formatting).
- mlsBoard AND mlsBoardName: MLS board/association name (e.g., "Heartland MLS", "KCRAR"). Return null if not found.
- sellerCredit AND sellerConcessions: seller price concessions/credits to buyer (numeric string). Separate from closing cost contributions.
- commissionReceived AND commissionAmount: the buyer's agent commission dollar amount. If only % stated, return as "3%" string.
- earnestMoneyHolder AND emHeldWith: the entity holding the earnest money (usually the title company).

For titleCompany / earnestMoneyHolder / emHeldWith: extract the name of the title company or escrow company holding the earnest money. Look for a line labeled "Deposited with:" anywhere in the earnest money section. On Heartland MLS / KC contracts, this is in section 4.b or 4.c. Return company name only (e.g., "Alliance Title"). Return null if not found.
For additionalEarnestMoney: second/additional earnest money amount (numeric string). Look in section 4.c or "Additional Earnest Money" clause. Return null if not found.
For additionalEarnestMoneyDue: due date or formula for additional earnest money. Return null if not found.
For sellerPaidClosingCosts: dollar amount seller contributes toward buyer's closing costs (numeric string, separate from sellerCredit). Return null if not found.
For repairsNotToExceed: repair cap agreed in contract (numeric string). Return null if not found.
For buyerAgentCommission: commission % or $ for buyer's agent (e.g., "3%" or "4950"). Return null if not found.
For listingAgentCommission: commission % or $ for listing/seller's agent. Return null if not found.
For loanOfficerCompany: the lender or mortgage company name (not the loan officer's personal name). Return null if not found.
For loanApplicationDue: loan application deadline (date YYYY-MM-DD or formula). Return null if not found.
For finalLoanApprovalDue: final loan approval/commitment deadline (date or formula). Return null if not found.
For surveyDeadline: survey delivery or review deadline (date or formula). Return null if not found.
For listingExpirationDate: listing expiration date if mentioned (YYYY-MM-DD). Return null if not found.
For inspectionDate: inspection period end date or formula (e.g., "11 calendar days after Effective Date"). Return null if not found.
For buyerInspectionNoticeDue: deadline for buyer to deliver inspection notice/objection (date or formula). Return null if not found.
For renegotiationPeriod: seller response/renegotiation period after buyer's inspection notice (date or formula). Return null if not found.
For appraisalDeliveryDate: when appraisal report must be delivered to buyer (date or formula). Return null if not found.
For appraisalDueToSeller: when appraisal report must be delivered to seller (date or formula). Return null if not found.
For appraisalNegotiationPeriod: period for parties to negotiate after appraisal (date or formula). Return null if not found.
For titleCommitmentDeliveryDate: when title commitment must be delivered (date or formula). Return null if not found.
For titleObjectionPeriod: deadline for buyer to object to title (date or formula). Return null if not found.
For hoaDocumentDeliveryDeadline: when HOA documents must be delivered to buyer (date or formula). Return null if not found.
For buyerHoaReviewDeadline: buyer's deadline to review and object to HOA documents (date or formula). Return null if not found.
For homeWarrantyPaidBy: who pays the home warranty — extract exact text (e.g., "BUYER", "SELLER", "BUYER waives", "N/A"). Return null if not mentioned.
For homeWarrantyAmount: the home warranty cost (numeric string). Return null if not found.
For buyerAgentName: full personal name of the buyer's representative/agent (not company). On Heartland MLS contracts, typically the "Selling Licensee". Return null if not found.
For sellerAgentName: full personal name of the seller's/listing agent (not company). On Heartland MLS contracts, typically the "Listing Licensee". Return null if not found.

For listingLicenseeName: MECHANICAL COPY ONLY — do not interpret or reason about roles at all. Find the section or column on this document labeled exactly "Listing Licensee". Copy ONLY the personal name (first + last, NOT a brokerage or company name) that appears inside that labeled section. Do not use any name from a neighboring column or section. Return null if this exact label does not appear on the document.
For sellingLicenseeName: MECHANICAL COPY ONLY — do not interpret or reason about roles at all. Find the section or column on this document labeled exactly "Selling Licensee". Copy ONLY the personal name (first + last, NOT a brokerage or company name) that appears inside that labeled section. Do not use any name from a neighboring column or section. Return null if this exact label does not appear on the document.
HEARTLAND MLS / KC CONTRACT NOTE: These contracts show two side-by-side columns — the LEFT column is labeled "Listing Licensee" and the RIGHT column is labeled "Selling Licensee". Each column contains its own separate name, phone, and email. You must copy the name strictly from WITHIN each labeled column — never borrow from the neighboring column. The role mapping (which side is buyer vs seller) is handled separately — your only job is to copy the name from the correct labeled box.
For licenseeSectionRaw: Find the agent/licensee block (typically the final section of a purchase agreement, showing two side-by-side agent columns). Extract it WITHOUT any role interpretation — just describe what is physically printed in each column:
- leftColumn: everything in the LEFT/first column — the agent name, their email, their phone, and the column's printed label or header text (e.g., "Listing Licensee", "Selling Licensee", or similar). Set columnLabel to the label text you see printed for that column.
- rightColumn: everything in the RIGHT/second column — same structure.
Do NOT decide which column represents buyer or seller — just copy what is there. Return null for licenseeSectionRaw if no two-column agent section exists (e.g., the document is an LOI or addendum with no agent columns).
For downPaymentPercent: on Heartland MLS contracts, extract the LTV or down payment percentage from line 330 "Principal Amount or LTV ___ ___". Return as a numeric percentage string (e.g., "3" for 3%). If written as a decimal less than 1 (e.g., ".03"), convert to percentage form (multiply by 100, return "3"). Return null if not found.
For buyerIsCompany / sellerIsCompany / buyerCompanyName / sellerCompanyName: If the buyer or seller field contains a business entity indicator (LLC, Inc., Corp., Ltd., L.L.C., LLP, LP, Co., Company, Trust, Holding, Holdings, Properties, Investments), set buyerIsCompany or sellerIsCompany=true and copy the FULL legal name into buyerCompanyName or sellerCompanyName. Set buyerNames/sellerNames to only the personal name if one appears alongside the company name (e.g., "John Smith / M&M LLC" → buyerNames="John Smith", buyerCompanyName="M&M LLC"). If only the company name appears with no person name, set buyerNames/sellerNames=null.
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
  const parsed = JSON.parse(content);

  // ── Agent name mapping — done in code, never by AI ──────────────────────
  //
  // Step 1: If licenseeSectionRaw is present, use column labels to resolve names.
  // This is the most reliable path — GPT just copied each physical column as-is,
  // and code finds the column whose label contains "listing" or "selling" to assign roles.
  // This bypasses GPT's visual two-column confusion entirely.
  if (parsed.licenseeSectionRaw) {
    const cols: Array<{ name: string | null; email: string | null; phone: string | null; columnLabel: string | null }> =
      [parsed.licenseeSectionRaw.leftColumn, parsed.licenseeSectionRaw.rightColumn].filter(Boolean);

    const listingCol = cols.find(col => col.columnLabel?.toLowerCase().includes('listing'));
    const sellingCol = cols.find(col => col.columnLabel?.toLowerCase().includes('selling'));

    // Override the AI-assigned listingLicenseeName / sellingLicenseeName with label-resolved values
    if (listingCol?.name) parsed.listingLicenseeName = listingCol.name;
    if (sellingCol?.name) parsed.sellingLicenseeName = sellingCol.name;
  }

  // Step 2: Apply role mapping rules (locked — code only, never AI).
  // Rules:
  //   residential_sale_contract / addendum / other:
  //     Listing Licensee  → sellerAgentName  (represents the seller)
  //     Selling Licensee  → buyerAgentName   (represents the buyer — KC terminology)
  //   loi:
  //     Usually from buy side (wholesalers). Use whatever name was found, default to buyer.
  const cType = (parsed.contractType as string) || 'other';
  let sellerAgentName: string | null = null;
  let buyerAgentName: string | null = null;

  if (cType === 'loi') {
    buyerAgentName = (parsed.sellingLicenseeName as string) || (parsed.listingLicenseeName as string) || null;
    sellerAgentName = null;
  } else {
    // residential_sale_contract, addendum, other
    sellerAgentName = (parsed.listingLicenseeName as string) || null;
    buyerAgentName  = (parsed.sellingLicenseeName as string) || null;
  }

  return { ...parsed, buyerAgentName, sellerAgentName };
}

// ── Main handler ──────────────────────────────────────────────────────────────


// ── Portfolio Report Schema & Handler (Tier 3) ────────────────────────────

const bottleneckSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    stage: { type: 'string' },
    dealCount: { type: 'number' },
    avgDaysStuck: { type: 'number' },
    description: { type: 'string' },
    recommendation: { type: 'string' },
  },
  required: ['stage', 'dealCount', 'avgDaysStuck', 'description', 'recommendation'],
};

const agentPerfSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    agentName: { type: 'string' },
    activeDealCount: { type: 'number' },
    avgDaysToClose: { type: 'number' },
    taskCompletionRate: { type: 'number' },
    riskLevel: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['agentName', 'activeDealCount', 'avgDaysToClose', 'taskCompletionRate', 'riskLevel', 'notes'],
};

const closingForecastSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    period: { type: 'string' },
    expectedClosings: { type: 'number' },
    totalVolume: { type: 'number' },
    confidence: { type: 'string' },
  },
  required: ['period', 'expectedClosings', 'totalVolume', 'confidence'],
};

const portfolioReportSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    executiveSummary: { type: 'string' },
    bottlenecks: { type: 'array', items: bottleneckSchema },
    agentPerformance: { type: 'array', items: agentPerfSchema },
    complianceOverview: {
      type: 'object',
      additionalProperties: false,
      properties: {
        overallScore: { type: 'number' },
        atRiskDeals: { type: 'number' },
        commonGaps: { type: 'array', items: { type: 'string' } },
        recommendation: { type: 'string' },
      },
      required: ['overallScore', 'atRiskDeals', 'commonGaps', 'recommendation'],
    },
    closingForecast: { type: 'array', items: closingForecastSchema },
    actionItems: { type: 'array', items: { type: 'string' } },
    generatedAt: { type: 'string' },
  },
  required: ['executiveSummary', 'bottlenecks', 'agentPerformance', 'complianceOverview', 'closingForecast', 'actionItems', 'generatedAt'],
};

async function handlePortfolioReport(apiKey: string, body: any) {
  const { deals } = body;
  if (!deals?.length) throw new Error('Missing deals data');

  const systemPrompt = `You are a senior real estate transaction coordinator analyzing a portfolio of active deals. Provide a concise executive summary, identify bottlenecks, assess agent performance, give compliance overview, forecast closings, and list top action items. Base your analysis ONLY on the provided data. Today: ${new Date().toISOString().split('T')[0]}`;

  const userContent = `PORTFOLIO DATA (${deals.length} deals):
${JSON.stringify(deals, null, 2)}`;

  const result = await callOpenAI(apiKey, systemPrompt, userContent, portfolioReportSchema, 'portfolio_report_response', 'gpt-4o');
  result.generatedAt = new Date().toISOString();
  return result;
}

// ── Evaluate Rules Schema & Handler (Tier 3) ────────────────────────────────

const triggeredRuleItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ruleId: { type: 'string' },
    ruleName: { type: 'string' },
    dealId: { type: 'string' },
    dealAddress: { type: 'string' },
    triggerReason: { type: 'string' },
    suggestedAction: { type: 'string' },
    actionType: { type: 'string' },
    priority: { type: 'string' },
    confidence: { type: 'number' },
  },
  required: ['ruleId', 'ruleName', 'dealId', 'dealAddress', 'triggerReason', 'suggestedAction', 'actionType', 'priority', 'confidence'],
};

const evaluateRulesSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    triggeredRules: { type: 'array', items: triggeredRuleItemSchema },
    summary: { type: 'string' },
    rulesChecked: { type: 'number' },
    dealsScanned: { type: 'number' },
  },
  required: ['triggeredRules', 'summary', 'rulesChecked', 'dealsScanned'],
};

async function handleEvaluateRules(apiKey: string, body: any) {
  const { deals, rules } = body;
  if (!deals?.length) throw new Error('Missing deals data');
  if (!rules?.length) return { triggeredRules: [], summary: 'No rules to evaluate.', rulesChecked: 0, dealsScanned: deals.length };

  const systemPrompt = `You are evaluating automation rules against a set of real estate deals. For each rule that is triggered by the data, return a triggered rule entry with a specific reason and suggested action. Only flag rules that clearly match the deal data conditions. Today: ${new Date().toISOString().split('T')[0]}`;

  const userContent = `RULES:
${JSON.stringify(rules, null, 2)}

DEALS (${deals.length}):
${JSON.stringify(deals, null, 2)}`;

  return callOpenAI(apiKey, systemPrompt, userContent, evaluateRulesSchema, 'evaluate_rules_response', 'gpt-4o');
}

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
      case 'portfolio-report':
        result = await handlePortfolioReport(apiKey, req.body);
        break;
      case 'evaluate-rules':
        result = await handleEvaluateRules(apiKey, req.body);
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
