import React from 'react';
import { Mail, ArrowRight, AlertCircle } from 'lucide-react';
import { Deal } from '../types';
import { useDealEmails } from '../hooks/useDealEmails';

interface Props {
  deal: Deal;
  onGoToEmails?: () => void;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  } catch {
    return dateStr;
  }
}

function truncate(str: string, len: number): string {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '…' : str;
}

function extractName(from: string): string {
  if (!from) return 'Unknown';
  const match = from.match(/^([^<]+)</);
  if (match) return match[1].trim();
  return from.split('@')[0];
}

export const EmailSummaryCard: React.FC<Props> = ({ deal, onGoToEmails }) => {
  const { emails, loading, error, stats, rawEmails } = useDealEmails(deal);

  // Loading skeleton
  if (loading && emails.length === 0) {
    return (
      <div className="rounded-xl border border-base-300 bg-white p-4 animate-pulse">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-4 h-4 bg-base-300 rounded" />
          <div className="h-4 w-32 bg-base-300 rounded" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-48 bg-base-300 rounded" />
          <div className="h-3 w-64 bg-base-300 rounded" />
          <div className="h-3 w-40 bg-base-300 rounded" />
        </div>
      </div>
    );
  }

  // Error state
  if (error && emails.length === 0) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <div className="flex items-center gap-2 mb-1">
          <AlertCircle size={14} className="text-red-500" />
          <span className="text-sm font-semibold text-red-700">Email Activity</span>
        </div>
        <p className="text-xs text-red-600">{error}</p>
      </div>
    );
  }

  // Empty state
  if (!loading && emails.length === 0) {
    return (
      <div className="rounded-xl border border-base-300 bg-white p-4">
        <div className="flex items-center gap-2 mb-2">
          <Mail size={14} className="text-base-content/50" />
          <span className="text-sm font-semibold text-base-content">Email Activity</span>
        </div>
        <p className="text-xs text-base-content/50">
          No emails found for this property. Try adding more contacts or checking the address.
        </p>
      </div>
    );
  }

  const latest3 = emails.slice(0, 3);

  return (
    <div className="rounded-xl border border-base-300 bg-white p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Mail size={14} className="text-primary" />
          <span className="text-sm font-semibold text-base-content">Email Activity</span>
        </div>
        <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
          {stats.total} email{stats.total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Count summary */}
      <p className="text-xs text-base-content/60 mb-3">
        {stats.total} email{stats.total !== 1 ? 's' : ''} matched to this deal
      </p>

      {/* Latest 3 emails */}
      <div className="space-y-2 mb-3">
        {latest3.map((email) => (
          <div key={email.id} className="flex items-start gap-2 p-2 rounded-lg bg-base-100 border border-base-200">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-base-content truncate">
                {truncate(email.subject || '(no subject)', 50)}
              </p>
              <p className="text-[11px] text-base-content/50">
                {extractName(email.from)} · {formatDate(email.receivedAt)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Classification stats */}
      {(stats.highConfidence > 0 || stats.aiClassified > 0 || stats.grayZone > 0) && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {stats.highConfidence > 0 && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              {stats.highConfidence} high-confidence
            </span>
          )}
          {stats.aiClassified > 0 && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
              {stats.aiClassified} AI-classified
            </span>
          )}
          {stats.grayZone > 0 && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
              {stats.grayZone} gray zone
            </span>
          )}
        </div>
      )}

      {/* View All link */}
      {onGoToEmails && (
        <button
          onClick={onGoToEmails}
          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          View All in AI Emails <ArrowRight size={12} />
        </button>
      )}
    </div>
  );
};
