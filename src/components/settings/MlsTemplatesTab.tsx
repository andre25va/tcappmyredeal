import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, Check, X, Loader2, AlertCircle, LayoutTemplate,
  ChevronRight, Save, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { MlsEntry } from '../../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const supabase = createClient(supabaseUrl, supabaseKey);

// ─── Types ───────────────────────────────────────────────────────────────────

interface TemplateItem {
  id: string;
  template_id: string;
  title: string;
  category: string;
  is_required: boolean;
  sort_order: number;
  due_days_from_contract: number | null;
  due_days_from_closing: number | null;
}

interface Template {
  id: string;
  name: string;
  mls_id: string | null;
  deal_type: string | null;
  checklist_type: string;
  is_active: boolean;
  items: TemplateItem[];
}

interface Props {
  mlsEntries: MlsEntry[];
}

const DEAL_TYPES = [
  { value: 'buyer', label: 'Buyer Side' },
  { value: 'seller', label: 'Seller Side' },
  { value: 'both', label: 'Both Sides' },
];

const CATEGORIES = [
  'Inspection', 'Finance', 'Title', 'Disclosures', 'Contingency',
  'Documentation', 'Closing', 'General',
];

const emptyItem = (templateId: string, sortOrder: number): Omit<TemplateItem, 'id'> => ({
  template_id: templateId,
  title: '',
  category: 'General',
  is_required: false,
  sort_order: sortOrder,
  due_days_from_contract: null,
  due_days_from_closing: null,
});

// ─── Component ───────────────────────────────────────────────────────────────

export function MlsTemplatesTab({ mlsEntries }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Draft state for selected template
  const [draftName, setDraftName] = useState('');
  const [draftMlsId, setDraftMlsId] = useState<string>('');
  const [draftDealType, setDraftDealType] = useState<string>('buyer');
  const [draftItems, setDraftItems] = useState<TemplateItem[]>([]);

  // ── Load templates ──────────────────────────────────────────────────────
  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: tpls, error: tErr } = await supabase
        .from('checklist_templates')
        .select('*')
        .eq('checklist_type', 'milestone')
        .order('name');
      if (tErr) throw tErr;

      const { data: items, error: iErr } = await supabase
        .from('checklist_template_items')
        .select('*')
        .order('sort_order');
      if (iErr) throw iErr;

      const mapped: Template[] = (tpls ?? []).map((t: any) => ({
        ...t,
        items: (items ?? []).filter((i: any) => i.template_id === t.id),
      }));
      setTemplates(mapped);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  // ── Select template ─────────────────────────────────────────────────────
  const selectTemplate = (tpl: Template) => {
    setSelectedId(tpl.id);
    setDraftName(tpl.name);
    setDraftMlsId(tpl.mls_id ?? '');
    setDraftDealType(tpl.deal_type ?? 'buyer');
    setDraftItems(tpl.items.map(i => ({ ...i })));
    setSaved(false);
  };

  // ── Create new template ─────────────────────────────────────────────────
  const createTemplate = async () => {
    setSaving(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('checklist_templates')
        .insert({
          name: 'New MLS Template',
          checklist_type: 'milestone',
          deal_type: 'buyer',
          mls_id: mlsEntries[0]?.id ?? null,
          is_active: true,
        })
        .select()
        .single();
      if (err) throw err;
      const newTpl: Template = { ...data, items: [] };
      setTemplates(prev => [...prev, newTpl]);
      selectTemplate(newTpl);
    } catch (e: any) {
      setError(e.message ?? 'Failed to create template');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete template ─────────────────────────────────────────────────────
  const deleteTemplate = async (id: string) => {
    if (!confirm('Delete this template and all its items?')) return;
    setSaving(true);
    try {
      await supabase.from('checklist_template_items').delete().eq('template_id', id);
      await supabase.from('checklist_templates').delete().eq('id', id);
      setTemplates(prev => prev.filter(t => t.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setDraftItems([]);
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed to delete template');
    } finally {
      setSaving(false);
    }
  };

  // ── Save template ───────────────────────────────────────────────────────
  const saveTemplate = async () => {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      // Update template header
      const { error: tErr } = await supabase
        .from('checklist_templates')
        .update({
          name: draftName.trim() || 'Untitled Template',
          mls_id: draftMlsId || null,
          deal_type: draftDealType,
        })
        .eq('id', selectedId);
      if (tErr) throw tErr;

      // Delete existing items and re-insert (simplest safe approach)
      const { error: dErr } = await supabase
        .from('checklist_template_items')
        .delete()
        .eq('template_id', selectedId);
      if (dErr) throw dErr;

      const validItems = draftItems.filter(i => i.title.trim());
      if (validItems.length > 0) {
        const { error: iErr } = await supabase
          .from('checklist_template_items')
          .insert(validItems.map((item, idx) => ({
            template_id: selectedId,
            title: item.title.trim(),
            category: item.category,
            is_required: item.is_required,
            sort_order: idx,
            due_days_from_contract: item.due_days_from_contract,
            due_days_from_closing: item.due_days_from_closing,
          })));
        if (iErr) throw iErr;
      }

      // Update local state
      setTemplates(prev => prev.map(t =>
        t.id === selectedId
          ? {
              ...t,
              name: draftName.trim() || 'Untitled Template',
              mls_id: draftMlsId || null,
              deal_type: draftDealType,
              items: validItems,
            }
          : t
      ));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setError(e.message ?? 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  // ── Item helpers ────────────────────────────────────────────────────────
  const addItem = () => {
    if (!selectedId) return;
    const newItem: TemplateItem = {
      id: `draft-${Date.now()}`,
      ...emptyItem(selectedId, draftItems.length),
    };
    setDraftItems(prev => [...prev, newItem]);
  };

  const updateItem = (id: string, field: keyof TemplateItem, value: any) => {
    setDraftItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const removeItem = (id: string) => {
    setDraftItems(prev => prev.filter(i => i.id !== id));
  };

  const selected = templates.find(t => t.id === selectedId) ?? null;

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-base-content/50">
        <Loader2 size={18} className="animate-spin" /> Loading templates…
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto flex gap-5 h-full">

      {/* ── Left: template list ── */}
      <div className="w-64 flex-none flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-base-content">MLS Templates</h2>
          <button
            className="btn btn-xs btn-primary gap-1"
            onClick={createTemplate}
            disabled={saving}
          >
            <Plus size={11} /> New
          </button>
        </div>

        <div className="flex flex-col gap-1">
          {templates.length === 0 && (
            <div className="text-xs text-base-content/40 text-center py-8 border border-dashed border-base-300 rounded-xl">
              No templates yet.<br />Click New to start.
            </div>
          )}
          {templates.map(tpl => {
            const mlsName = mlsEntries.find(m => m.id === tpl.mls_id)?.name ?? 'No MLS';
            const dealLabel = DEAL_TYPES.find(d => d.value === tpl.deal_type)?.label ?? tpl.deal_type;
            return (
              <button
                key={tpl.id}
                onClick={() => selectTemplate(tpl)}
                className={`w-full text-left rounded-xl border px-3 py-2.5 flex items-center gap-2 transition-all group
                  ${selectedId === tpl.id
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-base-300 bg-white hover:border-primary/40 text-base-content'}`}
              >
                <LayoutTemplate size={13} className="shrink-0 opacity-60" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate">{tpl.name}</div>
                  <div className="text-xs text-base-content/40 truncate">{mlsName} · {dealLabel}</div>
                  <div className="text-xs text-base-content/30">{tpl.items.length} item{tpl.items.length !== 1 ? 's' : ''}</div>
                </div>
                <ChevronRight size={12} className="shrink-0 opacity-30" />
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Right: edit panel ── */}
      <div className="flex-1 min-w-0">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-base-content/40">
            <LayoutTemplate size={32} className="opacity-30" />
            <p className="text-sm">Select a template to edit, or create a new one</p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">

            {/* Header row */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-base-content">Edit Template</h2>
                <p className="text-xs text-base-content/50 mt-0.5">
                  Items will auto-apply to new deals on this MLS. Due days are relative to contract or closing date.
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  className="btn btn-xs btn-error btn-outline gap-1"
                  onClick={() => deleteTemplate(selectedId!)}
                  disabled={saving}
                >
                  <Trash2 size={11} /> Delete
                </button>
                <button
                  className={`btn btn-xs gap-1 ${saved ? 'btn-success' : 'btn-primary'}`}
                  onClick={saveTemplate}
                  disabled={saving}
                >
                  {saving ? <Loader2 size={11} className="animate-spin" /> : saved ? <Check size={11} /> : <Save size={11} />}
                  {saved ? 'Saved!' : 'Save'}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-error/10 border border-error/30 rounded-lg px-3 py-2">
                <AlertCircle size={13} className="text-error shrink-0" />
                <span className="text-xs text-error">{error}</span>
                <button className="ml-auto" onClick={() => setError(null)}><X size={12} /></button>
              </div>
            )}

            {/* Template meta */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-3 sm:col-span-1">
                <label className="text-xs font-semibold text-base-content/60 mb-1 block">Template Name</label>
                <input
                  className="input input-bordered input-sm w-full"
                  value={draftName}
                  onChange={e => setDraftName(e.target.value)}
                  placeholder="e.g. Heartland Buyer Standard"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-base-content/60 mb-1 block">MLS Board</label>
                <select
                  className="select select-bordered select-sm w-full"
                  value={draftMlsId}
                  onChange={e => setDraftMlsId(e.target.value)}
                >
                  <option value="">— None —</option>
                  {mlsEntries.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-base-content/60 mb-1 block">Deal Type</label>
                <select
                  className="select select-bordered select-sm w-full"
                  value={draftDealType}
                  onChange={e => setDraftDealType(e.target.value)}
                >
                  {DEAL_TYPES.map(d => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Items table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-base-content/60">Checklist Items</label>
                <button className="btn btn-xs btn-outline gap-1" onClick={addItem}>
                  <Plus size={11} /> Add Item
                </button>
              </div>

              <div className="border border-base-300 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-base-300">
                      <th className="w-6 px-2 py-2 text-left text-base-content/40">#</th>
                      <th className="px-3 py-2 text-left text-base-content/50 font-semibold">Title</th>
                      <th className="w-32 px-3 py-2 text-left text-base-content/50 font-semibold">Category</th>
                      <th className="w-14 px-2 py-2 text-center text-base-content/50 font-semibold">Req</th>
                      <th className="w-20 px-2 py-2 text-center text-base-content/50 font-semibold">Days</th>
                      <th className="w-28 px-2 py-2 text-left text-base-content/50 font-semibold">From</th>
                      <th className="w-8 px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {draftItems.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-center py-8 text-base-content/30">
                          No items yet — click Add Item above
                        </td>
                      </tr>
                    )}
                    {draftItems.map((item, idx) => {
                      // Determine which days field is active
                      const hasDaysContract = item.due_days_from_contract !== null;
                      const hasDaysClosing = item.due_days_from_closing !== null;
                      const daysFrom = hasDaysClosing ? 'closing' : hasDaysContract ? 'contract' : 'none';
                      const daysVal = hasDaysClosing
                        ? item.due_days_from_closing
                        : hasDaysContract
                        ? item.due_days_from_contract
                        : null;

                      const setDaysFrom = (from: 'contract' | 'closing' | 'none') => {
                        updateItem(item.id, 'due_days_from_contract', null);
                        updateItem(item.id, 'due_days_from_closing', null);
                        if (from === 'contract') updateItem(item.id, 'due_days_from_contract', 0);
                        if (from === 'closing') updateItem(item.id, 'due_days_from_closing', 0);
                      };

                      const setDaysVal = (val: number | null) => {
                        if (daysFrom === 'contract') updateItem(item.id, 'due_days_from_contract', val);
                        if (daysFrom === 'closing') updateItem(item.id, 'due_days_from_closing', val);
                      };

                      return (
                        <tr
                          key={item.id}
                          className={`border-b border-base-300 last:border-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                        >
                          {/* # */}
                          <td className="px-2 py-1.5 text-base-content/30 font-mono">{idx + 1}</td>

                          {/* Title */}
                          <td className="px-3 py-1.5">
                            <input
                              className="input input-bordered input-xs w-full"
                              value={item.title}
                              onChange={e => updateItem(item.id, 'title', e.target.value)}
                              placeholder="e.g. Inspection deadline"
                            />
                          </td>

                          {/* Category */}
                          <td className="px-2 py-1.5">
                            <select
                              className="select select-bordered select-xs w-full"
                              value={item.category}
                              onChange={e => updateItem(item.id, 'category', e.target.value)}
                            >
                              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </td>

                          {/* Required toggle */}
                          <td className="px-2 py-1.5 text-center">
                            <button
                              onClick={() => updateItem(item.id, 'is_required', !item.is_required)}
                              className={`transition-colors ${item.is_required ? 'text-primary' : 'text-base-content/20'}`}
                            >
                              {item.is_required
                                ? <ToggleRight size={18} />
                                : <ToggleLeft size={18} />}
                            </button>
                          </td>

                          {/* Days value */}
                          <td className="px-2 py-1.5 text-center">
                            {daysFrom !== 'none' ? (
                              <input
                                type="number"
                                className="input input-bordered input-xs w-16 text-center"
                                value={daysVal ?? 0}
                                onChange={e => setDaysVal(parseInt(e.target.value) || 0)}
                                title="Positive = after date, negative = before date"
                              />
                            ) : (
                              <span className="text-base-content/20">—</span>
                            )}
                          </td>

                          {/* From dropdown */}
                          <td className="px-2 py-1.5">
                            <select
                              className="select select-bordered select-xs w-full"
                              value={daysFrom}
                              onChange={e => setDaysFrom(e.target.value as any)}
                            >
                              <option value="none">No date</option>
                              <option value="contract">Contract</option>
                              <option value="closing">Closing</option>
                            </select>
                          </td>

                          {/* Delete */}
                          <td className="px-1 py-1.5 text-center">
                            <button
                              onClick={() => removeItem(item.id)}
                              className="btn btn-xs btn-ghost btn-square text-error/60 hover:text-error"
                            >
                              <X size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-base-content/40 mt-2">
                💡 Days can be negative (before the date). E.g. <code>-3</code> from Closing = 3 days before closing.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
