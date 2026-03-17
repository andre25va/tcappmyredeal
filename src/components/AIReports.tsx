import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Users, Shield, Calendar, AlertTriangle, CheckCircle, Clock, Zap, ChevronDown, ChevronUp, Play, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { portfolioReportAI, PortfolioReportResponse, evaluateRulesAI, RulesEvaluationResponse } from '../ai/apiClient';
import { Deal } from '../types';

interface Props {
  deals: Deal[];
}

/* ════════════════════════════════════════════════════════════════
   AUTO ACTION RULES
   ════════════════════════════════════════════════════════════════ */

interface AutoRule {
  id: string;
  name: string;
  trigger: string;
  action: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  enabled: boolean;
}

const TRIGGER_OPTIONS = [
  'No response in X days',
  'Closing within X days',
  'Missing participant role',
  'Compliance item incomplete',
  'Task overdue by X days',
];

const ACTION_OPTIONS = [
  'Draft follow-up email',
  'Create task',
  'Flag as urgent',
  'Send notification',
  'Compliance alert',
];

const DEFAULT_RULES: AutoRule[] = [
  { id: 'r1', name: 'No lender response in 3+ days', trigger: 'No response in X days', action: 'Draft follow-up email', priority: 'medium', enabled: true },
  { id: 'r2', name: 'Closing within 7 days, title not cleared', trigger: 'Closing within X days', action: 'Flag as urgent', priority: 'high', enabled: true },
  { id: 'r3', name: 'Compliance item incomplete, closing within 14 days', trigger: 'Compliance item incomplete', action: 'Compliance alert', priority: 'high', enabled: true },
  { id: 'r4', name: 'Task overdue by 2+ days', trigger: 'Task overdue by X days', action: 'Create task', priority: 'medium', enabled: true },
  { id: 'r5', name: 'No activity in 5+ days', trigger: 'No response in X days', action: 'Send notification', priority: 'low', enabled: true },
];

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-blue-100 text-blue-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-red-100 text-red-700',
  urgent: 'bg-red-200 text-red-800',
};

const RISK_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-red-100 text-red-700',
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-gray-100 text-gray-600',
};

function generateRuleId(): string {
  return 'r_' + Math.random().toString(36).substr(2, 9);
}

/* ════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════════ */

export const AIReports: React.FC<Props> = ({ deals }) => {
  const [report, setReport] = useState<PortfolioReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto rules state
  const [rules, setRules] = useState<AutoRule[]>(() => {
    try {
      const saved = localStorage.getItem('tc-auto-rules');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_RULES;
  });
  const [rulesResult, setRulesResult] = useState<RulesEvaluationResponse | null>(null);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [showAddRule, setShowAddRule] = useState(false);
  const [newRule, setNewRule] = useState<Partial<AutoRule>>({ trigger: TRIGGER_OPTIONS[0], action: ACTION_OPTIONS[0], priority: 'medium' });

  // Persist rules
  useEffect(() => {
    localStorage.setItem('tc-auto-rules', JSON.stringify(rules));
  }, [rules]);

  const handleGenerateReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const dealSummaries = deals.map(d => ({
        id: d.id,
        propertyAddress: d.propertyAddress,
        stage: d.status,
        milestone: d.milestone,
        agentName: d.agentName,
        transactionType: d.transactionType,
        closingDate: d.closingDate,
        contractDate: d.contractDate,
        contractPrice: d.contractPrice,
        taskCount: d.tasks?.length || 0,
        completedTasks: d.tasks?.filter(t => t.completedAt)?.length || 0,
        pendingAlerts: d.documentRequests?.filter(r => r.status === 'pending')?.length || 0,
      }));
      const res = await portfolioReportAI(dealSummaries);
      setReport(res);
    } catch (err: any) {
      setError(err.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const handleRunRules = async () => {
    setRulesLoading(true);
    setRulesError(null);
    try {
      const enabledRules = rules.filter(r => r.enabled);
      const dealSummaries = deals.map(d => ({
        id: d.id,
        propertyAddress: d.propertyAddress,
        stage: d.status,
        milestone: d.milestone,
        agentName: d.agentName,
        transactionType: d.transactionType,
        closingDate: d.closingDate,
        contractDate: d.contractDate,
        contractPrice: d.contractPrice,
        taskCount: d.tasks?.length || 0,
        completedTasks: d.tasks?.filter(t => t.completedAt)?.length || 0,
        overdueTasks: d.tasks?.filter(t => !t.completedAt && t.dueDate < new Date().toISOString().slice(0, 10))?.length || 0,
        pendingAlerts: d.documentRequests?.filter(r => r.status === 'pending')?.length || 0,
      }));
      const res = await evaluateRulesAI(dealSummaries, enabledRules);
      setRulesResult(res);
    } catch (err: any) {
      setRulesError(err.message || 'Failed to evaluate rules');
    } finally {
      setRulesLoading(false);
    }
  };

  const addRule = () => {
    if (!newRule.name?.trim()) return;
    setRules(prev => [...prev, {
      id: generateRuleId(),
      name: newRule.name!.trim(),
      trigger: newRule.trigger || TRIGGER_OPTIONS[0],
      action: newRule.action || ACTION_OPTIONS[0],
      priority: (newRule.priority as AutoRule['priority']) || 'medium',
      enabled: true,
    }]);
    setNewRule({ trigger: TRIGGER_OPTIONS[0], action: ACTION_OPTIONS[0], priority: 'medium' });
    setShowAddRule(false);
  };

  const toggleRule = (id: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  const deleteRule = (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
  };

  // Find max for bar chart
  const maxDeals = report ? Math.max(...report.bottlenecks.map(b => b.dealCount), 1) : 1;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 bg-gray-50 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
            <BarChart3 size={20} className="text-primary-content" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-base-content">AI Portfolio Report</h1>
            {report && <p className="text-xs text-base-content/50">Generated: {report.generatedAt}</p>}
          </div>
        </div>
        <button
          onClick={handleGenerateReport}
          disabled={loading || deals.length === 0}
          className="btn btn-primary btn-sm gap-2"
        >
          {loading ? <span className="loading loading-spinner loading-xs" /> : <Zap size={14} />}
          {loading ? 'Generating...' : 'Generate Report'}
        </button>
      </div>

      {deals.length === 0 && (
        <div className="bg-white rounded-xl border p-8 text-center">
          <p className="text-base-content/50 text-sm">No deals in your portfolio. Add deals to generate a report.</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      {report && (
        <>
          {/* Executive Summary */}
          <div className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold text-base text-base-content flex items-center gap-2 mb-3">
              <TrendingUp size={16} className="text-primary" /> Executive Summary
            </h2>
            <p className="text-sm text-base-content/80 leading-relaxed whitespace-pre-wrap">{report.executiveSummary}</p>
          </div>

          {/* Bottleneck Analysis */}
          {report.bottlenecks.length > 0 && (
            <div className="bg-white rounded-xl border p-5">
              <h2 className="font-semibold text-base text-base-content flex items-center gap-2 mb-4">
                <AlertTriangle size={16} className="text-amber-500" /> Bottleneck Analysis
              </h2>
              <div className="space-y-3">
                {report.bottlenecks.map((b, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-base-content">{b.stage}</span>
                      <span className="text-xs text-base-content/50">{b.dealCount} deal{b.dealCount !== 1 ? 's' : ''} · avg {b.avgDaysStuck}d stuck</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-5 overflow-hidden">
                      <div
                        className="h-full bg-amber-400 rounded-full flex items-center justify-end pr-2 transition-all duration-500"
                        style={{ width: `${Math.max((b.dealCount / maxDeals) * 100, 10)}%` }}
                      >
                        <span className="text-[10px] font-bold text-amber-800">{b.dealCount}</span>
                      </div>
                    </div>
                    <p className="text-xs text-base-content/60">{b.description}</p>
                    <p className="text-xs text-primary font-medium">💡 {b.recommendation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Agent Performance */}
          {report.agentPerformance.length > 0 && (
            <div className="bg-white rounded-xl border p-5">
              <h2 className="font-semibold text-base text-base-content flex items-center gap-2 mb-4">
                <Users size={16} className="text-blue-500" /> Agent Performance
              </h2>
              <div className="overflow-x-auto">
                <table className="table table-sm w-full">
                  <thead>
                    <tr className="text-xs text-base-content/50">
                      <th>Agent</th>
                      <th className="text-center">Active Deals</th>
                      <th className="text-center">Avg Days</th>
                      <th className="text-center">Task %</th>
                      <th className="text-center">Risk</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.agentPerformance.map((a, i) => (
                      <tr key={i} className="text-sm">
                        <td className="font-medium">{a.agentName}</td>
                        <td className="text-center">{a.activeDealCount}</td>
                        <td className="text-center">{a.avgDaysToClose}</td>
                        <td className="text-center">{Math.round(a.taskCompletionRate)}%</td>
                        <td className="text-center">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${RISK_COLORS[a.riskLevel] || 'bg-gray-100 text-gray-600'}`}>
                            {a.riskLevel}
                          </span>
                        </td>
                        <td className="text-xs text-base-content/60 max-w-[200px] truncate">{a.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Compliance Overview */}
          <div className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold text-base text-base-content flex items-center gap-2 mb-4">
              <Shield size={16} className="text-emerald-500" /> Compliance Overview
            </h2>
            <div className="flex items-start gap-6">
              <div className="flex-none text-center">
                <div className="relative w-20 h-20">
                  <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 36 36">
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none" stroke="#e5e7eb" strokeWidth="3" />
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none" stroke={report.complianceOverview.overallScore >= 80 ? '#10b981' : report.complianceOverview.overallScore >= 60 ? '#f59e0b' : '#ef4444'}
                      strokeWidth="3" strokeDasharray={`${report.complianceOverview.overallScore}, 100`} />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-base-content">
                    {report.complianceOverview.overallScore}
                  </span>
                </div>
                <p className="text-[10px] text-base-content/50 mt-1">Score</p>
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={12} className="text-red-500" />
                  <span className="text-sm text-base-content">{report.complianceOverview.atRiskDeals} at-risk deal{report.complianceOverview.atRiskDeals !== 1 ? 's' : ''}</span>
                </div>
                {report.complianceOverview.commonGaps.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-base-content/50 mb-1">Common Gaps:</p>
                    <ul className="space-y-0.5">
                      {report.complianceOverview.commonGaps.map((g, i) => (
                        <li key={i} className="text-xs text-base-content/70 flex items-center gap-1">
                          <span className="w-1 h-1 rounded-full bg-red-400 flex-none" /> {g}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-xs text-primary font-medium mt-2">💡 {report.complianceOverview.recommendation}</p>
              </div>
            </div>
          </div>

          {/* Closing Forecast */}
          {report.closingForecast.length > 0 && (
            <div className="bg-white rounded-xl border p-5">
              <h2 className="font-semibold text-base text-base-content flex items-center gap-2 mb-4">
                <Calendar size={16} className="text-purple-500" /> Closing Forecast
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {report.closingForecast.map((f, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg border p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-base-content">{f.period}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${CONFIDENCE_COLORS[f.confidence] || 'bg-gray-100 text-gray-600'}`}>
                        {f.confidence}
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-primary">{f.expectedClosings}</p>
                    <p className="text-xs text-base-content/50">expected closing{f.expectedClosings !== 1 ? 's' : ''}</p>
                    {f.totalVolume > 0 && (
                      <p className="text-xs text-base-content/60 mt-1">${f.totalVolume.toLocaleString()} volume</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Items */}
          {report.actionItems.length > 0 && (
            <div className="bg-white rounded-xl border p-5">
              <h2 className="font-semibold text-base text-base-content flex items-center gap-2 mb-3">
                <CheckCircle size={16} className="text-green-500" /> Action Items
              </h2>
              <ol className="space-y-2">
                {report.actionItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-base-content/80">
                    <span className="flex-none w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">{i + 1}</span>
                    <span className="pt-0.5">{item}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════════
         AUTO ACTION RULES SECTION
         ════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl border p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-base text-base-content flex items-center gap-2">
            <Zap size={16} className="text-amber-500" /> Auto Action Rules
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddRule(true)}
              className="btn btn-xs btn-ghost gap-1"
            >
              <Plus size={11} /> Add Rule
            </button>
            <button
              onClick={handleRunRules}
              disabled={rulesLoading || deals.length === 0 || rules.filter(r => r.enabled).length === 0}
              className="btn btn-xs btn-primary gap-1"
            >
              {rulesLoading ? <span className="loading loading-spinner loading-xs" /> : <Play size={11} />}
              {rulesLoading ? 'Running...' : 'Run Rules Check'}
            </button>
          </div>
        </div>

        {/* Rule Builder */}
        {showAddRule && (
          <div className="bg-gray-50 border rounded-lg p-3 mb-4 space-y-2">
            <input
              className="input input-bordered input-sm w-full"
              placeholder="Rule name..."
              value={newRule.name || ''}
              onChange={e => setNewRule(prev => ({ ...prev, name: e.target.value }))}
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select
                className="select select-bordered select-sm w-full"
                value={newRule.trigger}
                onChange={e => setNewRule(prev => ({ ...prev, trigger: e.target.value }))}
              >
                {TRIGGER_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select
                className="select select-bordered select-sm w-full"
                value={newRule.action}
                onChange={e => setNewRule(prev => ({ ...prev, action: e.target.value }))}
              >
                {ACTION_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <select
                className="select select-bordered select-sm w-full"
                value={newRule.priority}
                onChange={e => setNewRule(prev => ({ ...prev, priority: e.target.value as AutoRule['priority'] }))}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAddRule(false)} className="btn btn-xs btn-ghost">Cancel</button>
              <button onClick={addRule} className="btn btn-xs btn-primary">Add Rule</button>
            </div>
          </div>
        )}

        {/* Rules List */}
        <div className="space-y-1.5 mb-4">
          {rules.map(rule => (
            <div key={rule.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${rule.enabled ? 'bg-white border-base-300' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
              <button onClick={() => toggleRule(rule.id)} className="flex-none" title={rule.enabled ? 'Disable' : 'Enable'}>
                {rule.enabled ? <ToggleRight size={18} className="text-primary" /> : <ToggleLeft size={18} className="text-gray-400" />}
              </button>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-base-content truncate block">{rule.name}</span>
                <span className="text-[10px] text-base-content/40">{rule.trigger} → {rule.action}</span>
              </div>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${PRIORITY_COLORS[rule.priority]}`}>
                {rule.priority}
              </span>
              <button onClick={() => deleteRule(rule.id)} className="btn btn-ghost btn-xs text-red-400 hover:text-red-600">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>

        {/* Rules Error */}
        {rulesError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 mb-3">
            {rulesError}
          </div>
        )}

        {/* Rules Results */}
        {rulesResult && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-base-content/50">
              <span>{rulesResult.rulesChecked} rules checked · {rulesResult.dealsScanned} deals scanned</span>
              <span>{rulesResult.triggeredRules.length} triggered</span>
            </div>

            {rulesResult.triggeredRules.length === 0 && (
              <p className="text-xs text-center text-base-content/50 py-2">No rules triggered — all clear!</p>
            )}

            {rulesResult.triggeredRules.map((tr, i) => (
              <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-base-content">{tr.ruleName}</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${PRIORITY_COLORS[tr.priority] || 'bg-gray-100'}`}>
                      {tr.priority}
                    </span>
                    <span className="text-[10px] text-base-content/40">{Math.round(tr.confidence * 100)}%</span>
                  </div>
                </div>
                <p className="text-xs text-base-content/70">{tr.dealAddress}</p>
                <p className="text-xs text-base-content/60">{tr.triggerReason}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-primary font-medium">💡 {tr.suggestedAction}</p>
                  <button className="btn btn-xs btn-ghost text-primary" onClick={() => console.log('Apply action:', tr)}>
                    Apply
                  </button>
                </div>
              </div>
            ))}

            {rulesResult.summary && (
              <p className="text-xs text-base-content/60 italic">{rulesResult.summary}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
