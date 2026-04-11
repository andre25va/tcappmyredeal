import React, { useState } from 'react';
import { Search, AlertTriangle, Clock, ShoppingCart, Tag, X, Archive, Flame, MoreVertical, RotateCcw } from 'lucide-react';
import { Deal, DealStatus, ContactRecord } from '../types';
import { MILESTONE_LABELS, MILESTONE_COLORS } from '../utils/taskTemplates';
import {
  closingCountdown, formatCurrency,
  pendingDocCount, checklistProgress, daysUntil,
} from '../utils/helpers';
import { StatusDotLabel } from './ui/StatusBadge';
import { Button } from './ui/Button';

const ARCHIVE_REASONS = [
  { value: 'deal-closed',  label: 'Deal Closed'  },
  { value: 'fell-through', label: 'Fell Through'  },
  { value: 'duplicate',    label: 'Duplicate'     },
  { value: 'other',        label: 'Other'         },
];

const VIEW_FILTER_OPTS: { label: string; value: 'active' | 'closed' | 'archived' | 'all' | 'terminated' }[] = [
  { label: 'Active',     value: 'active'     },
  { label: 'Closed',     value: 'closed'     },
  { label: 'Archived',   value: 'archived'   },
  { label: 'Terminated', value: 'terminated' },
  { label: 'All',        value: 'all'        },
];

interface Props {
  deals: Deal[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  amberFilter?: boolean;
  onClearAmberFilter?: () => void;
  contactRecords?: ContactRecord[];
  onArchiveDeal?: (dealId: string, reason: string) => void;
  onRestoreDeal?: (dealId: string) => void;
  onChangeStatus?: (dealId: string, status: DealStatus) => void;
}

const STATUS_FILTERS: { label: string; value: DealStatus | 'all' }[] = [
  { label: 'All',      value: 'all' },
  { label: 'Contract', value: 'contract' },
  { label: 'DD',       value: 'due-diligence' },
  { label: 'CTC',      value: 'clear-to-close' },
  { label: 'Closed',   value: 'closed' },
];

// Neutral grey cards
const cardBase     = 'bg-gray-50 border-gray-200';
const cardSelected = 'bg-gray-100 border-gray-300';

const sideStylesConst = {
  buyer: {
    card:         cardBase,
    cardSelected: cardSelected,
    badge:        'bg-blue-100  text-blue-700  border-blue-300',
    icon:         'text-blue-500',
    dot:          'bg-blue-400',
  },
  seller: {
    card:         cardBase,
    cardSelected: cardSelected,
    badge:        'bg-green-100 text-green-700 border-green-300',
    icon:         'text-green-500',
    dot:          'bg-green-400',
  },
};

// ── Deal Health Score ───────────────────────────────────────────────────────

function computeDealHealth(deal: Deal): { score: number; label: 'healthy' | 'watch' | 'at-risk'; tooltip: string } {
  let score = 100;
  const today = new Date().toISOString().slice(0, 10);
  const reasons: string[] = [];

  // Overdue tasks (-12 each)
  const overdueTasks = (deal.tasks ?? []).filter(t => !t.completedAt && t.dueDate && t.dueDate < today);
  if (overdueTasks.length > 0) {
    score -= overdueTasks.length * 12;
    reasons.push(`${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}`);
  }

  // Incomplete compliance items (-5 each, capped at -25)
  const missingCompliance = (deal.complianceChecklist ?? []).filter(i => !i.completed);
  if (missingCompliance.length > 0) {
    score -= Math.min(missingCompliance.length * 5, 25);
    reasons.push(`${missingCompliance.length} compliance item${missingCompliance.length > 1 ? 's' : ''} pending`);
  }

  // Pending doc requests (-8 each)
  const pendingDocs = (deal.documentRequests ?? []).filter(d => d.status === 'pending');
  if (pendingDocs.length > 0) {
    score -= pendingDocs.length * 8;
    reasons.push(`${pendingDocs.length} doc request${pendingDocs.length > 1 ? 's' : ''} pending`);
  }

  // Closing proximity penalty (-15 if closing <=7d with open issues)
  if (deal.closingDate) {
    const daysToClose = Math.floor((new Date(deal.closingDate).getTime() - Date.now()) / 86_400_000);
    if (daysToClose >= 0 && daysToClose <= 7 && reasons.length > 0) {
      score -= 15;
      reasons.push(`closing in ${daysToClose}d with open items`);
    }
  }

  score = Math.max(0, Math.min(100, score));
  const label = score >= 80 ? 'healthy' : score >= 50 ? 'watch' : 'at-risk';
  const tooltip = reasons.length > 0 ? reasons.join(' · ') : 'Deal is on track';
  return { score, label, tooltip };
}

const HEALTH_PILL = {
  'healthy': 'bg-emerald-100 text-emerald-700 border-emerald-300',
  'watch':   'bg-amber-100   text-amber-700   border-amber-300',
  'at-risk': 'bg-red-100     text-red-700     border-red-300',
} as const;

const HEALTH_ICON = {
  'healthy': '✓',
  'watch':   '!',
  'at-risk': '⚠',
} as const;

const renderDealCard = (
  deal: Deal,
  selectedId: string | null,
  onSelect: (id: string) => void,
  styles: typeof sideStylesConst,
  openMenu: string | null,
  setOpenMenu: (id: string | null) => void,
  onArchiveDeal?: (dealId: string, reason: string) => void,
  onRestoreDeal?: (dealId: string) => void,
  onChangeStatus?: (dealId: string, status: DealStatus) => void,
  openArchive?: (dealId: string, label: string) => void,
) => {
  const isArchived = deal.milestone === 'archived' || deal.status === 'archived';
  const side      = deal.transactionType ?? 'buyer';
  const sideKey   = (side === 'buyer' || side === 'seller') ? side : 'buyer';
  const sideStyle = styles[sideKey];
  const countdown = closingCountdown(deal.closingDate);
  const pending   = pendingDocCount(deal.documentRequests);
  const ddProg    = checklistProgress(deal.dueDiligenceChecklist);
  const isSelected = deal.id === selectedId;

  // Only compute health for active (non-archived, non-closed) deals
  const health = (!isArchived && deal.status !== 'closed') ? computeDealHealth(deal) : null;

  return (
    <div
      key={deal.id}
      className={`relative w-full text-left p-3 rounded-xl border transition-all group ${
        isSelected ? sideStyle.cardSelected : sideStyle.card
      } hover:opacity-90 ${isArchived ? 'opacity-60' : ''}`}
      onClick={() => onSelect(deal.id)}
    >

      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            {(deal as any).dealRef || deal.dealNumber != null ? (
              <span className="flex-none text-[10px] font-bold text-base-content/40 bg-base-300 px-1.5 py-0.5 rounded font-mono">
                {(deal as any).dealRef || `#${String(deal.dealNumber).padStart(3, '0')}`}
              </span>
            ) : null}
            <p className="font-semibold text-sm text-base-content truncate">{deal.propertyAddress}</p>
          </div>
          <p className="text-xs text-base-content/50 truncate">{deal.city}, {deal.state} {deal.zipCode}</p>
        </div>
        <div className="flex items-center gap-1 flex-none">
          {/* Amber alert count */}
          {!isArchived && pending > 0 && (
            <div className="flex items-center gap-0.5 bg-amber-500 px-1.5 py-0.5 rounded-full shadow-sm">
              <AlertTriangle size={10} className="text-white" />
              <span className="text-white text-xs font-bold">{pending}</span>
            </div>
          )}
          {/* Health score badge */}
          {health && (
            <div
              title={health.tooltip}
              className={`flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full border cursor-default select-none ${HEALTH_PILL[health.label]}`}
            >
              <span>{HEALTH_ICON[health.label]}</span>
              <span>{health.score}</span>
            </div>
          )}
          {/* Buyer/Seller or Archived badge */}
          {isArchived ? (
            <span className="flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full border bg-gray-100 text-gray-500 border-gray-300">
              <Archive size={9} /> ARCHIVED
            </span>
          ) : (
            <span className={`flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full border ${sideStyle.badge}`}>
              {side === 'buyer' ? <ShoppingCart size={9} /> : <Tag size={9} />}
              {side.charAt(0).toUpperCase() + side.slice(1)}
            </span>
          )}
        </div>
      </div>

      {/* Archive reason */}
      {isArchived && deal.archiveReason && (
        <p className="text-xs text-gray-500 mb-1 italic">
          {deal.archiveReason.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
        </p>
      )}

      {/* Status + Agent */}
      <div className="flex items-center gap-1.5 mb-2">
        <StatusDotLabel status={deal.status} />
        <span className="text-base-content/20 text-xs">·</span>
        <span className="text-xs text-base-content/60 truncate">{deal.agentName}</span>
      </div>

      {/* Milestone badge */}
      {deal.milestone && (
        <div className="mb-1.5">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${MILESTONE_COLORS[deal.milestone]}`}>
            {MILESTONE_LABELS[deal.milestone]}
          </span>
        </div>
      )}

      {/* Price + Countdown */}
      {!isArchived && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-base-content">{formatCurrency(deal.contractPrice)}</span>
          <div className={`flex items-center gap-1 text-xs font-medium ${countdown.color}`}>
            <Clock size={10} />
            {countdown.label}
          </div>
        </div>
      )}
      {isArchived && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-base-content">{formatCurrency(deal.contractPrice)}</span>
        </div>
      )}

      {/* DD Progress */}
      {!isArchived && (
        <div className="flex items-center gap-2 mb-2">
          <progress
            className={`progress h-1 flex-1 ${side === 'buyer' ? 'progress-info' : 'progress-success'}`}
            value={ddProg.percent}
            max={100}
          />
          <span className="text-xs text-base-content/40">{ddProg.percent}%</span>
        </div>
      )}

      {/* Bottom row: View button + 3-dot menu */}
      <div className="flex justify-between items-center">
        <button
          className={`btn btn-xs ${side === 'buyer' ? 'btn-info' : 'btn-success'} btn-outline gap-1`}
          onClick={e => { e.stopPropagation(); onSelect(deal.id); }}
        >
          View <span className="text-[10px]">→</span>
        </button>
        {/* 3-dot menu */}
        <div className="relative">
          <button
            className="btn btn-xs btn-ghost p-1"
            onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === deal.id ? null : deal.id); }}
            title="More actions"
          >
            <MoreVertical size={13} />
          </button>
          {openMenu === deal.id && (
            <div className="absolute right-0 bottom-7 z-50 bg-base-100 border border-base-300 rounded-lg shadow-lg min-w-[150px] py-1">
              {/* Change Status submenu */}
              <div className="px-3 py-1 text-[10px] font-semibold text-base-content/40 uppercase tracking-wide">Change Status</div>
              {(['contract','due-diligence','clear-to-close','closed','terminated'] as DealStatus[]).map(s => (
                <button
                  key={s}
                  className={`w-full text-left px-3 py-1 text-xs hover:bg-base-200 ${deal.status === s ? 'font-bold text-primary' : ''}`}
                  onClick={e => { e.stopPropagation(); onChangeStatus?.(deal.id, s); setOpenMenu(null); }}
                >
                  {s === 'contract' ? 'Contract' : s === 'due-diligence' ? 'Due Diligence' : s === 'clear-to-close' ? 'Clear to Close' : s === 'closed' ? 'Closed' : 'Terminated'}
                </button>
              ))}
              <div className="border-t border-base-300 my-1" />
              {isArchived ? (
                <button
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-base-200 flex items-center gap-2 text-green-600"
                  onClick={e => { e.stopPropagation(); onRestoreDeal?.(deal.id); setOpenMenu(null); }}
                >
                  <RotateCcw size={11} /> Restore
                </button>
              ) : (
                <button
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-base-200 flex items-center gap-2 text-red-500"
                  onClick={e => { e.stopPropagation(); openArchive?.(deal.id, deal.propertyAddress.split(',')[0]); }}
                >
                  <Archive size={11} /> Archive
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const DealList: React.FC<Props> = ({ deals, selectedId, onSelect, amberFilter = false, onClearAmberFilter, contactRecords = [], onArchiveDeal, onRestoreDeal, onChangeStatus }) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<DealStatus | 'all'>('all');
  const [sideFilter, setSideFilter] = useState<'all' | 'buyer' | 'seller'>('all');
  const [viewFilter, setViewFilter] = useState<'active' | 'closed' | 'archived' | 'all' | 'terminated'>('active');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<{ dealId: string; label: string } | null>(null);
  const [archiveReason, setArchiveReason] = useState('deal-closed');

  // Close menu on outside click
  React.useEffect(() => {
    if (!openMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-deallist-menu]')) setOpenMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenu]);

  const openArchive = (dealId: string, label: string) => {
    setOpenMenu(null);
    setArchiveReason('deal-closed');
    setArchiveTarget({ dealId, label });
  };

  const confirmArchive = () => {
    if (!archiveTarget) return;
    onArchiveDeal?.(archiveTarget.dealId, archiveReason);
    setArchiveTarget(null);
  };

  // Reset local filters when amber filter activates
  React.useEffect(() => {
    if (amberFilter) {
      setSearch('');
      setFilter('all');
      setSideFilter('all');
    }
  }, [amberFilter]);

  const filtered = deals.filter(d => {
    // View filter
    if (viewFilter === 'active'     && (d.status === 'terminated' || d.status === 'archived' || d.milestone === 'archived')) return false;
    if (viewFilter === 'closed'     && d.status !== 'closed') return false;
    if (viewFilter === 'archived'   && d.milestone !== 'archived' && d.status !== 'archived') return false;
    if (viewFilter === 'terminated' && d.status !== 'terminated') return false;

    const q = search.toLowerCase();
    const agentClient = d.agentClientId ? contactRecords.find(c => c.id === d.agentClientId) : undefined;
    const matchSearch =
      !q ||
      d.propertyAddress.toLowerCase().includes(q) ||
      d.agentName.toLowerCase().includes(q) ||
      d.mlsNumber.toLowerCase().includes(q) ||
      d.city.toLowerCase().includes(q) ||
      (agentClient?.id ?? '').toLowerCase().includes(q) ||
      (agentClient?.fullName ?? '').toLowerCase().includes(q);
    const matchStatus = filter === 'all' || d.status === filter;
    const matchSide   = sideFilter === 'all' || d.transactionType === sideFilter;
    const matchAmber  = !amberFilter || pendingDocCount(d.documentRequests) > 0;
    return matchSearch && matchStatus && matchSide && matchAmber;
  });

  // Clearing any manual filter also clears the amber filter
  const handleFilterChange = (val: DealStatus | 'all') => {
    setFilter(val);
    if (amberFilter) onClearAmberFilter?.();
  };
  const handleSideFilterChange = (val: 'all' | 'buyer' | 'seller') => {
    setSideFilter(val);
    if (amberFilter) onClearAmberFilter?.();
  };
  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (amberFilter) onClearAmberFilter?.();
  };

  // Split into closing-this-week and others
  const closingThisWeek = filtered.filter(d => {
    if (d.milestone === 'archived' || d.status === 'archived') return false;
    const days = daysUntil(d.closingDate);
    return days >= 0 && days <= 7;
  });
  const otherDeals = filtered.filter(d => !closingThisWeek.includes(d));

  return (
    <>
      <div className="flex-none bg-base-200 border-r border-base-300 flex flex-col h-full w-72 lg:w-80" data-deallist-menu>
        {/* Amber Alert Filter Banner */}
        {amberFilter && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-500 border-b border-amber-600">
            <AlertTriangle size={13} className="text-white flex-none" />
            <span className="text-xs font-semibold text-white flex-1">
              Showing {filtered.length} deal{filtered.length !== 1 ? 's' : ''} with amber alerts
            </span>
            <button
              onClick={onClearAmberFilter}
              className="flex items-center gap-0.5 text-xs text-white/80 hover:text-white font-medium"
            >
              <X size={12} /> Clear
            </button>
          </div>
        )}

        <div className="p-3 border-b border-base-300 space-y-2">
          <label className="input input-bordered input-sm flex items-center gap-2">
            <Search size={13} className="opacity-50" />
            <input
              type="text"
              className="grow text-sm min-w-0"
              placeholder="Search deals, agents, MLS…"
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
            />
          </label>

          {/* Buyer / Seller toggle */}
          <div className="flex gap-1">
            {(['all', 'buyer', 'seller'] as const).map(s => (
              <button
                key={s}
                onClick={() => handleSideFilterChange(s)}
                className={`btn btn-xs flex-1 gap-1 ${
                  sideFilter === s
                    ? s === 'buyer'  ? 'bg-blue-500  text-white border-blue-500  hover:bg-blue-600'
                    : s === 'seller' ? 'bg-green-500 text-white border-green-500 hover:bg-green-600'
                    : 'btn-neutral'
                    : 'btn-ghost'
                }`}
              >
                {s === 'buyer'  && <ShoppingCart size={10} />}
                {s === 'seller' && <Tag size={10} />}
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {/* Status filters */}
          <div className="flex gap-1 flex-wrap">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => handleFilterChange(f.value)}
                className={`btn btn-xs ${filter === f.value ? 'btn-primary' : 'btn-ghost'}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* View filter pills */}
          <div className="flex gap-1 flex-wrap">
            {VIEW_FILTER_OPTS.map(f => (
              <button
                key={f.value}
                onClick={() => setViewFilter(f.value)}
                className={`btn btn-xs ${viewFilter === f.value ? 'btn-primary' : 'btn-ghost text-base-content/50'}`}
              >
                {f.label}
                {f.value === 'archived' && deals.filter(d => d.milestone === 'archived' || d.status === 'archived').length > 0 && (
                  <span className="badge badge-xs ml-0.5">{deals.filter(d => d.milestone === 'archived' || d.status === 'archived').length}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Deal Cards */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {filtered.length === 0 && (
            <div className="text-center text-base-content/30 text-sm py-10">No deals found</div>
          )}

          {/* Closing This Week section */}
          {closingThisWeek.length > 0 && (
            <>
              <div className="flex items-center gap-2 px-1 py-1">
                <Flame size={11} className="text-red-500" />
                <span className="text-xs font-bold text-red-600 uppercase tracking-wide">
                  Closing This Week ({closingThisWeek.length})
                </span>
              </div>
              {closingThisWeek.map(deal => renderDealCard(deal, selectedId, onSelect, sideStylesConst, openMenu, setOpenMenu, onArchiveDeal, onRestoreDeal, onChangeStatus, openArchive))}
              {otherDeals.length > 0 && (
                <div className="border-t border-gray-200 my-1" />
              )}
            </>
          )}
          {otherDeals.map(deal => renderDealCard(deal, selectedId, onSelect, sideStylesConst, openMenu, setOpenMenu, onArchiveDeal, onRestoreDeal, onChangeStatus, openArchive))}
        </div>

        {/* Footer */}
        <div className="p-2 border-t border-base-300">
          <div className="flex items-center justify-center gap-3 text-xs text-base-content/30">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
              {deals.filter(d => d.transactionType === 'buyer').length} Buyer
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
              {deals.filter(d => d.transactionType === 'seller').length} Seller
            </span>
            <span>{filtered.length} shown</span>
          </div>
        </div>
      </div>

      {/* Archive confirmation modal */}
      {archiveTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" onClick={() => setArchiveTarget(null)}>
          <div className="bg-base-100 rounded-xl shadow-xl p-5 w-80 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-base flex items-center gap-2">
              <Archive size={16} className="text-red-500" /> Archive Deal
            </h3>
            <p className="text-sm text-base-content/70">
              Archiving <span className="font-semibold">{archiveTarget.label}</span>. Choose a reason:
            </p>
            <div className="space-y-1.5">
              {ARCHIVE_REASONS.map(r => (
                <label key={r.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    className="radio radio-sm radio-primary"
                    checked={archiveReason === r.value}
                    onChange={() => setArchiveReason(r.value)}
                  />
                  <span className="text-sm">{r.label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="ghost" onClick={() => setArchiveTarget(null)}>Cancel</Button>
              <Button variant="error" onClick={confirmArchive}>Archive</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
