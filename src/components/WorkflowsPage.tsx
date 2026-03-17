import React, { useState, useEffect, useCallback } from 'react';
import {
  Zap, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, Clock, AlertTriangle, RefreshCw,
  Loader2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

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

const TRIGGER_LABELS: Record<string, string> = {
  sms_inbound: '📱 SMS Received',
  email_inbound: '📧 Email Received',
  deal_milestone: '🏠 Deal Milestone',
  deal_inactivity: '⏰ Deal Inactive',
  new_contact: '👤 New Contact',
  manual: '▶️ Manual',
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

// ── Component ─────────────────────────────────────────────────────────────────
export function WorkflowsPage() {
  const [rules, setRules] = useState<WorkflowRule[]>([]);
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'rules' | 'log'>('rules');
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const [{ data: rulesData }, { data: execData }] = await Promise.all([
      supabase.from('workflow_rules').select('*').order('created_at'),
      supabase
        .from('workflow_executions')
        .select('*')
        .order('executed_at', { ascending: false })
        .limit(50),
    ]);
    setRules(rulesData || []);
    setExecutions(execData || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleRule = async (rule: WorkflowRule) => {
    setToggling(rule.id);
    await supabase
      .from('workflow_rules')
      .update({ is_active: !rule.is_active, updated_at: new Date().toISOString() })
      .eq('id', rule.id);
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: !r.is_active } : r));
    setToggling(null);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const activeCount = rules.filter(r => r.is_active).length;
  const todayExecs = executions.filter(e => {
    const d = new Date(e.executed_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });
  const successToday = todayExecs.filter(e => e.status === 'success').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-gray-400" size={32} />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Zap size={22} className="text-amber-500" />
              Workflows
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              AI-powered automations — OpenAI detects events and triggers actions
            </p>
          </div>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Stats bar */}
        <div className="flex gap-4 mt-4">
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-medium text-green-700">{activeCount} Active</span>
          </div>
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
            <span className="text-sm text-gray-600">{rules.length - activeCount} Paused</span>
          </div>
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            <CheckCircle2 size={14} className="text-blue-600" />
            <span className="text-sm font-medium text-blue-700">{successToday} ran today</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 border-b border-gray-200">
          {(['rules', 'log'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                tab === t
                  ? 'bg-white border border-b-white border-gray-200 text-gray-900 -mb-px'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'rules' ? `Rules (${rules.length})` : `Execution Log (${executions.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'rules' && (
          <div className="space-y-3 max-w-3xl">
            {rules.map(rule => (
              <div
                key={rule.id}
                className={`bg-white rounded-xl border transition-all ${
                  rule.is_active ? 'border-gray-200 shadow-sm' : 'border-gray-100 opacity-60'
                }`}
              >
                <div className="flex items-center gap-3 p-4">
                  {/* Toggle */}
                  <button
                    onClick={() => toggleRule(rule)}
                    disabled={toggling === rule.id}
                    className={`flex-none w-10 h-6 rounded-full transition-colors relative ${
                      rule.is_active ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                  >
                    {toggling === rule.id ? (
                      <Loader2 size={12} className="animate-spin absolute inset-0 m-auto text-white" />
                    ) : (
                      <span
                        className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                          rule.is_active ? 'translate-x-5' : 'translate-x-1'
                        }`}
                      />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 text-sm">{rule.name}</span>
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                        {TRIGGER_LABELS[rule.trigger_type] || rule.trigger_type}
                      </span>
                      {rule.ai_classification_prompt && (
                        <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">
                          🤖 AI
                        </span>
                      )}
                    </div>
                    {rule.description && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{rule.description}</p>
                    )}
                  </div>

                  <button
                    onClick={() => setExpandedRule(expandedRule === rule.id ? null : rule.id)}
                    className="flex-none p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    {expandedRule === rule.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>

                {expandedRule === rule.id && (
                  <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">
                    {/* Actions */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Actions
                      </p>
                      <div className="space-y-1">
                        {(rule.actions as Array<{ type: string; title?: string; message?: string }>).map((a, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-gray-700">
                            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px]">
                              {i + 1}
                            </span>
                            <span>
                              {a.type === 'create_comm_task' && `Create task: "${a.title}"`}
                              {a.type === 'create_notification' && `Send notification: "${a.title}"`}
                              {a.type === 'sms_reply' && `SMS reply: "${a.message}"`}
                              {!['create_comm_task','create_notification','sms_reply'].includes(a.type) && a.type}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* AI Prompt preview */}
                    {rule.ai_classification_prompt && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          AI Classification Prompt
                        </p>
                        <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2 leading-relaxed line-clamp-3">
                          {rule.ai_classification_prompt}
                        </p>
                      </div>
                    )}

                    {/* Recent executions for this rule */}
                    {(() => {
                      const ruleExecs = executions.filter(e => e.rule_id === rule.id).slice(0, 3);
                      if (!ruleExecs.length) return null;
                      return (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                            Recent Runs
                          </p>
                          <div className="space-y-1">
                            {ruleExecs.map(e => (
                              <div key={e.id} className="flex items-center gap-2 text-xs">
                                {STATUS_ICONS[e.status]}
                                <span className="text-gray-500">
                                  {new Date(e.executed_at).toLocaleString()}
                                </span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_STYLES[e.status]}`}>
                                  {e.status}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            ))}

            <div className="text-center py-4">
              <p className="text-xs text-gray-400">
                Custom workflow rules can be added via the database.
              </p>
            </div>
          </div>
        )}

        {tab === 'log' && (
          <div className="max-w-3xl space-y-2">
            {executions.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Clock size={32} className="mx-auto mb-2 opacity-40" />
                <p>No workflow executions yet</p>
              </div>
            ) : (
              executions.map(exec => (
                <div
                  key={exec.id}
                  className="bg-white rounded-xl border border-gray-200 p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-none mt-0.5">{STATUS_ICONS[exec.status]}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-gray-900">{exec.rule_name}</span>
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                          {TRIGGER_LABELS[exec.trigger_type] || exec.trigger_type}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[exec.status]}`}>
                          {exec.status}
                        </span>
                      </div>
                      {exec.actions_taken.length > 0 && (
                        <p className="text-xs text-gray-500 mt-1">
                          Actions: {exec.actions_taken.join(' · ')}
                        </p>
                      )}
                      {exec.ai_classification && Object.keys(exec.ai_classification).length > 0 && (
                        <p className="text-xs text-purple-600 mt-1">
                          🤖 {JSON.stringify(exec.ai_classification).substring(0, 120)}
                        </p>
                      )}
                      {exec.error_message && (
                        <p className="text-xs text-red-500 mt-1">{exec.error_message}</p>
                      )}
                    </div>
                    <span className="flex-none text-xs text-gray-400">
                      {new Date(exec.executed_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
