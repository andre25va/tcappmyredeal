import React, { useState } from 'react';
import { Shield, CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Deal } from '../types';
import { useDealEmails } from '../hooks/useDealEmails';

interface ComplianceResult {
  status: 'pass' | 'watch' | 'fail';
  missingItems: string[];
  inconsistentItems: string[];
  notes: string[];
  summary: string;
}

interface Props {
  deal: Deal;
}

const STATUS_CONFIG = {
  pass: {
    bg: 'bg-success/10 border-success/30',
    icon: <CheckCircle size={18} className="text-success" />,
    label: 'Compliance: Pass',
    labelColor: 'text-success',
  },
  watch: {
    bg: 'bg-warning/10 border-warning/30',
    icon: <AlertTriangle size={18} className="text-warning" />,
    label: 'Compliance: Watch',
    labelColor: 'text-warning',
  },
  fail: {
    bg: 'bg-error/10 border-error/30',
    icon: <XCircle size={18} className="text-error" />,
    label: 'Compliance: Fail',
    labelColor: 'text-error',
  },
};

export const CompliancePreCheck: React.FC<Props> = ({ deal }) => {
  const [result, setResult] = useState<ComplianceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const { emails } = useDealEmails(deal);

  const runCheck = async () => {
    setLoading(true);
    setError(null);
    try {
      const relatedThreads = emails.slice(0, 10).map(e => ({
        threadId: e.threadId,
        latest: {
          subject: e.subject,
          from: e.from,
          receivedAt: e.receivedAt,
          snippet: e.snippet || '',
        },
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
      const data: ComplianceResult = await res.json();
      setResult(data);
      // Default expanded for watch/fail, collapsed for pass
      setExpanded(data.status !== 'pass');
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const config = result ? STATUS_CONFIG[result.status] : null;
  const isExpanded = expanded ?? false;

  return (
    <div className="bg-base-200 rounded-xl border border-base-300 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm text-base-content flex items-center gap-2">
          <Shield size={14} className="text-primary opacity-70" />
          Compliance Pre-Check
        </h3>
        <button
          onClick={runCheck}
          disabled={loading}
          className="btn btn-xs btn-outline btn-primary gap-1"
        >
          {loading ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            <Shield size={11} />
          )}
          {loading ? 'Checking…' : result ? 'Re-Run' : 'Run Check'}
        </button>
      </div>

      {error && (
        <div className="alert alert-error alert-sm text-xs mt-2">
          <AlertTriangle size={12} />
          <span>{error}</span>
        </div>
      )}

      {result && config && (
        <div className={`rounded-lg border p-3 mt-2 ${config.bg}`}>
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {config.icon}
              <span className={`text-sm font-bold ${config.labelColor}`}>{config.label}</span>
            </div>
            <button
              onClick={() => setExpanded(!isExpanded)}
              className="btn btn-ghost btn-xs"
            >
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>

          {/* Summary */}
          <p className="text-xs text-base-content/70 mt-1">{result.summary}</p>

          {/* Collapsible Details */}
          {isExpanded && (
            <div className="mt-3 space-y-2">
              {result.missingItems.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-error mb-1">Missing Items:</p>
                  <ul className="list-disc list-inside text-xs text-base-content/70 space-y-0.5">
                    {result.missingItems.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.inconsistentItems.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-warning mb-1">Inconsistencies:</p>
                  <ul className="list-disc list-inside text-xs text-base-content/70 space-y-0.5">
                    {result.inconsistentItems.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.notes.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-base-content/60 mb-1">Notes:</p>
                  <ul className="list-disc list-inside text-xs text-base-content/60 space-y-0.5">
                    {result.notes.map((note, i) => (
                      <li key={i}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
