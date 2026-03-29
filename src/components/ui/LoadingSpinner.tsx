/**
 * MRD-UI-006 | LoadingSpinner  —  LOCKED DESIGN
 * ─────────────────────────────────────────────────────────────────
 * Canonical loading states for MyReDeal.
 *
 * SOURCE OF TRUTH — import this everywhere.
 * Replaces 149 ad-hoc animate-spin / "Loading..." / skeleton patterns.
 *
 * Usage:
 *   <LoadingSpinner />                           → centered spinner, full area
 *   <LoadingSpinner size="sm" label="Saving…" /> → inline with label
 *   <LoadingSpinner overlay />                   → full-page overlay spinner
 *   <SkeletonRow />                              → single text row placeholder
 *   <SkeletonCard />                             → card-shaped placeholder
 *   <SkeletonList count={5} />                   → list of skeleton rows
 * ─────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { Loader2 } from 'lucide-react';

type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg';

const spinnerSize: Record<SpinnerSize, number> = {
  xs: 12,
  sm: 16,
  md: 24,
  lg: 36,
};

interface LoadingSpinnerProps {
  size?: SpinnerSize;
  label?: string;
  /** Center in its container with vertical padding */
  centered?: boolean;
  /** Full-page semi-transparent overlay */
  overlay?: boolean;
  className?: string;
}

export function LoadingSpinner({
  size = 'md',
  label,
  centered = true,
  overlay = false,
  className = '',
}: LoadingSpinnerProps) {
  const icon = (
    <Loader2
      size={spinnerSize[size]}
      className="animate-spin text-primary"
    />
  );

  if (overlay) {
    return (
      <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/20">
        <div className="bg-white rounded-xl p-6 flex flex-col items-center gap-3 shadow-xl">
          {icon}
          {label && <p className="text-sm text-base-content/60">{label}</p>}
        </div>
      </div>
    );
  }

  if (centered) {
    return (
      <div className={`flex flex-col items-center justify-center py-12 gap-3 ${className}`}>
        {icon}
        {label && <p className="text-sm text-base-content/60">{label}</p>}
      </div>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {icon}
      {label && <span className="text-sm text-base-content/60">{label}</span>}
    </span>
  );
}

// ── Skeleton primitives ───────────────────────────────────────────

function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-base-200 rounded ${className}`} />
  );
}

/** Single row of skeleton text */
export function SkeletonRow({ wide = false }: { wide?: boolean }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <Skeleton className="h-8 w-8 rounded-full flex-none" />
      <div className="flex-1 space-y-2">
        <Skeleton className={`h-3 ${wide ? 'w-3/4' : 'w-1/2'}`} />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

/** Card-shaped skeleton */
export function SkeletonCard() {
  return (
    <div className="bg-white border border-base-200 rounded-xl p-4 space-y-3">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
    </div>
  );
}

/** List of skeleton rows */
export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} wide={i % 2 === 0} />
      ))}
    </div>
  );
}
