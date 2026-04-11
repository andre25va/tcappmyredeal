import React, { useState } from 'react';
import { Search, AlertTriangle, Clock, ShoppingCart, Tag, X, Archive, Flame, MoreVertical, RotateCcw, Info, Send } from 'lucide-react';
import { Deal, DealStatus, ContactRecord } from '../types';
import { MILESTONE_LABELS, MILESTONE_COLORS } from '../utils/taskTemplates';
import {
  closingCountdown, formatCurrency,
  pendingDocCount, checklistProgress, daysUntil,
} from '../utils/helpers';
import { StatusDotLabel } from './ui/StatusBadge';
import { Button } from './ui/Button';
import { supabase } from '../lib/supabase';

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

// ── Deal Health Insight Component ───────────────────────────────────────────

const DealHealthInsight = ({ dealId, score }: { dealId: string, score: number }) => {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nudging, setNudging] = useState(false);

  const label = score >= 80 ? 'healthy' : score >= 50 ? 'watch' : 'at-risk';

  const fetchInsight = async () => {
    if (insight) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-ai-insights', {
        body: { dealId }
      });
      if (error) throw error;
      setInsight(data.insight);
    } catch (err) {
      setInsight("Unable to load AI insights at this time.");
    } finally {
      setLoading(false);
    }
  };

  const handleNudge = async () => {
    setNudging(true);
    try {
      await supabase.functions.invoke('auto-nudge', {
        body: { dealId, urgency: score < 70 ? 'high' : 'medium' }
      });
      alert("Nudge sent to agent!");
    } catch (err) {
      alert("Failed to send nudge.");
    } finally {
      setNudging(false);
    }
  };

  return (
    <div className="dropdown dropdown-end">
      <div 
        tabIndex={0} 
        role="button" 
        onClick={(e) => { e.stopPropagation(); fetchInsight(); }}
        className={`flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full border cursor-pointer select-none ${HEALTH_PILL[label]}`}
      >
        <span>{HEALTH_ICON[label]}</span>
        <span>{score}</span>
      </div>
      <div tabIndex={0} className="dropdown-content z-[100] card card-compact w-64 p-2 shadow bg-base-100 border border-base-300 mt-1" onClick={e => e.stopPropagation()}>
        <div className="card-body">
          <h3 className="card-title text-xs font-bold flex items-center gap-1">
            <Info size={12} /> AI Deal Insight
          </h3>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-base-content/60">
              <span className="loading loading-spinner loading-xs"></span>
              Analyzing deal...
            </div>
          ) : (
            <p className="text-xs leading-relaxed text-base-content/80">
              {insight || "No insights available."}
            </p>
          )}
          <div className="card-actions justify-end mt-2">
            <Button 
              size="xs" 
              variant="primary" 
              className="gap-1" 
              onClick={handleNudge}
              disabled={nudging}
            >
              {nudging ? <span className="loading loading-spinner loading-xs"></span> : <Send size={10} />}
              Nudge Agent
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

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

  // Use the pre-calculated health score from the database
  const healthScore = (deal as any).health_score ?? 100;
  const showHealth = !isArchived && deal.status !== 'closed';

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
          {/* Health score badge with AI Insight Popover */}
          {showHealth && (
            <DealHealthInsight dealId={deal.id} score={healthScore} />
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

        <div className="dropdown dropdown-end" onClick={e => e.stopPropagation()}>
          <button
            className="btn btn-ghost btn-xs p-0 w-6 h-6 min-h-0"
            onClick={() => setOpenMenu(openMenu === deal.id ? null : deal.id)}
          >
            <MoreVertical size={14} />
          </button>
          {openMenu === deal.id && (
            <ul className="dropdown-content z-[50] menu p-1 shadow bg-base-100 border border-base-300 rounded-lg w-40 mt-1">
              {!isArchived && (
                <>
                  <li>
                    <button onClick={() => { onChangeStatus?.(deal.id, 'closed'); setOpenMenu(null); }}>
                      <ShoppingCart size={14} /> Mark Closed
                    </button>
                  </li>
                  <li>
                    <button onClick={() => { openArchive?.(deal.id, deal.propertyAddress); setOpenMenu(null); }}>
                      <Archive size={14} className="text-error" /> Archive Deal
                    </button>
                  </li>
                </>
              )}
              {isArchived && (
                <li>
                  <button onClick={() => { onRestoreDeal?.(deal.id); setOpenMenu(null); }}>
                    <RotateCcw size={14} /> Restore Deal
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

const DealList: React.FC<Props> = ({
  deals,
  selectedId,
  onSelect,
  amberFilter,
  onClearAmberFilter,
  onArchiveDeal,
  onRestoreDeal,
  onChangeStatus,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewFilter, setViewFilter] = useState<'active' | 'closed' | 'archived' | 'all' | 'terminated'>('active');
  const [statusFilter, setStatusFilter] = useState<DealStatus | 'all'>('all');
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const [archiveModal, setArchiveModal] = useState<{ id: string; label: string } | null>(null);
  const [archiveReason, setArchiveReason] = useState('deal-closed');

  const filtered = deals.filter(d => {
    // 1. Text search
    const matchesSearch =
      d.propertyAddress.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.agentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d as any).dealRef?.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    // 2. View filter (active, archived, etc)
    const isArchived = d.milestone === 'archived' || d.status === 'archived';
    const isClosed   = d.status === 'closed';
    const isTerminated = d.status === 'terminated';

    if (viewFilter === 'active') {
      if (isArchived || isClosed || isTerminated) return false;
    } else if (viewFilter === 'archived') {
      if (!isArchived) return false;
    } else if (viewFilter === 'closed') {
      if (!isClosed) return false;
    } else if (viewFilter === 'terminated') {
      if (!isTerminated) return false;
    }

    // 3. Status filter (contract, dd, etc)
    if (statusFilter !== 'all' && d.status !== statusFilter) return false;

    // 4. Amber alert filter
    if (amberFilter) {
      const pending = pendingDocCount(d.documentRequests);
      if (pending === 0) return false;
    }

    return true;
  });

  // Sort: At-risk deals first, then by closing date
  const sorted = [...filtered].sort((a, b) => {
    const aScore = (a as any).health_score ?? 100;
    const bScore = (b as any).health_score ?? 100;
    if (aScore !== bScore) return aScore - bScore;
    if (!a.closingDate) return 1;
    if (!b.closingDate) return -1;
    return a.closingDate.localeCompare(b.closingDate);
  });

  const openArchive = (id: string, label: string) => {
    setArchiveModal({ id, label });
  };

  const confirmArchive = () => {
    if (archiveModal && onArchiveDeal) {
      onArchiveDeal(archiveModal.id, archiveReason);
      setArchiveModal(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-base-100">
      <div className="p-4 border-b border-base-300 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            Transactions
            <span className="badge badge-sm badge-ghost">{filtered.length}</span>
          </h2>
          {amberFilter && (
            <button
              onClick={onClearAmberFilter}
              className="btn btn-xs btn-ghost text-amber-600 gap-1"
            >
              <X size={12} /> Clear Filter
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/30" size={16} />
          <input
            type="text"
            placeholder="Search address, agent, or ID..."
            className="input input-sm input-bordered w-full pl-10 bg-base-200/50 border-none"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        {/* View Filter Tabs */}
        <div className="flex flex-wrap gap-1">
          {VIEW_FILTER_OPTS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setViewFilter(opt.value)}
              className={`btn btn-xs rounded-full ${
                viewFilter === opt.value ? 'btn-neutral' : 'btn-ghost text-base-content/60'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Status Filter Tabs */}
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value as any)}
              className={`btn btn-xs rounded-full border ${
                statusFilter === f.value
                  ? 'bg-base-300 border-base-400 font-bold'
                  : 'bg-transparent border-base-200 text-base-content/50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-base-content/30">
            <Search size={48} className="mb-2 opacity-20" />
            <p>No transactions found</p>
          </div>
        ) : (
          sorted.map(deal => renderDealCard(
            deal,
            selectedId,
            onSelect,
            sideStylesConst,
            openMenu,
            setOpenMenu,
            onArchiveDeal,
            onRestoreDeal,
            onChangeStatus,
            openArchive
          ))
        )}
      </div>

      {/* Archive Modal */}
      {archiveModal && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Archive Deal</h3>
            <p className="py-2 text-sm text-base-content/70">
              Are you sure you want to archive <strong>{archiveModal.label}</strong>?
            </p>
            <div className="form-control w-full mt-4">
              <label className="label">
                <span className="label-text">Reason for archiving</span>
              </label>
              <select
                className="select select-bordered select-sm w-full"
                value={archiveReason}
                onChange={e => setArchiveReason(e.target.value)}
              >
                {ARCHIVE_REASONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div className="modal-action">
              <button className="btn btn-sm btn-ghost" onClick={() => setArchiveModal(null)}>Cancel</button>
              <button className="btn btn-sm btn-error" onClick={confirmArchive}>Archive Deal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DealList;
