import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Deal } from '../types';
import {
  Bell,
  Send,
  Clock,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Mail,
  MessageSquare,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { NudgeTaskStatus, NudgeTemplate, NudgeLogEntry } from './nudge-types';

interface WorkspaceNudgeProps {
  deal: Deal;
}

const URGENCY_CONFIG: Record<
  NudgeTaskStatus['urgency'],
  { label: string; color: string; badgeClass: string; icon: React.ReactNode }
> = {
  overdue: {
    label: 'Overdue',
    color: 'text-error',
    badgeClass: 'badge-error',
    icon: <AlertTriangle size={14} />,
  },
  due_today: {
    label: 'Due Today',
    color: 'text-warning',
    badgeClass: 'badge-warning',
    icon: <Clock size={14} />,
  },
  approaching: {
    label: 'Approaching',
    color: 'text-info',
    badgeClass: 'badge-info',
    icon: <Clock size={14} />,
  },
  on_track: {
    label: 'On Track',
    color: 'text-success',
    badgeClass: 'badge-success',
    icon: <CheckCircle size={14} />,
  },
};

function resolveMergeTags(
  text: string,
  task: NudgeTaskStatus | null,
  deal: Deal
): string {
  if (!text) return '';
  let resolved = text;
  resolved = resolved.replace(/\{\{task_name\}\}/g, task?.task_name ?? '');
  resolved = resolved.replace(
    /\{\{due_date\}\}/g,
    task?.due_date
      ? new Date(task.due_date).toLocaleDateString()
      : ''
  );
  resolved = resolved.replace(
    /\{\{property_address\}\}/g,
    deal.propertyAddress ?? ''
  );
  resolved = resolved.replace(/\{\{deal_ref\}\}/g, deal.dealRef ?? '');
  return resolved;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function WorkspaceNudge({ deal }: WorkspaceNudgeProps) {
  const { profile } = useAuth();

  // --- Data state ---
  const [tasks, setTasks] = useState<NudgeTaskStatus[]>([]);
  const [templates, setTemplates] = useState<NudgeTemplate[]>([]);
  const [nudgeLog, setNudgeLog] = useState<NudgeLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [logLoading, setLogLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // --- Compose state ---
  const [selectedTask, setSelectedTask] = useState<NudgeTaskStatus | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [recipientId, setRecipientId] = useState<string>('');
  const [channel, setChannel] = useState<'email' | 'sms'>('email');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  // --- UI state ---
  const [historyOpen, setHistoryOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // --- Fetch tasks + templates ---
  const fetchData = useCallback(() => {
    async function load() {
      setLoading(true);
      try {
        const [tasksRes, templatesRes] = await Promise.all([
          supabase
            .from('task_nudge_status')
            .select('*')
            .eq('deal_id', deal.id)
            .order('due_date', { ascending: true }),
          supabase
            .from('nudge_templates')
            .select('*')
            .or(`org_id.eq.${deal.orgId},org_id.is.null`)
            .eq('is_active', true)
            .order('name'),
        ]);

        if (tasksRes.error) {
          console.error('Error fetching nudge tasks:', tasksRes.error);
        } else {
          setTasks(tasksRes.data as NudgeTaskStatus[]);
        }

        if (templatesRes.error) {
          console.error('Error fetching nudge templates:', templatesRes.error);
        } else {
          setTemplates(templatesRes.data as NudgeTemplate[]);
        }
      } catch (err) {
        console.error('Unexpected error fetching nudge data:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [deal.id, deal.orgId]);

  // --- Fetch nudge log ---
  const fetchLog = useCallback(() => {
    async function load() {
      setLogLoading(true);
      try {
        const { data, error } = await supabase
          .from('nudge_log')
          .select('*')
          .eq('deal_id', deal.id)
          .order('sent_at', { ascending: false });

        if (error) {
          console.error('Error fetching nudge log:', error);
        } else {
          setNudgeLog(data as NudgeLogEntry[]);
        }
      } catch (err) {
        console.error('Unexpected error fetching nudge log:', err);
      } finally {
        setLogLoading(false);
      }
    }
    load();
  }, [deal.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchLog();
  }, [fetchLog]);

  // --- Template selection handler ---
  function handleTemplateChange(templateId: string) {
    setSelectedTemplateId(templateId);
    if (!templateId) {
      setSubject('');
      setBody('');
      return;
    }
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;

    // Auto-set channel if template specifies one
    if (tpl.channel === 'email' || tpl.channel === 'sms') {
      setChannel(tpl.channel);
    }

    setSubject(resolveMergeTags(tpl.subject ?? '', selectedTask, deal));
    setBody(resolveMergeTags(tpl.body, selectedTask, deal));
  }

  // --- Re-resolve merge tags when selected task changes ---
  useEffect(() => {
    if (!selectedTemplateId) return;
    const tpl = templates.find((t) => t.id === selectedTemplateId);
    if (!tpl) return;
    setSubject(resolveMergeTags(tpl.subject ?? '', selectedTask, deal));
    setBody(resolveMergeTags(tpl.body, selectedTask, deal));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTask]);

  // --- Send nudge ---
  async function handleSend() {
    if (!selectedTask) {
      setToast('Please select a task first.');
      return;
    }
    if (!recipientId) {
      setToast('Please select a recipient.');
      return;
    }
    if (!body.trim()) {
      setToast('Please enter a message body.');
      return;
    }
    if (channel === 'email' && !subject.trim()) {
      setToast('Please enter a subject for the email.');
      return;
    }

    setSending(true);
    try {
      const { error } = await supabase.from('nudge_log').insert({
        task_id: selectedTask.task_id,
        deal_id: deal.id,
        template_id: selectedTemplateId || null,
        recipient_id: recipientId,
        sent_by: profile?.id,
        channel,
        subject: channel === 'email' ? subject : null,
        body,
        delivery_status: 'sent',
      });

      if (error) {
        console.error('Error logging nudge:', error);
        setToast('Failed to log nudge. Please try again.');
      } else {
        setToast('Nudge logged! Email/SMS delivery coming in Phase 4.');
        // Reset compose form
        setSelectedTemplateId('');
        setRecipientId('');
        setSubject('');
        setBody('');
        // Refresh data
        fetchData();
        fetchLog();
      }
    } catch (err) {
      console.error('Unexpected error sending nudge:', err);
      setToast('An unexpected error occurred.');
    } finally {
      setSending(false);
    }
  }

  // --- Auto-dismiss toast ---
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // --- Recipient lookup helper ---
  function getRecipientName(contactId: string): string {
    const p = deal.participants?.find((p) => p.contactId === contactId);
    return p?.contactName ?? 'Unknown';
  }

  // --- Render ---
  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Toast */}
      {toast && (
        <div className="alert alert-info text-sm py-2 shadow-sm">
          <Bell size={16} />
          <span>{toast}</span>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        {/* ====== LEFT: Task Urgency List ====== */}
        <div className="card bg-base-100 shadow-sm border border-base-300 lg:w-1/2 flex flex-col min-h-0">
          <div className="card-body p-4 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm flex items-center gap-1.5">
                <AlertTriangle size={15} className="text-warning" />
                Task Urgency
              </h3>
              <button
                className="btn btn-ghost btn-xs"
                onClick={fetchData}
                title="Refresh"
              >
                <RefreshCw size={13} />
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin text-base-content/50" />
              </div>
            ) : tasks.length === 0 ? (
              <div className="text-sm text-base-content/50 text-center py-8">
                No tasks found for this deal.
              </div>
            ) : (
              <div className="overflow-y-auto flex-1 -mx-1 px-1 space-y-1">
                {tasks.map((task) => {
                  const cfg = URGENCY_CONFIG[task.urgency] ?? URGENCY_CONFIG.on_track;
                  const isSelected = selectedTask?.task_id === task.task_id;

                  return (
                    <button
                      key={task.task_id}
                      onClick={() => setSelectedTask(task)}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                          : 'border-base-300 hover:border-base-content/20 hover:bg-base-200/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {task.task_name}
                          </div>
                          <div className="text-xs text-base-content/60 mt-0.5">
                            Due: {formatDate(task.due_date)}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className={`badge badge-sm ${cfg.badgeClass} gap-1`}>
                            {cfg.icon}
                            {cfg.label}
                          </span>
                          <div className="flex items-center gap-2 text-xs text-base-content/50">
                            {task.needs_nudge && (
                              <span className="text-warning font-medium">
                                Needs nudge
                              </span>
                            )}
                            {task.nudge_count > 0 && (
                              <span>
                                {task.nudge_count}× nudged
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {task.last_nudged_at && (
                        <div className="text-xs text-base-content/40 mt-1">
                          Last nudged: {formatDateTime(task.last_nudged_at)}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ====== RIGHT: Compose / Send Panel ====== */}
        <div className="card bg-base-100 shadow-sm border border-base-300 lg:w-1/2 flex flex-col min-h-0">
          <div className="card-body p-4 flex flex-col min-h-0">
            <h3 className="font-semibold text-sm flex items-center gap-1.5 mb-3">
              <Send size={15} className="text-primary" />
              Compose Nudge
            </h3>

            {!selectedTask ? (
              <div className="text-sm text-base-content/50 text-center py-8">
                Select a task from the left to compose a nudge.
              </div>
            ) : (
              <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto">
                {/* Selected task indicator */}
                <div className="bg-base-200/50 rounded-lg px-3 py-2 text-sm">
                  <span className="text-base-content/60">Task: </span>
                  <span className="font-medium">{selectedTask.task_name}</span>
                </div>

                {/* Template picker */}
                <div className="form-control">
                  <label className="label py-1">
                    <span className="label-text text-xs">Template</span>
                  </label>
                  <select
                    className="select select-bordered select-sm w-full"
                    value={selectedTemplateId}
                    onChange={(e) => handleTemplateChange(e.target.value)}
                  >
                    <option value="">— No template (compose manually) —</option>
                    {templates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name} ({tpl.channel})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Recipient picker */}
                <div className="form-control">
                  <label className="label py-1">
                    <span className="label-text text-xs">Recipient</span>
                  </label>
                  <select
                    className="select select-bordered select-sm w-full"
                    value={recipientId}
                    onChange={(e) => setRecipientId(e.target.value)}
                  >
                    <option value="">— Select recipient —</option>
                    {deal.participants?.map((p) => (
                      <option key={p.contactId} value={p.contactId}>
                        {p.contactName} — {p.dealRole} ({p.side})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Channel toggle */}
                <div className="form-control">
                  <label className="label py-1">
                    <span className="label-text text-xs">Channel</span>
                  </label>
                  <div className="join w-full">
                    <button
                      className={`join-item btn btn-sm flex-1 ${
                        channel === 'email' ? 'btn-primary' : 'btn-ghost'
                      }`}
                      onClick={() => setChannel('email')}
                    >
                      <Mail size={14} />
                      Email
                    </button>
                    <button
                      className={`join-item btn btn-sm flex-1 ${
                        channel === 'sms' ? 'btn-primary' : 'btn-ghost'
                      }`}
                      onClick={() => setChannel('sms')}
                    >
                      <MessageSquare size={14} />
                      SMS
                    </button>
                  </div>
                </div>

                {/* Subject (email only) */}
                {channel === 'email' && (
                  <div className="form-control">
                    <label className="label py-1">
                      <span className="label-text text-xs">Subject</span>
                    </label>
                    <input
                      type="text"
                      className="input input-bordered input-sm w-full"
                      placeholder="Email subject..."
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </div>
                )}

                {/* Body */}
                <div className="form-control flex-1 min-h-0 flex flex-col">
                  <label className="label py-1">
                    <span className="label-text text-xs">Message</span>
                    <span className="label-text-alt text-xs text-base-content/40">
                      Tags: {'{{task_name}} {{due_date}} {{property_address}} {{deal_ref}}'}
                    </span>
                  </label>
                  <textarea
                    className="textarea textarea-bordered text-sm flex-1 min-h-[100px] w-full"
                    placeholder="Write your nudge message..."
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />
                </div>

                {/* Send button */}
                <button
                  className="btn btn-primary btn-sm gap-1.5"
                  onClick={handleSend}
                  disabled={sending}
                >
                  {sending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                  {sending ? 'Logging...' : 'Send Nudge'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ====== BOTTOM: Nudge History (collapsible) ====== */}
      <div className="card bg-base-100 shadow-sm border border-base-300">
        <div className="card-body p-0">
          <button
            className="flex items-center justify-between w-full px-4 py-3 hover:bg-base-200/50 transition-colors"
            onClick={() => setHistoryOpen(!historyOpen)}
          >
            <h3 className="font-semibold text-sm flex items-center gap-1.5">
              <Clock size={15} className="text-base-content/60" />
              Nudge History
              {nudgeLog.length > 0 && (
                <span className="badge badge-sm badge-ghost">
                  {nudgeLog.length}
                </span>
              )}
            </h3>
            {historyOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {historyOpen && (
            <div className="px-4 pb-4">
              {logLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 size={18} className="animate-spin text-base-content/50" />
                </div>
              ) : nudgeLog.length === 0 ? (
                <div className="text-sm text-base-content/50 text-center py-4">
                  No nudges sent for this deal yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table table-xs w-full">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Task</th>
                        <th>Recipient</th>
                        <th>Channel</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nudgeLog.map((entry) => {
                        const taskMatch = tasks.find(
                          (t) => t.task_id === entry.task_id
                        );
                        return (
                          <tr key={entry.id}>
                            <td className="whitespace-nowrap">
                              {formatDateTime(entry.sent_at)}
                            </td>
                            <td className="max-w-[160px] truncate">
                              {taskMatch?.task_name ?? entry.task_id}
                            </td>
                            <td>{getRecipientName(entry.recipient_id)}</td>
                            <td>
                              <span className="badge badge-xs badge-ghost gap-1">
                                {entry.channel === 'email' ? (
                                  <Mail size={10} />
                                ) : (
                                  <MessageSquare size={10} />
                                )}
                                {entry.channel}
                              </span>
                            </td>
                            <td>
                              <span
                                className={`badge badge-xs ${
                                  entry.delivery_status === 'sent'
                                    ? 'badge-info'
                                    : entry.delivery_status === 'delivered'
                                    ? 'badge-success'
                                    : entry.delivery_status === 'failed'
                                    ? 'badge-error'
                                    : 'badge-warning'
                                }`}
                              >
                                {entry.delivery_status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
