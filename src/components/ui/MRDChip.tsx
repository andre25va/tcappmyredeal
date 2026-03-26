/**
 * MRD-UI-001 | MRDChip
 * ─────────────────────────────────────────────────────────────────
 * Canonical contact-role chip for MyReDeal.
 *
 * SOURCE OF TRUTH — import this everywhere. Never rebuild inline.
 *
 * Two visual modes:
 *   isNotifier=true  → solid role-colored background (they ARE on the list)
 *   isNotifier=false → neutral white background (available to select)
 *
 * Optional states:
 *   selected  → blue selection ring (multi-select pickers)
 *   onRemove  → shows × button (To: field recipients)
 *   onClick   → makes the chip a button
 * ─────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { roleLabel, roleBadge, roleAvatarBg, roleChipSolid, getInitials } from '../../utils/helpers';
import type { ContactRole } from '../../types';

export interface MRDChipProps {
  /** Full display name shown in the chip */
  name: string;
  /** ContactRole value — drives all color decisions */
  role: string;
  /** Solid role-colored background when true; neutral white when false */
  isNotifier?: boolean;
  /** Blue selection ring — use for multi-select picker state */
  selected?: boolean;
  /** Shows a × button; call this to remove from a list */
  onRemove?: (e: React.MouseEvent) => void;
  /** Makes the chip clickable */
  onClick?: () => void;
  className?: string;
}

export function MRDChip({
  name,
  role,
  isNotifier = false,
  selected = false,
  onRemove,
  onClick,
  className = '',
}: MRDChipProps) {
  const r = role as ContactRole;

  /* ── visual config ────────────────────────────────────────────── */
  const chipBase = 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border shadow-sm transition-all';

  const chipColor = isNotifier
    ? roleChipSolid(r)                                                          // solid: bg-primary border-primary text-primary-content
    : selected
      ? 'bg-white border-primary ring-2 ring-primary/20 shadow-md'             // selected: white + ring
      : 'bg-white border-gray-200 hover:border-primary/40 hover:shadow-md';    // neutral: plain white

  const avatarColor = isNotifier
    ? 'bg-white/25 text-inherit'                                                // frosted on solid bg
    : roleAvatarBg(r);                                                          // role-tinted on white bg

  const badgeColor = isNotifier
    ? 'badge-xs bg-white/20 border-0 text-inherit'                             // frosted badge on solid
    : `badge-xs ${roleBadge(r)}`;                                              // role badge on white

  /* ── chip element ─────────────────────────────────────────────── */
  const inner = (
    <>
      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-none ${avatarColor}`}>
        {getInitials(name)}
      </div>
      <span className={`text-xs font-medium ${isNotifier ? '' : 'text-black'}`}>{name}</span>
      <span className={`badge ${badgeColor}`}>{roleLabel(r)}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className={`ml-0.5 rounded-full hover:opacity-70 transition-opacity ${isNotifier ? 'text-inherit' : 'text-gray-400'}`}
          aria-label={`Remove ${name}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${chipBase} ${chipColor} ${className}`}
      >
        {inner}
      </button>
    );
  }

  return (
    <div className={`${chipBase} ${chipColor} ${className}`}>
      {inner}
    </div>
  );
}
