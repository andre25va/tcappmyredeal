// AI Feature Types — Phase 1A
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
};

export type DealHealthSnapshot = {
  score: number;
  label: "healthy" | "watch" | "at-risk";
  missingItems: string[];
  overdueTasks: string[];
  staleWarnings: string[];
  summary: string;
};
