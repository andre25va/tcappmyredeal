// Centralized AI audit logger — Phase 3D
// All AI features use this to log suggestions, approvals, and dismissals.

import { supabase } from '../lib/supabase';
import type { DealChatAction } from './types';

export type AISource = 'deal_chat' | 'voice_update' | 'global_chat' | 'search' | 'auto';

export interface AIAuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  entityName: string;
  source: AISource;
  aiAction: DealChatAction;
  approved: boolean;
  extra?: Record<string, unknown>;
}

export async function logAIAudit(entry: AIAuditEntry): Promise<void> {
  try {
    await supabase.from('audit_log').insert({
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      entity_name: entry.entityName,
      metadata: {
        source: entry.source,
        aiActionType: entry.aiAction.type,
        aiPayload: entry.aiAction.payload,
        aiConfidence: entry.aiAction.confidence,
        aiRationale: entry.aiAction.rationale,
        userApproved: entry.approved,
        ...(entry.extra || {}),
      },
    });
  } catch (err) {
    console.error('AI audit log error:', err);
  }
}
