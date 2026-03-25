import React, { useEffect, useState } from 'react';
import { CheckSquare } from 'lucide-react';
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
  priority?: string;
  due_date: string;           // original DB date (YYYY-MM-DD)
  effectiveDate: Date;        // after Sat/Sun → Fri adjustment
  wasWeekend: boolean;        // true if original due_date was Sat or Sun
}

interface DayGroup {
  date: Date;
  label: string;
  tasks: TaskRow[];
}

interface Props {
  deals: Deal[];
  onSelectDeal: (dealId: string) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Return midnight-local for a calendar date string YYYY-MM-DD */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Strip time from a Date to midnight-local */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Adjust: Saturday → previous Friday, Sunday → previous Friday.
 * Returns { date, wasWeekend }.
 */
function effectiveDueDate(dateStr: string): { date: Date; wasWeekend: boolean } {
  const d = parseLocalDate(dateStr);
  const dow = d.getDay(); // 0=Sun, 6=Sat
  if (dow === 6) { d.setDate(d.getDate() - 1); return { date: d, wasWeekend: true }; }
  if (dow === 0) { d.setDate(d.getDate() - 2); return { date: d, wasWeekend: true }; }
  return { date: d, wasWeekend: false };
}

/** Human-friendly day label relative to today */
function dayLabel(date: Date, today: Date): string {
  const diff = Math.round((date.getTime() - today.getTime()) / 86400000);
  const formatted = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  if (diff === 0) return `Today — ${formatted}`;
  if (diff === 1) return `Tomorrow — ${formatted}`;
  return formatted;
}

// ── Priority dot ─────────────────────────────────────────────────────────────

const PRIORITY_DOT: Record<string, string> = {
  high:   'bg-red-500',
  normal: 'bg-blue-400',
  low:    'bg-gray-300',
};

// ── Component ────────────────────────────────────────────────────────────────

export const ByTaskView: React.FC<Props> = ({ deals, onSelectDeal }) => {
  const [groups, setGroups]   = useState<DayGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal]     = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const today  = startOfDay(new Date());
      // Fetch up to 6 calendar days ahead so Sat/Sun within the 3-day effective window are included
      const window6 = new Date(today);
      window6.setDate(window6.getDate() + 6);

      const todayStr   = today.toISOString().split('T')[0];
      const windowStr  = window6.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('tasks')
        .select('id, deal_id, title, description, category, status, priority, due_date')
        .neq('status', 'completed')
        .gte('due_date', todayStr)
        .lte('due_date', windowStr)
        .order('due_date', { ascending: true });

      if (error || !data) {
        console.error('ByTaskView fetch error:', error);
        setLoading(false);
        return;
      }

      // Cutoff = today + 3 calendar days (inclusive)
      const cutoff = new Date(today);
      cutoff.setDate(cutoff.getDate() + 3);

      // Enrich + filter to effective window
      const enriched: TaskRow[] = data
        .map(t => {
          const { date, wasWeekend } = effectiveDueDate(t.due_date);
          return { ...t, effectiveDate: date, wasWeekend };
        })
        .filter(t => t.effectiveDate >= today && t.effectiveDate <= cutoff);

      setTotal(enriched.length);

      // Group by effective date key
      const map = new Map<string, TaskRow[]>();
      for (const t of enriched) {
        const key = `${t.effectiveDate.getFullYear()}-${String(t.effectiveDate.getMonth() + 1).padStart(2, '0')}-${String(t.effectiveDate.getDate()).padStart(2, '0')}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(t);
      }

      // Sort groups by date ascending
      const grps: DayGroup[] = Array.from(map.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, tasks]) => {
          const [y, m, d] = key.split('-').map(Number);
          const date = new Date(y, m - 1, d);
          return { date, label: dayLabel(date, today), tasks };
        });

      setGroups(grps);
      setLoading(false);
    };

    load();
  }, []);

  const dealMap = new Map(deals.map(d => [d.id, d]));

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
        <p className="text-sm font-medium">All clear — no tasks due in the next 3 days</p>
        <p className="text-xs">Weekend tasks are automatically moved to Friday</p>
      </div>
    );
  }

  // ── Task list ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Summary bar */}
      <div className="px-3 py-2 border-b border-base-300 bg-base-50 shrink-0 flex items-center justify-between">
        <p className="text-xs font-semibold text-base-content/60">Next 3 days</p>
        <span className="text-xs text-base-content/40">
          {total} task{total !== 1 ? 's' : ''} · weekends → Friday
        </span>
      </div>

      {/* Scrollable groups */}
      <div className="flex-1 overflow-y-auto">
        {groups.map(group => (
          <div key={group.label}>
            {/* Sticky day header */}
            <div className="sticky top-0 z-10 px-3 py-1.5 bg-base-200 border-b border-base-300 flex items-center justify-between">
              <span className="text-[11px] font-bold text-base-content/70 uppercase tracking-wide">
                {group.label}
              </span>
              <span className="text-[10px] text-base-content/40 font-medium">
                {group.tasks.length} task{group.tasks.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Tasks in this day */}
            {group.tasks.map(task => {
              const deal   = dealMap.get(task.deal_id);
              const addr   = deal ? [deal.propertyAddress, deal.city].filter(Boolean).join(', ') : '—';
              const dotCls = PRIORITY_DOT[task.priority || 'normal'] ?? PRIORITY_DOT.normal;

              return (
                <button
                  key={task.id}
                  onClick={() => onSelectDeal(task.deal_id)}
                  className="w-full text-left px-3 py-2.5 border-b border-base-200 hover:bg-primary/5 active:bg-primary/10 transition-colors group"
                >
                  <div className="flex items-start gap-2.5">
                    {/* Priority dot */}
                    <span className={`mt-1.5 w-2 h-2 rounded-full flex-none ${dotCls}`} />

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-base-content leading-snug truncate">
                        {task.title}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {deal?.deal_ref && (
                          <span className="text-[10px] font-mono bg-base-200 text-base-content/50 px-1.5 py-0.5 rounded shrink-0">
                            {deal.deal_ref}
                          </span>
                        )}
                        <span className="text-xs text-base-content/50 truncate">{addr}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {task.category && (
                          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                            {task.category}
                          </span>
                        )}
                        {task.wasWeekend && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                            ↩ moved from weekend
                          </span>
                        )}
                        {task.priority === 'high' && (
                          <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-semibold">
                            High priority
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Arrow hint */}
                    <span className="text-[10px] text-base-content/30 group-hover:text-primary transition-colors mt-1 flex-none font-medium">
                      Open →
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
