import React from 'react';
import { Activity, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { getDealHealth } from '../ai/dealHealth';
import { DealRecord } from '../ai/types';

interface Props {
  dealRecord: DealRecord;
}

const LABEL_STYLES = {
  'healthy': { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-800', icon: CheckCircle },
  'watch': { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800', icon: Clock },
  'at-risk': { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-800', icon: AlertTriangle },
};

export const DealHealthCard: React.FC<Props> = ({ dealRecord }) => {
  const health = getDealHealth(dealRecord);
  const style = LABEL_STYLES[health.label];
  const Icon = style.icon;

  return (
    <div className={`rounded-xl border p-4 ${style.bg} ${style.border}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity size={16} className={style.text} />
          <h3 className="text-sm font-semibold text-base-content">Deal Health</h3>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${style.badge}`}>
          <Icon size={12} />
          <span>{health.score}/100</span>
          <span className="capitalize">— {health.label}</span>
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
    </div>
  );
};
