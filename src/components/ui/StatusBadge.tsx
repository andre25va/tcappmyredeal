/**
 * MRD-UI-003 | StatusBadge  —  LOCKED DESIGN
 * ─────────────────────────────────────────────────────────────────
 * Canonical status badge for MyReDeal.
 *
 * SOURCE OF TRUTH — import this everywhere. Never rebuild inline.
 * Replaces 56 inline `badge badge-*` status patterns across components.
 *
 * Usage:
 *   <StatusBadge status={deal.status} />
 *   <StatusBadge status="contract" size="lg" />
 *   <StatusBadge status={deal.status} dot />   ← dot only, no label
 *
 * Also handles task priority, checklist status, and document status.
 *
 * Deal status config is sourced from helpers.ts (statusLabel / statusColor / statusDot)
 * — do NOT duplicate it here. Change deal status colors in helpers.ts only.
 * ─────────────────────────────────────────────────────────────────
 */

import React from 'react';
import type { DealStatus, TaskPriority } from '../../types';
import { statusLabel, statusColor, statusDot } from '../../utils/helpers';

// ── Deal status values (used for type-narrowing only) ─────────────
const DEAL_STATUSES = new Set<string>([
  'contract', 'due-diligence', 'clear-to-close', 'closed', 'terminated',
]);

// ── Task priority ─────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; badge: string }> = {
  'high':   { label: 'High',   badge: 'badge-error' },
  'medium': { label: 'Medium', badge: 'badge-warning' },
  'low':    { label: 'Low',    badge: 'badge-ghost' },
};

// ── Checklist / doc status ─────────────────────────────────────────

const MISC_CONFIG: Record<string, { label: string; badge: string }> = {
  'pending':   { label: 'Pending',   badge: 'badge-warning' },
  'complete':  { label: 'Complete',  badge: 'badge-success' },
  'completed': { label: 'Completed', badge: 'badge-success' },
  'received':  { label: 'Received',  badge: 'badge-info' },
  'waived':    { label: 'Waived',    badge: 'badge-ghost' },
  'n/a':       { label: 'N/A',       badge: 'badge-ghost' },
  'approved':  { label: 'Approved',  badge: 'badge-success' },
  'rejected':  { label: 'Rejected',  badge: 'badge-error' },
  'draft':     { label: 'Draft',     badge: 'badge-neutral' },
  'sent':      { label: 'Sent',      badge: 'badge-info' },
  'active':    { label: 'Active',    badge: 'badge-success' },
  'inactive':  { label: 'Inactive',  badge: 'badge-neutral' },
};

type BadgeSize = 'xs' | 'sm' | 'md';

interface StatusBadgeProps {
  status: string;
  size?: BadgeSize;
  /** Render as a colored dot only (no text) */
  dot?: boolean;
  className?: string;
}

function resolveConfig(status: string): { label: string; badge: string; dot?: string } {
  const lower = status?.toLowerCase?.() ?? '';
  // Deal statuses — delegate to helpers.ts (single source of truth)
  if (DEAL_STATUSES.has(lower)) {
    const ds = lower as DealStatus;
    return { label: statusLabel(ds), badge: statusColor(ds), dot: statusDot(ds) };
  }
  if (lower in PRIORITY_CONFIG) return PRIORITY_CONFIG[lower as TaskPriority];
  if (lower in MISC_CONFIG) return MISC_CONFIG[lower];
  // Fallback: capitalize and use ghost
  return { label: status, badge: 'badge-ghost' };
}

const sizeClass: Record<BadgeSize, string> = {
  xs: 'badge-xs',
  sm: 'badge-sm',
  md: '',
};

export function StatusBadge({ status, size = 'xs', dot = false, className = '' }: StatusBadgeProps) {
  const config = resolveConfig(status);

  if (dot) {
    const dotColor = ('dot' in config && config.dot) ? config.dot : config.badge.replace('badge-', 'bg-');
    return (
      <span
        className={`inline-block w-2 h-2 rounded-full flex-none ${dotColor} ${className}`}
        title={config.label}
      />
    );
  }

  return (
    <span className={`badge ${config.badge} ${sizeClass[size]} ${className}`}>
      {config.label}
    </span>
  );
}

// ── Convenience exports ───────────────────────────────────────────

/** Dot + label side by side — common pattern in deal lists */
export function StatusDotLabel({
  status,
  size = 'xs',
  className = '',
}: {
  status: string;
  size?: BadgeSize;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <StatusBadge status={status} dot />
      <StatusBadge status={status} size={size} />
    </span>
  );
}
