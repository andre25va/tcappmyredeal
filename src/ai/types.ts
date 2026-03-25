// AI Feature Types — Phase 2
// Isolated from main app types to keep AI concerns separate.

export type DealRecord = {
  id: string;
  propertyAddress: string;
  addressVariants?: string[];
  mlsNumber?: string;
  clientNames?: string[];
  participantEmails?: string[];
  linkedThreadIds?: string[];
  dueDiligenceItems?: ChecklistItem[];
  complianceItems?: ChecklistItem[];
  tasks?: DealTask[];
  stage?: string;
  closingDate?: string;
  lastActivityAt?: string;
};

export type ChecklistItem = {
  id: string;
  label: string;
  status: "pending" | "complete" | "missing" | "failed";
  dueDate?: string;
};

export type DealTask = {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  status: "open" | "done";
  priority: "low" | "medium" | "high";
  source?: "manual" | "email" | "ai";
};

export type RawEmail = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to?: string[];
  cc?: string[];
  snippet?: string;
  bodyText?: string;
  bodyHtml?: string;
  receivedAt: string;
  attachmentNames?: string[];
};

export type EmailThreadGroup = {
  threadId: string;
  emails: RawEmail[];
  latest: RawEmail;
};

export type EmailClassification = {
  dealId: string | null;
  shouldAttach: boolean;
  confidence: number;
  reason: string;
  category:
    | "contract"
    | "inspection"
    | "appraisal"
    | "title"
    | "lender"
    | "closing"
    | "compliance"
    | "general"
    | "unrelated";
  extractedSignals: string[];
};

export type EmailSummary = {
  summary: string;
  keyUpdates: string[];
  actionItems: string[];
  riskFlags: string[];
};

export type SuggestedTask = {
  title: string;
  description?: string;
  dueDate?: string;
  priority: "low" | "medium" | "high";
  suggestedOwnerRole?: "agent" | "tc" | "admin" | "lender" | "title" | "compliance";
};

export type DealHealthSnapshot = {
  score: number;
  label: "healthy" | "watch" | "at-risk";
  missingItems: string[];
  overdueTasks: string[];
  staleWarnings: string[];
  summary: string;
};

export type CompliancePrecheckResult = {
  status: "pass" | "watch" | "fail";
  missingItems: string[];
  inconsistentItems: string[];
  notes: string[];
  summary: string;
};

// Phase 3A — Deal Chat Types

export type DealChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  suggestedActions?: DealChatAction[];
  factsUsed?: string[];
  warnings?: string[];
};

export type DealChatAction = {
  type: 'create_task' | 'add_note' | 'draft_email' | 'flag_compliance_issue' | 'suggest_stage_update';
  payload: Record<string, unknown>;
  confidence: number;
  rationale: string;
};

export type DealChatResponse = {
  answer: string;
  confidence: number;
  factsUsed: string[];
  suggestedActions: DealChatAction[];
  warnings: string[];
};

// ── Phase 3B: Natural Language Search ─────────────────────────────────────────

export interface DealSearchQuery {
  stage?: string[];
  closingDateRange?: { start: string | null; end: string | null };
  missingCompliance?: boolean;
  overdueTasks?: boolean;
  participantRoleMissing?: string[];
  dealType?: string[];
  staleDaysGreaterThan?: number | null;
  transactionType?: string[];
  textSearch?: string | null;
  hasAmberAlerts?: boolean;
}

export interface SearchInterpretationResponse {
  interpretedQuery: DealSearchQuery;
  explanation: string;
  assumptions: string[];
  warnings: string[];
}

// ── Phase 3C: Voice Updates ───────────────────────────────────────────────────

export interface VoiceUpdateInterpretation {
  transcript: string;
  summary: string;
  suggestedActions: DealChatAction[];
  mentionedEntities: string[];
  detectedDates: string[];
  warnings: string[];
}
