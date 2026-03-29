import React, { useState, useEffect, useCallback } from 'react';
import { LoadingSpinner } from './ui/LoadingSpinner';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  MoreVertical,
  Trash2,
  Edit3,
  CalendarClock,
  Ban,
  ChevronDown,
  X,
  Loader2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Deal } from '../types';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Milestone {
  id: string;
  deal_id: string;
  milestone: string;
  label: string;
  due_date: string | null;
  status: 'pending' | 'completed' | 'waived' | 'extended';
  completed_at: string | null;
  completed_by: string | null;
  extended_to: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface Props {
  deal: Deal;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function toDateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysDiff(target: string): number {
  const today = toDateOnly(new Date());
  const t = new Date(target + 'T00:00:00');
  return Math.round((t.getTime() - today.getTime()) / 86_400_000);
}

function effectiveDate(m: Milestone): string | null {
  if (m.status === 'extended' && m.extended_to) return m.extended_to;
  return m.due_date;
}

type Urgency = 'overdue' | 'today' | 'approaching' | 'ontrack' | 'completed' | 'waived' | 'extended';

function getUrgency(m: Milestone): Urgency {
  if (m.status === 'completed') return 'completed';
  if (m.status === 'waived') return 'waived';
  const ed = effectiveDate(m);
  if (!ed) return 'ontrack';
  const diff = daysDiff(ed);
  if (m.status === 'extended') return 'extended';
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 6) return 'approaching';
  return 'ontrack';
}

const URGENCY_DOT: Record<Urgency, string> = {
  overdue: 'bg-error',
  today: 'bg-warning',
  approaching: 'bg-yellow-400',
  ontrack: 'bg-success',
  completed: 'bg-info',
  waived: 'bg-base-300',
  extended: 'bg-secondary',
};

const URGENCY_TEXT_COLOR: Record<Urgency, string> = {
  overdue: 'text-error',
  today: 'text-warning',
  approaching: 'text-yellow-500',
  ontrack: 'text-success',
  completed: 'text-info',
  waived: 'text-base-content/50',
  extended: 'text-secondary',
};

function daysLabel(m: Milestone): string | null {
  if (m.status === 'completed' || m.status === 'waived') return null;
  const ed = effectiveDate(m);
  if (!ed) return null;
  const diff = daysDiff(ed);
  if (diff < 0) return `${Math.abs(diff)} day${Math.abs(diff) !== 1 ? 's' : ''} overdue`;
  if (diff === 0) return 'Due today';
  return `${diff} day${diff !== 1 ? 's' : ''} left`;
}

function statusBadge(m: Milestone) {
  const map: Record<string, string> = {
    pending: 'badge-ghost',
    completed: 'badge-info',
    waived: 'badge-ghost opacity-60',
    extended: 'badge-secondary',
  };
  return (
    <span className={`badge badge-sm ${map[m.status] ?? 'badge-ghost'}`}>
      {m.status}
    </span>
  );
}

const PRESET_MILESTONES = [
  { milestone: 'inspection', label: 'Inspection Deadline' },
  { milestone: 'appraisal', label: 'Appraisal Deadline' },
  { milestone: 'financing', label: 'Financing Deadline' },
  { milestone: 'title_commitment', label: 'Title Commitment' },
  { milestone: 'survey', label: 'Survey' },
  { milestone: 'hoa_docs', label: 'HOA Docs' },
  { milestone: 'home_warranty', label: 'Home Warranty' },
  { milestone: 'closing', label: 'Closing Date' },
  { milestone: 'custom', label: 'Custom…' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function WorkspaceTimeline({ deal }: Props) {
  const { profile } = useAuth();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  // Add-new state
  const [showAdd, setShowAdd] = useState(false);
  const [addPreset, setAddPreset] = useState<string | null>(null);
  const [addLabel, setAddLabel] = useState('');
  const [addDate, setAddDate] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  // Inline action state
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [extendingId, setExtendingId] = useState<string | null>(null);
  const [extendDate, setExtendDate] = useState('');

  /* ---- Fetch ---- */
  const fetchMilestones = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('deal_timeline')
      .select('*')
      .eq('deal_id', deal.id)
      .order('sort_order', { ascending: true })
      .order('due_date', { ascending: true });
    if (err) {
      setError(err.message);
    } else {
      setMilestones(data as Milestone[]);
    }
    setLoading(false);
  }, [deal.id]);

  useEffect(() => {
    fetchMilestones();
  }, [fetchMilestones]);

  /* ---- Seed from deal dates ---- */
  const seedMilestones = async () => {
    setSeeding(true);
    setError(null);
    const seeds: { milestone: string; label: string; due_date: string }[] = [];
    // Some date fields exist in the DB but not the Deal TypeScript interface — cast to access them
    const d = deal as Record<string, any>;
    const map: [string | undefined, string, string][] = [
      [d.contractDate, 'contract', 'Contract Date'],
      [d.optionPeriodEnd ?? d.option_period_end, 'option_period', 'Option Period End'],
      [d.inspectionDate ?? d.inspection_date, 'inspection', 'Inspection Deadline'],
      [d.appraisalDate ?? d.appraisal_date, 'appraisal', 'Appraisal Deadline'],
      [d.financeDeadline ?? d.finance_deadline, 'financing', 'Financing Deadline'],
      [d.closingDate, 'closing', 'Closing Date'],
    ];
    map.forEach(([val, ms, lbl]) => {
      if (val) seeds.push({ milestone: ms, label: lbl, due_date: val });
    });

    if (seeds.length === 0) {
      setError('No date fields found on this deal to seed from.');
      setSeeding(false);
      return;
    }

    const rows = seeds.map((s, i) => ({
      deal_id: deal.id,
      milestone: s.milestone,
      label: s.label,
      due_date: s.due_date,
      status: 'pending',
      sort_order: (i + 1) * 10,
    }));

    const { error: err } = await supabase.from('deal_timeline').insert(rows);
    if (err) {
      setError(err.message);
    } else {
      await fetchMilestones();
    }
    setSeeding(false);
  };

  /* ---- Actions ---- */
  const completeMilestone = async (m: Milestone) => {
    const { error: err } = await supabase
      .from('deal_timeline')
      .update({ status: 'completed', completed_at: new Date().toISOString(), completed_by: profile?.id })
      .eq('id', m.id);
    if (err) setError(err.message);
    else await fetchMilestones();
    setMenuOpen(null);
  };

  const waiveMilestone = async (m: Milestone) => {
    const { error: err } = await supabase
      .from('deal_timeline')
      .update({ status: 'waived' })
      .eq('id', m.id);
    if (err) setError(err.message);
    else await fetchMilestones();
    setMenuOpen(null);
  };

  const submitExtend = async (m: Milestone) => {
    if (!extendDate) return;
    const { error: err } = await supabase
      .from('deal_timeline')
      .update({ status: 'extended', extended_to: extendDate })
      .eq('id', m.id);
    if (err) setError(err.message);
    else await fetchMilestones();
    setExtendingId(null);
    setExtendDate('');
    setMenuOpen(null);
  };

  const startEdit = (m: Milestone) => {
    setEditingId(m.id);
    setEditLabel(m.label);
    setEditDate(m.due_date ?? '');
    setEditNotes(m.notes ?? '');
    setMenuOpen(null);
  };

  const submitEdit = async (m: Milestone) => {
    const { error: err } = await supabase
      .from('deal_timeline')
      .update({ label: editLabel, due_date: editDate || null, notes: editNotes || null })
      .eq('id', m.id);
    if (err) setError(err.message);
    else await fetchMilestones();
    setEditingId(null);
  };

  const deleteMilestone = async (m: Milestone) => {
    if (!window.confirm(`Delete milestone "${m.label}"?`)) return;
    const { error: err } = await supabase.from('deal_timeline').delete().eq('id', m.id);
    if (err) setError(err.message);
    else await fetchMilestones();
    setMenuOpen(null);
  };

  /* ---- Add milestone ---- */
  const submitAdd = async () => {
    if (!addPreset) return;
    const label = addPreset === 'custom' ? addLabel.trim() : PRESET_MILESTONES.find(p => p.milestone === addPreset)?.label ?? addPreset;
    if (!label) { setError('Please enter a label.'); return; }

    setAddSaving(true);
    const maxSort = milestones.length > 0 ? Math.max(...milestones.map(m => m.sort_order)) : 0;
    const { error: err } = await supabase.from('deal_timeline').insert({
      deal_id: deal.id,
      milestone: addPreset === 'custom' ? 'custom' : addPreset,
      label,
      due_date: addDate || null,
      status: 'pending',
      sort_order: maxSort + 10,
    });
    if (err) setError(err.message);
    else {
      await fetchMilestones();
      setShowAdd(false);
      setAddPreset(null);
      setAddLabel('');
      setAddDate('');
    }
    setAddSaving(false);
  };

  /* ---- Summary ---- */
  const total = milestones.length;
  const overdue = milestones.filter(m => getUrgency(m) === 'overdue').length;
  const approaching = milestones.filter(m => getUrgency(m) === 'approaching' || getUrgency(m) === 'today').length;
  const completed = milestones.filter(m => m.status === 'completed').length;

  /* ---- Render ---- */
  if (loading) {
    return (
      <LoadingSpinner />
    );
  }

  return (
    <div className="space-y-4">
      {/* Error toast */}
      {error && (
        <div className="alert alert-error shadow-sm">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm">{error}</span>
          <button className="btn btn-ghost btn-xs" onClick={() => setError(null)}>
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Empty state / seed prompt */}
      {milestones.length === 0 && !loading && (
        <div className="card bg-base-200 border border-base-300">
          <div className="card-body items-center text-center py-10">
            <CalendarClock className="w-10 h-10 text-base-content/30 mb-2" />
            <h3 className="font-semibold text-base-content">No milestones yet</h3>
            <p className="text-sm text-base-content/60 mb-4">
              Seed from deal dates to get started, or add milestones manually.
            </p>
            <div className="flex gap-2">
              <button className="btn btn-primary btn-sm" onClick={seedMilestones} disabled={seeding}>
                {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
                Seed from Deal Dates
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(true)}>
                <Plus className="w-4 h-4" /> Add Manually
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary bar */}
      {milestones.length > 0 && (
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="badge badge-ghost">{total} milestone{total !== 1 ? 's' : ''}</span>
          {overdue > 0 && <span className="badge badge-error badge-outline">{overdue} overdue</span>}
          {approaching > 0 && <span className="badge badge-warning badge-outline">{approaching} approaching</span>}
          <span className="badge badge-info badge-outline">{completed} completed</span>
        </div>
      )}

      {/* Milestone list */}
      <div className="space-y-2">
        {milestones.map((m) => {
          const urgency = getUrgency(m);
          const days = daysLabel(m);
          const isEditing = editingId === m.id;
          const isExtending = extendingId === m.id;

          return (
            <div
              key={m.id}
              className={`card bg-base-100 border border-base-300 ${
                m.status === 'waived' ? 'opacity-60' : ''
              }`}
            >
              <div className="card-body p-3 sm:p-4">
                {isEditing ? (
                  /* ---- Edit mode ---- */
                  <div className="space-y-2">
                    <input
                      type="text"
                      className="input input-bordered input-sm w-full"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      placeholder="Label"
                    />
                    <input
                      type="date"
                      className="input input-bordered input-sm w-full"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                    />
                    <textarea
                      className="textarea textarea-bordered textarea-sm w-full"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Notes (optional)"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button className="btn btn-primary btn-sm" onClick={() => submitEdit(m)}>
                        Save
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ---- Display mode ---- */
                  <div className="flex items-start gap-3">
                    {/* Urgency dot */}
                    <div className="pt-1.5">
                      <div className={`w-2.5 h-2.5 rounded-full ${URGENCY_DOT[urgency]}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`font-semibold text-sm ${m.status === 'completed' ? 'line-through text-base-content/50' : ''}`}>
                          {m.label}
                        </span>
                        {statusBadge(m)}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-base-content/60">
                        {m.due_date && <span>{fmtDate(m.due_date)}</span>}
                        {m.status === 'extended' && m.extended_to && (
                          <span className="text-secondary">→ Extended to {fmtDate(m.extended_to)}</span>
                        )}
                        {days && (
                          <span className={`font-medium ${URGENCY_TEXT_COLOR[urgency]}`}>{days}</span>
                        )}
                      </div>
                      {m.notes && (
                        <p className="text-xs text-base-content/50 mt-1 whitespace-pre-wrap">{m.notes}</p>
                      )}

                      {/* Extend inline form */}
                      {isExtending && (
                        <div className="flex items-center gap-2 mt-2">
                          <input
                            type="date"
                            className="input input-bordered input-xs"
                            value={extendDate}
                            onChange={(e) => setExtendDate(e.target.value)}
                          />
                          <button className="btn btn-secondary btn-xs" onClick={() => submitExtend(m)}>
                            Extend
                          </button>
                          <button
                            className="btn btn-ghost btn-xs"
                            onClick={() => { setExtendingId(null); setExtendDate(''); }}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Actions menu */}
                    <div className="relative">
                      <button
                        className="btn btn-ghost btn-xs btn-square"
                        onClick={() => setMenuOpen(menuOpen === m.id ? null : m.id)}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {menuOpen === m.id && (
                        <ul className="menu menu-sm bg-base-200 rounded-box shadow-lg absolute right-0 top-8 z-20 w-40 border border-base-300">
                          {m.status === 'pending' && (
                            <>
                              <li>
                                <button onClick={() => completeMilestone(m)}>
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Complete
                                </button>
                              </li>
                              <li>
                                <button onClick={() => waiveMilestone(m)}>
                                  <Ban className="w-3.5 h-3.5" /> Waive
                                </button>
                              </li>
                              <li>
                                <button onClick={() => { setExtendingId(m.id); setMenuOpen(null); }}>
                                  <CalendarClock className="w-3.5 h-3.5" /> Extend
                                </button>
                              </li>
                            </>
                          )}
                          {m.status === 'extended' && (
                            <>
                              <li>
                                <button onClick={() => completeMilestone(m)}>
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Complete
                                </button>
                              </li>
                              <li>
                                <button onClick={() => waiveMilestone(m)}>
                                  <Ban className="w-3.5 h-3.5" /> Waive
                                </button>
                              </li>
                              <li>
                                <button onClick={() => { setExtendingId(m.id); setMenuOpen(null); }}>
                                  <CalendarClock className="w-3.5 h-3.5" /> Re-extend
                                </button>
                              </li>
                            </>
                          )}
                          <li>
                            <button onClick={() => startEdit(m)}>
                              <Edit3 className="w-3.5 h-3.5" /> Edit
                            </button>
                          </li>
                          <li>
                            <button className="text-error" onClick={() => deleteMilestone(m)}>
                              <Trash2 className="w-3.5 h-3.5" /> Delete
                            </button>
                          </li>
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add milestone */}
      {milestones.length > 0 && !showAdd && (
        <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(true)}>
          <Plus className="w-4 h-4" /> Add Milestone
        </button>
      )}

      {showAdd && (
        <div className="card bg-base-200 border border-base-300">
          <div className="card-body p-4 space-y-3">
            <h4 className="font-semibold text-sm">Add Milestone</h4>

            {/* Preset selector */}
            <div className="flex flex-wrap gap-1.5">
              {PRESET_MILESTONES.map((p) => (
                <button
                  key={p.milestone}
                  className={`btn btn-xs ${addPreset === p.milestone ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => {
                    setAddPreset(p.milestone);
                    if (p.milestone !== 'custom') setAddLabel(p.label);
                    else setAddLabel('');
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {addPreset && (
              <div className="space-y-2">
                {addPreset === 'custom' && (
                  <input
                    type="text"
                    className="input input-bordered input-sm w-full"
                    placeholder="Milestone label"
                    value={addLabel}
                    onChange={(e) => setAddLabel(e.target.value)}
                  />
                )}
                <input
                  type="date"
                  className="input input-bordered input-sm w-full"
                  value={addDate}
                  onChange={(e) => setAddDate(e.target.value)}
                />
                <div className="flex gap-2">
                  <button className="btn btn-primary btn-sm" onClick={submitAdd} disabled={addSaving}>
                    {addSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Add
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setShowAdd(false); setAddPreset(null); setAddLabel(''); setAddDate(''); }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
