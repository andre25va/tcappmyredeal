import React, { useEffect, useState } from 'react';
import { CheckSquare, AlertTriangle, Send } from 'lucide-react';
import { Deal } from '../types';
import { supabase } from '../lib/supabase';

// ── Types ────────────────────────────────────────────────────────────────────

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

// ── Priority config ───────────────────────────────────────────────────────────

const UPCOMING_GROUPS = [
  {
    key: 'high',
    label: 'High Priority',
    headerCls: 'bg-red-50 border-red-200 text-red-700',
    dotCls: 'bg-red-500',
  },
  {
    key: 'normal',
    label: 'Normal',
    headerCls: 'bg-blue-50 border-blue-200 text-blue-700',
    dotCls: 'bg-blue-400',
  },
  {
    key: 'low',
    label: 'Low Priority',
    headerCls: 'bg-base-100 border-base-300 text-base-content/60',
    dotCls: 'bg-gray-300',
  },
];

// ── Component ────────────────────────────────────────────────────────────────

export const ByTaskView: React.FC<Props> = ({ deals, onSelectDeal, onSendRequest }) => {
  const [tasks, setTasks]     = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const today     = startOfDay(new Date());
      // Look back 90 days for overdue + ahead 60 days for upcoming
      const pastDate  = new Date(today);
      pastDate.setDate(pastDate.getDate() - 90);
      const aheadDate = new Date(today);
      aheadDate.setDate(aheadDate.getDate() + 60);

      const { data, error } = await supabase
        .from('tasks')
        .select('id, deal_id, title, description, category, status, priority, due_date')
        .neq('status', 'completed')
        .gte('due_date', pastDate.toISOString().split('T')[0])
        .lte('due_date', aheadDate.toISOString().split('T')[0])
        .order('due_date', { ascending: true });

      if (error || !data) {
        console.error('ByTaskView fetch error:', error);
        setLoading(false);
        return;
      }

      const enriched: TaskRow[] = data.map(t => {
        const { date, wasWeekend } = effectiveDueDate(t.due_date);
        const daysUntil = Math.round((date.getTime() - today.getTime()) / 86400000);
        return {
          ...t,
          effectiveDate: date,
          wasWeekend,
          daysUntil,
          priority: t.priority || 'normal',
        };
      });

      setTasks(enriched);
      setLoading(false);
    };

    load();
  }, []);

  const dealMap = new Map(deals.map(d => [d.id, d]));
  const today   = startOfDay(new Date());

  // Split overdue vs upcoming
  const overdueTasks  = tasks.filter(t => t.daysUntil < 0).sort((a, b) => b.daysUntil - a.daysUntil);
  const upcomingTasks = tasks.filter(t => t.daysUntil >= 0);

  // Build groups: overdue first, then priority groups
  const groups: TaskGroup[] = [];

  if (overdueTasks.length > 0) {
    groups.push({
      key: 'overdue',
      label: '🚨 Overdue',
      headerCls: 'bg-red-100 border-red-300 text-red-800',
      dotCls: 'bg-red-600',
      isOverdue: true,
      tasks: overdueTasks,
    });
  }

  for (const cfg of UPCOMING_GROUPS) {
    const filtered = upcomingTasks
      .filter(t => t.priority === cfg.key)
      .sort((a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime());

    if (filtered.length > 0) {
      groups.push({ ...cfg, isOverdue: false, tasks: filtered });
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="loading loading-spinner loading-md text-primary" />
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────

  if (groups.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-base-content/40 p-6">
        <CheckSquare size={32} />
        <p className="text-sm font-medium">All clear — no upcoming tasks</p>
        <p className="text-xs">Tasks are auto-generated from deal key dates</p>
      </div>
    );
  }

  // ── Task list ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Summary bar */}
      <div className="px-3 py-2 border-b border-base-300 bg-base-50 shrink-0 flex items-center justify-between">
        <p className="text-xs font-semibold text-base-content/60">Tasks by priority</p>
        <span className="text-xs text-base-content/40">
          {tasks.length} task{tasks.length !== 1 ? 's' : ''}
          {overdueTasks.length > 0 && (
            <span className="ml-1.5 text-red-600 font-semibold">· {overdueTasks.length} overdue</span>
          )}
        </span>
      </div>

      {/* Scrollable groups */}
      <div className="flex-1 overflow-y-auto">
        {groups.map(group => (
          <div key={group.key}>
            {/* Priority group header */}
            <div className={`sticky top-0 z-10 px-3 py-1.5 border-b ${group.headerCls} flex items-center justify-between`}>
              <span className="text-[11px] font-bold uppercase tracking-wide flex items-center gap-1.5">
                {group.isOverdue && <AlertTriangle size={10} className="text-red-700" />}
                {group.label}
              </span>
              <span className="text-[10px] font-medium opacity-70">
                {group.tasks.length} task{group.tasks.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Tasks in this group */}
            {group.tasks.map(task => {
              const deal       = dealMap.get(task.deal_id);
              const addr       = deal ? [deal.propertyAddress, deal.city].filter(Boolean).join(', ') : '—';
              const { label: dueLbl, urgent, overdue } = formatDueDate(task.daysUntil, task.effectiveDate);
              const requestCfg = task.category ? TASK_REQUEST_MAP[task.category] : undefined;

              return (
                <div
                  key={task.id}
                  className="w-full border-b border-base-200 hover:bg-primary/5 transition-colors group"
                >
                  {/* Main clickable row — opens deal workspace */}
                  <div
                    className="text-left px-3 py-2.5 cursor-pointer"
                    onClick={() => onSelectDeal(task.deal_id)}
                  >
                    <div className="flex items-start gap-2.5">
                      {/* Priority dot */}
                      <span className={`mt-1.5 w-2 h-2 rounded-full flex-none ${group.dotCls}`} />

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {/* Title + date badge */}
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-base-content leading-snug truncate">
                            {task.title}
                          </p>
                          <span className={`text-[10px] font-semibold shrink-0 px-1.5 py-0.5 rounded whitespace-nowrap ${
                            overdue
                              ? 'bg-red-100 text-red-700'
                              : urgent
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-base-200 text-base-content/50'
                          }`}>
                            {dueLbl}
                          </span>
                        </div>

                        {/* Deal info */}
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {deal?.dealRef && (
                            <span className="text-[10px] font-mono bg-base-200 text-base-content/50 px-1.5 py-0.5 rounded shrink-0">
                              {deal.dealRef}
                            </span>
                          )}
                          <span className="text-xs text-base-content/50 truncate">{addr}</span>
                        </div>

                        {/* Tags */}
                        {task.wasWeekend && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full mt-1 inline-block">
                            ↩ moved from weekend
                          </span>
                        )}
                      </div>

                      {/* Arrow hint */}
                      <span className="text-[10px] text-base-content/30 group-hover:text-primary transition-colors mt-1 flex-none font-medium">
                        Open →
                      </span>
                    </div>
                  </div>

                  {/* Send Request action — only for actionable task categories */}
                  {requestCfg && onSendRequest && (
                    <div className="px-3 pb-2 flex items-center gap-1.5">
                      <button
                        className="btn btn-xs btn-outline btn-primary gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSendRequest(task.deal_id, requestCfg.type);
                        }}
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
