import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, Trash2, Check, X, Loader2, AlertCircle, LayoutTemplate,
  ChevronRight, Save, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useMilestoneTypes } from '../../hooks/useMilestoneTypes';
import { useMlsEntries } from '../../hooks/useMlsEntries';
import { useChecklistTemplates, useInvalidateChecklistTemplates } from '../../hooks/useChecklistTemplates';
import { useChecklistTemplateItems, useInvalidateChecklistTemplateItems } from '../../hooks/useChecklistTemplateItems';
import { useMlsMilestoneConfig, useInvalidateMlsMilestoneConfig } from '../../hooks/useMlsMilestoneConfig';

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

interface MilestoneType {
  id: string;
  key: string;
  label: string;
  sort_order: number;
}

interface MilestoneDraftRow {
  milestone_type_id: string;
  label: string;
  active: boolean;
  due_days_from_contract: number | null;
  sort_order: number;
  days_before_notification: number;
  notify_agent: boolean;
  notify_client: boolean;
}

interface Props {}

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

export function MlsTemplatesTab() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Draft state for selected template
  const [draftName, setDraftName] = useState('');
  const [draftMlsId, setDraftMlsId] = useState<string>('');
  const [draftDealType, setDraftDealType] = useState<string>('buyer');
  const [draftItems, setDraftItems] = useState<TemplateItem[]>([]);

  // ─── Milestone Template state ─────────────────────────────────────────────
  const [milestoneRows, setMilestoneRows] = useState<MilestoneDraftRow[]>([]);

  // ── Shared TanStack Query hooks ──────────────────────────────────────────
  const { data: mlsEntries = [] } = useMlsEntries();
  const { data: milestoneTypes = [] } = useMilestoneTypes();
  const { data: checklistTemplatesRaw = [], isLoading: loadingTemplates } = useChecklistTemplates();
  const { data: checklistItemsRaw = [], isLoading: loadingItems } = useChecklistTemplateItems();
  const invalidateChecklistTemplates = useInvalidateChecklistTemplates();
  const invalidateChecklistTemplateItems = useInvalidateChecklistTemplateItems();

  const loading = loadingTemplates || loadingItems;

  const templates = useMemo<Template[]>(
    () =>
      (checklistTemplatesRaw as any[]).map((t: any) => ({
        ...t,
        items: (checklistItemsRaw as any[]).filter((i: any) => i.template_id === t.id),
      })),
    [checklistTemplatesRaw, checklistItemsRaw],
  );

  // ── Milestone config via hook ──────────────────────────────────────────
  const { data: milestoneConfigRaw = [], isLoading: loadingMilestoneConfig } = useMlsMilestoneConfig(draftMlsId || undefined);
  const invalidateMilestoneConfig = useInvalidateMlsMilestoneConfig();
  const [savingMilestone, setSavingMilestone] = useState(false);
  const [milestoneSaved, setMilestoneSaved] = useState(false);
  const [milestoneError, setMilestoneError] = useState<string | null>(null);
  // Derive milestone rows from hook data + milestone types
  const derivedMilestoneRows = useMemo<MilestoneDraftRow[]>(() => {
    if (milestoneTypes.length === 0) return [];
    const configMap = new Map<string, any>((milestoneConfigRaw as any[]).map((row: any) => [row.milestone_type_id, row]));
    return milestoneTypes.map((mt: any, i: number) => {
      const existing = configMap.get(mt.id);
      return {
        milestone_type_id: mt.id,
        label: mt.label,
        active: !!existing,
        due_days_from_contract: existing?.due_days_from_contract ?? null,
        sort_order: existing?.sort_order ?? i + 1,
        days_before_notification: existing?.days_before_notification ?? 1,
        notify_agent: existing?.notify_agent ?? true,
        notify_client: existing?.notify_client ?? false,
      };
    });
  }, [milestoneConfigRaw, milestoneTypes]);

  // Use override if user has edited, otherwise use derived
  useEffect(() => {
    setMilestoneRows(derivedMilestoneRows);
  }, [derivedMilestoneRows]);

  // ── Select template ─────────────────────────────────────────────────────
  const selectTemplate = useCallback((tpl: Template) => {
    setSelectedId(tpl.id);
    setDraftName(tpl.name);
    setDraftMlsId(tpl.mls_id ?? '');
    setDraftDealType(tpl.deal_type ?? 'buyer');
    setDraftItems(tpl.items.map(i => ({ ...i })));
    setSaved(false);
    setMilestoneSaved(false);
    setMilestoneError(null);
  }, []);

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
      invalidateChecklistTemplates();
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
      invalidateChecklistTemplates();
      invalidateChecklistTemplateItems();
      if (selectedId === id) {
        setSelectedId(null);
        setDraftItems([]);
        setMilestoneRows([]);
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

      invalidateChecklistTemplates();
      invalidateChecklistTemplateItems();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setError(e.message ?? 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  // ── Save Milestone Template ─────────────────────────────────────────────
  const saveMilestoneTemplate = async () => {
    if (!draftMlsId) {
      setMilestoneError('Please select an MLS board for this template before saving the milestone configuration.');
      return;
    }
    setSavingMilestone(true);
    setMilestoneError(null);
    try {
      const activeRows = milestoneRows.filter(r => r.active);
      const inactiveIds = milestoneRows.filter(r => !r.active).map(r => r.milestone_type_id);

      if (activeRows.length > 0) {
        const { error: uErr } = await supabase
          .from('mls_milestone_config')
          .upsert(
            activeRows.map((r, i) => ({
              mls_id: draftMlsId,
              milestone_type_id: r.milestone_type_id,
              due_days_from_contract: r.due_days_from_contract,
              sort_order: i + 1,
              days_before_notification: r.days_before_notification,
              notify_agent: r.notify_agent,
              notify_client: r.notify_client,
            })),
            { onConflict: 'mls_id,milestone_type_id' }
          );
        if (uErr) throw uErr;
      }

      if (inactiveIds.length > 0) {
        const { error: dErr } = await supabase
          .from('mls_milestone_config')
          .delete()
          .eq('mls_id', draftMlsId)
          .in('milestone_type_id', inactiveIds);
        if (dErr) throw dErr;
      }

      invalidateMilestoneConfig(draftMlsId);
      setMilestoneSaved(true);
      setTimeout(() => setMilestoneSaved(false), 2500);
    } catch (e: any) {
      setMilestoneError(e.message ?? 'Failed to save milestone template');
    } finally {
      setSavingMilestone(false);
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

  // ── Milestone row helpers ───────────────────────────────────────────────
  const updateMilestoneRow = (milestone_type_id: string, field: keyof MilestoneDraftRow, value: any) => {
    setMilestoneRows(prev => prev.map(r =>
      r.milestone_type_id === milestone_type_id ? { ...r, [field]: value } : r
    ));
  };

  const selected = templates.find(t => t.id === selectedId) ?? null;
  const selectedMlsEntry = mlsEntries.find(m => m.id === draftMlsId) ?? null;
  const selectedMlsName = selectedMlsEntry
    ? `${selectedMlsEntry.name}${selectedMlsEntry.state ? ` (${selectedMlsEntry.state})` : ''}`
    : null;

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
            const mlsEntry = mlsEntries.find(m => m.id === tpl.mls_id);
            const mlsName = mlsEntry
              ? `${mlsEntry.name}${mlsEntry.state ? ` (${mlsEntry.state})` : ''}`
              : 'No MLS';
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
                  onChange={e => {
                    setDraftMlsId(e.target.value);
                  }}
                >
                  <option value="">— None —</option>
                  {mlsEntries.map(m => (
                    <option key={m.id} value={m.id}>{m.name}{m.state ? ` (${m.state})` : ''}</option>
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

            {/* ── Milestone Template Section ── */}
            <div className="mt-2">
              <h3 className="font-semibold text-base text-base-content mb-1">Milestone Template</h3>
              <p className="text-xs text-base-content/50 mb-4">
                Configure which milestones apply to{selectedMlsName ? ` ${selectedMlsName}` : ' this MLS'} deals and when they're due.
              </p>

              {loadingMilestoneConfig ? (
                <div className="flex items-center gap-2 text-base-content/50 text-sm py-4">
                  <span className="loading loading-spinner loading-xs" />
                  Loading milestone config…
                </div>
              ) : milestoneTypes.length === 0 ? (
                <div className="rounded-xl border border-base-300 bg-base-200 p-6 text-center">
                  <p className="text-sm text-base-content/50">No milestone types defined.</p>
                  <p className="text-xs text-base-content/40 mt-1">
                    Add milestone types in the Milestones tab first.
                  </p>
                </div>
              ) : (
                <>
                  <div className="border border-base-300 rounded-xl overflow-hidden">
                    <table className="table table-sm w-full">
                      <thead>
                        <tr className="bg-gray-50 border-b border-base-300 text-xs">
                          <th className="w-8 px-3 py-2 text-center text-base-content/40">On</th>
                          <th className="px-3 py-2 text-left text-base-content/50 font-semibold">Milestone</th>
                          <th className="w-36 px-3 py-2 text-center text-base-content/50 font-semibold">Days from Contract</th>
                          <th className="w-28 px-3 py-2 text-center text-base-content/50 font-semibold">Notify</th>
                          <th className="w-32 px-3 py-2 text-center text-base-content/50 font-semibold">Days Before Alert</th>
                        </tr>
                      </thead>
                      <tbody>
                        {milestoneRows.map((row, idx) => (
                          <tr
                            key={row.milestone_type_id}
                            className={`border-b border-base-300 last:border-0 text-xs ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} ${!row.active ? 'opacity-50' : ''}`}
                          >
                            {/* Active checkbox */}
                            <td className="px-3 py-2 text-center">
                              <input
                                type="checkbox"
                                className="checkbox checkbox-sm checkbox-primary"
                                checked={row.active}
                                onChange={e => updateMilestoneRow(row.milestone_type_id, 'active', e.target.checked)}
                              />
                            </td>

                            {/* Label */}
                            <td className="px-3 py-2 font-medium text-base-content">
                              {row.label}
                            </td>

                            {/* Days from contract */}
                            <td className="px-3 py-2 text-center">
                              <input
                                type="number"
                                min={0}
                                max={365}
                                className="input input-bordered input-xs w-20 text-center"
                                value={row.due_days_from_contract ?? ''}
                                disabled={!row.active}
                                placeholder="—"
                                onChange={e => updateMilestoneRow(
                                  row.milestone_type_id,
                                  'due_days_from_contract',
                                  e.target.value === '' ? null : parseInt(e.target.value)
                                )}
                              />
                            </td>

                            {/* Notify agent / client */}
                            <td className="px-3 py-2">
                              <div className="flex items-center justify-center gap-3">
                                <label className="flex items-center gap-1 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    className="checkbox checkbox-xs checkbox-primary"
                                    checked={row.notify_agent}
                                    disabled={!row.active}
                                    onChange={e => updateMilestoneRow(row.milestone_type_id, 'notify_agent', e.target.checked)}
                                  />
                                  <span className="text-[10px] text-base-content/70">Agent</span>
                                </label>
                                <label className="flex items-center gap-1 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    className="checkbox checkbox-xs checkbox-secondary"
                                    checked={row.notify_client}
                                    disabled={!row.active}
                                    onChange={e => updateMilestoneRow(row.milestone_type_id, 'notify_client', e.target.checked)}
                                  />
                                  <span className="text-[10px] text-base-content/70">Client</span>
                                </label>
                              </div>
                            </td>

                            {/* Days before notification */}
                            <td className="px-3 py-2 text-center">
                              <input
                                type="number"
                                min={0}
                                max={30}
                                className="input input-bordered input-xs w-16 text-center"
                                value={row.days_before_notification}
                                disabled={!row.active}
                                onChange={e => updateMilestoneRow(
                                  row.milestone_type_id,
                                  'days_before_notification',
                                  parseInt(e.target.value) || 1
                                )}
                              />
                              <span className="text-[10px] text-base-content/40 ml-1">d</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {milestoneError && (
                    <div className="flex items-center gap-2 mt-3 bg-error/10 border border-error/30 rounded-lg px-3 py-2">
                      <AlertCircle size={13} className="text-error shrink-0" />
                      <span className="text-xs text-error">{milestoneError}</span>
                      <button className="ml-auto" onClick={() => setMilestoneError(null)}><X size={12} /></button>
                    </div>
                  )}

                  <div className="flex justify-end mt-3">
                    <button
                      className={`btn btn-sm gap-1.5 ${milestoneSaved ? 'btn-success' : 'btn-primary'}`}
                      onClick={saveMilestoneTemplate}
                      disabled={savingMilestone}
                    >
                      {savingMilestone
                        ? <span className="loading loading-spinner loading-xs" />
                        : milestoneSaved
                        ? <Check size={13} />
                        : <Save size={13} />}
                      {milestoneSaved ? 'Saved!' : 'Save Milestone Template'}
                    </button>
                  </div>
                </>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
