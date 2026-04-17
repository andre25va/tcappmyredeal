import React from 'react';
import { Shield, CheckCircle, AlertTriangle, XCircle, ChevronRight } from 'lucide-react';
import { Deal } from '../types';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

interface Props {
  deal: Deal;
  /** Called when user clicks "View Report →" — navigates to Compliance tab */
  onViewReport?: () => void;
}

export const CompliancePreCheck: React.FC<Props> = ({ deal, onViewReport }) => {
  const { data: latestCheck, isLoading } = useQuery<{
    id: string;
    run_at: string;
    violation_count: number;
    warning_count: number;
    passed_count: number;
    total_rules_checked: number;
  } | null>({
    queryKey: ['compliance-check', deal.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_checks')
        .select('id, run_at, violation_count, warning_count, passed_count, total_rules_checked')
        .eq('deal_id', deal.id)
        .order('run_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const hasViolations = (latestCheck?.violation_count ?? 0) > 0;
  const hasWarnings = (latestCheck?.warning_count ?? 0) > 0;

  const runDate = latestCheck
    ? new Date(latestCheck.run_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  return (
    <div className="bg-base-200 rounded-xl border border-base-300 p-4">

      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm text-base-content flex items-center gap-2">
          <Shield size={14} className="text-primary opacity-70" />
          Compliance
        </h3>
        {latestCheck && onViewReport && (
          <button
            onClick={onViewReport}
            className="btn btn-ghost btn-xs gap-1 text-primary"
          >
            View Report <ChevronRight size={12} />
          </button>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center gap-2 py-1">
          <span className="loading loading-spinner loading-xs" />
          <span className="text-xs text-base-content/40">Loading…</span>
        </div>
      )}

      {/* Never run yet */}
      {!isLoading && !latestCheck && (
        <div>
          <p className="text-xs text-base-content/40 italic">
            Not run yet — upload contract to begin
          </p>
          {onViewReport && (
            <button
              onClick={onViewReport}
              className="btn btn-xs btn-outline btn-primary mt-2 gap-1"
            >
              <Shield size={11} /> Run Check
            </button>
          )}
        </div>
      )}

      {/* Status card */}
      {!isLoading && latestCheck && (
        <div className="space-y-1.5">
          {/* Counts row */}
          <div className="flex items-center gap-3 flex-wrap text-xs">
            <div className="flex items-center gap-1 font-semibold text-success">
              <CheckCircle size={12} />
              {latestCheck.passed_count} passed
            </div>
            {hasWarnings && (
              <div className="flex items-center gap-1 font-semibold text-warning">
                <AlertTriangle size={12} />
                {latestCheck.warning_count} warnings
              </div>
            )}
            {hasViolations && (
              <div className="flex items-center gap-1 font-semibold text-error">
                <XCircle size={12} />
                {latestCheck.violation_count} violations
              </div>
            )}
          </div>

          {/* Last run + link */}
          <p className="text-[10px] text-base-content/40 leading-relaxed">
            Last run: {runDate}
            {(hasViolations || hasWarnings) && onViewReport && (
              <>
                {' · '}
                <button
                  onClick={onViewReport}
                  className="text-primary underline underline-offset-2"
                >
                  View details →
                </button>
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
};
