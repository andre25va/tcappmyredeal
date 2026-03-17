import React, { useState } from 'react';
import { Brain, TrendingUp, AlertTriangle, Clock, Users, Shield, ChevronDown, ChevronUp, Zap, Target } from 'lucide-react';
import { detectPatternsAI, PatternDetectionResponse } from '../ai/apiClient';
import { Deal } from '../types';

interface Props {
  deal: Deal;
  allDeals?: any[];
}

const PATTERN_ICONS: Record<string, React.ReactNode> = {
  stall_risk: <Clock size={14} className="text-amber-500" />,
  missing_item: <AlertTriangle size={14} className="text-red-500" />,
  communication_gap: <Users size={14} className="text-blue-500" />,
  timeline_anomaly: <TrendingUp size={14} className="text-purple-500" />,
  agent_pattern: <Target size={14} className="text-indigo-500" />,
  compliance_trend: <Shield size={14} className="text-emerald-500" />,
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'bg-green-100 text-green-700 border-green-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-gray-100 text-gray-600 border-gray-200',
};

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-blue-100 text-blue-700',
};

export const SmartSuggestions: React.FC<Props> = ({ deal, allDeals = [] }) => {
  const [result, setResult] = useState<PatternDetectionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedPatterns, setExpandedPatterns] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedPatterns(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const dealSummaries = allDeals.map((d: any) => ({
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
        completedTasks: d.tasks?.filter((t: any) => t.completedAt)?.length || 0,
        pendingAlerts: d.documentRequests?.filter((r: any) => r.status === 'pending')?.length || 0,
      }));
      const res = await detectPatternsAI(deal as any, dealSummaries);
      setResult(res);
    } catch (err: any) {
      setError(err.message || 'Failed to analyze patterns');
    } finally {
      setLoading(false);
    }
  };

  const confidenceLabel = (c: number): string => {
    if (c >= 0.75) return 'high';
    if (c >= 0.45) return 'medium';
    return 'low';
  };

  return (
    <div className="bg-base-200 rounded-xl border border-base-300 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm text-base-content flex items-center gap-2">
          <Brain size={14} className="text-purple-500" />
          Smart Suggestions
        </h3>
        <button
          onClick={handleAnalyze}
          disabled={loading || allDeals.length === 0}
          className="btn btn-xs btn-primary gap-1"
        >
          {loading ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            <Zap size={11} />
          )}
          {loading ? 'Analyzing...' : 'Analyze Patterns'}
        </button>
      </div>

      {allDeals.length === 0 && (
        <p className="text-xs text-base-content/50 text-center py-2">No deals available for pattern analysis.</p>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          {result.patterns.length === 0 && (
            <p className="text-xs text-base-content/50 text-center py-2">No patterns detected — this deal looks on track!</p>
          )}

          {result.patterns.map(pattern => {
            const confLabel = confidenceLabel(pattern.confidence);
            const expanded = expandedPatterns.has(pattern.id);
            return (
              <div key={pattern.id} className="bg-white rounded-lg border border-base-300 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="flex-none mt-0.5">{PATTERN_ICONS[pattern.type] || <Brain size={14} />}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-base-content">{pattern.title}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${CONFIDENCE_COLORS[confLabel]}`}>
                        {Math.round(pattern.confidence * 100)}%
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${PRIORITY_COLORS[pattern.priority]}`}>
                        {pattern.priority}
                      </span>
                    </div>
                    <p className="text-xs text-base-content/70 mt-1">{pattern.description}</p>
                    <div className="mt-2 flex items-start gap-1.5">
                      <Zap size={11} className="text-primary flex-none mt-0.5" />
                      <p className="text-xs text-primary font-medium">{pattern.suggestedAction}</p>
                    </div>
                  </div>
                </div>

                {pattern.dataPoints.length > 0 && (
                  <button
                    onClick={() => toggleExpand(pattern.id)}
                    className="text-[10px] text-base-content/40 hover:text-base-content/60 flex items-center gap-1"
                  >
                    {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                    {expanded ? 'Hide' : 'Show'} data points ({pattern.dataPoints.length})
                  </button>
                )}

                {expanded && pattern.dataPoints.length > 0 && (
                  <ul className="pl-4 space-y-0.5">
                    {pattern.dataPoints.map((dp, i) => (
                      <li key={i} className="text-[11px] text-base-content/50 list-disc">{dp}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

          {result.insights && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <p className="text-xs text-purple-800">{result.insights}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
