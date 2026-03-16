import { useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useAuth } from '../contexts/AuthContext';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export type AuditAction =
  | 'create' | 'update' | 'delete' | 'view'
  | 'send' | 'login' | 'logout' | 'navigate'
  | 'upload' | 'download' | 'approve' | 'reject' | 'complete';

export type AuditEntityType =
  | 'deal' | 'contact' | 'task' | 'document' | 'email'
  | 'sms' | 'whatsapp' | 'comm_task' | 'template'
  | 'compliance' | 'note' | 'mls' | 'user' | 'settings';

export function useAudit() {
  const { profile } = useAuth();

  const logAction = useCallback(async (
    action: AuditAction,
    entityType?: AuditEntityType,
    entityId?: string | null,
    entityName?: string | null,
    oldData?: any,
    newData?: any,
    metadata?: any
  ) => {
    if (!profile) return; // no-op if not logged in

    try {
      await supabase.from('audit_log').insert({
        user_id: profile.id,
        user_name: profile.name || profile.phone,
        user_phone: profile.phone,
        action,
        entity_type: entityType,
        entity_id: entityId,
        entity_name: entityName,
        old_data: oldData,
        new_data: newData,
        metadata,
      });
    } catch (err) {
      // Audit failures should never break the app
      console.warn('Audit log failed (non-fatal):', err);
    }
  }, [profile]);

  return { logAction };
}
