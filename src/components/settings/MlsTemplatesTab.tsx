import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, Trash2, Check, X, Loader2, AlertCircle, LayoutTemplate,
  ChevronRight, Save, ToggleLeft, ToggleRight, Bell,
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
  priority: string;
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
  pipeline_stage: string | null;  // milestone key this template fires on
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
  notify_buyer: boolean;
  notify_seller: boolean;
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

const PRIORITIES = [
  { value: 'high',   label: '🔴 High' },
  { value: 'medium', label: '🟡 Medium' },
  { value: 'low',    label: '🟢 Low' },
];

const emptyItem = (templateId: string, sortOrder: number): Omit<TemplateItem, 'id'> => ({
  template_id: templateId,
  title: '',
  category: 'General',
  priority: 'medium',
  is_required: false,
  sort_order: sortOrder,
  due_days_from_contract: null,
  due_days_from_closing: null,
});

// ─── Component ───────────────────────────────────────────────────────────────

export function MlsTemplatesTab() {
  // ── Checklist Template state ─────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftMlsId, setDraftMlsId] = useState<string>('');
  const [draftDealType, setDraftDealType] = useState<string>('buyer');
  const [draftPipelineStage, setDraftPipelineStage] = useState<string>('');
  const [draftItems, setDraftItems] = useState<TemplateItem[]>([]);

  // ── Milestone section — own MLS dropdown ─────────────────────────────────
  const [milestoneMlsId, setMilestoneMlsId] = useState<string>('');
  const [milestoneRows, setMilestoneRows] = useState<MilestoneDraftRow[]>([]);
  const [savingMilestone, setSavingMilestone] = useState(false);
  const [milestoneSaved, setMilestoneSaved] = useState(false);
  const [milestoneError, setMilestoneError] = useState<string | null>(null);

  // ── Shared hooks ──────────────────────────────────────────────────────────
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

  // ── Default milestone MLS to first entry on load ──────────────────────────
  useEffect(() => {
    if (mlsEntries.length > 0 && !milestoneMlsId) {
      setMilestoneMlsId((mlsEntries[0] as any).id);
    }
  }, [mlsEntries, milestoneMlsId]);

  // ── Milestone config via hook (keyed to milestoneMlsId) ──────────────────
  const { data: milestoneConfigRaw = [], isLoading: loadingMilestoneConfig } = useMlsMilestoneConfig(milestoneMlsId || undefined);
  const invalidateMilestoneConfig = useInvalidateMlsMilestoneConfig();

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
        notify_buyer: existing?.notify_buyer ?? false,
        notify_seller: existing?.notify_seller ?? false,
      };
    });
  }, [milestoneConfigRaw, milestoneTypes]);

  useEffect(() => {
    setMilestoneRows(derivedMilestoneRows);
  }, [derivedMilestoneRows]);

  // ── Select template ───────────────────────────────────────────────────────
  const selectTemplate = useCallback((tpl: Template) => {
    setSelectedId(tpl.id);
    setDraftName(tpl.name);
    setDraftMlsId(tpl.mls_id ?? '');
    setDraftDealType(tpl.deal_type ?? 'buyer');
    setDraftPipelineStage(tpl.pipeline_stage ?? '');
    setDraftItems(tpl.items.map(i => ({ ...i, priority: (i as any).priority || 'medium' })));
    setSaved(false);
  }, []);

  // ── Create template ───────────────────────────────────────────────────────
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

  // ── Delete template ───────────────────────────────────────────────────────
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
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed to delete template');
    } finally {
      setSaving(false);
    }
  };

  // ── Save checklist template ───────────────────────────────────────────────
  const saveTemplate = async () => {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      const { error: tErr } = await supabase
        .from('checklist_templates')
        .update({
          name: draftName.trim() || 'Untitled Template',
          mls_id: draftMlsId || null,
          deal_type: draftDealType,
          pipeline_stage: draftPipelineStage || null,
        })
        .eq('id', selectedId);
      if (tErr) throw tErr;

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
            priority: item.priority || 'medium',
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

  // ── Save milestone rules ──────────────────────────────────────────────────
  const saveMilestoneTemplate = async () => {
    if (!milestoneMlsId) {
      setMilestoneError('Please select an MLS to configure milestone rules.');
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
              mls_id: milestoneMlsId,
              milestone_type_id: r.milestone_type_id,
              due_days_from_contract: r.due_days_from_contract,
              sort_order: i + 1,
              days_before_notification: r.days_before_notification,
              notify_agent: r.notify_agent,
              notify_buyer: r.notify_buyer,
              notify_seller: r.notify_seller,
            })),
            { onConflict: 'mls_id,milestone_type_id' }
          );
        if (uErr) throw uErr;
      }

      if (inactiveIds.length > 0) {
        const { error: dErr } = await supabase
          .from('mls_milestone_config')
          .delete()
          .eq('mls_id', milestoneMlsId)
          .in('milestone_type_id', inactiveIds);
        if (dErr) throw dErr;
      }

      invalidateMilestoneConfig(milestoneMlsId);
      setMilestoneSaved(true);
      setTimeout(() => setMilestoneSaved(false), 2500);
    } catch (e: any) {
      setMilestoneError(e.message ?? 'Failed to save milestone rules');
    } finally {
      setSavingMilestone(false);
    }
  };

  // ── Item helpers ──────────────────────────────────────────────────────────
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

  const updateMilestoneRow = (milestone_type_id: string, field: keyof MilestoneDraftRow, value: any) => {
    setMilestoneRows(prev => prev.map(r =>
      r.milestone_type_id === milestone_type_id ? { ...r, [field]: value } : r
    ));
  };

  const selected = templates.find(t => t.id === selectedId) ?? null;

  const selectedMilestoneMlsName = useMemo(() => {
    const entry = (mlsEntries as any[]).find((m: any) => m.id === milestoneMlsId);
    return entry ? `${entry.name}${entry.state ? ` (${entry.state})` : ''}` : '';
  }, [mlsEntries, milestoneMlsId]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-base-content/50">
        <Loader2 size={18} className="animate-spin" /> Loading templates…
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-8">

      {/* ══════════════════════════════════════════════════════════════
          SECTION 1: Checklist Templates
      ══════════════════════════════════════════════════════════════ */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <LayoutTemplate size={15} className="text-primary" />
          <h2 className="text-sm font-bold text-base-content">Checklist Templates</h2>
          <span className="text-xs text-base-content/40">— auto-applied to new deals by MLS</span>
        </div>

        <div className="flex gap-5">
          {/* Left: template list */}
          <div className="w-64 flex-none flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-base-content/50 font-semibold">{templates.length} template{templates.length !== 1 ? 's' : ''}</span>
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
                const mlsEntry = (mlsEntries as any[]).find((m: any) => m.id === tpl.mls_id);
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
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-xs text-base-content/30">{tpl.items.length} item{tpl.items.length !== 1 ? 's' : ''}</span>
                        {(tpl as any).pipeline_stage && (
                          <span className="badge badge-xs badge-primary badge-outline truncate max-w-[100px]">
                            {(milestoneTypes as any[]).find((m: any) => m.key === (tpl as any).pipeline_stage)?.label ?? (tpl as any).pipeline_stage}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={12} className="shrink-0 opacity-30" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: edit panel */}
          <div className="flex-1 min-w-0">
            {!selected ? (
              <div className="flex flex-col items-center justify-center h-48 gap-3 text-base-content/40 border border-dashed border-base-300 rounded-xl">
                <LayoutTemplate size={28} className="opacity-30" />
                <p className="text-sm">Select a template to edit, or create a new one</p>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-base-content">Edit Template</h3>
                    <p className="text-xs text-base-content/50 mt-0.5">
                      Items auto-apply to new deals on this MLS. Due days are relative to contract or closing date.
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
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="text-xs font-semibold text-base-content/60 mb-1 block">Template Name</label>
                    <input
                      className="input input-bordered input-sm w-full"
                      value={draftName}
                      onChange={e => setDraftName(e.target.value)}
                      placeholder="e.g. Heartland Buyer Standard"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-base-content/60 mb-1 block">Fires on Milestone</label>
                    <select
                      className="select select-bordered select-sm w-full"
                      value={draftPipelineStage}
                      onChange={e => setDraftPipelineStage(e.target.value)}
                    >
                      <option value="">— Any / None —</option>
                      {(milestoneTypes as any[]).map((mt: any) => (
                        <option key={mt.key} value={mt.key}>{mt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-base-content/60 mb-1 block">MLS Board</label>
                    <select
                      className="select select-bordered select-sm w-full"
                      value={draftMlsId}
                      onChange={e => setDraftMlsId(e.target.value)}
                    >
                      <option value="">— All MLS —</option>
                      {(mlsEntries as any[]).map((m: any) => (
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
                {draftPipelineStage && (
                  <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                    <Bell size={13} className="text-blue-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-blue-700">
                      These tasks will auto-generate when a deal advances to <strong>{(milestoneTypes as any[]).find((m: any) => m.key === draftPipelineStage)?.label ?? draftPipelineStage}</strong>.
                      {draftMlsId ? ` Applies only to the selected MLS board.` : ` Applies to all MLS boards.`}
                      {` Most specific match wins (org → MLS → deal type).`}
                    </p>
                  </div>
                )}

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
                          <th className="w-28 px-3 py-2 text-left text-base-content/50 font-semibold">Category</th>
                          <th className="w-24 px-2 py-2 text-left text-base-content/50 font-semibold">Priority</th>
                          <th className="w-14 px-2 py-2 text-center text-base-content/50 font-semibold">Req</th>
                          <th className="w-20 px-2 py-2 text-center text-base-content/50 font-semibold">Days</th>
                          <th className="w-28 px-2 py-2 text-left text-base-content/50 font-semibold">From</th>
                          <th className="w-8 px-2 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {draftItems.length === 0 && (
                          <tr>
                            <td colSpan={8} className="text-center py-8 text-base-content/30">
                              No items yet — click Add Item above
                            </td>
                          </tr>
                        )}
                        {draftItems.map((item, idx) => {
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
                              <td className="px-2 py-1.5 text-base-content/30 font-mono">{idx + 1}</td>
                              <td className="px-3 py-1.5">
                                <input
                                  className="input input-bordered input-xs w-full"
                                  value={item.title}
                                  onChange={e => updateItem(item.id, 'title', e.target.value)}
                                  placeholder="e.g. Inspection deadline"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <select
                                  className="select select-bordered select-xs w-full"
                                  value={item.category}
                                  onChange={e => updateItem(item.id, 'category', e.target.value)}
                                >
                                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                              </td>
                              <td className="px-2 py-1.5">
                                <select
                                  className="select select-bordered select-xs w-full"
                                  value={(item as any).priority || 'medium'}
                                  onChange={e => updateItem(item.id, 'priority' as any, e.target.value)}
                                >
                                  {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                </select>
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                <button
                                  onClick={() => updateItem(item.id, 'is_required', !item.is_required)}
                                  className={`transition-colors ${item.is_required ? 'text-primary' : 'text-base-content/20'}`}
                                >
                                  {item.is_required ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                                </button>
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                {daysFrom !== 'none' ? (
                                  <input
                                    type="number"
                                    className="input input-bordered input-xs w-16 text-center"
                                    value={daysVal ?? 0}
                                    onChange={e => setDaysVal(parseInt(e.target.value) || 0)}
                                  />
                                ) : (
                                  <span className="text-base-content/20">—</span>
                                )}
                              </td>
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
      </div>

      {/* Divider */}
      <div className="border-t border-base-300" />

      {/* ══════════════════════════════════════════════════════════════
          SECTION 2: Milestone Notification Rules
      ══════════════════════════════════════════════════════════════ */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Bell size={15} className="text-primary" />
          <h2 className="text-sm font-bold text-base-content">Milestone Notification Rules</h2>
        </div>
        <p className="text-xs text-base-content/50 mb-4">
          Configure when to notify the agent, buyer, and seller for each milestone — per MLS. These rules feed the Pending Outbox in each deal.
        </p>

        {/* MLS dropdown */}
        <div className="flex items-center gap-3 mb-5">
          <label className="text-xs font-semibold text-base-content/60 shrink-0">MLS Board</label>
          <select
            className="select select-bordered select-sm w-64"
            value={milestoneMlsId}
            onChange={e => {
              setMilestoneMlsId(e.target.value);
              setMilestoneSaved(false);
              setMilestoneError(null);
            }}
          >
            <option value="">— Select MLS —</option>
            {(mlsEntries as any[]).map((m: any) => (
              <option key={m.id} value={m.id}>{m.name}{m.state ? ` (${m.state})` : ''}</option>
            ))}
          </select>
          {selectedMilestoneMlsName && (
            <span className="text-xs text-base-content/40">
              Showing rules for <span className="font-semibold text-base-content/60">{selectedMilestoneMlsName}</span>
            </span>
          )}
        </div>

        {!milestoneMlsId ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-base-content/30 border border-dashed border-base-300 rounded-xl">
            <Bell size={24} className="opacity-30" />
            <p className="text-sm">Select an MLS above to view or edit its milestone rules</p>
          </div>
        ) : loadingMilestoneConfig ? (
          <div className="flex items-center gap-2 text-base-content/50 text-sm py-6">
            <span className="loading loading-spinner loading-xs" /> Loading milestone rules…
          </div>
        ) : milestoneTypes.length === 0 ? (
          <div className="rounded-xl border border-base-300 bg-base-200 p-6 text-center">
            <p className="text-sm text-base-content/50">No milestone types defined.</p>
            <p className="text-xs text-base-content/40 mt-1">Add milestone types in the Milestones tab first.</p>
          </div>
        ) : (
          <>
            <div className="border border-base-300 rounded-xl overflow-hidden">
              <table className="table table-sm w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-base-300 text-xs">
                    <th className="w-8 px-3 py-2.5 text-center text-base-content/40">On</th>
                    <th className="px-3 py-2.5 text-left text-base-content/50 font-semibold">Milestone</th>
                    <th className="w-36 px-3 py-2.5 text-center text-base-content/50 font-semibold">Days from Contract</th>
                    <th className="w-44 px-3 py-2.5 text-center text-base-content/50 font-semibold">Notify</th>
                    <th className="w-32 px-3 py-2.5 text-center text-base-content/50 font-semibold">Days Before Alert</th>
                  </tr>
                </thead>
                <tbody>
                  {milestoneRows.map((row, idx) => (
                    <tr
                      key={row.milestone_type_id}
                      className={`border-b border-base-300 last:border-0 text-xs transition-opacity ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} ${!row.active ? 'opacity-40' : ''}`}
                    >
                      {/* Active */}
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm checkbox-primary"
                          checked={row.active}
                          onChange={e => updateMilestoneRow(row.milestone_type_id, 'active', e.target.checked)}
                        />
                      </td>

                      {/* Label */}
                      <td className="px-3 py-2.5 font-medium text-base-content">{row.label}</td>

                      {/* Days from contract */}
                      <td className="px-3 py-2.5 text-center">
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

                      {/* Notify: Agent / Buyer / Seller */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-center gap-3">
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              className="checkbox checkbox-xs checkbox-primary"
                              checked={row.notify_agent}
                              disabled={!row.active}
                              onChange={e => updateMilestoneRow(row.milestone_type_id, 'notify_agent', e.target.checked)}
                            />
                            <span className="text-[10px] text-base-content/70 font-medium">Agent</span>
                          </label>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              className="checkbox checkbox-xs checkbox-secondary"
                              checked={row.notify_buyer}
                              disabled={!row.active}
                              onChange={e => updateMilestoneRow(row.milestone_type_id, 'notify_buyer', e.target.checked)}
                            />
                            <span className="text-[10px] text-base-content/70 font-medium">Buyer</span>
                          </label>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              className="checkbox checkbox-xs"
                              style={{ accentColor: '#7c3aed' }}
                              checked={row.notify_seller}
                              disabled={!row.active}
                              onChange={e => updateMilestoneRow(row.milestone_type_id, 'notify_seller', e.target.checked)}
                            />
                            <span className="text-[10px] text-base-content/70 font-medium">Seller</span>
                          </label>
                        </div>
                      </td>

                      {/* Days before notification */}
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
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
                          <span className="text-[10px] text-base-content/40">d</span>
                        </div>
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

            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-base-content/40">
                💡 Changes only affect <span className="font-semibold">{selectedMilestoneMlsName}</span>. Switch the dropdown to configure other MLS boards.
              </p>
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
                {milestoneSaved ? 'Saved!' : 'Save Rules'}
              </button>
            </div>
          </>
        )}
      </div>

    </div>
  );
}
