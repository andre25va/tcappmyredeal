import React, { useState } from 'react';
import {
  Zap, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, Clock, AlertTriangle, RefreshCw,
  Loader2, Plus, X, Save, ToggleLeft, ToggleRight, Info,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { Button } from './ui/Button';
import { useWorkflowRules, useInvalidateWorkflowRules } from '../hooks/useWorkflowRules';
import { useWorkflowExecutions, useInvalidateWorkflowExecutions } from '../hooks/useWorkflowExecutions';

// ── Types ─────────────────────────────────────────────────────────────────────
interface WorkflowRule {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  is_active: boolean;
  conditions: Record<string, unknown>;
  actions: Array<{ type: string; [k: string]: unknown }>;
  ai_classification_prompt: string | null;
  created_at: string;
}

interface WorkflowExecution {
  id: string;
  rule_id: string | null;
  rule_name: string;
  trigger_type: string;
  trigger_data: Record<string, unknown>;
  ai_classification: Record<string, unknown> | null;
  actions_taken: string[];
  status: 'success' | 'partial' | 'failed' | 'skipped';
  error_message: string | null;
  executed_at: string;
}

const TRIGGER_OPTIONS = [
  { value: 'sms_inbound',    label: '📱 SMS Received',      desc: 'Fires when a client texts in' },
  { value: 'email_inbound',  label: '📧 Email Received',    desc: 'Fires when an email arrives' },
  { value: 'deal_milestone', label: '🏠 Deal Milestone',    desc: 'Fires when a deal stage changes' },
  { value: 'deal_inactivity',label: '⏰ Deal Inactive',     desc: 'Fires when no activity for N days' },
  { value: 'new_contact',    label: '👤 New Contact',       desc: 'Fires when a contact is created' },
  { value: 'manual',         label: '▶️ Manual',            desc: 'Triggered manually by TC' },
  { value: 'callback_request', label: '📞 Callback Requested', desc: 'Fires when a client requests a callback' },
  { value: 'call_completed',   label: '📱 Call Completed',     desc: 'Fires when an outbound call ends' },
];

const ACTION_OPTIONS = [
  { value: 'create_comm_task',   label: '✅ Create Comm Task' },
  { value: 'create_notification',label: '🔔 Create Notification' },
  { value: 'send_sms',           label: '📱 Send SMS' },
  { value: 'send_email',         label: '📧 Send Email' },
  { value: 'flag_deal',          label: '🚩 Flag Deal' },
  { value: 'create_deal',        label: '🏠 Create Draft Deal' },
  { value: 'request_callback', label: '📞 Request Callback' },
  { value: 'initiate_call',    label: '📱 Initiate Call' },
];

const TRIGGER_LABELS: Record<string, string> = {
  sms_inbound: '📱 SMS Received',
  email_inbound: '📧 Email Received',
  deal_milestone: '🏠 Deal Milestone',
  deal_inactivity: '⏰ Deal Inactive',
  new_contact: '👤 New Contact',
  manual: '▶️ Manual',
  callback_request: '📞 Callback Requested',
  call_completed: '📱 Call Completed',
};

const STATUS_STYLES: Record<string, string> = {
  success: 'bg-green-100 text-green-700',
  partial: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-700',
  skipped: 'bg-gray-100 text-gray-500',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  success: <CheckCircle2 size={14} className="text-green-600" />,
  partial: <AlertTriangle size={14} className="text-yellow-600" />,
  failed: <XCircle size={14} className="text-red-600" />,
  skipped: <Clock size={14} className="text-gray-400" />,
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// ── Create Workflow Modal ──────────────────────────────────────────────────────
interface CreateModalProps {
  onClose: () => void;
  onSaved: () => void;
}

function CreateWorkflowModal({ onClose, onSaved }: CreateModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState('sms_inbound');
  const [aiPrompt, setAiPrompt] = useState('');
  const [selectedActions, setSelectedActions] = useState<string[]>(['create_comm_task']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleAction = (val: string) => {
    setSelectedActions(prev =>
      prev.includes(val) ? prev.filter(a => a !== val) : [...prev, val]
    );
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    if (selectedActions.length === 0) { setError('Select at least one action'); return; }
    setSaving(true);
    setError('');
    const actions = selectedActions.map(type => ({ type }));
    const { error: err } = await supabase.from('workflow_rules').insert({
      name: name.trim(),
      description: description.trim() || null,
      trigger_type: triggerType,
      is_active: true,
      conditions: {},
      actions,
      ai_classification_prompt: aiPrompt.trim() || null,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved();
    onClose();
  };

  const selectedTrigger = TRIGGER_OPTIONS.find(t => t.value === triggerType);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
              <Zap size={16} className="text-violet-600" />
            </div>
            <h2 className="font-bold text-gray-900">Create Workflow</h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm btn-square">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Workflow Name *</label>
            <input
              className="input input-bordered w-full text-sm"
              placeholder="e.g. Contract Email Detection"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Description</label>
            <input
              className="input input-bordered w-full text-sm"
              placeholder="What does this workflow do?"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          {/* Trigger */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Trigger</label>
            <div className="grid grid-cols-2 gap-2">
              {TRIGGER_OPTIONS.map(t => (
                <button
                  key={t.value}
                  onClick={() => setTriggerType(t.value)}
                  className={`text-left p-3 rounded-xl border-2 transition-all ${
                    triggerType === t.value
                      ? 'border-violet-500 bg-violet-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-sm font-medium text-gray-800">{t.label}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* AI Prompt */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">OpenAI Classification Prompt</label>
              <div className="tooltip" data-tip="OpenAI reads the inbound message using this prompt to decide if this workflow should fire">
                <Info size={12} className="text-gray-400" />
              </div>
            </div>
            <textarea
              className="textarea textarea-bordered w-full text-sm resize-none"
              rows={3}
              placeholder={`e.g. "Is this message a new real estate contract submission? Reply with JSON: { isMatch: boolean, confidence: number, extractedAddress: string | null }"`}
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Leave blank to skip AI — workflow fires for ALL {selectedTrigger?.label} events.
            </p>
          </div>

          {/* Actions */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Actions (what happens when triggered) *</label>
            <div className="grid grid-cols-2 gap-2">
              {ACTION_OPTIONS.map(a => (
                <label
                  key={a.value}
                  className={`flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    selectedActions.includes(a.value)
                      ? 'border-violet-500 bg-violet-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="checkbox checkbox-xs"
                    checked={selectedActions.includes(a.value)}
                    onChange={() => toggleAction(a.value)}
                  />
                  <span className="text-sm text-gray-800">{a.label}</span>
                </label>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary btn-sm gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Create Workflow
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function WorkflowsPage() {
  const { data: rules = [] as WorkflowRule[], isLoading: loadingRules } = useWorkflowRules();
  const { data: executions = [] as WorkflowExecution[], isLoading: loadingExecs } = useWorkflowExecutions();
  const invalidateRules = useInvalidateWorkflowRules();
  const invalidateExecutions = useInvalidateWorkflowExecutions();

  const loading = loadingRules || loadingExecs;

  const [tab, setTab] = useState<'rules' | 'log'>('rules');
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([invalidateRules(), invalidateExecutions()]);
    setRefreshing(false);
  };

  const handleToggle = async (rule: WorkflowRule) => {
    setToggling(rule.id);
    await supabase
      .from('workflow_rules')
      .update({ is_active: !rule.is_active })
      .eq('id', rule.id);
    await invalidateRules();
    setToggling(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this workflow? This cannot be undone.')) return;
    setDeleting(id);
    await supabase.from('workflow_rules').delete().eq('id', id);
    await invalidateRules();
    setDeleting(null);
  };

  const handleWorkflowSaved = () => {
    invalidateRules();
    invalidateExecutions();
  };

  const activeCount = (rules as WorkflowRule[]).filter(r => r.is_active).length;
  const todayStr = new Date().toDateString();
  const todayCount = (executions as WorkflowExecution[]).filter(e =>
    new Date(e.executed_at).toDateString() === todayStr
  ).length;

  // Executions grouped by rule for the rules tab
  const execByRule = (executions as WorkflowExecution[]).reduce<Record<string, WorkflowExecution[]>>((acc, e) => {
    if (e.rule_id) { acc[e.rule_id] = [...(acc[e.rule_id] || []), e]; }
    return acc;
  }, {});

  if (loading) {
    return (
      <LoadingSpinner />
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {showCreate && (
        <CreateWorkflowModal
          onClose={() => setShowCreate(false)}
          onSaved={handleWorkflowSaved}
        />
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center">
              <Zap size={18} className="text-violet-600" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-lg leading-tight">Workflows</h1>
              <p className="text-xs text-gray-400">AI-powered automations — Admin only</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="btn btn-ghost btn-sm btn-square"
              title="Refresh"
            >
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="btn btn-primary btn-sm gap-2"
            >
              <Plus size={15} />
              New Workflow
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-6 mt-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-xs text-gray-500">{activeCount} active</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-gray-300" />
            <span className="text-xs text-gray-500">{(rules as WorkflowRule[]).length - activeCount} paused</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Zap size={11} className="text-violet-400" />
            <span className="text-xs text-gray-500">{todayCount} ran today</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 border-b border-gray-100">
          {(['rules', 'log'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === t
                  ? 'border-violet-500 text-violet-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {t === 'rules' ? `Rules (${(rules as WorkflowRule[]).length})` : `Execution Log (${(executions as WorkflowExecution[]).length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'rules' && (
          <div className="flex flex-col gap-3">
            {(rules as WorkflowRule[]).length === 0 && (
              <div className="text-center py-16">
                <div className="w-14 h-14 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Zap size={24} className="text-violet-300" />
                </div>
                <p className="font-semibold text-gray-500">No workflows yet</p>
                <p className="text-sm text-gray-400 mt-1">Create your first automation above</p>
              </div>
            )}
            {(rules as WorkflowRule[]).map(rule => {
              const ruleExecs = execByRule[rule.id] || [];
              const isExpanded = expandedRule === rule.id;
              const lastRun = ruleExecs[0];
              return (
                <div key={rule.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  {/* Rule header */}
                  <div className="flex items-start gap-3 p-4">
                    {/* Toggle */}
                    <button
                      onClick={() => handleToggle(rule)}
                      disabled={toggling === rule.id}
                      className="mt-0.5 flex-none"
                      title={rule.is_active ? 'Pause workflow' : 'Activate workflow'}
                    >
                      {toggling === rule.id ? (
                        <Loader2 size={22} className="animate-spin text-gray-300" />
                      ) : rule.is_active ? (
                        <ToggleRight size={22} className="text-violet-500" />
                      ) : (
                        <ToggleLeft size={22} className="text-gray-300" />
                      )}
                    </button>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 text-sm">{rule.name}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          rule.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                        }`}>
                          {rule.is_active ? 'ACTIVE' : 'PAUSED'}
                        </span>
                        <span className="text-[10px] bg-violet-50 text-violet-600 font-medium px-2 py-0.5 rounded-full">
                          {TRIGGER_LABELS[rule.trigger_type] || rule.trigger_type}
                        </span>
                      </div>
                      {rule.description && (
                        <p className="text-xs text-gray-400 mt-0.5">{rule.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5">
                        {lastRun ? (
                          <span className="text-[11px] text-gray-400 flex items-center gap-1">
                            {STATUS_ICONS[lastRun.status]}
                            Last ran {fmtTime(lastRun.executed_at)}
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-300">Never run</span>
                        )}
                        <span className="text-[11px] text-gray-300">•</span>
                        <span className="text-[11px] text-gray-400">{ruleExecs.length} total runs</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-none">
                      <button
                        onClick={() => setExpandedRule(isExpanded ? null : rule.id)}
                        className="btn btn-ghost btn-xs btn-square"
                        title="View details"
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                      <button
                        onClick={() => handleDelete(rule.id)}
                        disabled={deleting === rule.id}
                        className="btn btn-ghost btn-xs btn-square text-red-400 hover:text-red-600 hover:bg-red-50"
                        title="Delete workflow"
                      >
                        {deleting === rule.id ? <Loader2 size={12} className="animate-spin" /> : <X size={14} />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50 px-5 py-4 flex flex-col gap-3">
                      <div className="grid grid-cols-2 gap-4">
                        {/* Actions */}
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Actions</p>
                          <div className="flex flex-col gap-1.5">
                            {rule.actions.map((a, i) => (
                              <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600 bg-white px-3 py-1.5 rounded-lg border border-gray-200">
                                <CheckCircle2 size={12} className="text-violet-400 flex-none" />
                                {ACTION_OPTIONS.find(o => o.value === a.type)?.label || a.type}
                              </div>
                            ))}
                          </div>
                        </div>
                        {/* AI Prompt */}
                        {rule.ai_classification_prompt && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">AI Prompt</p>
                            <p className="text-[11px] text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-2 leading-relaxed">
                              {rule.ai_classification_prompt}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Recent runs for this rule */}
                      {ruleExecs.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Recent Runs</p>
                          <div className="flex flex-col gap-1.5">
                            {ruleExecs.slice(0, 5).map(e => (
                              <div key={e.id} className="flex items-center gap-2 text-[11px] text-gray-500 bg-white px-3 py-1.5 rounded-lg border border-gray-200">
                                {STATUS_ICONS[e.status]}
                                <span className={`font-medium px-1.5 py-0.5 rounded-full text-[10px] ${STATUS_STYLES[e.status]}`}>
                                  {e.status}
                                </span>
                                <span className="flex-1 truncate">
                                  {e.actions_taken?.join(', ') || 'No actions'}
                                </span>
                                <span className="text-gray-300 flex-none">{fmtTime(e.executed_at)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'log' && (
          <div className="flex flex-col gap-2">
            {(executions as WorkflowExecution[]).length === 0 && (
              <div className="text-center py-16">
                <Clock size={28} className="text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">No executions yet</p>
              </div>
            )}
            {(executions as WorkflowExecution[]).map(e => (
              <div key={e.id} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex items-start gap-3">
                <div className="mt-0.5 flex-none">{STATUS_ICONS[e.status]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-gray-800">{e.rule_name}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_STYLES[e.status]}`}>
                      {e.status.toUpperCase()}
                    </span>
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                      {TRIGGER_LABELS[e.trigger_type] || e.trigger_type}
                    </span>
                  </div>
                  {e.actions_taken?.length > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">{e.actions_taken.join(' → ')}</p>
                  )}
                  {e.ai_classification && (
                    <p className="text-[11px] text-gray-300 mt-0.5">
                      AI: {JSON.stringify(e.ai_classification).slice(0, 80)}…
                    </p>
                  )}
                  {e.error_message && (
                    <p className="text-[11px] text-red-400 mt-0.5">{e.error_message}</p>
                  )}
                </div>
                <span className="text-[11px] text-gray-300 flex-none mt-0.5 whitespace-nowrap">
                  {fmtTime(e.executed_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
