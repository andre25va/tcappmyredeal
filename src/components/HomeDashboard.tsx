import React, { useMemo, useState, useEffect } from 'react';
import {
  Building2, TrendingUp, AlertTriangle, CheckSquare, Calendar,
  MapPin, Users, Clock, FileText, Activity, Home, DollarSign,
  ChevronRight, Flame, Target, BarChart2, Zap, XCircle,
  Mail, Phone, ClipboardList, Sparkles,
} from 'lucide-react';
import { Deal, DealStatus, DealMilestone } from '../types';
import { formatCurrency, daysUntil, formatDate } from '../utils/helpers';
import { MILESTONE_LABELS } from '../utils/taskTemplates';
import { supabase } from '../lib/supabase';

interface Props {
  deals: Deal[];
  onSelectDeal: (id: string) => void;
  onGoToDeals: () => void;
  onGoToAlerts: () => void;
}

const STATUS_META: Record<DealStatus, { label: string; color: string; bg: string; order: number }> = {
  contract:       { label: 'Under Contract', color: 'text-black',   bg: 'bg-blue-500',    order: 1 },
  'due-diligence':{ label: 'Due Diligence',  color: 'text-black', bg: 'bg-purple-500',  order: 2 },
  'clear-to-close':{ label: 'Clear to Close', color: 'text-black', bg: 'bg-emerald-500', order: 3 },
  closed:         { label: 'Closed',          color: 'text-black',  bg: 'bg-green-500',   order: 4 },
  terminated:     { label: 'Terminated',      color: 'text-red-400',    bg: 'bg-red-500',     order: 5 },
};

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="w-full bg-base-300 rounded-full h-2 overflow-hidden">
      <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function KPICard({ icon, label, value, sub, color, onClick }:
  { icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string; onClick?: () => void }) {
  return (
    <div
      className={`card bg-base-200 border border-base-300 hover:border-primary/40 transition-all ${onClick ? 'cursor-pointer hover:shadow-md' : ''}`}
      onClick={onClick}
    >
      <div className="card-body p-4 gap-2">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color} bg-opacity-15`}>
          <span className={color}>{icon}</span>
        </div>
        <div>
          <p className="text-2xl font-bold text-base-content leading-none">{value}</p>
          {sub && <p className="text-xs text-base-content/50 mt-0.5">{sub}</p>}
          <p className="text-xs font-medium text-base-content/60 mt-1">{label}</p>
        </div>
      </div>
    </div>
  );
}

interface LiveStats {
  emailsThisWeek: number;
  callsThisWeek: number;
  openRequests: number;
  aiSummaries: number;
}

interface LiveActivityItem {
  id: string;
  type: 'email' | 'call' | 'request';
  icon: string;
  action: string;
  dealId: string | null;
  dealAddress: string | null;
  timestamp: string;
}

export const HomeDashboard: React.FC<Props> = ({ deals, onSelectDeal, onGoToDeals, onGoToAlerts }) => {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisYearStart  = new Date(now.getFullYear(), 0, 1);

  // ── Live DB stats ──────────────────────────────────────────────────────────
  const [liveStats, setLiveStats] = useState<LiveStats>({
    emailsThisWeek: 0,
    callsThisWeek: 0,
    openRequests: 0,
    aiSummaries: 0,
  });
  const [liveActivity, setLiveActivity] = useState<LiveActivityItem[]>([]);
  const [liveLoaded, setLiveLoaded] = useState(false);

  // Build a deal address lookup from props so we can enrich DB rows client-side
  const dealAddressMap = useMemo(() => {
    const m: Record<string, string> = {};
    deals.forEach(d => { m[d.id] = d.propertyAddress; });
    return m;
  }, [deals]);

  useEffect(() => {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    // ── Fetch counts ──
    Promise.all([
      supabase.from('email_send_log').select('id', { count: 'exact', head: true }).gte('sent_at', weekAgo),
      supabase.from('call_logs').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
      supabase.from('requests').select('id', { count: 'exact', head: true }).in('status', ['pending', 'sent', 'pending_review']),
      supabase.from('call_logs').select('id', { count: 'exact', head: true }).not('ai_summary', 'is', null),
    ]).then(([emails, calls, requests, summaries]) => {
      setLiveStats({
        emailsThisWeek: emails.count ?? 0,
        callsThisWeek: calls.count ?? 0,
        openRequests: requests.count ?? 0,
        aiSummaries: summaries.count ?? 0,
      });
    }).catch(() => {/* silent — stats just stay 0 */});

    // ── Fetch recent activity ──
    Promise.all([
      supabase.from('email_send_log')
        .select('id, subject, template_name, sent_at, deal_id')
        .order('sent_at', { ascending: false })
        .limit(6),
      supabase.from('call_logs')
        .select('id, direction, status, duration, created_at, deal_id')
        .order('created_at', { ascending: false })
        .limit(6),
      supabase.from('requests')
        .select('id, request_type, status, created_at, deal_id')
        .order('created_at', { ascending: false })
        .limit(6),
    ]).then(([emailRes, callRes, reqRes]) => {
      const items: LiveActivityItem[] = [
        ...(emailRes.data ?? []).map((e: any): LiveActivityItem => ({
          id: `email-${e.id}`,
          type: 'email',
          icon: '📧',
          action: e.subject || e.template_name || 'Email sent',
          dealId: e.deal_id ?? null,
          dealAddress: e.deal_id ? (dealAddressMap[e.deal_id] ?? null) : null,
          timestamp: e.sent_at,
        })),
        ...(callRes.data ?? []).map((c: any): LiveActivityItem => ({
          id: `call-${c.id}`,
          type: 'call',
          icon: '📞',
          action: `${c.direction === 'inbound' ? 'Inbound' : 'Outbound'} call${c.duration ? ` · ${c.duration}s` : ''}${c.status ? ` · ${c.status}` : ''}`,
          dealId: c.deal_id ?? null,
          dealAddress: c.deal_id ? (dealAddressMap[c.deal_id] ?? null) : null,
          timestamp: c.created_at,
        })),
        ...(reqRes.data ?? []).map((r: any): LiveActivityItem => ({
          id: `req-${r.id}`,
          type: 'request',
          icon: '📋',
          action: `${r.request_type || 'Request'} · ${r.status}`,
          dealId: r.deal_id ?? null,
          dealAddress: r.deal_id ? (dealAddressMap[r.deal_id] ?? null) : null,
          timestamp: r.created_at,
        })),
      ]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 10);

      setLiveActivity(items);
      setLiveLoaded(true);
    }).catch(() => { setLiveLoaded(true); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const active = deals.filter(d => d.status !== 'closed' && d.status !== 'terminated' && d.milestone !== 'archived');
    const closedThisMonth = deals.filter(d =>
      d.status === 'closed' && new Date(d.closingDate) >= thisMonthStart
    );
    const terminated = deals.filter(d => d.status === 'terminated');
    const terminatedThisYear = terminated.filter(d =>
      new Date(d.updatedAt ?? d.closingDate ?? d.contractDate) >= thisYearStart
    );

    const totalActiveVolume = active.reduce((s, d) => s + d.contractPrice, 0);
    const totalClosedVolume = closedThisMonth.reduce((s, d) => s + d.contractPrice, 0);
    const totalTerminatedVolume = terminated.reduce((s, d) => s + d.contractPrice, 0);

    const pipeline = (['contract', 'due-diligence', 'clear-to-close', 'closed', 'terminated'] as DealStatus[])
      .map(status => ({
        status,
        count: deals.filter(d => d.status === status && (status === 'terminated' || d.milestone !== 'archived')).length,
        volume: deals.filter(d => d.status === status && (status === 'terminated' || d.milestone !== 'archived')).reduce((s, d) => s + d.contractPrice, 0),
      }));

    const allPending = deals.flatMap(d =>
      d.status !== 'terminated' && d.milestone !== 'archived'
        ? d.documentRequests.filter(r => r.status === 'pending').map(r => ({ ...r, dealId: d.id, dealAddress: d.propertyAddress }))
        : []
    );
    const highAlerts = allPending.filter(r => r.urgency === 'high');
    const medAlerts  = allPending.filter(r => r.urgency === 'medium');

    const closingSoon = active
      .map(d => ({ ...d, daysLeft: daysUntil(d.closingDate) }))
      .filter(d => d.daysLeft >= 0 && d.daysLeft <= 30)
      .sort((a, b) => a.daysLeft - b.daysLeft);

    const closingThisWeek  = closingSoon.filter(d => d.daysLeft <= 7);
    const closingThisMonth = closingSoon.filter(d => d.daysLeft > 7 && d.daysLeft <= 30);

    const allDDItems   = active.flatMap(d => d.dueDiligenceChecklist);
    const allCompItems = active.flatMap(d => d.complianceChecklist);
    const ddPct   = allDDItems.length   === 0 ? 100 : Math.round(allDDItems.filter(i => i.completed).length   / allDDItems.length   * 100);
    const compPct = allCompItems.length === 0 ? 100 : Math.round(allCompItems.filter(i => i.completed).length / allCompItems.length * 100);
    const overdueItems = [...allDDItems, ...allCompItems].filter(
      i => !i.completed && i.dueDate && new Date(i.dueDate) < now
    );

    const byState: Record<string, { count: number; volume: number }> = {};
    active.forEach(d => {
      if (!byState[d.state]) byState[d.state] = { count: 0, volume: 0 };
      byState[d.state].count++;
      byState[d.state].volume += d.contractPrice;
    });
    const stateList = Object.entries(byState).sort((a, b) => b[1].count - a[1].count);

    const byAgent: Record<string, { count: number; volume: number }> = {};
    active.forEach(d => {
      if (!byAgent[d.agentName]) byAgent[d.agentName] = { count: 0, volume: 0 };
      byAgent[d.agentName].count++;
      byAgent[d.agentName].volume += d.contractPrice;
    });
    const agentList = Object.entries(byAgent).sort((a, b) => b[1].count - a[1].count);

    const byType: Record<string, number> = {};
    active.forEach(d => {
      byType[d.propertyType] = (byType[d.propertyType] || 0) + 1;
    });

    const todayStr = now.toISOString().slice(0, 10);
    const todayReminders = active.flatMap(d =>
      d.reminders.filter(r => !r.completed && r.dueDate <= todayStr)
        .map(r => ({ ...r, dealId: d.id, dealAddress: d.propertyAddress }))
    );

    const recentActivity = deals
      .flatMap(d => d.activityLog.map(a => ({ ...a, dealId: d.id, dealAddress: d.propertyAddress, dealState: d.state })))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 8);

    const closedDeals = deals.filter(d => d.status === 'closed');
    const avgDaysToClose = closedDeals.length === 0 ? 0 :
      Math.round(closedDeals.reduce((s, d) => {
        const days = Math.max(0, (new Date(d.closingDate).getTime() - new Date(d.contractDate).getTime()) / 86400000);
        return s + days;
      }, 0) / closedDeals.length);

    const MILESTONE_ORDER: DealMilestone[] = [
      'contract-received', 'emd-due', 'inspections-due', 'appraisal-ordered',
      'appraisal-received', 'title-opened', 'loan-commitment', 'closing-scheduled',
      'clear-to-close', 'closed',
    ];
    const milestoneFunnel = MILESTONE_ORDER.map(m => ({
      milestone: m,
      count: active.filter(d => d.milestone === m).length,
    })).filter(m => m.count > 0);

    const allTasks = active.flatMap(d => d.tasks ?? []);
    const todayStr2 = now.toISOString().slice(0, 10);
    const overdueTasks     = allTasks.filter(t => !t.completedAt && t.dueDate < todayStr2);
    const tasksDueToday    = allTasks.filter(t => !t.completedAt && t.dueDate === todayStr2);
    const completedTasks   = allTasks.filter(t => !!t.completedAt);
    const taskCompletionPct = allTasks.length === 0 ? 100 : Math.round(completedTasks.length / allTasks.length * 100);

    return {
      active, closedThisMonth, terminated, terminatedThisYear,
      totalActiveVolume, totalClosedVolume, totalTerminatedVolume,
      pipeline, allPending, highAlerts, medAlerts,
      closingSoon, closingThisWeek, closingThisMonth,
      ddPct, compPct, overdueItems,
      stateList, agentList, byType,
      todayReminders, recentActivity,
      avgDaysToClose,
      milestoneFunnel, overdueTasks, tasksDueToday, taskCompletionPct, allTasks,
    };
  }, [deals]);

  const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
    deal_created: <Home size={12} />,
    status_change: <Zap size={12} />,
    checklist: <CheckSquare size={12} />,
    contact_added: <Users size={12} />,
    document_requested: <AlertTriangle size={12} />,
    document_confirmed: <CheckSquare size={12} />,
    reminder_set: <Clock size={12} />,
    note: <FileText size={12} />,
    price_change: <DollarSign size={12} />,
  };

  const ACTIVITY_COLORS: Record<string, string> = {
    deal_created: 'text-primary', status_change: 'text-accent',
    checklist: 'text-success', contact_added: 'text-info',
    document_requested: 'text-warning', document_confirmed: 'text-success',
    reminder_set: 'text-secondary', note: 'text-base-content/60',
    price_change: 'text-error',
  };

  const LIVE_ACTIVITY_COLORS: Record<string, string> = {
    email: 'text-blue-500',
    call: 'text-green-500',
    request: 'text-amber-500',
  };

  const typeLabel: Record<string, string> = {
    'single-family': 'Single Family', 'multi-family': 'Multi-Family',
    condo: 'Condo', townhouse: 'Townhouse', land: 'Land', commercial: 'Commercial',
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-base-100">
      {/* Header bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-base-300 bg-base-100 sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-bold text-base-content">Command Center</h1>
          <p className="text-xs text-base-content/50">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <button onClick={onGoToDeals} className="btn btn-sm gap-1.5 bg-green-600 hover:bg-green-700 text-white border-none">
          <FileText size={13} /> Open Deals <ChevronRight size={13} />
        </button>
      </div>

      <div className="p-5 space-y-5 max-w-[1600px] mx-auto w-full">

        {/* ── TOP KPI CARDS ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-9 gap-3">
          <KPICard
            icon={<Building2 size={16} />}
            label="Active Deals"
            value={stats.active.length}
            sub={`${deals.length} total`}
            color="text-black"
            onClick={onGoToDeals}
          />
          <KPICard
            icon={<DollarSign size={16} />}
            label="Active Volume"
            value={`$${(stats.totalActiveVolume / 1000000).toFixed(1)}M`}
            sub={formatCurrency(stats.totalActiveVolume)}
            color="text-black"
          />
          <KPICard
            icon={<TrendingUp size={16} />}
            label="Closed This Month"
            value={stats.closedThisMonth.length}
            sub={formatCurrency(stats.totalClosedVolume)}
            color="text-black"
          />
          <KPICard
            icon={<Calendar size={16} />}
            label="Closing This Week"
            value={stats.closingThisWeek.length}
            sub={stats.closingThisWeek.length > 0 ? `Next: ${stats.closingThisWeek[0]?.propertyAddress?.split(' ').slice(0,3).join(' ')}` : 'None this week'}
            color="text-black"
            onClick={onGoToDeals}
          />
          <KPICard
            icon={<XCircle size={16} />}
            label="Fell Apart"
            value={stats.terminated.length}
            sub={stats.terminated.length > 0 ? `${formatCurrency(stats.totalTerminatedVolume)} lost vol.` : 'None this year'}
            color={stats.terminated.length > 0 ? 'text-red-500' : 'text-base-content/40'}
            onClick={stats.terminated.length > 0 ? onGoToDeals : undefined}
          />
          <KPICard
            icon={<AlertTriangle size={16} />}
            label="Amber Alerts"
            value={stats.allPending.length}
            sub={`${stats.highAlerts.length} high priority`}
            color="text-amber-500"
            onClick={onGoToAlerts}
          />
          <KPICard
            icon={<Clock size={16} />}
            label="Avg Days to Close"
            value={stats.avgDaysToClose || '—'}
            sub={`${stats.closedThisMonth.length} closed deals`}
            color="text-black"
          />
          <KPICard
            icon={<AlertTriangle size={16} />}
            label="Overdue Tasks"
            value={stats.overdueTasks.length}
            sub={stats.tasksDueToday.length > 0 ? `${stats.tasksDueToday.length} due today` : 'None due today'}
            color={stats.overdueTasks.length > 0 ? 'text-red-600' : 'text-green-600'}
            onClick={stats.overdueTasks.length > 0 ? onGoToDeals : undefined}
          />
          <KPICard
            icon={<CheckSquare size={16} />}
            label="Task Completion"
            value={`${stats.taskCompletionPct}%`}
            sub={`${stats.allTasks.length} total tasks`}
            color="text-primary"
          />
        </div>

        {/* ── COMMUNICATIONS THIS WEEK (live from DB) ── */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Activity size={13} className="text-primary" />
            <span className="text-xs font-semibold text-base-content/60 uppercase tracking-wide">Communications This Week</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card bg-base-200 border border-base-300 hover:border-blue-400/40 transition-all">
              <div className="card-body p-4 gap-1">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Mail size={15} className="text-blue-500" />
                </div>
                <p className="text-2xl font-bold leading-none mt-1">{liveStats.emailsThisWeek}</p>
                <p className="text-xs font-medium text-base-content/60">Emails Sent</p>
              </div>
            </div>
            <div className="card bg-base-200 border border-base-300 hover:border-green-400/40 transition-all">
              <div className="card-body p-4 gap-1">
                <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <Phone size={15} className="text-green-500" />
                </div>
                <p className="text-2xl font-bold leading-none mt-1">{liveStats.callsThisWeek}</p>
                <p className="text-xs font-medium text-base-content/60">Calls Made</p>
              </div>
            </div>
            <div className="card bg-base-200 border border-base-300 hover:border-amber-400/40 transition-all">
              <div className="card-body p-4 gap-1">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <ClipboardList size={15} className="text-amber-500" />
                </div>
                <p className="text-2xl font-bold leading-none mt-1">{liveStats.openRequests}</p>
                <p className="text-xs font-medium text-base-content/60">Open Requests</p>
              </div>
            </div>
            <div className="card bg-base-200 border border-base-300 hover:border-purple-400/40 transition-all">
              <div className="card-body p-4 gap-1">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Sparkles size={15} className="text-purple-500" />
                </div>
                <p className="text-2xl font-bold leading-none mt-1">{liveStats.aiSummaries}</p>
                <p className="text-xs font-medium text-base-content/60">AI Summaries</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── PIPELINE + ALERTS ROW ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Pipeline Funnel */}
          <div className="card bg-base-200 border border-base-300 col-span-1 lg:col-span-2">
            <div className="card-body p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <BarChart2 size={15} className="text-primary" /> Pipeline Overview
                </h2>
                <span className="text-xs text-base-content/50">{deals.length} total deals</span>
              </div>
              <div className="space-y-2.5">
                {stats.pipeline.map(({ status, count, volume }) => {
                  const meta = STATUS_META[status];
                  const pct = deals.length === 0 ? 0 : Math.round(count / deals.length * 100);
                  return (
                    <div key={status} className="flex items-center gap-3">
                      <span className={`text-xs font-medium w-28 shrink-0 ${meta.color}`}>{meta.label}</span>
                      <div className="flex-1">
                        <div className="w-full bg-base-300 rounded-full h-5 overflow-hidden relative">
                          <div
                            className={`h-5 rounded-full ${meta.bg} transition-all flex items-center`}
                            style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
                          />
                          {count > 0 && (
                            <span className="absolute inset-y-0 left-2 flex items-center text-[10px] font-bold text-white/90">
                              {count} deal{count !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-base-content/50 w-20 text-right shrink-0">{formatCurrency(volume)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Amber Alerts Summary */}
          <div className="card bg-base-200 border border-base-300">
            <div className="card-body p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <Flame size={15} className="text-warning" /> Amber Alerts
                </h2>
                {stats.allPending.length > 0 && (
                  <span className="badge badge-warning badge-sm animate-pulse">{stats.allPending.length} pending</span>
                )}
              </div>

              {stats.allPending.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-20 gap-2 text-base-content/30">
                  <CheckSquare size={22} />
                  <span className="text-xs">All clear — no pending alerts</span>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex gap-2">
                    {[
                      { label: 'High', count: stats.highAlerts.length, color: 'bg-error', text: 'text-error' },
                      { label: 'Med',  count: stats.medAlerts.length,  color: 'bg-amber-500', text: 'text-amber-500' },
                      { label: 'Low',  count: stats.allPending.length - stats.highAlerts.length - stats.medAlerts.length, color: 'bg-info', text: 'text-info' },
                    ].map(u => (
                      <div key={u.label} className="flex-1 bg-base-300 rounded-lg p-2 text-center">
                        <p className={`text-lg font-bold ${u.text}`}>{u.count}</p>
                        <p className="text-[10px] text-base-content/50">{u.label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {[...stats.highAlerts, ...stats.medAlerts].slice(0, 4).map((r: any) => (
                      <div
                        key={r.id}
                        className="flex items-center gap-2 p-1.5 rounded-md bg-base-300/60 cursor-pointer hover:bg-base-300"
                        onClick={() => { onSelectDeal(r.dealId); onGoToAlerts(); }}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${r.urgency === 'high' ? 'bg-error' : 'bg-warning'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium truncate">{r.label}</p>
                          <p className="text-[10px] text-base-content/40 truncate">{r.dealAddress}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={onGoToAlerts} className="btn btn-warning btn-xs w-full">
                    View All Alerts →
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── FELL APART DEALS (if any) ── */}
        {stats.terminated.length > 0 && (
          <div className="card bg-red-50 border border-red-200">
            <div className="card-body p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sm flex items-center gap-2 text-red-700">
                  <XCircle size={15} className="text-red-500" /> Fell Apart / Canceled Deals
                </h2>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-red-400">{stats.terminated.length} deal{stats.terminated.length !== 1 ? 's' : ''} · {formatCurrency(stats.totalTerminatedVolume)} lost volume</span>
                  <button onClick={() => { onGoToDeals(); }} className="btn btn-error btn-xs">View in List →</button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                {stats.terminated.slice(0, 8).map((deal: any) => (
                  <div
                    key={deal.id}
                    className="flex items-center gap-2 p-2 rounded-lg bg-white border border-red-200 cursor-pointer hover:bg-red-50"
                    onClick={() => { onSelectDeal(deal.id); onGoToDeals(); }}
                  >
                    <XCircle size={14} className="text-red-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{deal.propertyAddress}</p>
                      <p className="text-[10px] text-base-content/40">{deal.agentName} · {formatCurrency(deal.contractPrice)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── MILESTONE FUNNEL ── */}
        {stats.milestoneFunnel.length > 0 && (
          <div className="card bg-base-200 border border-base-300">
            <div className="card-body p-4">
              <h3 className="font-bold text-sm text-black mb-3 flex items-center gap-2">
                <Target size={14} className="text-primary" /> Deals by Milestone
              </h3>
              <div className="space-y-2">
                {stats.milestoneFunnel.map(({ milestone, count }) => (
                  <div key={milestone} className="flex items-center gap-3">
                    <span className="text-xs text-black w-36 truncate flex-none">{MILESTONE_LABELS[milestone]}</span>
                    <div className="flex-1 bg-base-300 rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{ width: `${Math.max(8, (count / (stats.active.length || 1)) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-black w-5 text-right flex-none">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── CHECKLIST HEALTH + CLOSING TIMELINE ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Checklist Health */}
          <div className="card bg-base-200 border border-base-300">
            <div className="card-body p-4">
              <h2 className="font-semibold text-sm flex items-center gap-2 mb-3">
                <Target size={15} className="text-success" /> Checklist Health
              </h2>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-xs text-base-content/60">Due Diligence</span>
                    <span className={`text-xs font-bold ${stats.ddPct >= 80 ? 'text-success' : stats.ddPct >= 50 ? 'text-warning' : 'text-error'}`}>
                      {stats.ddPct}%
                    </span>
                  </div>
                  <ProgressBar value={stats.ddPct} max={100} color={stats.ddPct >= 80 ? 'bg-success' : stats.ddPct >= 50 ? 'bg-warning' : 'bg-error'} />
                </div>
                <div>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-xs text-base-content/60">Compliance</span>
                    <span className={`text-xs font-bold ${stats.compPct >= 80 ? 'text-success' : stats.compPct >= 50 ? 'text-warning' : 'text-error'}`}>
                      {stats.compPct}%
                    </span>
                  </div>
                  <ProgressBar value={stats.compPct} max={100} color={stats.compPct >= 80 ? 'bg-success' : stats.compPct >= 50 ? 'bg-warning' : 'bg-error'} />
                </div>
                <div className="divider my-1 text-[10px] text-base-content/30">Overdue Items</div>
                {stats.overdueItems.length === 0 ? (
                  <p className="text-xs text-success text-center">✓ No overdue items</p>
                ) : (
                  <div className="flex items-center justify-between bg-error/10 border border-error/30 rounded-lg p-2">
                    <span className="text-xs text-error font-medium">⚠ {stats.overdueItems.length} overdue</span>
                    <button onClick={onGoToDeals} className="btn btn-error btn-xs">Review</button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Closing Timeline */}
          <div className="card bg-base-200 border border-base-300 col-span-1 lg:col-span-2">
            <div className="card-body p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <Calendar size={15} className="text-primary" /> Closing Timeline — Next 30 Days
                </h2>
                <span className="text-xs text-base-content/50">{stats.closingSoon.length} deals</span>
              </div>
              {stats.closingSoon.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-24 text-base-content/30 gap-2">
                  <Calendar size={24} />
                  <span className="text-xs">No closings in the next 30 days</span>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {stats.closingSoon.map((deal: any) => {
                    const urgency   = deal.daysLeft <= 3 ? 'text-error' : deal.daysLeft <= 7 ? 'text-warning' : 'text-success';
                    const bgUrgency = deal.daysLeft <= 3 ? 'bg-error/10 border-error/30' : deal.daysLeft <= 7 ? 'bg-warning/10 border-warning/30' : 'bg-base-300/60 border-transparent';
                    const meta = STATUS_META[deal.status as DealStatus];
                    return (
                      <div
                        key={deal.id}
                        className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer hover:opacity-90 transition-all ${bgUrgency}`}
                        onClick={() => { onSelectDeal(deal.id); onGoToDeals(); }}
                      >
                        <div className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center shrink-0 ${deal.daysLeft <= 3 ? 'bg-error/20' : deal.daysLeft <= 7 ? 'bg-warning/20' : 'bg-base-300'}`}>
                          <span className={`text-sm font-black leading-none ${urgency}`}>{deal.daysLeft}</span>
                          <span className="text-[8px] text-base-content/40 leading-none">days</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{deal.propertyAddress}, {deal.city}, {deal.state}</p>
                          <p className="text-[10px] text-base-content/50">{deal.agentName} · {formatCurrency(deal.contractPrice)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-[10px] font-medium ${meta.color}`}>{meta.label}</p>
                          <p className="text-[10px] text-base-content/40">{formatDate(deal.closingDate)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── STATES + AGENTS + PROPERTY TYPES ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

          {/* By State */}
          <div className="card bg-base-200 border border-base-300">
            <div className="card-body p-4">
              <h2 className="font-semibold text-sm flex items-center gap-2 mb-3">
                <MapPin size={15} className="text-accent" /> Active Deals by State
              </h2>
              {stats.stateList.length === 0 ? (
                <p className="text-xs text-base-content/40 text-center py-4">No active deals</p>
              ) : (
                <div className="space-y-2">
                  {stats.stateList.map(([state, { count, volume }]) => (
                    <div key={state} className="flex items-center gap-2">
                      <span className="badge badge-outline badge-sm w-8 justify-center shrink-0 font-mono">{state}</span>
                      <div className="flex-1">
                        <ProgressBar value={count} max={stats.stateList[0][1].count} color="bg-accent" />
                      </div>
                      <span className="text-xs text-base-content/50 w-6 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* By Agent */}
          <div className="card bg-base-200 border border-base-300">
            <div className="card-body p-4">
              <h2 className="font-semibold text-sm flex items-center gap-2 mb-3">
                <Users size={15} className="text-secondary" /> Active Deals by Agent
              </h2>
              {stats.agentList.length === 0 ? (
                <p className="text-xs text-base-content/40 text-center py-4">No active deals</p>
              ) : (
                <div className="space-y-2">
                  {stats.agentList.slice(0, 6).map(([agent, { count, volume }], i) => (
                    <div key={agent} className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-secondary/20 flex items-center justify-center shrink-0">
                        <span className="text-[9px] font-bold text-secondary">{i + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{agent}</p>
                        <p className="text-[10px] text-base-content/40">{formatCurrency(volume)}</p>
                      </div>
                      <span className="badge badge-secondary badge-sm">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* By Property Type */}
          <div className="card bg-base-200 border border-base-300">
            <div className="card-body p-4">
              <h2 className="font-semibold text-sm flex items-center gap-2 mb-3">
                <Home size={15} className="text-info" /> Property Types
              </h2>
              {Object.keys(stats.byType).length === 0 ? (
                <p className="text-xs text-base-content/40 text-center py-4">No active deals</p>
              ) : (
                <div className="space-y-2">
                  {(Object.entries(stats.byType) as [string, number][])
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, count]) => {
                      const total = stats.active.length;
                      return (
                        <div key={type} className="flex items-center gap-2">
                          <span className="text-xs text-base-content/60 w-28 shrink-0">{typeLabel[type] || type}</span>
                          <div className="flex-1">
                            <ProgressBar value={count as number} max={total} color="bg-info" />
                          </div>
                          <span className="text-xs text-base-content/50 w-6 text-right">{count}</span>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── REMINDERS + RECENT ACTIVITY ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-6">

          {/* Today's Reminders */}
          <div className="card bg-base-200 border border-base-300">
            <div className="card-body p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <Clock size={15} className="text-warning" /> Due Today &amp; Overdue
                </h2>
                {stats.todayReminders.length > 0 && (
                  <span className="badge badge-warning badge-sm">{stats.todayReminders.length}</span>
                )}
              </div>
              {stats.todayReminders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-20 gap-2 text-base-content/30">
                  <Clock size={22} />
                  <span className="text-xs">No reminders due today</span>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {stats.todayReminders.map((r: any) => (
                    <div
                      key={r.id}
                      className="flex items-start gap-2 p-2 rounded-md bg-warning/8 border border-warning/25 cursor-pointer hover:bg-warning/15"
                      onClick={() => { onSelectDeal(r.dealId); onGoToDeals(); }}
                    >
                      <Clock size={12} className="text-warning mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">{r.title}</p>
                        <p className="text-[10px] text-base-content/40 truncate">{r.dealAddress}</p>
                      </div>
                      <span className="text-[10px] text-warning/70 shrink-0">{r.dueDate}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent Activity Feed — live from DB when loaded, fallback to in-memory */}
          <div className="card bg-base-200 border border-base-300">
            <div className="card-body p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <Activity size={15} className="text-primary" /> Recent Activity
                </h2>
                {liveLoaded && liveActivity.length > 0 && (
                  <span className="badge badge-primary badge-xs badge-outline">Live</span>
                )}
              </div>

              {/* Live DB activity */}
              {liveLoaded && liveActivity.length > 0 ? (
                <div className="space-y-1 max-h-52 overflow-y-auto">
                  {liveActivity.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-start gap-2 p-1.5 rounded-md hover:bg-base-300/60 cursor-pointer"
                      onClick={() => {
                        if (entry.dealId) { onSelectDeal(entry.dealId); onGoToDeals(); }
                      }}
                    >
                      <div className={`w-5 h-5 rounded-full bg-base-300 flex items-center justify-center shrink-0 mt-0.5 text-xs ${LIVE_ACTIVITY_COLORS[entry.type]}`}>
                        {entry.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium leading-tight truncate">{entry.action}</p>
                        {entry.dealAddress && (
                          <p className="text-[10px] text-base-content/40 truncate">{entry.dealAddress}</p>
                        )}
                      </div>
                      <span className="text-[10px] text-base-content/30 shrink-0 whitespace-nowrap">
                        {new Date(entry.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  ))}
                </div>
              ) : !liveLoaded ? (
                <div className="flex items-center justify-center h-20 gap-2 text-base-content/30">
                  <span className="loading loading-spinner loading-sm" />
                  <span className="text-xs">Loading activity...</span>
                </div>
              ) : stats.recentActivity.length === 0 ? (
                <p className="text-xs text-base-content/40 text-center py-4">No recent activity</p>
              ) : (
                /* Fallback: in-memory activity log */
                <div className="space-y-1 max-h-52 overflow-y-auto">
                  {stats.recentActivity.map((entry: any) => (
                    <div
                      key={entry.id}
                      className="flex items-start gap-2 p-1.5 rounded-md hover:bg-base-300/60 cursor-pointer"
                      onClick={() => { onSelectDeal(entry.dealId); onGoToDeals(); }}
                    >
                      <div className={`w-5 h-5 rounded-full bg-base-300 flex items-center justify-center shrink-0 mt-0.5 ${ACTIVITY_COLORS[entry.type] || 'text-base-content/40'}`}>
                        {ACTIVITY_ICONS[entry.type] || <Activity size={10} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium leading-tight">{entry.action}</p>
                        <p className="text-[10px] text-base-content/40 truncate">{entry.dealAddress} · {entry.user}</p>
                      </div>
                      <span className="text-[10px] text-base-content/30 shrink-0 whitespace-nowrap">
                        {new Date(entry.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
