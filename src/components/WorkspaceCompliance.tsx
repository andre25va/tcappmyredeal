import React, { useState } from 'react';
import {
  Shield, CheckCircle, AlertTriangle, XCircle,
  RefreshCw, Clock, Download, ChevronDown, ChevronUp, Info,
} from 'lucide-react';
import { Deal } from '../types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { WorkspaceSignatureMap } from './WorkspaceSignatureMap';
import { useDealEmails } from '../hooks/useDealEmails';

/* ─── Types ─── */
interface RuleResult {
  rule_id: string;
  rule_code: string;
  rule_name: string;
  description: string | null;
  severity: 'error' | 'warning' | 'info';
  check_type: string;
  status: 'pass' | 'warning' | 'fail';
  detail: string;
}

interface ComplianceCheckResults {
  rules?: RuleResult[];
  has_extraction?: boolean;
  has_signature_check?: boolean;
  // Legacy AI format (pre-PR#425) — for backward compat
  [key: string]: any;
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
  results: ComplianceCheckResults;
}

interface Props {
  deal: Deal;
}

/* ─── Helper: extract rules from check (handles both new + legacy format) ─── */
function extractRules(check: ComplianceCheck | null): RuleResult[] {
  if (!check) return [];
  const results = check.results || {};

  // New format from run-compliance edge function
  if (Array.isArray(results.rules)) return results.rules;

  // Legacy AI format: results was an array directly
  if (Array.isArray(results)) {
    return (results as any[]).map((r: any, i: number) => ({
      rule_id: `legacy_${i}`,
      rule_code: r.rule_code || `RULE_${i}`,
      rule_name: r.rule_name || r.message || 'Rule',
      description: null,
      severity: r.severity || 'warning',
      check_type: 'custom',
      status: r.passed ? 'pass' : r.severity === 'error' ? 'fail' : 'warning',
      detail: r.message || '',
    }));
  }

  return [];
}


/* ─── PDF Export ─── */
function generateCompliancePDF(deal: Deal, check: ComplianceCheck | null | undefined, rules: RuleResult[]) {
  const property = (deal as any).property_address || deal.address || 'Unknown Property';
  const runAt = check
    ? new Date(check.run_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : '—';

  const violationRows = rules.filter(r => r.status === 'fail');
  const warningRows   = rules.filter(r => r.status === 'warning');
  const passedRows    = rules.filter(r => r.status === 'pass');

  const ruleHtml = (r: RuleResult, color: string, icon: string) => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;">
        <span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-family:monospace;background:#f0f0f0;color:#666;margin-right:8px;">${r.rule_code}</span>
        <span style="font-weight:500;color:#1a1a1a;">${r.rule_name}</span>
        ${r.detail && r.detail !== r.rule_name ? `<br/><span style="font-size:11px;color:#666;padding-left:2px;">${r.detail}</span>` : ''}
      </td>
      <td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:18px;">${icon}</td>
    </tr>`;

  const sectionsHtml = [
    violationRows.length > 0 ? `
      <h3 style="font-size:13px;font-weight:700;color:#dc2626;margin:20px 0 8px;text-transform:uppercase;letter-spacing:.06em;">❌ Violations (${violationRows.length})</h3>
      <table style="width:100%;border-collapse:collapse;border:1px solid #fecaca;border-radius:8px;overflow:hidden;">
        ${violationRows.map(r => ruleHtml(r, '#dc2626', '❌')).join('')}
      </table>` : '',
    warningRows.length > 0 ? `
      <h3 style="font-size:13px;font-weight:700;color:#d97706;margin:20px 0 8px;text-transform:uppercase;letter-spacing:.06em;">⚠️ Warnings (${warningRows.length})</h3>
      <table style="width:100%;border-collapse:collapse;border:1px solid #fde68a;border-radius:8px;overflow:hidden;">
        ${warningRows.map(r => ruleHtml(r, '#d97706', '⚠️')).join('')}
      </table>` : '',
    passedRows.length > 0 ? `
      <h3 style="font-size:13px;font-weight:700;color:#16a34a;margin:20px 0 8px;text-transform:uppercase;letter-spacing:.06em;">✅ Passed (${passedRows.length})</h3>
      <table style="width:100%;border-collapse:collapse;border:1px solid #bbf7d0;border-radius:8px;overflow:hidden;">
        ${passedRows.map(r => ruleHtml(r, '#16a34a', '✅')).join('')}
      </table>` : '',
  ].filter(Boolean).join('');

  const overallLabel = violationRows.length > 0
    ? '<span style="color:#dc2626;font-weight:700;">⛔ Violations Found</span>'
    : warningRows.length > 0
      ? '<span style="color:#d97706;font-weight:700;">⚠️ Warnings Present</span>'
      : '<span style="color:#16a34a;font-weight:700;">✅ All Rules Passed</span>';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Compliance Report — ${property}</title>
  <style>
    @page { margin: 20mm 18mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1a1a1a; margin: 0; padding: 0; }
    @media print { button { display: none !important; } }
  </style>
</head>
<body>
  <div style="max-width:720px;margin:0 auto;padding:24px;">
    <!-- Header -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1B2C5E;padding-bottom:16px;margin-bottom:20px;">
      <div>
        <h1 style="margin:0;font-size:20px;font-weight:700;color:#1B2C5E;">Compliance Report</h1>
        <p style="margin:4px 0 0;font-size:13px;color:#555;">${property}</p>
      </div>
      <div style="text-align:right;font-size:11px;color:#888;">
        <div>Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</div>
        <div>Last check: ${runAt}</div>
        <div style="margin-top:6px;font-size:13px;">${overallLabel}</div>
      </div>
    </div>

    <!-- Summary -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px;">
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px;text-align:center;">
        <div style="font-size:28px;font-weight:700;color:#16a34a;">${check?.passed_count ?? 0}</div>
        <div style="font-size:11px;color:#16a34a;font-weight:600;margin-top:2px;">PASSED</div>
      </div>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px;text-align:center;">
        <div style="font-size:28px;font-weight:700;color:#d97706;">${check?.warning_count ?? 0}</div>
        <div style="font-size:11px;color:#d97706;font-weight:600;margin-top:2px;">WARNINGS</div>
      </div>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px;text-align:center;">
        <div style="font-size:28px;font-weight:700;color:#dc2626;">${check?.violation_count ?? 0}</div>
        <div style="font-size:11px;color:#dc2626;font-weight:600;margin-top:2px;">VIOLATIONS</div>
      </div>
    </div>

    <!-- Rule Results -->
    ${sectionsHtml || '<p style="color:#888;text-align:center;padding:20px 0;">No rule results available.</p>'}

    <!-- Footer -->
    <div style="margin-top:30px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#aaa;text-align:center;">
      Generated by MyRedeal TC App · Compliance Engine v1 · ${new Date().getFullYear()}
    </div>
  </div>
  <script>window.onload = function(){ window.print(); }</script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

/* ─── Component ─── */
export const WorkspaceCompliance: React.FC<Props> = ({ deal }) => {
  const queryClient = useQueryClient();
  const { emails } = useDealEmails(deal);
  const [showHistory, setShowHistory] = useState(false);

  /* Fetch latest compliance check (exclude signature-only checks) */
  const { data: latestCheck, isLoading: loadingCheck } = useQuery<ComplianceCheck | null>({
    queryKey: ['compliance-check', deal.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_checks')
        .select('*')
        .eq('deal_id', deal.id)
        .order('run_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      // Find the first check that has a rules array (not just signature data)
      const checkWithRules = (data || []).find((c: any) => {
        const r = c.results || {};
        return Array.isArray(r.rules) || Array.isArray(r);
      });
      return (checkWithRules as ComplianceCheck) ?? null;
    },
  });

  /* Fetch check history */
  const { data: allChecks = [] } = useQuery<any[]>({
    queryKey: ['compliance-checks-history', deal.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_checks')
        .select('id, run_at, violation_count, warning_count, passed_count, total_rules_checked, results')
        .eq('deal_id', deal.id)
        .order('run_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      // Only show compliance (not signature-only) checks in history
      return (data ?? []).filter((c: any) => {
        const r = c.results || {};
        return Array.isArray(r.rules) || Array.isArray(r);
      });
    },
  });

  /* Run compliance check via edge function */
  const runCheckMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('run-compliance', {
        body: { deal_id: deal.id },
      });
      if (error) throw new Error(error.message || 'Compliance check failed');
      if (data?.error) throw new Error(data.error);
      return data?.check as ComplianceCheck;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-check', deal.id] });
      queryClient.invalidateQueries({ queryKey: ['compliance-checks-history', deal.id] });
    },
  });

  /* Derived state */
  const rules = extractRules(latestCheck ?? null);
  const violations = rules.filter(r => r.status === 'fail');
  const warnings = rules.filter(r => r.status === 'warning');
  const passed = rules.filter(r => r.status === 'pass');

  const overallStatus =
    violations.length > 0 ? 'fail'
    : warnings.length > 0 ? 'watch'
    : latestCheck ? 'pass'
    : null;

  const hasExtractionData = latestCheck?.results?.has_extraction ?? false;
  const hasSigCheck = latestCheck?.results?.has_signature_check ?? false;

  const fmt = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });

  const severityIcon = (s: 'error' | 'warning' | 'info') => {
    if (s === 'error') return <XCircle size={14} className="text-error flex-none mt-0.5" />;
    if (s === 'warning') return <AlertTriangle size={14} className="text-warning flex-none mt-0.5" />;
    return <Info size={14} className="text-info flex-none mt-0.5" />;
  };

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

      {/* ─── Context banner: no extraction data ─── */}
      {latestCheck && !hasExtractionData && (
        <div className="alert alert-info text-xs py-2 px-3">
          <Info size={13} />
          <span>Compliance check is based on deal fields only. Upload &amp; extract a contract for deeper AI-powered field analysis.</span>
        </div>
      )}

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
              Run a check to validate required fields, dates, and signatures against your compliance rules.
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
          {rules.length > 0 && (
            <div className="space-y-4">
              {/* Violations */}
              {violations.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-error uppercase tracking-wide flex items-center gap-1.5">
                    <XCircle size={12} /> Violations ({violations.length})
                  </p>
                  {violations.map(r => (
                    <div key={r.rule_code} className="flex items-start gap-2.5 p-3 bg-error/5 border border-error/20 rounded-lg">
                      {severityIcon(r.severity)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-base-content">{r.rule_name}</p>
                          <span className="font-mono text-[10px] text-base-content/30 bg-base-300 px-1.5 py-0.5 rounded">{r.rule_code}</span>
                        </div>
                        {r.detail && r.detail !== r.rule_name && (
                          <p className="text-xs text-base-content/60 mt-0.5">{r.detail}</p>
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
                      {severityIcon(r.severity)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-base-content">{r.rule_name}</p>
                          <span className="font-mono text-[10px] text-base-content/30 bg-base-300 px-1.5 py-0.5 rounded">{r.rule_code}</span>
                        </div>
                        {r.detail && r.detail !== r.rule_name && (
                          <p className="text-xs text-base-content/60 mt-0.5">{r.detail}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Passed */}
              {passed.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-success uppercase tracking-wide flex items-center gap-1.5">
                    <CheckCircle size={12} /> Passed ({passed.length})
                  </p>
                  {passed.map(r => (
                    <div key={r.rule_code} className="flex items-start gap-2.5 p-3 bg-base-200 border border-base-300 rounded-lg">
                      <CheckCircle size={14} className="text-success flex-none mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-base-content/70">{r.rule_name}</p>
                          <span className="font-mono text-[10px] text-base-content/25 bg-base-300 px-1.5 py-0.5 rounded">{r.rule_code}</span>
                        </div>
                        {r.detail && <p className="text-xs text-base-content/40 mt-0.5">{r.detail}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {rules.length === 0 && (
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

          {/* ─── PDF Export ─── */}
          <div className="flex justify-end pt-1">
            <button
              onClick={() => generateCompliancePDF(deal, latestCheck, rules)}
              className="btn btn-ghost btn-xs gap-1.5 text-base-content/60 hover:text-base-content"
            >
              <Download size={12} /> Export PDF
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default WorkspaceCompliance;
