// Shared AI Action Types — Phase 3
// Used by deal chat, natural-language search, and voice (future phases)

export type AISuggestedAction =
  | { type: 'create_task'; payload: CreateTaskPayload }
  | { type: 'add_note'; payload: AddNotePayload }
  | { type: 'draft_email'; payload: DraftEmailPayload }
  | { type: 'flag_compliance_issue'; payload: FlagCompliancePayload }
  | { type: 'suggest_stage_update'; payload: StageUpdatePayload };

export interface CreateTaskPayload {
  title: string;
  description: string;
  dueDate: string | null;
  priority: 'low' | 'medium' | 'high';
  suggestedOwnerRole: string;
}

export interface AddNotePayload {
  note: string;
  category: string;
}

export interface DraftEmailPayload {
  toRole: string;
  subject: string;
  body: string;
}

export interface FlagCompliancePayload {
  label: string;
  severity: 'watch' | 'fail';
  note: string;
}

export interface StageUpdatePayload {
  fromStage: string;
  toStage: string;
  rationale: string;
}

export interface AIAuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  entityName: string;
  aiSuggestion: AISuggestedAction;
  userApproved: boolean;
  metadata?: Record<string, unknown>;
}
