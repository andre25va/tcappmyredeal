import { useAuth } from '../lib/auth';
import React, { useState, useEffect } from 'react';
import {
  Plus, X, FileText, Edit3, ChevronDown, ChevronRight,
  Loader2, CheckCircle2, AlertTriangle, Save, Calendar,
  Hash, Type, AlignLeft, Sparkles, Trash2,
} from 'lucide-react';
import { Deal } from '../types';
import { supabase } from '../lib/supabase';
import { generateId, formatDateTime } from '../utils/helpers';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Amendment {
  id: string;
  deal_id: string;
  amendment_number: number;
  amendment_date: string;
  amendment_type: 'price' | 'date' | 'condition' | 'financing' | 'other';
  description: string;
  new_values: Record<string, string>;
  document_id?: string;
  document_name?: string;
  created_at: string;
  created_by?: string;
}

const AMENDMENT_TYPES: { value: Amendment['amendment_type']; label: string; color: string }[] = [
  { value: 'price',     label: 'Price Change',    color: 'bg-success/15 text-success' },
  { value: 'date',      label: 'Date Change',     color: 'bg-info/15 text-info' },
  { value: 'condition', label: 'Condition',       color: 'bg-warning/15 text-warning' },
  { value: 'financing', label: 'Financing',       color: 'bg-primary/15 text-primary' },
  { value: 'other',     label: 'Other',           color: 'bg-base-300 text-base-content/60' },
];

const FIELD_OPTIONS = [
  { key: 'contractPrice', label: 'Contract Price' },
  { key: 'closingDate', label: 'Closing Date' },
  { key: 'earnestMoney', label: 'Earnest Money' },
  { key: 'inspectionDeadline', label: 'Inspection Deadline' },
  { key: 'loanCommitmentDate', label: 'Loan Commitment Date' },
  { key: 'possessionDate', label: 'Possession Date' },
  { key: 'sellerConcessions', label: 'Seller Concessions' },
  { key: 'homeWarranty', label: 'Home Warranty' },
  { key: 'asIsSale', label: 'As-Is Sale' },
  { key: 'inspectionWaived', label: 'Inspection Waived' },
  { key: 'loanAmount', label: 'Loan Amount' },
  { key: 'other', label: 'Other (custom)' },
];

interface Props {
  deal: Deal;
  onUpdate: (d: Deal) => void;
}

// ─── Amendment Form ───────────────────────────────────────────────────────────
interface AmendmentFormProps {
  dealId: string;
  nextNumber: number;
  existing?: Amendment;
  onSave: (a: Amendment) => void;
  onClose: () => void;
}

function AmendmentForm({ dealId, nextNumber, existing, onSave, onClose }: AmendmentFormProps) {
  const { profile } = useAuth();
  const userName = profile?.full_name || profile?.name || 'TC Staff';
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<Partial<Amendment>>(existing ?? {
    amendment_number: nextNumber,
    amendment_date: today,
    amendment_type: 'price',
    description: '',
    new_values: {},
  });
  const [newValuePairs, setNewValuePairs] = useState<{ key: string; label: string; value: string }[]>(
    Object.entries(existing?.new_values ?? {}).map(([k, v]) => ({
      key: k,
      label: FIELD_OPTIONS.find(f => f.key === k)?.label ?? k,
      value: v,
    }))
  );
  const [saving, setSaving] = useState(false);

  const f = (k: keyof Amendment) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value as any }));

  const addValuePair = () => {
    setNewValuePairs(p => [...p, { key: 'contractPrice', label: 'Contract Price', value: '' }]);
  };

  const updatePair = (i: number, field: 'key' | 'value', val: string) => {
    setNewValuePairs(p => p.map((pair, idx) => {
      if (idx !== i) return pair;
      if (field === 'key') {
        const opt = FIELD_OPTIONS.find(o => o.key === val);
        return { key: val, label: opt?.label ?? val, value: pair.value };
      }
      return { ...pair, value: val };
    }));
  };

  const removePair = (i: number) => setNewValuePairs(p => p.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (!form.amendment_date || !form.description?.trim()) return;
    setSaving(true);
    const new_values: Record<string, string> = {};
    newValuePairs.forEach(p => { if (p.key && p.value) new_values[p.key] = p.value; });

    const amendment: Amendment = {
      id: existing?.id ?? generateId(),
      deal_id: dealId,
      amendment_number: form.amendment_number ?? nextNumber,
      amendment_date: form.amendment_date ?? today,
      amendment_type: form.amendment_type ?? 'other',
      description: form.description?.trim() ?? '',
      new_values,
      created_at: existing?.created_at ?? new Date().toISOString(),
      created_by: existing?.created_by ?? userName,
    };

    const { error } = existing
      ? await supabase.from('deal_amendments').update(amendment).eq('id', amendment.id)
      : await supabase.from('deal_amendments').insert(amendment);

    setSaving(false);
    if (error) { alert('Save failed: ' + error.message); return; }
    onSave(amendment);
    onClose();
  };

  const typeObj = AMENDMENT_TYPES.find(t => t.value === form.amendment_type);

  return (
    <div className="fixed inset-0 z-50 flex bg-black/50 backdrop-blur-sm">
      <div className="m-auto bg-base-100 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-base-300 flex-none">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-primary" />
            <span className="font-semibold">{existing ? 'Edit Amendment' : 'Add Amendment / Addendum'}</span>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle"><X size={15} /></button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-4 space-y-4 flex-1">

          {/* Number + Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-base-content/50 mb-1 flex items-center gap-1"><Hash size={11} /> Amendment #</label>
              <input type="number" className="input input-sm input-bordered w-full" value={form.amendment_number ?? nextNumber}
                onChange={e => setForm(p => ({ ...p, amendment_number: parseInt(e.target.value) || 1 }))} min={1} />
            </div>
            <div>
              <label className="text-xs text-base-content/50 mb-1 flex items-center gap-1"><Calendar size={11} /> Date *</label>
              <input type="date" className="input input-sm input-bordered w-full" value={form.amendment_date ?? today} onChange={f('amendment_date')} />
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="text-xs text-base-content/50 mb-2 flex items-center gap-1"><Type size={11} /> Type</label>
            <div className="flex flex-wrap gap-2">
              {AMENDMENT_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, amendment_type: t.value }))}
                  className={`btn btn-sm rounded-full ${form.amendment_type === t.value ? t.color + ' font-semibold border-transparent' : 'btn-ghost border border-base-300'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-base-content/50 mb-1 flex items-center gap-1"><AlignLeft size={11} /> Description *</label>
            <textarea
              className="textarea textarea-bordered w-full text-sm resize-none"
              rows={3}
              value={form.description ?? ''}
              onChange={f('description')}
              placeholder="Describe the changes in this amendment…"
            />
          </div>

          {/* Changed Values */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-base-content/50 flex items-center gap-1"><Sparkles size={11} /> Updated Field Values</label>
              <button type="button" onClick={addValuePair} className="btn btn-ghost btn-xs gap-1">
                <Plus size={11} /> Add Field
              </button>
            </div>
            {newValuePairs.length === 0 ? (
              <p className="text-xs text-base-content/30 italic">No specific field changes tracked yet</p>
            ) : (
              <div className="space-y-2">
                {newValuePairs.map((pair, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      className="select select-xs select-bordered flex-1"
                      value={pair.key}
                      onChange={e => updatePair(i, 'key', e.target.value)}
                    >
                      {FIELD_OPTIONS.map(o => (
                        <option key={o.key} value={o.key}>{o.label}</option>
                      ))}
                    </select>
                    <input
                      className="input input-xs input-bordered flex-1"
                      placeholder="New value"
                      value={pair.value}
                      onChange={e => updatePair(i, 'value', e.target.value)}
                    />
                    <button onClick={() => removePair(i)} className="btn btn-ghost btn-xs btn-circle text-error/60"><X size={11} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-base-300 flex-none">
          <button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !form.amendment_date || !form.description?.trim()}
            className="btn btn-primary btn-sm gap-1.5"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {existing ? 'Update Amendment' : 'Save Amendment'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Amendment Card ───────────────────────────────────────────────────────────
interface CardProps {
  amendment: Amendment;
  onEdit: () => void;
  onDelete: () => void;
}

function AmendmentCard({ amendment, onEdit, onDelete }: CardProps) {
  const [expanded, setExpanded] = useState(false);
  const typeObj = AMENDMENT_TYPES.find(t => t.value === amendment.amendment_type);
  const hasValues = Object.keys(amendment.new_values ?? {}).length > 0;

  return (
    <div className="rounded-xl border border-base-300 bg-base-100 overflow-hidden group">
      <div className="flex items-center gap-3 p-3">
        {/* Number bubble */}
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-none">
          <span className="text-sm font-bold text-primary">#{amendment.amendment_number}</span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${typeObj?.color ?? 'bg-base-300 text-base-content/60'}`}>
              {typeObj?.label ?? amendment.amendment_type}
            </span>
            <span className="text-xs text-base-content/40">
              {new Date(amendment.amendment_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
          <p className="text-sm text-base-content mt-0.5 truncate">{amendment.description}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {hasValues && (
            <button
              onClick={() => setExpanded(p => !p)}
              className="btn btn-ghost btn-xs btn-circle"
              title="Show field changes"
            >
              {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          )}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={onEdit} className="btn btn-ghost btn-xs btn-circle" title="Edit"><Edit3 size={12} /></button>
            <button onClick={onDelete} className="btn btn-ghost btn-xs btn-circle text-error/60 hover:text-error" title="Delete"><Trash2 size={12} /></button>
          </div>
        </div>
      </div>

      {/* Expanded: field changes */}
      {expanded && hasValues && (
        <div className="border-t border-base-300 px-3 py-2 bg-base-200/50">
          <p className="text-xs text-base-content/40 font-semibold uppercase mb-1.5">Field Changes</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            {Object.entries(amendment.new_values).map(([key, val]) => {
              const opt = FIELD_OPTIONS.find(o => o.key === key);
              return (
                <div key={key} className="flex items-center justify-between text-xs py-0.5">
                  <span className="text-base-content/50">{opt?.label ?? key}:</span>
                  <span className="font-medium text-base-content">{val}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function WorkspaceAmendments({ deal, onUpdate }: Props) {
  const { profile } = useAuth();
  const userName = profile?.full_name || profile?.name || 'TC Staff';
  const [amendments, setAmendments] = useState<Amendment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAmendment, setEditingAmendment] = useState<Amendment | undefined>();

  useEffect(() => {
    loadAmendments();
  }, [deal.id]);

  const loadAmendments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('deal_amendments')
      .select('*')
      .eq('deal_id', deal.id)
      .order('amendment_number', { ascending: true });

    if (!error && data) setAmendments(data as Amendment[]);
    setLoading(false);
  };

  const handleSave = (a: Amendment) => {
    setAmendments(prev => {
      const exists = prev.find(x => x.id === a.id);
      if (exists) return prev.map(x => x.id === a.id ? a : x);
      return [...prev, a].sort((x, y) => x.amendment_number - y.amendment_number);
    });
  };

  const handleDelete = async (amendment: Amendment) => {
    if (!confirm(`Delete Amendment #${amendment.amendment_number}? This cannot be undone.`)) return;
    const { error } = await supabase.from('deal_amendments').delete().eq('id', amendment.id);
    if (error) { alert('Delete failed: ' + error.message); return; }
    setAmendments(prev => prev.filter(a => a.id !== amendment.id));
  };

  const nextNumber = (amendments.length > 0 ? Math.max(...amendments.map(a => a.amendment_number)) : 0) + 1;

  return (
    <div className="p-4 space-y-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-base-content">Amendments &amp; Addendums</h3>
          <p className="text-xs text-base-content/40 mt-0.5">Track all changes to the original purchase agreement</p>
        </div>
        <button
          onClick={() => { setEditingAmendment(undefined); setShowForm(true); }}
          className="btn btn-primary btn-sm gap-1"
        >
          <Plus size={13} /> Add Amendment
        </button>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-base-content/30">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : amendments.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-base-300 p-8 text-center space-y-2">
          <FileText size={28} className="mx-auto text-base-content/20" />
          <p className="font-medium text-base-content/50">No amendments yet</p>
          <p className="text-xs text-base-content/30">Track price changes, date extensions, condition removals, and more</p>
          <button
            onClick={() => { setEditingAmendment(undefined); setShowForm(true); }}
            className="btn btn-ghost btn-sm gap-1 mt-2"
          >
            <Plus size={13} /> Add First Amendment
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {amendments.map(a => (
            <AmendmentCard
              key={a.id}
              amendment={a}
              onEdit={() => { setEditingAmendment(a); setShowForm(true); }}
              onDelete={() => handleDelete(a)}
            />
          ))}
        </div>
      )}

      {/* Summary stats */}
      {amendments.length > 0 && (
        <div className="rounded-xl bg-base-200/50 border border-base-300 p-3 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-lg font-bold text-base-content">{amendments.length}</p>
            <p className="text-xs text-base-content/40">Total</p>
          </div>
          <div>
            <p className="text-lg font-bold text-base-content">
              {amendments.filter(a => a.amendment_type === 'price').length}
            </p>
            <p className="text-xs text-base-content/40">Price Changes</p>
          </div>
          <div>
            <p className="text-lg font-bold text-base-content">
              {amendments.filter(a => a.amendment_type === 'date').length}
            </p>
            <p className="text-xs text-base-content/40">Date Changes</p>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <AmendmentForm
          dealId={deal.id}
          nextNumber={nextNumber}
          existing={editingAmendment}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditingAmendment(undefined); }}
        />
      )}
    </div>
  );
}
