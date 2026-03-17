import React, { useState } from 'react';
import { Sparkles, Clock, AlertTriangle, Calendar } from 'lucide-react';
import { Deal } from '../types';

interface TimelineEvent {
  date: string;
  title: string;
  description: string;
  category: 'contract' | 'inspection' | 'appraisal' | 'title' | 'lender' | 'closing' | 'compliance' | 'task' | 'communication' | 'milestone';
  importance: 'high' | 'medium' | 'low';
  source: string;
}

interface TimelineResult {
  events: TimelineEvent[];
  summary: string;
  nextKeyDate: string | null;
  nextKeyDateLabel: string | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  contract: 'bg-blue-500',
  inspection: 'bg-yellow-500',
  appraisal: 'bg-orange-400',
  title: 'bg-purple-500',
  lender: 'bg-green-500',
  closing: 'bg-red-500',
  compliance: 'bg-pink-500',
  task: 'bg-gray-400',
  communication: 'bg-cyan-500',
  milestone: 'bg-primary',
};

const CATEGORY_BADGE: Record<string, string> = {
  contract: 'badge-info',
  inspection: 'badge-warning',
  appraisal: 'badge-warning',
  title: 'badge-secondary',
  lender: 'badge-success',
  closing: 'badge-error',
  compliance: 'badge-accent',
  task: 'badge-ghost',
  communication: 'badge-info',
  milestone: 'badge-primary',
};

function formatDateDisplay(dateStr: string): string {
  try {
    const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T12:00:00'));
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

interface Props {
  deal: Deal;
}

export const DealTimeline: React.FC<Props> = ({ deal }) => {
  const [result, setResult] = useState<TimelineResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildTimeline = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai?action=build-timeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deal }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to build timeline' }));
        throw new Error(err.error || 'Failed to build timeline');
      }
      const data: TimelineResult = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-5 max-w-3xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-base-content flex items-center gap-2">
          <Clock size={18} className="text-primary" />
          Deal Timeline
        </h2>
        <button
          onClick={buildTimeline}
          disabled={loading}
          className="btn btn-sm btn-primary gap-1.5"
        >
          {loading ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            <Sparkles size={13} />
          )}
          {loading ? 'Building…' : result ? 'Rebuild Timeline' : 'Build Timeline'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="alert alert-error text-sm">
          <AlertTriangle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading && !result && (
        <div className="flex items-center justify-center py-16">
          <span className="loading loading-spinner loading-lg text-primary" />
          <span className="ml-3 text-sm text-base-content/60">Analyzing deal history…</span>
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Summary Card */}
          <div className="bg-base-200 rounded-xl border border-base-300 p-4 space-y-2">
            <p className="text-sm text-base-content">{result.summary}</p>
            {result.nextKeyDate && result.nextKeyDateLabel && (
              <div className="flex items-center gap-2 mt-2 p-2 bg-primary/10 border border-primary/20 rounded-lg">
                <Calendar size={14} className="text-primary flex-none" />
                <span className="text-xs font-semibold text-primary">
                  Next Key Date: {formatDateDisplay(result.nextKeyDate)}
                </span>
                <span className="text-xs text-base-content/60">— {result.nextKeyDateLabel}</span>
              </div>
            )}
          </div>

          {/* Vertical Timeline */}
          <div className="relative pl-6 space-y-0">
            {/* Vertical line */}
            <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-base-300" />

            {result.events.map((event, i) => (
              <div key={i} className="relative flex gap-4 pb-5">
                {/* Dot */}
                <div className={`absolute left-[-13px] top-1.5 w-3 h-3 rounded-full border-2 border-white ${CATEGORY_COLORS[event.category] || 'bg-gray-400'} z-10 shadow-sm`} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-xs font-mono text-base-content/50">{formatDateDisplay(event.date)}</span>
                    <span className={`badge badge-xs ${CATEGORY_BADGE[event.category] || 'badge-ghost'}`}>
                      {event.category}
                    </span>
                    {event.importance === 'high' && (
                      <span className="badge badge-xs badge-error">high</span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-base-content">{event.title}</p>
                  <p className="text-xs text-base-content/60 mt-0.5">{event.description}</p>
                  <span className="text-[10px] text-base-content/40 mt-1 inline-block">Source: {event.source}</span>
                </div>
              </div>
            ))}
          </div>

          {result.events.length === 0 && (
            <p className="text-center text-sm text-base-content/50 py-8">No timeline events found for this deal.</p>
          )}
        </>
      )}

      {/* Empty state */}
      {!result && !loading && !error && (
        <div className="text-center py-16 text-base-content/40">
          <Clock size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Click "Build Timeline" to generate a chronological view of this deal's key events.</p>
        </div>
      )}
    </div>
  );
};
