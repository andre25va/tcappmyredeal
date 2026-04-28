import { useAuth } from '../contexts/AuthContext';
import React, { useState } from 'react';
import { useDealAmendments, useInvalidateDealAmendments } from '../hooks/useDealAmendments';
import {
  Plus, X, FileText, Edit3, ChevronDown, ChevronRight,
  Loader2, CheckCircle2, AlertTriangle, Save, Calendar,
  Hash, Type, AlignLeft, Sparkles, Trash2, Upload, RotateCcw,
} from 'lucide-react';
import { Deal } from '../types';
import { supabase } from '../lib/supabase';
import { generateId, formatDateTime } from '../utils/helpers';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { Button } from './ui/Button';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Amendment {
  id: string;
  deal_id: string;
  amendment_number: number;
  amendment_date: string;
  amendment_type: 'price' | 'date' | 'condition' | 'financing' | 'other';
  description: string;
  new_values: Record<string, string>;
  diff_status?: 'analyzed' | 'no_changes' | 'applied' | null;
  storage_path?: string;
  analyzed_at?: string;
  applied_at?: string;
  applied_by?: string;
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
  { key: 'buyerNames', label: 'Buyer Name(s)' },
  { key: 'sellerNames', label: 'Seller Name(s)' },
  { key: 'other', label: 'Other (custom)' },
];

// Fields that can be AI-detected and applied back to the deal record
const DIFF_FIELD_MAP = [
  { extractKey: 'contractPrice', dealProp: 'contractPrice', dbCol: 'purchase_price', label: 'Contract Price' },
  { extractKey: 'closingDate',   dealProp: 'closingDate',   dbCol: 'closing_date',   label: 'Closing Date' },
  { extractKey: 'earnestMoney',  dealProp: 'earnestMoney',  dbCol: 'earnest_money',  label: 'Earnest Money' },
  { extractKey: 'loanAmount',    dealProp: 'loanAmount',    dbCol: 'loan_amount',    label: 'Loan Amount' },
  { extractKey: 'buyerNames',    dealProp: 'buyerName',     dbCol: 'buyer_name',     label: 'Buyer Name(s)' },
  { extractKey: 'sellerNames',   dealProp: 'sellerName',    dbCol: 'seller_name',    label: 'Seller Name(s)' },
] as const;

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
  const userName = profile?.name || 'TC Staff';
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
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfUploading, setPdfUploading] = useState(false);

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

    const amendmentId = existing?.id ?? generateId();

    // Upload PDF if provided
    let storage_path: string | undefined = existing?.storage_path;
    if (pdfFile) {
      setPdfUploading(true);
      const path = `amendments/${dealId}/${amendmentId}.pdf`;
      const { error: uploadErr } = await supabase.storage
        .from('deal-documents')
        .upload(path, pdfFile, { upsert: true, contentType: 'application/pdf' });
      setPdfUploading(false);
      if (uploadErr) {
        alert('PDF upload failed: ' + uploadErr.message);
        setSaving(false);
        return;
      }
      storage_path = path;
    }

    const amendment: Amendment = {
      id: amendmentId,
      deal_id: dealId,
      amendment_number: form.amendment_number ?? nextNumber,
      amendment_date: form.amendment_date ?? today,
      amendment_type: form.amendment_type ?? 'other',
      description: form.description?.trim() ?? '',
      new_values,
      storage_path,
      diff_status: existing?.diff_status ?? null,
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
          <Button variant="ghost" className="btn-circle" onClick={onClose}><X size={15} /></Button>
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

          {/* Manual Field Values */}
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
                    <Button variant="ghost" size="xs" className="btn-circle text-error/60" onClick={() => removePair(i)}><X size={11} /></Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* PDF Upload */}
          <div className="border-t border-base-300 pt-4">
            <label className="text-xs text-base-content/50 mb-2 flex items-center gap-1">
              <Upload size={11} /> Attach Amendment PDF
              <span className="text-base-content/30 ml-1">(optional — enables AI diff analysis)</span>
            </label>
            {existing?.storage_path && !pdfFile ? (
              <div className="flex items-center gap-2 text-xs text-success">
                <FileText size={12} />
                <span>PDF already attached</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs text-base-content/40"
                  onClick={() => document.getElementById('amendment-pdf-input')?.click()}
                >
                  Replace
                </button>
              </div>
            ) : pdfFile ? (
              <div className="flex items-center gap-2 text-xs text-primary">
                <FileText size={12} />
                <span className="truncate max-w-xs">{pdfFile.name}</span>
                <button type="button" className="text-error/60 hover:text-error" onClick={() => setPdfFile(null)}>
                  <X size={11} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => document.getElementById('amendment-pdf-input')?.click()}
                className="btn btn-ghost btn-sm border border-dashed border-base-300 gap-1.5 w-full"
              >
                <Upload size={12} /> Choose PDF
              </button>
            )}
            <input
              id="amendment-pdf-input"
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={e => setPdfFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-base-300 flex-none">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <button
            onClick={handleSave}
            disabled={saving || pdfUploading || !form.amendment_date || !form.description?.trim()}
            className="btn btn-primary btn-sm gap-1.5"
          >
            {(saving || pdfUploading) ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {pdfUploading ? 'Uploading PDF…' : existing ? 'Update Amendment' : 'Save Amendment'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Amendment Card ───────────────────────────────────────────────────────────
interface CardProps {
  amendment: Amendment;
  deal: Deal;
  onEdit: () => void;
  onDelete: () => void;
  onAnalyze: () => void;
  onApply: () => void;
  onReanalyze: () => void;
  isAnalyzing: boolean;
}

function AmendmentCard({ amendment, deal, onEdit, onDelete, onAnalyze, onApply, onReanalyze, isAnalyzing }: CardProps) {
  const [expanded, setExpanded] = useState(false);
  const typeObj = AMENDMENT_TYPES.find(t => t.value === amendment.amendment_type);
  const hasValues = Object.keys(amendment.new_values ?? {}).length > 0;
  const hasPdf = !!amendment.storage_path;
  const diffStatus = amendment.diff_status;

  // Show expand chevron if there are values to show
  const showChevron = hasValues || diffStatus === 'no_changes' || diffStatus === 'applied';

  // Get current deal value for a given extract key (for old→new diff display)
  const getDealVal = (extractKey: string): string => {
    const fm = DIFF_FIELD_MAP.find(f => f.extractKey === extractKey);
    if (!fm) return '';
    const val = (deal as any)[fm.dealProp];
    return val != null ? String(val) : '';
  };

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
            {hasPdf && (
              <span className="text-xs text-base-content/30 flex items-center gap-0.5">
                <FileText size={10} /> PDF
              </span>
            )}
          </div>
          <p className="text-sm text-base-content mt-0.5 truncate">{amendment.description}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {/* Expand chevron */}
          {showChevron && (
            <button
              onClick={() => setExpanded(p => !p)}
              className="btn btn-ghost btn-xs btn-circle"
              title="Show field changes"
            >
              {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          )}

          {/* AI Analyze button — visible if PDF attached and not yet analyzed / applied */}
          {hasPdf && !diffStatus && (
            <button
              onClick={onAnalyze}
              disabled={isAnalyzing}
              className="btn btn-ghost btn-xs gap-1 text-primary hover:bg-primary/10"
              title="Analyze amendment PDF with AI to detect field changes"
            >
              {isAnalyzing
                ? <Loader2 size={11} className="animate-spin" />
                : <Sparkles size={11} />}
              {isAnalyzing ? 'Analyzing…' : 'AI Diff'}
            </button>
          )}

          {/* Applied badge */}
          {diffStatus === 'applied' && (
            <span className="badge badge-success badge-sm gap-1 font-normal">
              <CheckCircle2 size={10} /> Applied
            </span>
          )}

          {/* No changes badge */}
          {diffStatus === 'no_changes' && (
            <span className="badge badge-ghost badge-sm gap-1 font-normal">
              No changes found
            </span>
          )}

          {/* Analyzed but pending review indicator */}
          {diffStatus === 'analyzed' && hasValues && (
            <span className="badge badge-warning badge-sm gap-1 font-normal">
              <AlertTriangle size={10} /> Review
            </span>
          )}

          {/* Re-analyze button if already analyzed/no_changes */}
          {hasPdf && (diffStatus === 'analyzed' || diffStatus === 'no_changes') && (
            <button
              onClick={onReanalyze}
              disabled={isAnalyzing}
              className="btn btn-ghost btn-xs btn-circle opacity-0 group-hover:opacity-60 transition-opacity"
              title="Re-analyze PDF"
            >
              <RotateCcw size={11} />
            </button>
          )}

          {/* Edit/Delete — hover only */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="xs" className="btn-circle" onClick={onEdit} title="Edit"><Edit3 size={12} /></Button>
            <Button variant="ghost" size="xs" className="btn-circle text-error/60 hover:text-error" onClick={onDelete} title="Delete"><Trash2 size={12} /></Button>
          </div>
        </div>
      </div>

      {/* Expanded section */}
      {expanded && (
        <div className="border-t border-base-300 px-3 py-3 bg-base-200/50">

          {/* AI diff review */}
          {diffStatus === 'analyzed' && hasValues && (
            <>
              <p className="text-xs font-semibold text-warning mb-2.5 flex items-center gap-1.5">
                <AlertTriangle size={11} /> AI detected these changes — review and confirm before applying
              </p>
              <div className="space-y-1.5 mb-3">
                {Object.entries(amendment.new_values).map(([key, newVal]) => {
                  const opt = FIELD_OPTIONS.find(o => o.key === key);
                  const oldVal = getDealVal(key);
                  return (
                    <div key={key} className="flex items-center gap-2 text-xs bg-base-100 rounded-lg px-2.5 py-1.5">
                      <span className="w-28 text-base-content/50 shrink-0 font-medium">{opt?.label ?? key}</span>
                      <span className="text-error/70 line-through">{oldVal || '—'}</span>
                      <span className="text-base-content/30 mx-0.5">→</span>
                      <span className="text-success font-semibold">{newVal}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { onApply(); setExpanded(false); }}
                  className="btn btn-success btn-xs gap-1.5"
                >
                  <CheckCircle2 size={11} /> Apply Changes to Deal
                </button>
              </div>
            </>
          )}

          {/* No changes found */}
          {diffStatus === 'no_changes' && (
            <p className="text-xs text-base-content/40 italic flex items-center gap-1.5">
              <Sparkles size={11} /> No recognized field changes found in this amendment PDF
            </p>
          )}

          {/* Applied */}
          {diffStatus === 'applied' && (
            <div>
              <p className="text-xs text-success/70 flex items-center gap-1.5 mb-1.5">
                <CheckCircle2 size={11} /> Changes applied to deal
                {amendment.applied_at && (
                  <span className="text-base-content/40">
                    — {new Date(amendment.applied_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {amendment.applied_by && ` by ${amendment.applied_by}`}
                  </span>
                )}
              </p>
              {hasValues && (
                <div className="space-y-1">
                  {Object.entries(amendment.new_values).map(([key, val]) => {
                    const opt = FIELD_OPTIONS.find(o => o.key === key);
                    return (
                      <div key={key} className="flex items-center gap-2 text-xs">
                        <span className="w-28 text-base-content/40 shrink-0">{opt?.label ?? key}</span>
                        <span className="text-base-content/60">{val}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Manual field values (no diff_status — legacy or manual entry) */}
          {!diffStatus && hasValues && (
            <>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function WorkspaceAmendments({ deal, onUpdate }: Props) {
  const { profile } = useAuth();
  const userName = profile?.name || 'TC Staff';
  const { data: amendments = [], isLoading: loading } = useDealAmendments(deal.id);
  const invalidateDealAmendments = useInvalidateDealAmendments();
  const [showForm, setShowForm] = useState(false);
  const [editingAmendment, setEditingAmendment] = useState<Amendment | undefined>();
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());

  const handleSave = (_a: Amendment) => {
    invalidateDealAmendments(deal.id);
  };

  const handleDelete = async (amendment: Amendment) => {
    if (!confirm(`Delete Amendment #${amendment.amendment_number}? This cannot be undone.`)) return;
    const { error } = await supabase.from('deal_amendments').delete().eq('id', amendment.id);
    if (error) { alert('Delete failed: ' + error.message); return; }
    invalidateDealAmendments(deal.id);
  };

  // ── AI: analyze amendment PDF and detect changed fields ──────────────────
  const analyzeAmendment = async (amendment: Amendment) => {
    if (!amendment.storage_path) return;
    setAnalyzingIds(p => new Set([...p, amendment.id]));
    try {
      // 1. Get signed URL for the PDF
      const { data: urlData, error: urlErr } = await supabase.storage
        .from('deal-documents')
        .createSignedUrl(amendment.storage_path, 300);
      if (urlErr || !urlData?.signedUrl) throw new Error('Could not access PDF');

      // 2. Fetch PDF as base64
      const resp = await fetch(urlData.signedUrl);
      const blob = await resp.blob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Strip "data:application/pdf;base64," prefix
          resolve(result.includes(',') ? result.split(',')[1] : result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      // 3. Run extraction via existing API
      const res = await fetch('/api/ai?action=extract-deal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileBase64: base64, fileName: 'amendment.pdf' }),
      });
      if (!res.ok) throw new Error(`Extraction failed (${res.status})`);
      const extracted = await res.json();

      // 4. Compare extracted fields to current deal values
      const newValues: Record<string, string> = {};
      for (const fm of DIFF_FIELD_MAP) {
        const extractedVal = extracted[fm.extractKey];
        if (!extractedVal) continue;
        const dealVal = String((deal as any)[fm.dealProp] ?? '');
        // Only flag as changed if value differs (case-insensitive trim)
        if (extractedVal.trim().toLowerCase() !== dealVal.trim().toLowerCase()) {
          newValues[fm.extractKey] = extractedVal;
        }
      }

      const diffStatus = Object.keys(newValues).length > 0 ? 'analyzed' : 'no_changes';

      // 5. Save diff to DB
      await supabase.from('deal_amendments').update({
        new_values: newValues,
        diff_status: diffStatus,
        analyzed_at: new Date().toISOString(),
      }).eq('id', amendment.id);

      invalidateDealAmendments(deal.id);
    } catch (err) {
      alert('AI analysis failed: ' + (err as Error).message);
    } finally {
      setAnalyzingIds(p => { const s = new Set(p); s.delete(amendment.id); return s; });
    }
  };

  // Re-analyze: clear previous diff and re-run
  const reanalyzeAmendment = async (amendment: Amendment) => {
    await supabase.from('deal_amendments').update({
      new_values: {},
      diff_status: null,
      analyzed_at: null,
    }).eq('id', amendment.id);
    invalidateDealAmendments(deal.id);
    // Small delay to let query invalidate, then analyze
    setTimeout(() => analyzeAmendment({ ...amendment, diff_status: null, new_values: {} }), 300);
  };

  // ── Apply: update deal fields + log deal_field_history ───────────────────
  const applyChanges = async (amendment: Amendment) => {
    const dealUpdates: Record<string, unknown> = {};
    const historyEntries: Record<string, unknown>[] = [];

    for (const fm of DIFF_FIELD_MAP) {
      const newVal = amendment.new_values?.[fm.extractKey];
      if (!newVal) continue;
      const oldVal = String((deal as any)[fm.dealProp] ?? '');
      dealUpdates[fm.dbCol] = newVal;
      historyEntries.push({
        id: generateId(),
        deal_id: deal.id,
        field_name: fm.dbCol,
        previous_value: oldVal || null,
        new_value: newVal,
        changed_by: userName,
        changed_at: new Date().toISOString(),
        source: `amendment_${amendment.amendment_number}`,
      });
    }

    if (Object.keys(dealUpdates).length === 0) return;

    // 1. Update deal record
    const { error: dealErr } = await supabase.from('deals').update(dealUpdates).eq('id', deal.id);
    if (dealErr) { alert('Failed to update deal: ' + dealErr.message); return; }

    // 2. Log to deal_field_history (fire-and-forget)
    if (historyEntries.length > 0) {
      supabase.from('deal_field_history').insert(historyEntries).then();
    }

    // 3. Mark amendment as applied
    await supabase.from('deal_amendments').update({
      diff_status: 'applied',
      applied_at: new Date().toISOString(),
      applied_by: userName,
    }).eq('id', amendment.id);

    // 4. Update frontend deal state
    const frontendUpdates: Partial<Deal> = {};
    for (const fm of DIFF_FIELD_MAP) {
      const newVal = amendment.new_values?.[fm.extractKey];
      if (newVal) (frontendUpdates as any)[fm.dealProp] = newVal;
    }
    onUpdate({ ...deal, ...frontendUpdates });

    invalidateDealAmendments(deal.id);
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
        <LoadingSpinner />
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
              deal={deal}
              onEdit={() => { setEditingAmendment(a); setShowForm(true); }}
              onDelete={() => handleDelete(a)}
              onAnalyze={() => analyzeAmendment(a)}
              onApply={() => applyChanges(a)}
              onReanalyze={() => reanalyzeAmendment(a)}
              isAnalyzing={analyzingIds.has(a.id)}
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
