import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Loader2, ShieldCheck, ShieldAlert, ShieldX, ExternalLink,
  CheckCircle2, AlertTriangle, XCircle, Clock, Filter,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ComplianceRow {
  id: string;
  deal_id: string;
  run_at: string;
  state: string | null;
  form_type: string | null;
  total_rules_checked: number;
  passed_count: number;
  warning_count: number;
  violation_count: number;
  deal: {
    property_address: string | null;
    status: string | null;
  } | null;
}

type FilterType = 'all' | 'violations' | 'warnings' | 'clean';

// ─── Data Hook ────────────────────────────────────────────────────────────────

function useComplianceDashboard() {
  return useQuery({
    queryKey: ['compliance-dashboard'],
    queryFn: async (): Promise<ComplianceRow[]> => {
      // Get all compliance checks with deal info
      const { data, error } = await supabase
        .from('compliance_checks')
        .select(`
          id,
          deal_id,
          run_at,
          state,
          form_type,
          total_rules_checked,
          passed_count,
          warning_count,
          violation_count,
          deal:deals!deal_id (
            property_address,
            status
          )
        `)
        .order('run_at', { ascending: false });

      if (error) throw error;

      // De-duplicate: keep only the latest check per deal
      const seen = new Set<string>();
      const latest: ComplianceRow[] = [];
      for (const row of (data ?? []) as any[]) {
        if (!seen.has(row.deal_id)) {
          seen.add(row.deal_id);
          latest.push(row as ComplianceRow);
        }
      }
      return latest;
    },
    refetchOnWindowFocus: false,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: string | null) {
  if (!status) return null;
  const map: Record<string, string> = {
    active:   'badge-success',
    pending:  'badge-warning',
    closed:   'badge-ghost',
    archived: 'badge-ghost',
  };
  return (
    <span className={`badge badge-xs capitalize ${map[status] ?? 'badge-ghost'}`}>
      {status}
    </span>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 60)  return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  return `${days}d ago`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  onOpenDeal?: (dealId: string) => void;
}

export function ComplianceDashboard({ onOpenDeal }: Props) {
  const { data: rows = [], isLoading, error } = useComplianceDashboard();
  const [filter, setFilter] = useState<FilterType>('all');

  // ── Stat cards ────────────────────────────────────────────────────────────
  const totalChecked    = rows.length;
  const withViolations  = rows.filter(r => r.violation_count > 0).length;
  const withWarnings    = rows.filter(r => r.warning_count > 0 && r.violation_count === 0).length;
  const allClear        = rows.filter(r => r.violation_count === 0 && r.warning_count === 0).length;

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = rows.filter(r => {
    if (filter === 'violations') return r.violation_count > 0;
    if (filter === 'warnings')   return r.warning_count > 0 && r.violation_count === 0;
    if (filter === 'clean')      return r.violation_count === 0 && r.warning_count === 0;
    return true;
  });

  // ── States ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-base-content/50">
        <Loader2 size={18} className="animate-spin" /> Loading compliance data…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-error">
        <ShieldX size={18} /> Failed to load compliance data
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-base-content/40">
        <ShieldCheck size={40} className="opacity-20" />
        <div className="text-center">
          <p className="text-sm font-semibold">No compliance checks yet</p>
          <p className="text-xs mt-1 max-w-xs">
            Upload a contract and run AI extraction — compliance checks are triggered automatically.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── Stat Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Total Checked */}
        <div className="bg-base-100 border border-base-300 rounded-xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <ShieldCheck size={18} className="text-primary" />
          </div>
          <div>
            <p className="text-xs text-base-content/50 font-medium">Deals Checked</p>
            <p className="text-xl font-bold text-base-content">{totalChecked}</p>
          </div>
        </div>

        {/* Violations */}
        <button
          onClick={() => setFilter(filter === 'violations' ? 'all' : 'violations')}
          className={`bg-base-100 border rounded-xl p-4 flex items-center gap-3 text-left transition-all hover:shadow-sm ${
            filter === 'violations' ? 'border-error bg-error/5' : 'border-base-300 hover:border-error/40'
          }`}
        >
          <div className="w-9 h-9 rounded-lg bg-error/10 flex items-center justify-center shrink-0">
            <XCircle size={18} className="text-error" />
          </div>
          <div>
            <p className="text-xs text-base-content/50 font-medium">Violations</p>
            <p className="text-xl font-bold text-error">{withViolations}</p>
          </div>
        </button>

        {/* Warnings */}
        <button
          onClick={() => setFilter(filter === 'warnings' ? 'all' : 'warnings')}
          className={`bg-base-100 border rounded-xl p-4 flex items-center gap-3 text-left transition-all hover:shadow-sm ${
            filter === 'warnings' ? 'border-warning bg-warning/5' : 'border-base-300 hover:border-warning/40'
          }`}
        >
          <div className="w-9 h-9 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
            <AlertTriangle size={18} className="text-warning" />
          </div>
          <div>
            <p className="text-xs text-base-content/50 font-medium">Warnings Only</p>
            <p className="text-xl font-bold text-warning">{withWarnings}</p>
          </div>
        </button>

        {/* All Clear */}
        <button
          onClick={() => setFilter(filter === 'clean' ? 'all' : 'clean')}
          className={`bg-base-100 border rounded-xl p-4 flex items-center gap-3 text-left transition-all hover:shadow-sm ${
            filter === 'clean' ? 'border-success bg-success/5' : 'border-base-300 hover:border-success/40'
          }`}
        >
          <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
            <CheckCircle2 size={18} className="text-success" />
          </div>
          <div>
            <p className="text-xs text-base-content/50 font-medium">All Clear</p>
            <p className="text-xl font-bold text-success">{allClear}</p>
          </div>
        </button>
      </div>

      {/* ── Filter bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <Filter size={13} className="text-base-content/40 shrink-0" />
        <span className="text-xs text-base-content/40">Filter:</span>
        {(['all', 'violations', 'warnings', 'clean'] as FilterType[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`btn btn-xs capitalize ${filter === f ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
          >
            {f === 'all' ? `All (${totalChecked})` :
             f === 'violations' ? `🔴 Violations (${withViolations})` :
             f === 'warnings'   ? `🟡 Warnings (${withWarnings})` :
             `✅ Clean (${allClear})`}
          </button>
        ))}
      </div>

      {/* ── Deals Table ─────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-xl border border-base-300">
        <table className="table table-sm w-full">
          <thead className="bg-base-200">
            <tr>
              <th className="text-xs font-semibold text-base-content/60">Property</th>
              <th className="text-xs font-semibold text-base-content/60">Deal Status</th>
              <th className="text-xs font-semibold text-center text-success">✅ Pass</th>
              <th className="text-xs font-semibold text-center text-warning">⚠️ Warn</th>
              <th className="text-xs font-semibold text-center text-error">🔴 Fail</th>
              <th className="text-xs font-semibold text-base-content/60">State</th>
              <th className="text-xs font-semibold text-base-content/60">Last Run</th>
              {onOpenDeal && <th className="text-xs font-semibold text-base-content/60 w-20">View</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={onOpenDeal ? 8 : 7} className="text-center py-10 text-xs text-base-content/40">
                  No deals match this filter
                </td>
              </tr>
            )}
            {filtered.map(row => {
              const hasViolations = row.violation_count > 0;
              const hasWarnings   = row.warning_count > 0;
              const rowClass = hasViolations
                ? 'bg-error/5 hover:bg-error/10'
                : hasWarnings
                  ? 'bg-warning/5 hover:bg-warning/10'
                  : 'hover:bg-base-200';

              return (
                <tr key={row.id} className={`transition-colors ${rowClass}`}>
                  {/* Property */}
                  <td className="max-w-[220px]">
                    <div className="flex items-center gap-2">
                      {hasViolations ? (
                        <ShieldX size={14} className="text-error shrink-0" />
                      ) : hasWarnings ? (
                        <ShieldAlert size={14} className="text-warning shrink-0" />
                      ) : (
                        <ShieldCheck size={14} className="text-success shrink-0" />
                      )}
                      <span className="text-xs font-medium text-base-content truncate">
                        {row.deal?.property_address ?? 'Unknown address'}
                      </span>
                    </div>
                  </td>

                  {/* Deal Status */}
                  <td>{statusBadge(row.deal?.status ?? null)}</td>

                  {/* Pass */}
                  <td className="text-center">
                    <span className="text-xs font-bold text-success">{row.passed_count}</span>
                  </td>

                  {/* Warn */}
                  <td className="text-center">
                    <span className={`text-xs font-bold ${row.warning_count > 0 ? 'text-warning' : 'text-base-content/20'}`}>
                      {row.warning_count}
                    </span>
                  </td>

                  {/* Fail */}
                  <td className="text-center">
                    <span className={`text-xs font-bold ${row.violation_count > 0 ? 'text-error' : 'text-base-content/20'}`}>
                      {row.violation_count}
                    </span>
                  </td>

                  {/* State */}
                  <td>
                    <span className="text-xs text-base-content/50">{row.state ?? '—'}</span>
                  </td>

                  {/* Last Run */}
                  <td>
                    <div className="flex items-center gap-1 text-xs text-base-content/50">
                      <Clock size={11} />
                      {timeAgo(row.run_at)}
                    </div>
                  </td>

                  {/* View */}
                  {onOpenDeal && (
                    <td>
                      <button
                        onClick={() => onOpenDeal(row.deal_id)}
                        className="btn btn-xs btn-ghost gap-1 text-primary hover:text-primary"
                        title="Open deal compliance"
                      >
                        View <ExternalLink size={11} />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <p className="text-xs text-base-content/40 text-right">
          Showing {filtered.length} of {totalChecked} deal{totalChecked !== 1 ? 's' : ''} · Latest check per deal
        </p>
      )}
    </div>
  );
}
