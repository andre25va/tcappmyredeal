import React, { useState, useMemo } from 'react';
import {
  Users, ChevronDown, ChevronUp, ShoppingCart, Tag,
  Clock, AlertTriangle, CheckSquare, Calendar,
} from 'lucide-react';
import { Deal } from '../types';
import { statusLabel, statusDot, daysUntil, formatDate } from '../utils/helpers';

interface Props {
  deals: Deal[];
  onSelectDeal: (id: string) => void;
}

interface PendingItem {
  label: string;
  dueDate: string;
  overdue: boolean;
  address: string;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function getNextDueItem(deal: Deal): { label: string; dueDate: string } | null {
  const items: { label: string; dueDate: string }[] = [];

  (deal.tasks ?? [])
    .filter(t => !t.completedAt && t.dueDate)
    .forEach(t => items.push({ label: t.title, dueDate: t.dueDate }));

  (deal.dueDiligenceChecklist ?? [])
    .filter(t => !t.completed && t.dueDate)
    .forEach(t => items.push({ label: t.title, dueDate: t.dueDate! }));

  (deal.reminders ?? [])
    .filter(r => !r.completed && r.dueDate)
    .forEach(r => items.push({ label: r.title, dueDate: r.dueDate }));

  if (items.length === 0) return null;
  items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return items[0];
}

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
    if (item.dueDate < best.dueDate) { best = { ...item, overdue, address: deal.propertyAddress }; }
  });

  return best;
}

function getAgentUrgencyScore(agentDeals: Deal[]): number {
  const today = new Date().toISOString().slice(0, 10);
  let overdueCount = 0;
  let minDays = Infinity;

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

// ── sub-components ────────────────────────────────────────────────────────────

function NextDueItem({ dueDate, label, overdue }: { dueDate: string; label: string; overdue: boolean }) {
  const days = daysUntil(dueDate);
  const urgency =
    overdue            ? 'text-red-600'
    : days <= 2        ? 'text-red-500'
    : days <= 7        ? 'text-amber-500'
    : 'text-base-content/50';

  return (
    <span className={`text-[11px] ${urgency} truncate`}>
      {overdue ? `⚠ Overdue` : days === 0 ? `Due today` : `Due in ${days}d`}: {label}
    </span>
  );
}

// Initials avatar
function AgentAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map(w => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
      <span className="text-xs font-bold text-primary">{initials || '?'}</span>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export const AgentCardView: React.FC<Props> = ({ deals, onSelectDeal }) => {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  // Active deals only (exclude archived + terminated)
  const activeDeals = useMemo(
    () => deals.filter(d => d.status !== 'terminated' && d.milestone !== 'archived'),
    [deals],
  );

  // Group by agentName, sort by urgency score
  const agentGroups = useMemo(() => {
    const map = new Map<string, Deal[]>();
    activeDeals.forEach(deal => {
      const key = deal.agentName || 'Unknown Agent';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(deal);
    });

    return Array.from(map.entries())
      .map(([name, agentDeals]) => ({
        name,
        deals: agentDeals,
        topTask: getTopPriorityTask(agentDeals),
        score: getAgentUrgencyScore(agentDeals),
      }))
      .sort((a, b) => a.score - b.score);
  }, [activeDeals]);

  const toggleAgent = (name: string) =>
    setExpandedAgent(prev => (prev === name ? null : name));

  if (agentGroups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-base-content/30 gap-3 p-6">
        <Users size={36} />
        <p className="text-sm text-center">No active deals yet</p>
      </div>
    );
  }

  return (
    <div className="flex-none bg-base-200 border-r border-base-300 flex flex-col h-full w-72 lg:w-80 overflow-y-auto">
      {/* Header */}
      <div className="px-3 py-2 border-b border-base-300 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5">
          <Users size={13} className="text-primary" />
          <span className="text-xs font-semibold text-base-content/70">
            {agentGroups.length} agent{agentGroups.length !== 1 ? 's' : ''}
          </span>
        </div>
        <span className="text-xs text-base-content/40">{activeDeals.length} active deals</span>
      </div>

      {/* Cards */}
      <div className="flex-1 p-2 space-y-1.5">
        {agentGroups.map(({ name, deals: agentDeals, topTask }) => {
          const isExpanded = expandedAgent === name;
          const today = new Date().toISOString().slice(0, 10);
          const hasOverdue = topTask?.overdue ?? false;

          return (
            <div
              key={name}
              className={`rounded-xl border transition-all ${
                hasOverdue
                  ? 'border-red-300 bg-red-50/50'
                  : isExpanded
                  ? 'border-primary/40 bg-base-100'
                  : 'border-base-300 bg-base-100'
              }`}
            >
              {/* Tile header */}
              <div className="flex items-center gap-2 p-3">
                <AgentAvatar name={name} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-base-content truncate">{name}</p>
                    <span className="badge badge-primary badge-xs shrink-0">
                      {agentDeals.length}
                    </span>
                  </div>
                  {topTask ? (
                    <div className="mt-0.5 flex items-center gap-1 min-w-0">
                      {topTask.overdue
                        ? <AlertTriangle size={10} className="text-red-500 shrink-0" />
                        : <Clock size={10} className="text-amber-500 shrink-0" />
                      }
                      <NextDueItem
                        dueDate={topTask.dueDate}
                        label={topTask.label}
                        overdue={topTask.overdue}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 mt-0.5">
                      <CheckSquare size={10} className="text-green-500 shrink-0" />
                      <span className="text-[11px] text-green-600">All clear</span>
                    </div>
                  )}
                </div>

                <button
                  className="btn btn-xs btn-ghost gap-0.5 shrink-0"
                  onClick={() => toggleAgent(name)}
                >
                  {isExpanded
                    ? <><ChevronUp size={12} /> Hide</>
                    : <><ChevronDown size={12} /> View</>
                  }
                </button>
              </div>

              {/* Expanded deal table */}
              {isExpanded && (
                <div className="border-t border-base-300 overflow-x-auto">
                  <table className="table table-xs w-full text-[11px]">
                    <thead>
                      <tr className="text-base-content/50 text-[10px] uppercase tracking-wide">
                        <th className="font-semibold">Address</th>
                        <th className="font-semibold">Side</th>
                        <th className="font-semibold">Status</th>
                        <th className="font-semibold">Close</th>
                        <th className="font-semibold">Next Due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agentDeals
                        .sort((a, b) => {
                          const ai = getNextDueItem(a);
                          const bi = getNextDueItem(b);
                          if (!ai && !bi) return 0;
                          if (!ai) return 1;
                          if (!bi) return -1;
                          return ai.dueDate.localeCompare(bi.dueDate);
                        })
                        .map(deal => {
                          const nextItem = getNextDueItem(deal);
                          const nextOverdue = nextItem ? nextItem.dueDate < today : false;
                          const side = deal.transactionType ?? 'buyer';
                          const days = daysUntil(deal.closingDate);
                          const closeUrgency =
                            days < 0     ? 'text-red-600 font-bold'
                            : days <= 7  ? 'text-amber-500 font-semibold'
                            : 'text-base-content/60';

                          return (
                            <tr
                              key={deal.id}
                              className="hover:bg-base-200 cursor-pointer transition-colors"
                              onClick={() => {
                                setExpandedAgent(null);
                                onSelectDeal(deal.id);
                              }}
                            >
                              <td className="max-w-[90px]">
                                <p className="truncate font-medium text-base-content">
                                  {deal.propertyAddress.split(',')[0]}
                                </p>
                              </td>
                              <td>
                                {side === 'buyer' ? (
                                  <span className="flex items-center gap-0.5 text-blue-600">
                                    <ShoppingCart size={9} /> Buy
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-0.5 text-green-600">
                                    <Tag size={9} /> Sell
                                  </span>
                                )}
                              </td>
                              <td>
                                <div className="flex items-center gap-1">
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot(deal.status)}`} />
                                  <span className="truncate max-w-[60px]">{statusLabel(deal.status)}</span>
                                </div>
                              </td>
                              <td>
                                <span className={closeUrgency}>
                                  {days < 0
                                    ? `${Math.abs(days)}d ago`
                                    : days === 0
                                    ? 'Today'
                                    : `${days}d`}
                                </span>
                              </td>
                              <td className="max-w-[90px]">
                                {nextItem ? (
                                  <span
                                    className={`truncate block ${nextOverdue ? 'text-red-500' : 'text-base-content/60'}`}
                                    title={nextItem.label}
                                  >
                                    {nextItem.label}
                                  </span>
                                ) : (
                                  <span className="text-green-500">✓ Clear</span>
                                )}
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
    </div>
  );
};
