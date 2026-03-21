import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Users, ChevronDown, ChevronUp, ShoppingCart, Tag,
  Clock, AlertTriangle, CheckSquare, MoreVertical,
  Archive, RotateCcw, UserX, Home, Calendar,
} from 'lucide-react';
import { Deal, DealStatus } from '../types';
import { statusLabel, statusDot, daysUntil } from '../utils/helpers';

type ViewFilter = 'active' | 'closed' | 'archived' | 'all';
type AgentTypeFilter = 'all' | 'buyer' | 'seller';

interface ArchiveTarget { dealIds: string[]; label: string }

interface Props {
  deals: Deal[];
  selectedId?: string | null;
  onSelectDeal: (id: string) => void;
  onArchiveDeal: (dealId: string, reason: string) => void;
  onRestoreDeal: (dealId: string) => void;
  onChangeStatus: (dealId: string, status: DealStatus) => void;
}

const ARCHIVE_REASONS = [
  { value: 'deal-closed',  label: 'Deal Closed'  },
  { value: 'fell-through', label: 'Fell Through'  },
  { value: 'duplicate',    label: 'Duplicate'     },
  { value: 'other',        label: 'Other'         },
];

const VIEW_FILTERS: { label: string; value: ViewFilter }[] = [
  { label: 'Active',   value: 'active'   },
  { label: 'Closed',   value: 'closed'   },
  { label: 'Archived', value: 'archived' },
  { label: 'All',      value: 'all'      },
];

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  'single-family': 'Single Family',
  'condo':         'Condo',
  'townhouse':     'Townhouse',
  'multi-family':  'Multi-Family',
  'land':          'Land',
  'commercial':    'Commercial',
  'other':         'Other',
};

// ── helpers ──────────────────────────────────────────────────────────────────

function getNextDueItem(deal: Deal): { label: string; dueDate: string } | null {
  const items: { label: string; dueDate: string }[] = [];
  (deal.tasks ?? []).filter(t => !t.completedAt && t.dueDate).forEach(t => items.push({ label: t.title, dueDate: t.dueDate }));
  (deal.dueDiligenceChecklist ?? []).filter(t => !t.completed && t.dueDate).forEach(t => items.push({ label: t.title, dueDate: t.dueDate! }));
  (deal.reminders ?? []).filter(r => !r.completed && r.dueDate).forEach(r => items.push({ label: r.title, dueDate: r.dueDate }));
  if (items.length === 0) return null;
  items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return items[0];
}

interface PendingItem { label: string; dueDate: string; overdue: boolean; address: string }

function getTopPriorityTask(agentDeals: Deal[]): PendingItem | null {
  const today = new Date().toISOString().slice(0, 10);
  let best: PendingItem | null = null;
  agentDeals.forEach(deal => {
    const item = getNextDueItem(deal);
    if (!item) return;
    const overdue = item.dueDate < today;
    if (!best) { best = { ...item, overdue, address: deal.propertyAddress }; return; }
    if (overdue && !best.overdue) { best = { ...item, overdue, address: deal.propertyAddress }; return; }
    if (!overdue && best.overdue) return;
    if (item.dueDate < best.dueDate) best = { ...item, overdue, address: deal.propertyAddress };
  });
  return best;
}

function getAgentUrgencyScore(agentDeals: Deal[]): number {
  const today = new Date().toISOString().slice(0, 10);
  let overdueCount = 0; let minDays = Infinity;
  agentDeals.forEach(deal => {
    const item = getNextDueItem(deal);
    if (!item) return;
    if (item.dueDate < today) overdueCount++;
    const d = daysUntil(item.dueDate);
    if (d < minDays) minDays = d;
  });
  if (overdueCount > 0) return -overdueCount * 10000 + minDays;
  return minDays === Infinity ? 999999 : minDays;
}

function formatCloseDate(dateStr: string | undefined): string {
  if (!dateStr) return '\u2014';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  } catch { return dateStr; }
}

// ── sub-components ────────────────────────────────────────────────────────────

function NextDueItem({ dueDate, label, overdue }: { dueDate: string; label: string; overdue: boolean }) {
  const days = daysUntil(dueDate);
  const urgency = overdue ? 'text-red-600' : days <= 2 ? 'text-red-500' : days <= 7 ? 'text-amber-500' : 'text-base-content/50';
  return (
    <span className={`text-[11px] ${urgency} truncate`}>
      {overdue ? '! Overdue' : days === 0 ? 'Due today' : `Due in ${days}d`}: {label}
    </span>
  );
}

function AgentAvatar({ name, isActive }: { name: string; isActive?: boolean }) {
  const initials = name.split(' ').map(w => w[0] ?? '').slice(0, 2).join('').toUpperCase();
  return (
    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-primary/20 transition-all ${
      isActive ? 'ring-2 ring-primary ring-offset-2' : ''
    }`}>
      <span className="text-xs font-bold text-primary">
        {initials || '?'}
      </span>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export const AgentCardView: React.FC<Props> = ({
  deals,
  selectedId,
  onSelectDeal,
  onArchiveDeal,
  onRestoreDeal,
  onChangeStatus,
}) => {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [viewFilter, setViewFilter]       = useState<ViewFilter>('active');
  const [agentType, setAgentType]         = useState<AgentTypeFilter>('all');
  const [openMenu, setOpenMenu]           = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ArchiveTarget | null>(null);
  const [archiveReason, setArchiveReason] = useState('deal-closed');
  const menuContainerRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    if (!openMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenu]);

  // Filter deals
  const filteredDeals = useMemo(() => deals.filter(d => {
    if (viewFilter === 'active')   return d.status !== 'terminated' && d.milestone !== 'archived';
    if (viewFilter === 'closed')   return d.status === 'closed';
    if (viewFilter === 'archived') return d.milestone === 'archived';
    return true;
  }), [deals, viewFilter]);

  // Group by agent
  const agentGroups = useMemo(() => {
    const map = new Map<string, { deals: Deal[]; type: 'buyer' | 'seller' | 'mixed' }>();
    filteredDeals.forEach(deal => {
      const entries: Array<{ name: string; side: 'buyer' | 'seller' }> = [];
      if (deal.buyerAgent?.isOurClient && deal.buyerAgent.name)
        entries.push({ name: deal.buyerAgent.name, side: 'buyer' });
      if (deal.sellerAgent?.isOurClient && deal.sellerAgent.name)
        entries.push({ name: deal.sellerAgent.name, side: 'seller' });
      if (entries.length === 0) {
        const fallback = deal.agentName || 'Unknown Agent';
        const side: 'buyer' | 'seller' = deal.transactionType === 'seller' ? 'seller' : 'buyer';
        entries.push({ name: fallback, side });
      }
      entries.forEach(({ name, side }) => {
        if (!map.has(name)) map.set(name, { deals: [], type: side });
        map.get(name)!.deals.push(deal);
      });
    });
    return Array.from(map.entries())
      .map(([name, { deals: agentDeals }]) => {
        const types = new Set(agentDeals.map(d => d.transactionType ?? 'buyer'));
        const type: 'buyer' | 'seller' | 'mixed' =
          types.has('buyer') && types.has('seller') ? 'mixed'
          : types.has('seller') ? 'seller' : 'buyer';
        return { name, deals: agentDeals, topTask: getTopPriorityTask(agentDeals), score: getAgentUrgencyScore(agentDeals), type };
      })
      .filter(g => agentType === 'all' || g.type === (agentType as string) || g.type === 'mixed')
      .sort((a, b) => a.score - b.score);
  }, [filteredDeals, agentType]);

  // Auto-expand the agent card that owns the currently selected deal
  useEffect(() => {
    if (!selectedId) return;
    for (const group of agentGroups) {
      if (group.deals.some(d => d.id === selectedId)) {
        setExpandedAgent(group.name);
        break;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const toggleAgent = (name: string) => setExpandedAgent(prev => prev === name ? null : name);

  const openArchive = (dealIds: string[], label: string) => {
    setOpenMenu(null);
    setArchiveReason('deal-closed');
    setArchiveTarget({ dealIds, label });
  };

  const confirmArchive = () => {
    if (!archiveTarget) return;
    archiveTarget.dealIds.forEach(id => onArchiveDeal(id, archiveReason));
    setArchiveTarget(null);
  };

  const today = new Date().toISOString().slice(0, 10);

  // Table cell style helpers
  const thStyle: React.CSSProperties = {
    border: '1px solid #e5e7eb',
    padding: '6px 10px',
    textAlign: 'left',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#6b7280',
    whiteSpace: 'nowrap',
  };
  const tdStyle: React.CSSProperties = {
    border: '1px solid #e5e7eb',
    padding: '8px 10px',
    fontSize: '14px',
  };

  return (
    <div className="w-full bg-base-200 border-r border-base-300 flex flex-col h-full overflow-y-auto" ref={menuContainerRef}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-base-300 shrink-0 space-y-2">
        <div className="flex gap-1 flex-wrap">
          {VIEW_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setViewFilter(f.value)}
              className={`btn btn-xs ${viewFilter === f.value ? 'btn-primary' : 'btn-ghost text-base-content/50'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(['all', 'buyer', 'seller'] as const).map(t => (
            <button
              key={t}
              onClick={() => setAgentType(t)}
              className={`btn btn-xs flex-1 gap-1 ${
                agentType === t
                  ? t === 'buyer'  ? 'bg-blue-500 text-white border-blue-500'
                  : t === 'seller' ? 'bg-green-500 text-white border-green-500'
                  : 'btn-neutral'
                  : 'btn-ghost'
              }`}
            >
              {t === 'buyer'  && <ShoppingCart size={10} />}
              {t === 'seller' && <Tag size={10} />}
              {t === 'all' ? 'All Agents' : t === 'buyer' ? 'Buyers' : 'Sellers'}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-base-content/40">{agentGroups.length} agent{agentGroups.length !== 1 ? 's' : ''}</span>
          <span className="text-xs text-base-content/40">{filteredDeals.length} deals</span>
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 p-2 space-y-1.5">
        {agentGroups.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-base-content/30 gap-2">
            <Users size={28} />
            <p className="text-xs text-center">No deals match this filter</p>
          </div>
        )}

        {agentGroups.map(({ name, deals: agentDeals, topTask }) => {
          const isExpanded     = expandedAgent === name;
          const isActiveAgent  = agentDeals.some(d => d.id === selectedId);
          const hasOverdue     = topTask?.overdue ?? false;
          const tileMenuId     = `tile-${name}`;
          const missingClientCount = agentDeals.filter(
            d => !d.buyerAgent?.isOurClient && !d.sellerAgent?.isOurClient
          ).length;

          return (
            <div
              key={name}
              className={`rounded-xl border transition-all ${
                hasOverdue
                  ? 'border-red-300 bg-red-50/50'
                  : isExpanded
                  ? 'border-primary/30 bg-base-100'
                  : 'border-base-300 bg-base-100'
              }`}
            >
              {/* Tile header */}
              <div className="flex items-center gap-2 p-3 rounded-t-xl">
                <AgentAvatar name={name} isActive={isActiveAgent} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-semibold truncate text-base-content">{name}</p>
                    <span className="badge badge-xs badge-primary shrink-0">{agentDeals.length}</span>
                    {missingClientCount > 0 && (
                      <span
                        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-[9px] font-bold text-amber-700 shrink-0"
                        title={`${missingClientCount} deal${missingClientCount > 1 ? 's' : ''} missing agent client`}
                      >
                        <UserX size={8} /> {missingClientCount}
                      </span>
                    )}
                  </div>
                  {topTask ? (
                    <div className="mt-0.5 flex items-center gap-1 min-w-0">
                      {topTask.overdue
                        ? <AlertTriangle size={10} className="text-red-500 shrink-0" />
                        : <Clock size={10} className="text-amber-500 shrink-0" />}
                      <NextDueItem dueDate={topTask.dueDate} label={topTask.label} overdue={topTask.overdue} />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 mt-0.5">
                      <CheckSquare size={10} className="text-green-500 shrink-0" />
                      <span className="text-[11px] text-green-600">All clear</span>
                    </div>
                  )}
                </div>

                {/* View button */}
                <button
                  className="btn btn-xs btn-ghost shrink-0 gap-0.5"
                  onClick={() => toggleAgent(name)}
                >
                  {isExpanded ? <><ChevronUp size={12} /> Hide</> : <><ChevronDown size={12} /> View</>}
                </button>

                {/* 3-dot tile menu */}
                <div className="relative shrink-0">
                  <button
                    className="btn btn-xs btn-ghost p-1"
                    onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === tileMenuId ? null : tileMenuId); }}
                    title="More actions"
                  >
                    <MoreVertical size={13} />
                  </button>
                  {openMenu === tileMenuId && (
                    <div className="absolute right-0 top-7 z-50 bg-base-100 border border-base-300 rounded-lg shadow-lg min-w-[160px] py-1">
                      <button
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-base-200 flex items-center gap-2 text-red-500"
                        onClick={() => openArchive(agentDeals.map(d => d.id), `all deals for ${name}`)}
                      >
                        <Archive size={11} /> Archive All Deals
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Expanded deal table */}
              {isExpanded && (
                <div className="border-t border-base-300 overflow-x-auto">
                  <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f3f4f6' }}>
                        <th style={thStyle}>Address</th>
                        <th style={thStyle}>Type</th>
                        <th style={thStyle}>Side</th>
                        <th style={thStyle}>Status</th>
                        <th style={thStyle}>Close Date</th>
                        <th style={thStyle}>Next Due</th>
                        <th style={{ ...thStyle, width: '28px', padding: '6px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {agentDeals
                        .sort((a, b) => {
                          const ai = getNextDueItem(a); const bi = getNextDueItem(b);
                          if (!ai && !bi) return 0; if (!ai) return 1; if (!bi) return -1;
                          return ai.dueDate.localeCompare(bi.dueDate);
                        })
                        .map(deal => {
                          const nextItem   = getNextDueItem(deal);
                          const nextOverdue = nextItem ? nextItem.dueDate < today : false;
                          const side       = deal.transactionType ?? 'buyer';
                          const isArchived = deal.milestone === 'archived';
                          const rowMenuId  = `row-${deal.id}`;
                          const noClient   = !deal.buyerAgent?.isOurClient && !deal.sellerAgent?.isOurClient;
                          const isSelectedRow = deal.id === selectedId;
                          const propTypeLabel = deal.propertyType
                            ? (PROPERTY_TYPE_LABELS[deal.propertyType] ?? deal.propertyType)
                            : '\u2014';
                          const closeDateStr = formatCloseDate(
                            deal.closingDate ?? (deal as any).closeDate ?? (deal as any).closing_date
                          );

                          const rowBg = isSelectedRow
                            ? 'rgba(99,102,241,0.12)'
                            : noClient && !isArchived
                            ? 'rgba(251,191,36,0.1)'
                            : 'transparent';

                          return (
                            <tr
                              key={deal.id}
                              style={{ backgroundColor: rowBg, transition: 'background-color 0.15s' }}
                              className="hover:brightness-95"
                            >
                              {/* Address */}
                              <td
                                style={{ ...tdStyle, cursor: 'pointer', maxWidth: '140px' }}
                                onClick={() => { setExpandedAgent(null); onSelectDeal(deal.id); }}
                              >
                                <p style={{
                                  fontWeight: isSelectedRow ? 700 : 500,
                                  color: isArchived ? '#9ca3af' : isSelectedRow ? '#4f46e5' : '#111827',
                                  fontStyle: isArchived ? 'italic' : 'normal',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                  {deal.propertyAddress.split(',')[0]}
                                </p>
                                {isArchived && <span style={{ fontSize: '9px', color: '#9ca3af', fontWeight: 600 }}>ARCHIVED</span>}
                                {noClient && !isArchived && (
                                  <span style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '9px', color: '#d97706', fontWeight: 600 }}>
                                    <UserX size={8} /> No client
                                  </span>
                                )}
                              </td>
                              {/* Type */}
                              <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#6b7280' }}>
                                  <Home size={11} style={{ flexShrink: 0 }} />
                                  {propTypeLabel}
                                </span>
                              </td>
                              {/* Side */}
                              <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                                {side === 'buyer'
                                  ? <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#2563eb' }}><ShoppingCart size={11} /> Buy</span>
                                  : <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#16a34a' }}><Tag size={11} /> Sell</span>}
                              </td>
                              {/* Status */}
                              <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot(deal.status)}`} />
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '90px', fontSize: '13px' }}>{statusLabel(deal.status)}</span>
                                </div>
                              </td>
                              {/* Close Date */}
                              <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#6b7280' }}>
                                  <Calendar size={11} style={{ flexShrink: 0 }} />
                                  {closeDateStr}
                                </span>
                              </td>
                              {/* Next Due */}
                              <td style={{ ...tdStyle, maxWidth: '130px' }}>
                                {nextItem
                                  ? <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', color: nextOverdue ? '#ef4444' : '#6b7280', fontSize: '13px' }} title={nextItem.label}>{nextItem.label}</span>
                                  : <span style={{ color: '#22c55e', fontSize: '13px' }}>Clear</span>}
                              </td>
                              {/* 3-dot row menu */}
                              <td style={{ ...tdStyle, padding: '4px 6px', width: '28px' }}>
                                <div className="relative">
                                  <button
                                    className="btn btn-xs btn-ghost p-0.5"
                                    onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === rowMenuId ? null : rowMenuId); }}
                                  >
                                    <MoreVertical size={12} />
                                  </button>
                                  {openMenu === rowMenuId && (
                                    <div className="absolute right-0 top-5 z-50 bg-base-100 border border-base-300 rounded-lg shadow-lg min-w-[140px] py-1">
                                      <button
                                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-base-200"
                                        onClick={() => { setOpenMenu(null); setExpandedAgent(null); onSelectDeal(deal.id); }}
                                      >
                                        View Deal
                                      </button>
                                      {isArchived ? (
                                        <button
                                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-base-200 flex items-center gap-2 text-green-600"
                                          onClick={() => { setOpenMenu(null); onRestoreDeal(deal.id); }}
                                        >
                                          <RotateCcw size={11} /> Restore
                                        </button>
                                      ) : (
                                        <button
                                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-base-200 flex items-center gap-2 text-red-500"
                                          onClick={() => openArchive([deal.id], deal.propertyAddress.split(',')[0])}
                                        >
                                          <Archive size={11} /> Archive
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
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
              <button className="btn btn-sm btn-ghost" onClick={() => setArchiveTarget(null)}>Cancel</button>
              <button className="btn btn-sm btn-error" onClick={confirmArchive}>Archive</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
