import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

interface ChangeDiff { field: string; old_value: string; new_value: string; }

export interface ActivityItem {
  id: string;
  type: 'email' | 'call' | 'call_note' | 'request' | 'request_event' | 'note' | 'activity' | 'sms' | 'whatsapp' | 'portal' | 'contact_update' | 'task_event' | 'status_change' | 'ai_summary';
  timestamp: string;
  title: string;
  body?: string;
  meta?: Record<string, any>;
}

const fmtDuration = (secs?: number) => {
  if (!secs) return '';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

export function useActivityLog(dealId: string | undefined, activityLog?: any[]) {
  return useQuery({
    queryKey: ['activity-log', dealId, activityLog],
    queryFn: async () => {
      if (!dealId) return [];

      // Parallel fetches
      const [emailRes, callRes, callNoteRes, requestRes, messagesRes, contactChangeRes, activityLogRes] = await Promise.all([
        supabase
          .from('email_send_log')
          .select('id, subject, to_addresses, template_name, sent_by, sent_at')
          .eq('deal_id', dealId)
          .order('sent_at', { ascending: false })
          .limit(100),
        supabase
          .from('call_logs')
          .select('id, direction, to_number, from_number, status, duration, dial_call_status, ai_summary, created_at, contacts:contact_id(first_name, last_name)')
          .eq('deal_id', dealId)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('call_notes')
          .select('id, raw_notes, ai_summary, created_at')
          .eq('deal_id', dealId)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('requests')
          .select('id, request_type, status, requested_from_name, notes, created_at')
          .eq('deal_id', dealId)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('messages')
          .select('id, direction, channel, body, status, sent_at, created_at, from_number, to_number, contact_id')
          .eq('deal_id', dealId)
          .in('channel', ['sms', 'whatsapp', 'portal'])
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('contact_change_log')
          .select('*')
          .eq('deal_id', dealId)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('activity_log')
          .select('id, action, entity_type, description, performed_by, created_at')
          .eq('deal_id', dealId)
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      // Request events (chained)
      const requestIds = (requestRes.data || []).map((r: any) => r.id);
      const requestEventRes = requestIds.length > 0
        ? await supabase
            .from('request_events')
            .select('id, event_type, description, actor, created_at, request_id')
            .in('request_id', requestIds)
            .order('created_at', { ascending: false })
            .limit(200)
        : { data: [] };

      const normalized: ActivityItem[] = [];

      // Emails
      for (const e of emailRes.data || []) {
        normalized.push({
          id: `email-${e.id}`,
          type: 'email',
          timestamp: e.sent_at,
          title: `Email sent: ${e.subject || '(no subject)'}`,
          body: [
            (e.to_addresses || []).join(', '),
            e.template_name ? `Template: ${e.template_name}` : '',
            e.sent_by ? `By: ${e.sent_by}` : '',
          ].filter(Boolean).join(' · '),
        });
      }

      // Calls
      for (const c of callRes.data || []) {
        const ct = c.contacts as any;
        const who = ct
          ? `${ct.first_name || ''} ${ct.last_name || ''}`.trim()
          : c.direction === 'inbound' ? c.from_number : c.to_number;
        const dur = fmtDuration(c.duration);
        const statusLabel = c.dial_call_status || c.status || '';
        normalized.push({
          id: `call-${c.id}`,
          type: 'call',
          timestamp: c.created_at,
          title: `${c.direction === 'inbound' ? '↙ Inbound' : '↗ Outbound'} call${who ? ` · ${who}` : ''}`,
          body: [statusLabel, dur].filter(Boolean).join(' · ') || undefined,
          meta: { ai_summary: c.ai_summary, callId: c.id },
        });
      }

      // Call Notes
      for (const n of callNoteRes.data || []) {
        normalized.push({
          id: `callnote-${n.id}`,
          type: 'call_note',
          timestamp: n.created_at,
          title: 'Call note',
          body: n.ai_summary || n.raw_notes || undefined,
        });
      }

      // Requests
      for (const r of requestRes.data || []) {
        normalized.push({
          id: `req-${r.id}`,
          type: 'request',
          timestamp: r.created_at,
          title: `Request: ${(r.request_type || '').replace(/_/g, ' ')}`,
          body: [
            r.requested_from_name,
            `Status: ${r.status}`,
            r.notes || '',
          ].filter(Boolean).join(' · ') || undefined,
        });
      }

      // Request Events
      for (const ev of requestEventRes.data || []) {
        normalized.push({
          id: `reqev-${ev.id}`,
          type: 'request_event',
          timestamp: ev.created_at,
          title: `Request ${(ev.event_type || '').replace(/_/g, ' ')}`,
          body: ev.description || undefined,
          meta: { actor: ev.actor },
        });
      }

      // SMS / WhatsApp messages
      for (const m of messagesRes.data || []) {
        if (m.channel === 'portal') {
          const dirLabel = m.direction === 'inbound' ? '↙ Client sent' : '↗ TC replied';
          normalized.push({
            id: `msg-${m.id}`,
            type: 'portal' as const,
            timestamp: m.sent_at || m.created_at,
            title: `${dirLabel} via Client Portal`,
            body: m.body ? (m.body.length > 200 ? m.body.slice(0, 200) + '…' : m.body) : undefined,
            meta: { status: m.status, messageId: m.id, hasAttachment: !!m.metadata?.attachments?.length },
          });
        } else {
          const channel = m.channel === 'whatsapp' ? 'whatsapp' : 'sms';
          const channelLabel = channel === 'whatsapp' ? 'WhatsApp' : 'SMS';
          const dirLabel = m.direction === 'inbound' ? '↙ Inbound' : '↗ Outbound';
          const contact = m.direction === 'inbound' ? m.from_number : m.to_number;
          normalized.push({
            id: `msg-${m.id}`,
            type: channel,
            timestamp: m.sent_at || m.created_at,
            title: `${dirLabel} ${channelLabel}${contact ? ` · ${contact}` : ''}`,
            body: m.body ? (m.body.length > 200 ? m.body.slice(0, 200) + '…' : m.body) : undefined,
            meta: { status: m.status, messageId: m.id },
          });
        }
      }

      // Contact change log events
      for (const r of contactChangeRes.data || []) {
        normalized.push({
          id: `contactchange-${r.id}`,
          type: 'contact_update',
          timestamp: r.created_at,
          title: r.action_type === 'add'
            ? `${r.contact_name || 'Contact'} added to deal`
            : r.action_type === 'remove'
            ? `${r.contact_name || 'Contact'} removed from deal`
            : `${r.contact_name || 'Contact'} updated`,
          body: r.changed_by_name
            + (r.changes?.length ? ': ' + (r.changes as ChangeDiff[]).map(c => `${c.field} changed`).join(', ') : ''),
          meta: { changes: r.changes, action_type: r.action_type, changed_by_name: r.changed_by_name },
        });
      }

      // Activity log (deal status changes, task events, MLS fetches, etc.)
      for (const a of activityLogRes.data || []) {
        const action = a.action as string;
        let type: ActivityItem['type'] = 'activity';
        if (action === 'status_changed') type = 'status_change';
        else if (action === 'task_completed' || action === 'task_reopened' || action === 'task_created') type = 'task_event';
        else if (action === 'ai_summary_sent') type = 'ai_summary';

        normalized.push({
          id: `actlog-${a.id}`,
          type,
          timestamp: a.created_at,
          title: a.description || action.replace(/_/g, ' '),
          meta: { user: a.performed_by, action },
        });
      }

      // In-memory notes from deal.activityLog
      for (const entry of (activityLog || [])) {
        normalized.push({
          id: `log-${entry.id}`,
          type: (entry.type === 'note' ? 'note' : 'activity') as ActivityItem['type'],
          timestamp: entry.timestamp,
          title: entry.action,
          body: entry.detail || undefined,
          meta: { user: entry.user },
        });
      }

      // Sort newest first
      normalized.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return normalized;
    },
    enabled: !!dealId,
    staleTime: 30_000,
  });
}

export function useInvalidateActivityLog() {
  const queryClient = useQueryClient();
  return (dealId: string) =>
    queryClient.invalidateQueries({ queryKey: ['activity-log', dealId] });
}
