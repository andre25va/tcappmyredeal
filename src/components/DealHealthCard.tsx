import React, { useState, useCallback, useEffect } from 'react';
import { Activity, AlertTriangle, CheckCircle, Clock, Brain, RefreshCw, ChevronDown, ChevronUp, Mail } from 'lucide-react';
import { getDealHealth } from '../ai/dealHealth';
import { dealHealthAI } from '../ai/apiClient';
import type { DealHealthAIResponse } from '../ai/apiClient';
import { DealRecord } from '../ai/types';
import { Deal } from '../types';
import { supabase } from '../lib/supabase';
import { generateId } from '../utils/helpers';
import { useInvalidateActivityLog } from '../hooks/useActivityLog';
import { DealParticipant } from '../types';

interface Props {
  dealRecord: DealRecord;
  deal?: Deal;
  onUpdate?: (deal: Deal) => void;
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

export const DealHealthCard: React.FC<Props> = ({ dealRecord, deal, onUpdate }) => {
  const health = getDealHealth(dealRecord);
  const style = LABEL_STYLES[health.label];
  const Icon = style.icon;

  const invalidateActivityLog = useInvalidateActivityLog();
  const [aiResult, setAiResult] = useState<DealHealthAIResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiExpanded, setAiExpanded] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [selectedRecipientId, setSelectedRecipientId] = useState<string | null>(null);

  useEffect(() => {
    if (aiResult) {
      setAiExpanded(true);
    }
  }, [aiResult]);

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

  const sendAgentSummary = useCallback(async (recipientEmail: string) => {
    if (!aiResult || isSending) return;
    
    setIsSending(true);
    try {
      const { error } = await supabase.functions.invoke('auto-nudge', {
        body: {
          dealId: dealRecord.id,
          riskSummary: aiResult.riskSummary,
          topRisk: aiResult.topRisk,
          recommendations: aiResult.recommendations,
          context: 'manual_summary_send',
          recipientEmail: recipientEmail
        },
      });

      if (error) throw error;

      // Find recipient name for the log description
      const recipientName = (deal?.participants ?? [])
        .find(p => p.contactEmail === recipientEmail)?.contactName ?? recipientEmail;

      // Write to activity_log table (persisted, shows in Activity tab)
      await supabase.from('activity_log').insert({
        deal_id: dealRecord.id,
        action: 'ai_summary_sent',
        entity_type: 'deal',
        description: `AI Deal Summary emailed to ${recipientName} (${recipientEmail})`,
        performed_by: 'TC Staff',
      });
      invalidateActivityLog(dealRecord.id);

      // Also keep legacy in-memory update for immediate UI refresh
      if (deal && onUpdate) {
        const newActivityLog = [
          {
            id: generateId(),
            timestamp: new Date().toISOString(),
            action: 'Email sent',
            detail: `AI Summary sent to ${recipientName}`,
            user: 'TC Staff',
            type: 'email_sent' as const,
          },
          ...deal.activityLog,
        ];
        onUpdate({
          ...deal,
          activityLog: newActivityLog,
          updatedAt: new Date().toISOString(),
        });
      }
      
      alert(`AI Summary sent to ${recipientEmail} successfully!`);
    } catch (err: any) {
      console.error('Failed to send nudge:', err);
      alert(`Failed to send nudge: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSending(false);
    }
  }, [aiResult, dealRecord.id, isSending, deal, onUpdate]);

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
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => setAiExpanded(!aiExpanded)}
              className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900"
            >
              <Brain size={12} />
              AI Insights
              <span className={`badge badge-xs ${ASSESSMENT_STYLES[aiResult.overallAssessment] || 'bg-gray-100 text-gray-700'}`}>
                {aiResult.overallAssessment}
              </span>
              {aiExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            
            {/* Recipient selector + Send button */}
            {deal && (
              <select
                className="select select-bordered select-xs w-full max-w-xs mr-2"
                value={selectedRecipientId || ''}
                onChange={(e) => setSelectedRecipientId(e.target.value)}
              >
                <option value="" disabled>Select Recipient</option>
                {(deal.participants ?? [])
                  .filter(p => ['lead_agent', 'co_agent', 'buyer', 'seller'].includes(p.dealRole) && p.contactEmail)
                  .map(p => (
                    <option key={p.contactId} value={p.contactEmail}>
                      {p.contactName} ({p.dealRole.replace('_', ' ')})
                    </option>
                  ))}
              </select>
            )}
            <button
              onClick={() => selectedRecipientId && sendAgentSummary(selectedRecipientId)}
              disabled={isSending || !selectedRecipientId}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {isSending ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <Mail size={12} />
              )}
              Send Summary to Agent
            </button>
          </div>

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
            </div>
          )}
        </div>
      )}
    </div>
  );
};
