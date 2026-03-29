/**
 * MRD UI Component Library
 * ─────────────────────────────────────────────────────────────────
 * Single import point for all shared UI components.
 *
 * Usage:
 *   import { Modal, Button, StatusBadge, DateDisplay, LoadingSpinner } from '../ui';
 *   import { MRDChip } from '../ui';
 *
 * Never import from individual files when this barrel exists.
 * ─────────────────────────────────────────────────────────────────
 */

// MRD-UI-001 | Chip
export { MRDChip } from './MRDChip';
export type { MRDChipProps } from './MRDChip';

// MRD-UI-002 | Modal
export { Modal } from './Modal';

// MRD-UI-003 | StatusBadge
export { StatusBadge, StatusDotLabel } from './StatusBadge';

// MRD-UI-004 | Button
export { Button, IconButton } from './Button';

// MRD-UI-005 | DateDisplay
export { DateDisplay, DeadlineRow } from './DateDisplay';

// MRD-UI-006 | LoadingSpinner
export { LoadingSpinner, SkeletonRow, SkeletonCard, SkeletonList } from './LoadingSpinner';

// MRD-UI-007 | EmptyState
export { EmptyState } from './EmptyState';
