/**
 * MRD-UI-007 | EmptyState  —  LOCKED DESIGN
 * ─────────────────────────────────────────────────────────────────
 * Canonical empty state for MyReDeal lists and views.
 *
 * SOURCE OF TRUTH — import this everywhere.
 *
 * Usage:
 *   <EmptyState
 *     icon={<FileText size={32} />}
 *     title="No documents yet"
 *     message="Upload your first document to get started."
 *     action={<Button variant="primary" size="sm">Upload</Button>}
 *   />
 * ─────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  message?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  message,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 px-6 text-center ${className}`}>
      <div className="w-12 h-12 rounded-full bg-base-200 flex items-center justify-center mb-4 text-base-content/30">
        {icon ?? <Inbox size={24} />}
      </div>
      <p className="font-semibold text-sm text-base-content/70">{title}</p>
      {message && (
        <p className="text-sm text-base-content/40 mt-1 max-w-xs">{message}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
