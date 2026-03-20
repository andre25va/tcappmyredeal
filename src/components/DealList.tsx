import React, { useState } from 'react';
import { Search, AlertTriangle, Clock, ShoppingCart, Tag, X, Archive, Flame } from 'lucide-react';
import { Deal, DealStatus, DirectoryContact } from '../types';
import { MILESTONE_LABELS, MILESTONE_COLORS } from '../utils/taskTemplates';
import {
  statusLabel, statusDot, closingCountdown, formatCurrency,
  pendingDocCount, checklistProgress, daysUntil,
} from '../utils/helpers';

interface Props {
  deals: Deal[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  amberFilter?: boolean;
  onClearAmberFilter?: () => void;
  directory?: DirectoryContact[];
}

const STATUS_FILTERS: { label: string; value: DealStatus | 'all' }[] = [
  { label: 'All',      value: 'all' },
  { label: 'Contract', value: 'contract' },
  { label: 'DD',       value: 'due-diligence' },
  { label: 'CTC',      value: 'clear-to-close' },
  { label: 'Closed',   value: 'closed' },
];

// Neutral grey cards — buyer/seller only affects badges and dots
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

const renderDealCard = (
  deal: Deal,
  selectedId: string | null,
  onSelect: (id: string) => void,
  styles: typeof sideStylesConst,
) => {
  const isArchived = deal.milestone === 'archived';
  const side      = deal.transactionType ?? 'buyer';
  const sideKey   = (side === 'buyer' || side === 'seller') ? side : 'buyer';
  const sideStyle = styles[sideKey];
  const countdown = closingCountdown(deal.closingDate);
  const pending   = pendingDocCount(deal.documentRequests);
  const ddProg    = checklistProgress(deal.dueDiligenceChecklist);
  const isSelected = deal.id === selectedId;

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
          <p className="font-semibold text-sm text-base-content truncate">{deal.propertyAddress}</p>
          <p className="text-xs text-base-content/50 truncate">{deal.city}, {deal.state} {deal.zipCode}</p>
        </div>
        <div className="flex items-center gap-1 flex-none">
          {!isArchived && pending > 0 && (
            <div className="flex items-center gap-0.5 bg-amber-500 px-1.5 py-0.5 rounded-full shadow-sm">
              <AlertTriangle size={10} className="text-white" />
              <span className="text-white text-xs font-bold">{pending}</span>
            </div>
          )}
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
        <span className={`w-1.5 h-1.5 rounded-full flex-none ${statusDot(deal.status)}`} />
        <span className="text-xs text-base-content/60">{statusLabel(deal.status)}</span>
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

      {/* View button */}
      <div className="flex justify-end">
        <button
          className={`btn btn-xs ${side === 'buyer' ? 'btn-info' : 'btn-success'} btn-outline gap-1`}
          onClick={e => { e.stopPropagation(); onSelect(deal.id); }}
        >
          View <span className="text-[10px]">→</span>
        </button>
      </div>
    </div>
  );
};

export const DealList: React.FC<Props> = ({ deals, selectedId, onSelect, amberFilter = false, onClearAmberFilter, directory = [] }) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<DealStatus | 'all'>('all');
  const [sideFilter, setSideFilter] = useState<'all' | 'buyer' | 'seller'>('all');
  const [showArchived, setShowArchived] = useState(false);

  // Reset local filters when amber filter activates
  React.useEffect(() => {
    if (amberFilter) {
      setSearch('');
      setFilter('all');
      setSideFilter('all');
    }
  }, [amberFilter]);

  const filtered = deals.filter(d => {
    // archived deals only shown when showArchived toggle is on
    if (d.milestone === 'archived') return showArchived;

    const q = search.toLowerCase();
    const agentClient = d.agentClientId ? directory.find(c => c.id === d.agentClientId) : undefined;
    const matchSearch =
      !q ||
      d.propertyAddress.toLowerCase().includes(q) ||
      d.agentName.toLowerCase().includes(q) ||
      d.mlsNumber.toLowerCase().includes(q) ||
      d.city.toLowerCase().includes(q) ||
      (agentClient?.clientId ?? '').toLowerCase().includes(q) ||
      (agentClient?.name ?? '').toLowerCase().includes(q);
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
    if (d.milestone === 'archived') return false;
    const days = daysUntil(d.closingDate);
    return days >= 0 && days <= 7;
  });
  const otherDeals = filtered.filter(d => !closingThisWeek.includes(d));

  return (
    <>
      <div className="flex-none bg-base-200 border-r border-base-300 flex flex-col h-full w-72 lg:w-80">
        {/* Search + Filters */}
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

          {/* Archived toggle */}
          <div className="flex items-center justify-between pt-1">
            <button
              className={`btn btn-xs gap-1 ${showArchived ? 'btn-warning' : 'btn-ghost text-gray-400'}`}
              onClick={() => setShowArchived(v => !v)}
            >
              <Archive size={10} />
              {showArchived ? 'Hide Archived' : 'Show Archived'}
              {deals.filter(d => d.milestone === 'archived').length > 0 && (
                <span className="badge badge-xs">{deals.filter(d => d.milestone === 'archived').length}</span>
              )}
            </button>
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
              {closingThisWeek.map(deal => renderDealCard(deal, selectedId, onSelect, sideStylesConst))}
              {otherDeals.length > 0 && (
                <div className="border-t border-gray-200 my-1" />
              )}
            </>
          )}
          {otherDeals.map(deal => renderDealCard(deal, selectedId, onSelect, sideStylesConst))}
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

    </>
  );
};
