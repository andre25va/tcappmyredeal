import React, { useState } from 'react';
import {
  AlertTriangle, AlertCircle, Info, RefreshCw, CheckCircle2,
  Clock, XCircle, ChevronDown, ChevronUp, Zap, Building2
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface DealIssue {
  id: string;
  deal_id: string;
  issue_type: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  suggested_action: string;
  action_type: string;
  action_payload: Record<string, unknown>;
  status: 'open' | 'snoozed' | 'dismissed' | 'resolved';
  loop_run_at: string;
  created_at: string;
}

// ─────────────────────────────────────────────
// Severity config
// ─────────────────────────────────────────────
const SEVERITY_CONFIG = {
  critical: {
    bg: 'bg-error/10 border-error/30',
    badge: 'badge-error',
    icon: <AlertCircle size={14} className="text-error shrink-0 mt-0.5" />,
    label: 'Critical',
  },
  warning: {
    bg: 'bg-warning/10 border-warning/30',
    badge: 'badge-warning',
    icon: <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />,
    label: 'Warning',
  },
  info: {
    bg: 'bg-base-300/60 border-base-300',
    badge: 'badge-ghost',
    icon: <Info size={14} className="text-base-content/50 shrink-0 mt-0.5" />,
    label: 'Info',
  },
};

// ─────────────────────────────────────────────
// Issue Row
// ─────────────────────────────────────────────
const IssueRow: React.FC<{
  issue: DealIssue;
  onDismiss: (id: string) => void;
  onSnooze: (id: string) => void;
  onSelectDeal?: (dealId: string) => void;
  onGoToDeals?: () => void;
  dismissingId: string | null;
  snoozingId: string | null;
}> = ({ issue, onDismiss, onSnooze, onSelectDeal, onGoToDeals, dismissingId, snoozingId }) => {
  const cfg = SEVERITY_CONFIG[issue.severity] ?? SEVERITY_CONFIG.info;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-lg border p-3 ${cfg.bg}`}>
      <div className="flex items-start gap-2">
        {cfg.icon}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <button
              className="text-xs font-semibold text-left leading-snug hover:underline"
              onClick={() => {
                if (onSelectDeal && onGoToDeals) {
                  onSelectDeal(issue.deal_id);
                  onGoToDeals();
                }
              }}
            >
              {issue.title}
            </button>
            <button
              className="text-base-content/30 hover:text-base-content/60 shrink-0"
              onClick={() => setExpanded(e => !e)}
            >
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>

          {expanded && (
            <div className="mt-1.5 space-y-1">
              {issue.description && (
                <p className="text-[11px] text-base-content/60 leading-relaxed">{issue.description}</p>
              )}
              {issue.suggested_action && (
                <p className="text-[11px] text-primary/80 font-medium">💡 {issue.suggested_action}</p>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <button
              className="btn btn-xs btn-ghost gap-1 opacity-60 hover:opacity-100"
              disabled={snoozingId === issue.id}
              onClick={() => onSnooze(issue.id)}
            >
              {snoozingId === issue.id
                ? <span className="loading loading-spinner loading-xs" />
                : <Clock size={10} />}
              Snooze 1d
            </button>
            <button
              className="btn btn-xs btn-ghost gap-1 opacity-60 hover:opacity-100 text-error hover:text-error"
              disabled={dismissingId === issue.id}
              onClick={() => onDismiss(issue.id)}
            >
              {dismissingId === issue.id
                ? <span className="loading loading-spinner loading-xs" />
                : <XCircle size={10} />}
              Dismiss
            </button>
            {(onSelectDeal && onGoToDeals) && (
              <button
                className="btn btn-xs btn-primary gap-1 ml-auto"
                onClick={() => { onSelectDeal(issue.deal_id); onGoToDeals(); }}
              >
                <Building2 size={10} /> Open Deal
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────
interface DealLoopDashboardProps {
  onSelectDeal?: (dealId: string) => void;
  onGoToDeals?: () => void;
}

export const DealLoopDashboard: React.FC<DealLoopDashboardProps> = ({
  onSelectDeal,
  onGoToDeals,
}) => {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [lastRunResult, setLastRunResult] = useState<{ checked: number; issues_found: number } | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'critical' | 'warning' | 'info'>('all');
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [snoozingId, setSnoozingId] = useState<string | null>(null);

  // ── Fetch open issues ──────────────────────────────────────────────────────
  const { data: issues = [], isLoading, dataUpdatedAt } = useQuery<DealIssue[]>({
    queryKey: ['deal-issues', 'open'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_issues')
        .select('*')
        .eq('status', 'open')
        .or('snoozed_until.is.null,snoozed_until.lte.' + new Date().toISOString())
        .order('severity', { ascending: true }) // critical < info alphabetically — reorder below
        .order('loop_run_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: true,
  });

  // ── Sort: critical → warning → info ──────────────────────────────────────
  const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  const sortedIssues = [...issues].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3)
  );
  const filtered = filterSeverity === 'all'
    ? sortedIssues
    : sortedIssues.filter(i => i.severity === filterSeverity);

  const criticalCount = issues.filter(i => i.severity === 'critical').length;
  const warningCount  = issues.filter(i => i.severity === 'warning').length;
  const infoCount     = issues.filter(i => i.severity === 'info').length;

  // ── Run Check Now ─────────────────────────────────────────────────────────
  const handleRunCheck = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('deal-loop');
      if (error) throw error;
      setLastRunResult(data);
      queryClient.invalidateQueries({ queryKey: ['deal-issues'] });
    } catch (err) {
      console.error('Deal loop error:', err);
    } finally {
      setRunning(false);
    }
  };

  // ── Dismiss ───────────────────────────────────────────────────────────────
  const handleDismiss = async (issueId: string) => {
    setDismissingId(issueId);
    try {
      await supabase
        .from('deal_issues')
        .update({ status: 'dismissed', resolved_at: new Date().toISOString() })
        .eq('id', issueId);
      queryClient.invalidateQueries({ queryKey: ['deal-issues'] });
    } finally {
      setDismissingId(null);
    }
  };

  // ── Snooze 1 day ─────────────────────────────────────────────────────────
  const handleSnooze = async (issueId: string) => {
    setSnoozingId(issueId);
    const snoozeUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    try {
      await supabase
        .from('deal_issues')
        .update({ status: 'snoozed', snoozed_until: snoozeUntil })
        .eq('id', issueId);
      queryClient.invalidateQueries({ queryKey: ['deal-issues'] });
    } finally {
      setSnoozingId(null);
    }
  };

  // ── Last run time ─────────────────────────────────────────────────────────
  const lastRunAt = issues.length > 0
    ? new Date(issues[0].loop_run_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <div className="card bg-base-200 border border-base-300">
      <div className="card-body p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Zap size={15} className={criticalCount > 0 ? 'text-error' : 'text-primary'} />
            Deal Loop
            {issues.length > 0 && (
              <span className={`badge badge-sm ${criticalCount > 0 ? 'badge-error animate-pulse' : 'badge-warning'}`}>
                {issues.length} issue{issues.length !== 1 ? 's' : ''}
              </span>
            )}
          </h2>
          <div className="flex items-center gap-1.5">
            {lastRunAt && (
              <span className="text-[10px] text-base-content/30 hidden sm:block">
                Last: {lastRunAt}
              </span>
            )}
            <button
              className="btn btn-xs btn-ghost gap-1"
              onClick={handleRunCheck}
              disabled={running}
              title="Run check now"
            >
              {running
                ? <span className="loading loading-spinner loading-xs" />
                : <RefreshCw size={11} className={running ? 'animate-spin' : ''} />}
              <span className="hidden sm:inline">Run Check</span>
            </button>
          </div>
        </div>

        {/* Last run result toast */}
        {lastRunResult && (
          <div className="alert alert-success py-1.5 px-3 mb-2">
            <CheckCircle2 size={13} />
            <span className="text-xs">
              Checked {lastRunResult.checked} deals — found {lastRunResult.issues_found} issue{lastRunResult.issues_found !== 1 ? 's' : ''}
            </span>
            <button className="ml-auto text-xs opacity-60" onClick={() => setLastRunResult(null)}>✕</button>
          </div>
        )}

        {/* Severity filter tabs */}
        {issues.length > 0 && (
          <div className="flex gap-1 mb-2 flex-wrap">
            {(['all', 'critical', 'warning', 'info'] as const).map(s => (
              <button
                key={s}
                className={`btn btn-xs ${filterSeverity === s ? 'btn-neutral' : 'btn-ghost opacity-60'}`}
                onClick={() => setFilterSeverity(s)}
              >
                {s === 'all' ? `All (${issues.length})`
                  : s === 'critical' ? `🔴 ${criticalCount}`
                  : s === 'warning'  ? `🟡 ${warningCount}`
                  : `⚪ ${infoCount}`}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center h-16 gap-2 text-base-content/30">
            <span className="loading loading-spinner loading-sm" />
            <span className="text-xs">Scanning deals…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-16 gap-1.5 text-base-content/30">
            <CheckCircle2 size={20} />
            <span className="text-xs">
              {issues.length === 0
                ? 'No issues found — all deals look good 🎉'
                : `No ${filterSeverity} issues`}
            </span>
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
            {filtered.map(issue => (
              <IssueRow
                key={issue.id}
                issue={issue}
                onDismiss={handleDismiss}
                onSnooze={handleSnooze}
                onSelectDeal={onSelectDeal}
                onGoToDeals={onGoToDeals}
                dismissingId={dismissingId}
                snoozingId={snoozingId}
              />
            ))}
          </div>
        )}

        {/* Footer hint */}
        <p className="text-[10px] text-base-content/25 mt-2 text-center">
          Runs daily at 7am CT · AI surfaces issues, you decide what to do
        </p>
      </div>
    </div>
  );
};
