import React, { useState } from 'react';
import {
  Shield, CheckCircle, AlertTriangle, XCircle,
  RefreshCw, Clock, Download, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Deal } from '../types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { WorkspaceSignatureMap } from './WorkspaceSignatureMap';
import { useDealEmails } from '../hooks/useDealEmails';

/* ─── Types ─── */
interface ComplianceResult {
  rule_code: string;
  rule_name: string;
  severity: 'error' | 'warning' | 'info';
  passed: boolean;
  message: string;
}

interface ComplianceCheck {
  id: string;
  deal_id: string;
  run_at: string;
  state: string | null;
  form_type: string | null;
  total_rules_checked: number;
  passed_count: number;
  warning_count: number;
  violation_count: number;
  results: ComplianceResult[];
}

interface Props {
  deal: Deal;
}

/* ─── Map old AI response → compliance_checks row ─── */
function mapAiResponseToCheck(
  dealId: string,
  dealState: string | null,
  aiResponse: { status: string; missingItems: string[]; inconsistentItems: string[]; notes: string[]; summary: string },
): Omit<ComplianceCheck, 'id'> {
  const results: ComplianceResult[] = [];

  aiResponse.missingItems.forEach((item, i) => {
    results.push({
      rule_code: `MISSING_${i}`,
      rule_name: item,
      severity: 'error',
      passed: false,
      message: item,
    });
  });

  aiResponse.inconsistentItems.forEach((item, i) => {
    results.push({
      rule_code: `INCONSISTENT_${i}`,
      rule_name: item,
      severity: 'warning',
      passed: false,
      message: item,
    });
  });

  aiResponse.notes.forEach((note, i) => {
    results.push({
      rule_code: `NOTE_${i}`,
      rule_name: note,
      severity: 'info',
      passed: true,
      message: note,
    });
  });

  return {
    deal_id: dealId,
    run_at: new Date().toISOString(),
    state: dealState,
    form_type: null,
    total_rules_checked: results.length,
    passed_count: results.filter(r => r.passed).length,
    warning_count: aiResponse.inconsistentItems.length,
    violation_count: aiResponse.missingItems.length,
    results,
  };
}

/* ─── Component ─── */
export const WorkspaceCompliance: React.FC<Props> = ({ deal }) => {
  const queryClient = useQueryClient();
  const { emails } = useDealEmails(deal);
  const [showHistory, setShowHistory] = useState(false);

  /* Fetch latest compliance check */
  const { data: latestCheck, isLoading: loadingCheck } = useQuery<ComplianceCheck | null>({
    queryKey: ['compliance-check', deal.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_checks')
        .select('*')
        .eq('deal_id', deal.id)
        .order('run_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as ComplianceCheck | null;
    },
  });

  /* Fetch check history */
  const { data: allChecks = [] } = useQuery<any[]>({
    queryKey: ['compliance-checks-history', deal.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_checks')
        .select('id, run_at, violation_count, warning_count, passed_count, total_rules_checked')
        .eq('deal_id', deal.id)
        .order('run_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  /* Run compliance check */
  const runCheckMutation = useMutation({
    mutationFn: async () => {
      const relatedThreads = emails.slice(0, 10).map(e => ({
        threadId: e.threadId,
        latest: { subject: e.subject, from: e.from, receivedAt: e.receivedAt, snippet: e.snippet || '' },
      }));

      const res = await fetch('/api/ai?action=compliance-precheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deal, relatedThreads }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Compliance check failed' }));
        throw new Error(err.error || 'Compliance check failed');
      }

      const aiResponse = await res.json();
      const checkData = mapAiResponseToCheck(deal.id, deal.state || null, aiResponse);

      const { data: saved, error } = await supabase
        .from('compliance_checks')
        .insert([checkData])
        .select()
        .single();

      if (error) throw error;
      return saved as ComplianceCheck;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-check', deal.id] });
      queryClient.invalidateQueries({ queryKey: ['compliance-checks-history', deal.id] });
    },
  });

  /* Derived state */
  const results: ComplianceResult[] = latestCheck?.results ?? [];
  const violations = results.filter(r => !r.passed && r.severity === 'error');
  const warnings = results.filter(r => !r.passed && r.severity === 'warning');
  const passed = results.filter(r => r.passed);
  const overallStatus =
    violations.length > 0 ? 'fail'
    : warnings.length > 0 ? 'watch'
    : latestCheck ? 'pass'
    : null;

  const fmt = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });

  return (
    <div className="p-5 space-y-5 max-w-4xl">

      {/* ─── Header ─── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-none">
            <Shield size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="font-bold text-base-content text-base">Compliance Check</h2>
            {latestCheck
              ? <p className="text-xs text-base-content/50">Last run: {fmt(latestCheck.run_at)}</p>
              : <p className="text-xs text-base-content/40">No check run yet</p>
            }
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Overall status badge */}
          {overallStatus === 'fail' && (
            <span className="badge badge-error gap-1"><XCircle size={10} /> Violations</span>
          )}
          {overallStatus === 'watch' && (
            <span className="badge badge-warning gap-1"><AlertTriangle size={10} /> Warnings</span>
          )}
          {overallStatus === 'pass' && (
            <span className="badge badge-success gap-1"><CheckCircle size={10} /> Passed</span>
          )}
          <button
            onClick={() => runCheckMutation.mutate()}
            disabled={runCheckMutation.isPending}
            className="btn btn-sm btn-primary gap-2"
          >
            {runCheckMutation.isPending
              ? <span className="loading loading-spinner loading-xs" />
              : <RefreshCw size={13} />
            }
            {runCheckMutation.isPending ? 'Running…' : latestCheck ? 'Re-run Check' : 'Run Check'}
          </button>
        </div>
      </div>

      {/* ─── Error ─── */}
      {runCheckMutation.isError && (
        <div className="alert alert-error text-sm">
          <AlertTriangle size={14} />
          <span>{(runCheckMutation.error as Error).message}</span>
        </div>
      )}

      {/* ─── Loading ─── */}
      {loadingCheck && (
        <div className="flex items-center justify-center py-12">
          <span className="loading loading-spinner loading-md text-primary" />
        </div>
      )}

      {/* ─── Never run yet ─── */}
      {!loadingCheck && !latestCheck && !runCheckMutation.isPending && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center bg-base-200 rounded-2xl border border-base-300 border-dashed">
          <div className="w-16 h-16 rounded-2xl bg-base-100 border border-base-300 flex items-center justify-center">
            <Shield size={28} className="text-base-content/25" />
          </div>
          <div>
            <p className="font-semibold text-base-content/60 text-sm">No compliance check run yet</p>
            <p className="text-xs text-base-content/40 mt-1 max-w-xs mx-auto">
              Upload a contract and extract data first, then run a compliance check to detect issues.
            </p>
          </div>
          <button
            onClick={() => runCheckMutation.mutate()}
            className="btn btn-primary btn-sm gap-2"
          >
            <Shield size={13} /> Run First Check
          </button>
        </div>
      )}

      {/* ─── Results ─── */}
      {latestCheck && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-success/10 border border-success/20 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-success">{latestCheck.passed_count}</p>
              <p className="text-xs text-success/70 font-medium mt-0.5">Passed</p>
            </div>
            <div className="bg-warning/10 border border-warning/20 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-warning">{latestCheck.warning_count}</p>
              <p className="text-xs text-warning/70 font-medium mt-0.5">Warnings</p>
            </div>
            <div className="bg-error/10 border border-error/20 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-error">{latestCheck.violation_count}</p>
              <p className="text-xs text-error/70 font-medium mt-0.5">Violations</p>
            </div>
          </div>

          {/* Results detail */}
          {results.length > 0 && (
            <div className="space-y-4">
              {/* Violations */}
              {violations.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-error uppercase tracking-wide flex items-center gap-1.5">
                    <XCircle size={12} /> Violations ({violations.length})
                  </p>
                  {violations.map(r => (
                    <div key={r.rule_code} className="flex items-start gap-2.5 p-3 bg-error/5 border border-error/20 rounded-lg">
                      <XCircle size={14} className="text-error flex-none mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-base-content">{r.rule_name}</p>
                        {r.message !== r.rule_name && (
                          <p className="text-xs text-base-content/60 mt-0.5">{r.message}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Warnings */}
              {warnings.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-warning uppercase tracking-wide flex items-center gap-1.5">
                    <AlertTriangle size={12} /> Warnings ({warnings.length})
                  </p>
                  {warnings.map(r => (
                    <div key={r.rule_code} className="flex items-start gap-2.5 p-3 bg-warning/5 border border-warning/20 rounded-lg">
                      <AlertTriangle size={14} className="text-warning flex-none mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-base-content">{r.rule_name}</p>
                        {r.message !== r.rule_name && (
                          <p className="text-xs text-base-content/60 mt-0.5">{r.message}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Notes / Passed */}
              {passed.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-success uppercase tracking-wide flex items-center gap-1.5">
                    <CheckCircle size={12} /> Passed / Notes ({passed.length})
                  </p>
                  {passed.map(r => (
                    <div key={r.rule_code} className="flex items-start gap-2.5 p-3 bg-base-200 border border-base-300 rounded-lg">
                      <CheckCircle size={14} className="text-success flex-none mt-0.5" />
                      <p className="text-sm text-base-content/70">{r.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {results.length === 0 && (
            <div className="text-center py-6 text-sm text-base-content/40">
              No detailed results available for this check.
            </div>
          )}

          {/* ─── Check History ─── */}
          {allChecks.length > 1 && (
            <div>
              <button
                onClick={() => setShowHistory(h => !h)}
                className="flex items-center gap-2 text-xs font-bold text-base-content/50 uppercase tracking-widest hover:text-base-content transition-colors"
              >
                {showHistory ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                Check History ({allChecks.length})
              </button>
              {showHistory && (
                <div className="mt-2 space-y-1.5">
                  {allChecks.map((check: any) => (
                    <div
                      key={check.id}
                      className="flex items-center gap-3 px-3 py-2 bg-base-200 rounded-lg border border-base-300 text-xs"
                    >
                      <Clock size={11} className="text-base-content/40 flex-none" />
                      <span className="text-base-content/60 flex-1">
                        {new Date(check.run_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric',
                          hour: 'numeric', minute: '2-digit',
                        })}
                      </span>
                      <span className="text-error font-semibold">{check.violation_count}v</span>
                      <span className="text-warning font-semibold">{check.warning_count}w</span>
                      <span className="text-success font-semibold">{check.passed_count}p</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── Signature Map ─── */}
          <div className="divider text-xs text-base-content/40">Signature Verification</div>
          <WorkspaceSignatureMap deal={deal} />

          {/* ─── PDF Export placeholder ─── */}
          <div className="flex justify-end pt-1">
            <button
              disabled
              title="PDF export coming in a future update"
              className="btn btn-ghost btn-xs gap-1.5 text-base-content/30 cursor-not-allowed"
            >
              <Download size={12} /> Export PDF
              <span className="badge badge-xs badge-ghost">Soon</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default WorkspaceCompliance;
