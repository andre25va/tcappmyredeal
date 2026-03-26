/**
 * MRD-UI-001 | MRDChip  —  LOCKED DESIGN
 * ─────────────────────────────────────────────────────────────────
 * Canonical contact-role chip for MyReDeal.
 *
 * SOURCE OF TRUTH — import this everywhere. Never rebuild inline.
 *
 * Chip anatomy:
 *   [ Avatar ]  Name  [ Role Badge ]
 *
 * Visual states:
 *   default   → white pill, gray border, solid-color avatar + role badge
 *   selected  → full solid role color, frosted avatar + badge, white text
 *   onRemove  → × button appended (To: field recipients)
 *
 * NOTE: isNotifier prop is kept for API compatibility.
 *       All chips now start white; solid color fires on selected=true.
 * ─────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { roleLabel, roleBadge, roleAvatarBg, roleChipSolid, getInitials } from '../../utils/helpers';
import type { ContactRole } from '../../types';

export interface MRDChipProps {
  /** Full display name shown in the chip */
  name: string;
  /** Role value — drives all color decisions. Accepts raw DB values (buyers_agent, title_officer, etc.) */
  role: string;
  /** Kept for API compatibility — no longer changes visual appearance */
  isNotifier?: boolean;
  /** Selected state — fills chip with solid role color */
  selected?: boolean;
  /** Shows a × button; call this to remove from a list */
  onRemove?: (e: React.MouseEvent) => void;
  /** Makes the chip a clickable button */
  onClick?: () => void;
  className?: string;
}

/** Normalize raw DB role values to ContactRole */
function normalizeRole(r: string): ContactRole {
  const map: Record<string, ContactRole> = {
    buyers_agent: 'agent',
    listing_agent: 'agent',
    lead_agent: 'agent',
    title_officer: 'title',
  };
  return (map[r] ?? r) as ContactRole;
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
  void isNotifier; // kept for API compat
  const r = normalizeRole(role);
  const initials = getInitials(name);

  const handleClick = onClick ? onClick : undefined;
  const Tag = handleClick ? 'button' : 'div';
  const tagProps = handleClick
    ? { type: 'button' as const, onClick: handleClick }
    : {};

  /* ── SELECTED — full solid role color ──────────────────────────── */
  if (selected) {
    return (
      <Tag
        {...tagProps}
        className={`inline-flex items-center gap-1 pl-1 pr-2 py-0.5 rounded-full border transition-all ${
          handleClick ? 'cursor-pointer' : ''
        } ${roleChipSolid(r)} ${className}`}
      >
        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-none bg-white/25 text-white">
          {initials}
        </div>
        <span className="text-xs font-medium text-white">{name}</span>
        <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 ml-0.5 bg-white/20 text-white">
          {roleLabel(r)}
        </span>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="ml-0.5 rounded-full text-white/70 hover:text-white transition-opacity"
            aria-label={`Remove ${name}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </Tag>
    );
  }

  /* ── DEFAULT — white pill, colored avatar + badge ──────────────── */
  return (
    <Tag
      {...tagProps}
      className={`inline-flex items-center gap-1 pl-1 pr-2 py-0.5 rounded-full border border-gray-200 bg-white transition-all ${
        handleClick ? 'cursor-pointer hover:border-gray-300 hover:shadow-sm' : ''
      } ${className}`}
    >
      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-none ${roleAvatarBg(r)}`}>
        {initials}
      </div>
      <span className="text-xs font-medium text-gray-900">{name}</span>
      <span className={`badge badge-xs ${roleBadge(r)}`}>{roleLabel(r)}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 rounded-full text-gray-400 hover:text-gray-600 transition-opacity"
          aria-label={`Remove ${name}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </Tag>
  );
}
