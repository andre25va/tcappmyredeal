import React, { useState, useEffect } from 'react';
import {
  Shield, CheckCircle, AlertTriangle, XCircle,
  RefreshCw, Clock, Download, ChevronDown, ChevronUp, Info, Printer, X as XIcon,
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

/* ─── Compliance PDF Preview Modal ──────────────────────────────────────────
   Reuses the same modal pattern as PdfPreviewModal in WorkspaceDocuments.tsx:
   - fixed inset-0 z-50 backdrop, m-auto rounded-2xl shadow-2xl
   - iframe body showing a blob URL of the generated HTML
   - Print / Save as PDF button triggers window.print() in a clean popup
── */
function CompliancePDFModal({ deal, check, onClose }: {
  deal: Deal;
  check: ComplianceCheck;
  onClose: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState('');

  const buildHTML = (): string => {
    const rules = extractRules(check);
    const passed = rules.filter(r => r.status === 'pass').length;
    const warnings = rules.filter(r => r.status === 'warning').length;
    const violations = rules.filter(r => r.status === 'fail').length;
    const runAt = check.run_at ? new Date(check.run_at).toLocaleString() : new Date().toLocaleString();
    const addr = [
      (deal as any).propertyAddress,
      (deal as any).city,
      (deal as any).state,
    ].filter(Boolean).join(', ');

    const rows = rules.map(r => {
      const icon = r.status === 'pass' ? '✅' : r.status === 'warning' ? '🟡' : '🔴';
      return `
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:10px 14px;font-size:15px;">${icon}</td>
          <td style="padding:10px 14px;">
            <span style="font-weight:600;color:#111;">${r.rule_name ?? '—'}</span>
            ${r.rule_code ? `<br/><span style="font-size:11px;color:#6b7280;font-family:monospace;">${r.rule_code}</span>` : ''}
          </td>
          <td style="padding:10px 14px;color:#374151;font-size:13px;">${r.detail ?? '—'}</td>
        </tr>`;
    }).join('');

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Compliance Report — ${addr}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;background:#fff;padding:40px}
  @media print{body{padding:20px}.no-print{display:none!important}}
  h1{font-size:22px;font-weight:700;margin-bottom:4px}
  .meta{font-size:13px;color:#6b7280;margin-bottom:24px}
  .summary{display:flex;gap:16px;margin-bottom:28px}
  .pill{padding:8px 18px;border-radius:20px;font-weight:700;font-size:14px}
  .pill-pass{background:#dcfce7;color:#166534}
  .pill-warn{background:#fef9c3;color:#854d0e}
  .pill-fail{background:#fee2e2;color:#991b1b}
  table{width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}
  th{background:#f9fafb;padding:10px 14px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;font-weight:600;border-bottom:2px solid #e5e7eb}
  tr:last-child td{border-bottom:none}
  .footer{margin-top:28px;font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:12px}
</style></head>
<body>
  <h1>📋 Compliance Report</h1>
  <div class="meta">${addr}<br/>Generated: ${runAt}</div>
  <div class="summary">
    <div class="pill pill-pass">✅ ${passed} Passed</div>
    <div class="pill pill-warn">🟡 ${warnings} Warnings</div>
    <div class="pill pill-fail">🔴 ${violations} Violations</div>
  </div>
  <table>
    <thead><tr>
      <th style="width:40px;"></th>
      <th>Rule</th>
      <th>Detail</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">TC Command · Compliance Engine · ${runAt}</div>
</body></html>`;
  };

  useEffect(() => {
    const html = buildHTML();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [check]);

  const handlePrint = () => {
    const html = buildHTML();
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { alert('Pop-up blocked — allow pop-ups for this site.'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="m-auto bg-base-100 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: '85vw', maxWidth: '1000px', height: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header — same pattern as PdfPreviewModal in WorkspaceDocuments */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-base-300 flex-none">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-primary" />
            <span className="font-semibold text-sm text-base-content">Compliance Report Preview</span>
            <span className="badge badge-sm badge-ghost">{(deal as any).propertyAddress}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="btn btn-ghost btn-xs gap-1">
              <Printer size={12} /> Print / Save as PDF
            </button>
            <button className="btn btn-ghost btn-circle btn-sm" onClick={onClose}>
              <XIcon size={16} />
            </button>
          </div>
        </div>
        {/* Body — iframe showing blob URL (same as PdfPreviewModal) */}
        <div className="flex-1 min-h-0 bg-base-200">
          {!previewUrl ? (
            <div className="flex items-center justify-center h-full">
              <span className="loading loading-spinner loading-md" />
            </div>
          ) : (
            <iframe src={previewUrl} className="w-full h-full" title="Compliance Report Preview" />
          )}
        </div>
      </div>
    </div>
  );
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

/* ─── Component ─── */
export const WorkspaceCompliance: React.FC<Props> = ({ deal }) => {
  const queryClient = useQueryClient();
  const [showPDFModal, setShowPDFModal] = useState(false);
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

  /* A4: Auto-run compliance on first open if no check has ever been run */
  useEffect(() => {
    if (!loadingCheck && !latestCheck && !runCheckMutation.isPending) {
      runCheckMutation.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingCheck, latestCheck]);

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

      {/* ─── Loading (query fetch OR auto-run mutation in progress) ─── */}
      {(loadingCheck || (runCheckMutation.isPending && !latestCheck)) && (
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
              onClick={() => setShowPDFModal(true)}
              className="btn btn-ghost btn-xs gap-1.5 text-base-content/60 hover:text-primary"
              title="Preview & export compliance report as PDF"
            >
              <Download size={12} /> Export PDF
            </button>
          </div>
        </>
      )}

      {/* ─── Compliance PDF Preview Modal ─────────────────────────────── */}
      {showPDFModal && latestCheck && (
        <CompliancePDFModal
          deal={deal}
          check={latestCheck}
          onClose={() => setShowPDFModal(false)}
        />
      )}
    </div>
  );
};

export default WorkspaceCompliance;
