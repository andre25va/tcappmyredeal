import React, { useState, useCallback } from 'react';
import { Activity, AlertTriangle, CheckCircle, Clock, Brain, RefreshCw, ChevronDown, ChevronUp, Mail } from 'lucide-react';
import { getDealHealth } from '../ai/dealHealth';
import { dealHealthAI } from '../ai/apiClient';
import type { DealHealthAIResponse } from '../ai/apiClient';
import { DealRecord } from '../ai/types';

interface Props {
  dealRecord: DealRecord;
}

const LABEL_STYLES = {
  'healthy': { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-800', icon: CheckCircle },
  'watch': { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800', icon: Clock },
  'at-risk': { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-800', icon: AlertTriangle },
};

const ASSESSMENT_STYLES: Record<string, string> = {
  'on-track': 'bg-emerald-100 text-emerald-800',
  'needs-attention': 'bg-amber-100 text-amber-800',
  'at-risk': 'bg-orange-100 text-orange-800',
  'critical': 'bg-red-100 text-red-800',
};

export const DealHealthCard: React.FC<Props> = ({ dealRecord }) => {
  const health = getDealHealth(dealRecord);
  const style = LABEL_STYLES[health.label];
  const Icon = style.icon;

  const [aiResult, setAiResult] = useState<DealHealthAIResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiExpanded, setAiExpanded] = useState(true);

  const runAIAnalysis = useCallback(async () => {
    if (aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await dealHealthAI(dealRecord);
      setAiResult(result);
      setAiExpanded(true);
    } catch (err: any) {
      setAiError(err.message || 'AI analysis failed');
    } finally {
      setAiLoading(false);
    }
  }, [dealRecord, aiLoading]);

  const sendAgentSummary = useCallback(async () => {
    if (!aiResult) return; // Only send if AI analysis is available

    // In a real implementation, this would call an Edge Function or API to send the summary
    // For now, we'll simulate the action and log the content
    console.log('Sending AI summary to agent:', {
      dealId: dealRecord.id,
      riskSummary: aiResult.riskSummary,
      topRisk: aiResult.topRisk,
      recommendations: aiResult.recommendations,
      // You would typically include agent contact info from dealRecord here
      // e.g., agentEmail: dealRecord.agent.email,
    });

    // Simulate API call success
    alert('AI Summary sent to agent (simulated)!');

    // Optionally, you might want to disable the button or show a success message
  }, [aiResult, dealRecord]);

  return (
    <div className={`rounded-xl border p-4 ${style.bg} ${style.border}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity size={16} className={style.text} />
          <h3 className="text-sm font-semibold text-base-content">Deal Health</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runAIAnalysis}
            disabled={aiLoading}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-colors disabled:opacity-50"
          >
            {aiLoading ? (
              <>
                <span className="loading loading-spinner loading-xs" />
                Analyzing…
              </>
            ) : (
              <>
                <Brain size={12} />
                AI Analysis
              </>
            )}
          </button>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${style.badge}`}>
            <Icon size={12} />
            <span>{health.score}/100</span>
            <span className="capitalize">— {health.label}</span>
          </div>
        </div>
      </div>

      <p className="text-sm text-base-content/70 mb-3">{health.summary}</p>

      {(health.missingItems.length > 0 || health.overdueTasks.length > 0 || health.staleWarnings.length > 0) && (
        <div className="grid gap-3 md:grid-cols-3">
          {health.missingItems.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-base-content/60 mb-1">Missing Items</h5>
              <ul className="space-y-0.5">
                {health.missingItems.map((item) => (
                  <li key={item} className="text-xs text-red-600">• {item}</li>
                ))}
              </ul>
            </div>
          )}
          {health.overdueTasks.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-base-content/60 mb-1">Overdue Tasks</h5>
              <ul className="space-y-0.5">
                {health.overdueTasks.map((item) => (
                  <li key={item} className="text-xs text-amber-700">• {item}</li>
                ))}
              </ul>
            </div>
          )}
          {health.staleWarnings.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-base-content/60 mb-1">Warnings</h5>
              <ul className="space-y-0.5">
                {health.staleWarnings.map((item) => (
                  <li key={item} className="text-xs text-orange-600">• {item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* AI Error */}
      {aiError && (
        <div className="mt-3 flex items-center gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200">
          <AlertTriangle size={14} className="text-red-500 flex-none" />
          <span className="text-xs text-red-700 flex-1">{aiError}</span>
          <button
            onClick={runAIAnalysis}
            className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 font-medium"
          >
            <RefreshCw size={12} />
            Retry
          </button>
        </div>
      )}

      {/* AI Results */}
      {aiResult && (
        <div className="mt-3 border-t border-current/10 pt-3">
          <button
            onClick={() => setAiExpanded(!aiExpanded)}
            className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900 mb-2"
          >
            <Brain size={12} />
            AI Insights
            <span className={`badge badge-xs ${ASSESSMENT_STYLES[aiResult.overallAssessment] || 'bg-gray-100 text-gray-700'}`}>
              {aiResult.overallAssessment}
            </span>
            {aiExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          {aiExpanded && (
            <div className="space-y-3 pl-1">
              {/* Risk Summary */}
              <div>
                <h6 className="text-xs font-semibold text-base-content/60 mb-0.5">Risk Summary</h6>
                <p className="text-xs text-base-content/80">{aiResult.riskSummary}</p>
              </div>

              {/* Top Risk */}
              {aiResult.topRisk && (
                <div>
                  <h6 className="text-xs font-semibold text-base-content/60 mb-0.5">Top Risk</h6>
                  <p className="text-xs text-red-600">{aiResult.topRisk}</p>
                </div>
              )}

              {/* Recommendations */}
              {aiResult.recommendations.length > 0 && (
                <div>
                  <h6 className="text-xs font-semibold text-base-content/60 mb-0.5">Recommendations</h6>
                  <ul className="space-y-0.5">
                    {aiResult.recommendations.slice(0, 5).map((rec, idx) => (
                      <li key={idx} className="text-xs text-base-content/80">• {rec}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Next Milestone */}
              <div className="flex items-center gap-3 flex-wrap">
                <div>
                  <h6 className="text-xs font-semibold text-base-content/60 mb-0.5">Next Milestone</h6>
                  <p className="text-xs text-base-content/80">{aiResult.nextMilestone}</p>
                </div>
                {aiResult.estimatedDaysToClose !== null && (
                  <div>
                    <h6 className="text-xs font-semibold text-base-content/60 mb-0.5">Est. Days to Close</h6>
                    <p className="text-xs text-base-content/80">{aiResult.estimatedDaysToClose} days</p>
                  </div>
                )}
              </div>

              {/* New Send Agent Summary Button */}
              <button
                onClick={sendAgentSummary}
                className="mt-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                <Mail size={16} />
                Send AI Summary to Agent
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
