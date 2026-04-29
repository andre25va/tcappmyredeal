import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckSquare, AlertTriangle, Send, CheckCircle2, RefreshCw, Filter } from 'lucide-react';
import { Deal } from '../types';
import { supabase } from '../lib/supabase';

// ── Types ────────────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'overdue' | 'today' | 'this_week' | 'high';

interface TaskRow {
  id: string;
  deal_id: string;
  title: string;
  description?: string;
  category?: string;
  status: string;
  priority: string;
  due_date: string;
  effectiveDate: Date;
  wasWeekend: boolean;
  daysUntil: number;
}

interface TaskGroup {
  key: string;
  label: string;
  headerCls: string;
  dotCls: string;
  isOverdue: boolean;
  tasks: TaskRow[];
}

interface Props {
  deals: Deal[];
  onSelectDeal: (dealId: string) => void;
  onSendRequest?: (dealId: string, requestType: string) => void;
}

// ── Task category → request type mapping ─────────────────────────────────────

const TASK_REQUEST_MAP: Record<string, { type: string; label: string }> = {
  emd_due:    { type: 'earnest_money_receipt', label: 'Request EMD Receipt' },
  inspection: { type: 'inspection_complete',   label: 'Request Inspection Confirm' },
};

// ── Pipeline stage labels ─────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, { label: string; cls: string }> = {
  'contract-received':  { label: 'Contract',    cls: 'bg-blue-100 text-blue-700' },
  'inspection_period':  { label: 'Inspection',  cls: 'bg-purple-100 text-purple-700' },
  'under_contract':     { label: 'Under Contract', cls: 'bg-indigo-100 text-indigo-700' },
  'financing':          { label: 'Financing',   cls: 'bg-cyan-100 text-cyan-700' },
  'clear_to_close':     { label: 'Clear to Close', cls: 'bg-green-100 text-green-700' },
  'closing':            { label: 'Closing',     cls: 'bg-emerald-100 text-emerald-700' },
  'closed':             { label: 'Closed',      cls: 'bg-gray-100 text-gray-600' },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function effectiveDueDate(dateStr: string): { date: Date; wasWeekend: boolean } {
  const d = parseLocalDate(dateStr);
  const dow = d.getDay();
  if (dow === 6) { d.setDate(d.getDate() - 1); return { date: d, wasWeekend: true }; }
  if (dow === 0) { d.setDate(d.getDate() - 2); return { date: d, wasWeekend: true }; }
  return { date: d, wasWeekend: false };
}

function formatDueDate(daysUntil: number, date: Date): { label: string; urgent: boolean; overdue: boolean } {
  if (daysUntil < 0) {
    const n = Math.abs(daysUntil);
    return { label: n === 1 ? '1 day overdue' : `${n} days overdue`, urgent: true, overdue: true };
  }
  if (daysUntil === 0) return { label: 'Today', urgent: true, overdue: false };
  if (daysUntil === 1) return { label: 'Tomorrow', urgent: true, overdue: false };
  const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return { label: formatted, urgent: daysUntil <= 7, overdue: false };
}

// ── Fetch function ────────────────────────────────────────────────────────────

async function fetchTasks(): Promise<TaskRow[]> {
  const today    = startOfDay(new Date());
  const pastDate = new Date(today);
  pastDate.setDate(pastDate.getDate() - 90);
  const aheadDate = new Date(today);
  aheadDate.setDate(aheadDate.getDate() + 60);

  const { data, error } = await supabase
    .from('tasks')
    .select('id, deal_id, title, description, category, status, priority, due_date')
    .neq('status', 'completed')
    .not('deal_id', 'is', null)
    .gte('due_date', pastDate.toISOString().split('T')[0])
    .lte('due_date', aheadDate.toISOString().split('T')[0])
    .order('due_date', { ascending: true });

  if (error || !data) throw error ?? new Error('No data');

  return data.map(t => {
    const { date, wasWeekend } = effectiveDueDate(t.due_date);
    const daysUntil = Math.round((date.getTime() - today.getTime()) / 86400000);
    return { ...t, effectiveDate: date, wasWeekend, daysUntil, priority: t.priority || 'normal' };
  });
}

// ── Priority group config ─────────────────────────────────────────────────────

const UPCOMING_GROUPS = [
  { key: 'high',   label: 'High Priority', headerCls: 'bg-red-50 border-red-200 text-red-700',              dotCls: 'bg-red-500' },
  { key: 'normal', label: 'Normal',        headerCls: 'bg-blue-50 border-blue-200 text-blue-700',           dotCls: 'bg-blue-400' },
  { key: 'low',    label: 'Low Priority',  headerCls: 'bg-base-100 border-base-300 text-base-content/60',   dotCls: 'bg-gray-300' },
];

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'overdue',   label: '🚨 Overdue' },
  { key: 'today',     label: 'Today' },
  { key: 'this_week', label: 'This Week' },
  { key: 'high',      label: 'High' },
];

// ── Component ────────────────────────────────────────────────────────────────

export const ByTaskView: React.FC<Props> = ({ deals, onSelectDeal, onSendRequest }) => {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [completing, setCompleting]     = useState<Set<string>>(new Set());

  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading, error, refetch } = useQuery<TaskRow[]>({
    queryKey: ['cross-deal-tasks'],
    queryFn: fetchTasks,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const completeMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from('tasks')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', taskId);
      if (error) throw error;
    },
    onMutate: (taskId) => {
      setCompleting(prev => new Set(prev).add(taskId));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cross-deal-tasks'] });
    },
    onSettled: (_, __, taskId) => {
      setCompleting(prev => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    },
  });

  const dealMap = new Map(deals.map(d => [d.id, d]));
  const today   = startOfDay(new Date());

  // ── Filter tasks by active tab ─────────────────────────────────────────────
  const filteredTasks = tasks.filter(t => {
    switch (activeFilter) {
      case 'overdue':   return t.daysUntil < 0;
      case 'today':     return t.daysUntil === 0;
      case 'this_week': return t.daysUntil >= 0 && t.daysUntil <= 7;
      case 'high':      return t.priority === 'high';
      default:          return true;
    }
  });

  // ── Stat counters ──────────────────────────────────────────────────────────
  const overdueCount  = tasks.filter(t => t.daysUntil < 0).length;
  const todayCount    = tasks.filter(t => t.daysUntil === 0).length;
  const weekCount     = tasks.filter(t => t.daysUntil >= 0 && t.daysUntil <= 7).length;

  // ── Build groups ──────────────────────────────────────────────────────────
  const overdueTasks  = filteredTasks.filter(t => t.daysUntil < 0).sort((a, b) => b.daysUntil - a.daysUntil);
  const upcomingTasks = filteredTasks.filter(t => t.daysUntil >= 0);

  const groups: TaskGroup[] = [];
  if (overdueTasks.length > 0) {
    groups.push({ key: 'overdue', label: '🚨 Overdue', headerCls: 'bg-red-100 border-red-300 text-red-800', dotCls: 'bg-red-600', isOverdue: true, tasks: overdueTasks });
  }
  for (const cfg of UPCOMING_GROUPS) {
    const filtered = upcomingTasks.filter(t => t.priority === cfg.key).sort((a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime());
    if (filtered.length > 0) groups.push({ ...cfg, isOverdue: false, tasks: filtered });
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="loading loading-spinner loading-md text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-error p-6">
        <AlertTriangle size={28} />
        <p className="text-sm font-medium">Failed to load tasks</p>
        <button className="btn btn-sm btn-outline" onClick={() => refetch()}>Retry</button>
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────

  if (groups.length === 0) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Stat bar */}
        <StatBar overdueCount={overdueCount} todayCount={todayCount} weekCount={weekCount} totalCount={tasks.length} onRefetch={refetch} />
        {/* Filter tabs */}
        <FilterTabs active={activeFilter} onChange={setActiveFilter} tasks={tasks} />
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-base-content/40 p-6">
          <CheckSquare size={32} />
          <p className="text-sm font-medium">All clear — no tasks for this filter</p>
          <p className="text-xs">Tasks are auto-generated from deal key dates</p>
        </div>
      </div>
    );
  }

  // ── Task list ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Stat bar */}
      <StatBar overdueCount={overdueCount} todayCount={todayCount} weekCount={weekCount} totalCount={tasks.length} onRefetch={refetch} />

      {/* Filter tabs */}
      <FilterTabs active={activeFilter} onChange={setActiveFilter} tasks={tasks} />

      {/* Scrollable groups */}
      <div className="flex-1 overflow-y-auto">
        {groups.map(group => (
          <div key={group.key}>
            {/* Group header */}
            <div className={`sticky top-0 z-10 px-3 py-1.5 border-b ${group.headerCls} flex items-center justify-between`}>
              <span className="text-[11px] font-bold uppercase tracking-wide flex items-center gap-1.5">
                {group.isOverdue && <AlertTriangle size={10} className="text-red-700" />}
                {group.label}
              </span>
              <span className="text-[10px] font-medium opacity-70">
                {group.tasks.length} task{group.tasks.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Tasks */}
            {group.tasks.map(task => {
              const deal       = dealMap.get(task.deal_id);
              const addr       = deal ? [(deal as any).propertyAddress || (deal as any).property_address, (deal as any).city].filter(Boolean).join(', ') : '—';
              const stage      = (deal as any)?.pipelineStage || (deal as any)?.pipeline_stage;
              const stageCfg   = stage ? STAGE_LABELS[stage] : undefined;
              const { label: dueLbl, urgent, overdue } = formatDueDate(task.daysUntil, task.effectiveDate);
              const requestCfg = task.category ? TASK_REQUEST_MAP[task.category] : undefined;
              const canOpen    = !!deal;
              const isCompleting = completing.has(task.id);

              return (
                <div key={task.id} className="w-full border-b border-base-200 hover:bg-primary/5 transition-colors group">
                  {/* Main row */}
                  <div
                    className={`text-left px-3 py-2.5 ${canOpen ? 'cursor-pointer' : 'cursor-default'}`}
                    onClick={() => { if (canOpen) onSelectDeal(task.deal_id); }}
                  >
                    <div className="flex items-start gap-2.5">
                      {/* Priority dot */}
                      <span className={`mt-1.5 w-2 h-2 rounded-full flex-none ${group.dotCls}`} />

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {/* Title + due badge */}
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-base-content leading-snug truncate">{task.title}</p>
                          <span className={`text-[10px] font-semibold shrink-0 px-1.5 py-0.5 rounded whitespace-nowrap ${
                            overdue   ? 'bg-red-100 text-red-700'
                            : urgent  ? 'bg-amber-100 text-amber-700'
                            :           'bg-base-200 text-base-content/50'
                          }`}>
                            {dueLbl}
                          </span>
                        </div>

                        {/* Deal info row */}
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {(deal as any)?.dealRef && (
                            <span className="text-[10px] font-mono bg-base-200 text-base-content/50 px-1.5 py-0.5 rounded shrink-0">
                              {(deal as any).dealRef}
                            </span>
                          )}
                          <span className="text-xs text-base-content/50 truncate">{addr}</span>
                          {stageCfg && (
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${stageCfg.cls}`}>
                              {stageCfg.label}
                            </span>
                          )}
                        </div>

                        {/* Weekend tag */}
                        {task.wasWeekend && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full mt-1 inline-block">
                            ↩ moved from weekend
                          </span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 flex-none" onClick={e => e.stopPropagation()}>
                        {/* ✓ Complete button */}
                        <button
                          className="btn btn-xs btn-ghost text-success opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Mark complete"
                          disabled={isCompleting}
                          onClick={() => completeMutation.mutate(task.id)}
                        >
                          {isCompleting
                            ? <span className="loading loading-spinner loading-xs" />
                            : <CheckCircle2 size={14} />}
                        </button>

                        {/* Open → hint */}
                        {canOpen && (
                          <span className="text-[10px] text-base-content/30 group-hover:text-primary transition-colors font-medium">
                            Open →
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Send Request action */}
                  {requestCfg && onSendRequest && (
                    <div className="px-3 pb-2 flex items-center gap-1.5">
                      <button
                        className="btn btn-xs btn-outline btn-primary gap-1"
                        onClick={(e) => { e.stopPropagation(); onSendRequest(task.deal_id, requestCfg.type); }}
                      >
                        <Send size={10} />
                        {requestCfg.label}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatBar({ overdueCount, todayCount, weekCount, totalCount, onRefetch }: {
  overdueCount: number; todayCount: number; weekCount: number; totalCount: number;
  onRefetch: () => void;
}) {
  return (
    <div className="px-3 py-2 border-b border-base-300 bg-base-50 shrink-0 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        {overdueCount > 0 && (
          <span className="text-xs font-bold text-red-600 flex items-center gap-1">
            <AlertTriangle size={11} />
            {overdueCount} overdue
          </span>
        )}
        {todayCount > 0 && (
          <span className="text-xs font-semibold text-amber-600">{todayCount} due today</span>
        )}
        <span className="text-xs text-base-content/40">{weekCount} this week · {totalCount} total</span>
      </div>
      <button
        className="btn btn-xs btn-ghost text-base-content/40 hover:text-base-content"
        title="Refresh"
        onClick={() => onRefetch()}
      >
        <RefreshCw size={12} />
      </button>
    </div>
  );
}

function FilterTabs({ active, onChange, tasks }: {
  active: FilterTab; onChange: (f: FilterTab) => void; tasks: TaskRow[];
}) {
  const counts: Record<FilterTab, number> = {
    all:       tasks.length,
    overdue:   tasks.filter(t => t.daysUntil < 0).length,
    today:     tasks.filter(t => t.daysUntil === 0).length,
    this_week: tasks.filter(t => t.daysUntil >= 0 && t.daysUntil <= 7).length,
    high:      tasks.filter(t => t.priority === 'high').length,
  };

  return (
    <div className="flex items-center gap-0 border-b border-base-300 bg-base-100 shrink-0 overflow-x-auto">
      {FILTER_TABS.map(tab => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap border-b-2 transition-colors flex items-center gap-1 ${
            active === tab.key
              ? 'border-primary text-primary bg-base-100'
              : 'border-transparent text-base-content/50 hover:text-base-content hover:bg-base-200'
          }`}
        >
          {tab.label}
          {counts[tab.key] > 0 && (
            <span className={`text-[10px] px-1 rounded-full font-bold ${
              tab.key === 'overdue' && counts[tab.key] > 0
                ? 'bg-red-100 text-red-700'
                : 'bg-base-300 text-base-content/60'
            }`}>
              {counts[tab.key]}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
