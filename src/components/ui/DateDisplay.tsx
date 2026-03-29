/**
 * MRD-UI-005 | DateDisplay  —  LOCKED DESIGN
 * ─────────────────────────────────────────────────────────────────
 * Canonical date rendering for MyReDeal.
 *
 * SOURCE OF TRUTH — import this everywhere. Never use new Date() inline.
 * Replaces 293 raw date formatting calls across components.
 *
 * Uses the existing formatDate / formatDateTime / daysUntil from helpers.ts.
 *
 * Usage:
 *   <DateDisplay date={deal.closeDate} />                   → "Apr 15, 2025"
 *   <DateDisplay date={deal.closeDate} withTime />          → "Apr 15, 2025 3:00 PM"
 *   <DateDisplay date={deal.closeDate} relative />          → "in 12 days" or "3 days ago"
 *   <DateDisplay date={deal.closeDate} relative urgency />  → colored + icon when close
 *   <DateDisplay date={deal.closeDate} format="short" />    → "Apr 15"
 *
 * Returns "—" for empty/null/undefined dates.
 * ─────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import { formatDate, formatDateTime, daysUntil } from '../../utils/helpers';

type DateFormat = 'default' | 'short' | 'long';

interface DateDisplayProps {
  date: string | null | undefined;
  /** Show time alongside date */
  withTime?: boolean;
  /** Show relative label ("in 12 days", "3 days ago") */
  relative?: boolean;
  /** Color-code based on urgency when relative=true (red <3 days, yellow <7) */
  urgency?: boolean;
  format?: DateFormat;
  className?: string;
}

function formatShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatLong(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function relativeLabel(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 0) return `in ${days} days`;
  return `${Math.abs(days)} days ago`;
}

function urgencyClass(days: number): string {
  if (days < 0) return 'text-error';
  if (days <= 3) return 'text-error';
  if (days <= 7) return 'text-warning';
  return 'text-base-content';
}

export function DateDisplay({
  date,
  withTime = false,
  relative = false,
  urgency = false,
  format = 'default',
  className = '',
}: DateDisplayProps) {
  if (!date) return <span className={`text-base-content/40 ${className}`}>—</span>;

  let label: string;
  if (withTime) {
    label = formatDateTime(date);
  } else if (format === 'short') {
    label = formatShort(date);
  } else if (format === 'long') {
    label = formatLong(date);
  } else {
    label = formatDate(date);
  }

  if (relative) {
    const days = daysUntil(date);
    const rel = relativeLabel(days);
    const color = urgency ? urgencyClass(days) : 'text-base-content/60';
    const showIcon = urgency && days <= 3;

    return (
      <span className={`inline-flex items-center gap-1 ${color} ${className}`}>
        {showIcon && (days < 0 ? <AlertCircle size={12} /> : <Clock size={12} />)}
        <span title={label}>{rel}</span>
      </span>
    );
  }

  return <span className={className}>{label}</span>;
}

// ── Deadline row — common pattern in deal workspace ───────────────
/** Label + date in a compact row. urgency coloring built in. */
export function DeadlineRow({
  label,
  date,
  className = '',
}: {
  label: string;
  date: string | null | undefined;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between text-sm ${className}`}>
      <span className="text-base-content/60">{label}</span>
      <DateDisplay date={date} relative urgency className="font-medium text-xs" />
    </div>
  );
}
