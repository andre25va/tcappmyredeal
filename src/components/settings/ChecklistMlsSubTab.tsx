import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, X, Check, GripVertical, MoreVertical,
  Star, Loader2, AlertCircle, Globe,
} from 'lucide-react';
import { DDMasterItem, ComplianceMasterItem } from '../../types';
import { generateId } from '../../utils/helpers';
import { ConfirmModal } from '../ConfirmModal';
import { Button } from '../ui/Button';
import { useMlsEntries } from '../../hooks/useMlsEntries';
import { supabase } from '../../lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

type Item = DDMasterItem | ComplianceMasterItem;

interface MlsOverrideTemplate {
  id: string;
  mlsId: string;
  name: string;
  items: Item[];
}

interface Props {
  checklistType: 'dd' | 'compliance';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isDD(item: Item): item is DDMasterItem {
  return 'required' in item;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ChecklistMlsSubTab({ checklistType }: Props) {
  const { data: mlsEntriesRaw } = useMlsEntries();
  const mlsEntries = (mlsEntriesRaw ?? []).map(e => ({ id: e.id, name: e.name, state: e.state ?? '' }));

  const [templates, setTemplates] = useState<MlsOverrideTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedMlsId, setSelectedMlsId] = useState<string>('');
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);

  // Load all MLS override templates
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('checklist_templates')
        .select(`id, name, mls_id, checklist_template_items ( id, title, is_required, sort_order )`)
        .eq('checklist_type', checklistType)
        .eq('is_active', true)
        .not('mls_id', 'is', null)
        .is('contact_id', null);
      if (error) throw error;
      setTemplates(
        (data ?? []).map(row => ({
          id: row.id,
          mlsId: row.mls_id as string,
          name: row.name,
          items: ((row.checklist_template_items ?? []) as any[])
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(i => ({
              id: i.id,
              title: i.title,
              required: i.is_required ?? false,
              order: i.sort_order,
            })),
        }))
      );
    } finally {
      setLoading(false);
    }
  }, [checklistType]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = () => setOpenMenuId(null);
    if (openMenuId) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenuId]);

  // Current template for selected MLS
  const currentTemplate = templates.find(t => t.mlsId === selectedMlsId);
  const currentItems = currentTemplate?.items ?? [];

  const selectedMlsName = mlsEntries.find(e => e.id === selectedMlsId)?.name ?? '';

  // Save items for selected MLS
  const saveItems = async (items: Item[]) => {
    if (!selectedMlsId) return;
    setSaving(true);
    try {
      let templateId = currentTemplate?.id;
      const templateName = `${selectedMlsName} ${checklistType === 'dd' ? 'DD' : 'Compliance'} Template`;

      if (!templateId) {
        const { data, error } = await supabase
          .from('checklist_templates')
          .insert({
            name: templateName,
            checklist_type: checklistType,
            deal_type: 'buyer',
            is_active: true,
            mls_id: selectedMlsId,
            contact_id: null,
          })
          .select('id')
          .single();
        if (error) throw error;
        templateId = data.id;
      }

      await supabase.from('checklist_template_items').delete().eq('template_id', templateId);

      if (items.length > 0) {
        const rows = items.map((item, idx) => ({
          id: item.id,
          template_id: templateId,
          title: item.title,
          is_required: isDD(item) ? item.required : false,
          sort_order: item.order ?? idx,
        }));
        const { error } = await supabase.from('checklist_template_items').insert(rows);
        if (error) throw error;
      }

      await load();
    } finally {
      setSaving(false);
    }
  };

  const addItem = () => {
    const t = newTitle.trim();
    if (!t) return;
    const item: Item = { id: generateId(), title: t, required: false, order: currentItems.length };
    saveItems([...currentItems, item]);
    setNewTitle('');
  };

  const deleteItem = (id: string) => saveItems(currentItems.filter(i => i.id !== id));

  const toggleRequired = (id: string) =>
    saveItems(currentItems.map(i => i.id === id ? { ...i, required: !(i as DDMasterItem).required } as Item : i));

  const renameItem = (id: string, title: string) =>
    saveItems(currentItems.map(i => i.id === id ? { ...i, title } : i));

  const handleReorder = (dragId: string, dropId: string) => {
    if (dragId === dropId) return;
    const arr = [...currentItems];
    const fromIdx = arr.findIndex(i => i.id === dragId);
    const toIdx = arr.findIndex(i => i.id === dropId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, moved);
    saveItems(arr.map((i, o) => ({ ...i, order: o })));
  };

  const deleteTemplate = async (templateId: string) => {
    const tpl = templates.find(t => t.id === templateId);
    await supabase.from('checklist_template_items').delete().eq('template_id', templateId);
    await supabase.from('checklist_templates').delete().eq('id', templateId);
    if (tpl && selectedMlsId === tpl.mlsId) setSelectedMlsId('');
    await load();
  };

  // MLS entries that already have a template
  const mlsWithTemplate = new Set(templates.map(t => t.mlsId));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-black/30">
        <Loader2 size={20} className="animate-spin mr-2" /> Loading…
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-5">
      {/* Header */}
      <div>
        <h2 className="text-base font-bold text-black">
          MLS {checklistType === 'dd' ? 'Due Diligence' : 'Compliance'} Templates
        </h2>
        <p className="text-xs text-black/50 mt-0.5">
          Add items specific to each MLS board — merged on top of master items when a deal is created.
        </p>
        <div className="mt-2 flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          <AlertCircle size={13} className="text-blue-500 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-700">
            These items are <strong>added on top of</strong> the master list — they never replace required master items.
            Example: "Radon Disclosure" for an MLS that requires it.
          </p>
        </div>
      </div>

      {/* MLS Selector */}
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="label py-0.5"><span className="label-text text-xs font-medium">Select MLS Board</span></label>
          <select
            className="select select-bordered select-sm w-full"
            value={selectedMlsId}
            onChange={e => setSelectedMlsId(e.target.value)}
          >
            <option value="">— Choose an MLS —</option>
            {mlsEntries.map(e => (
              <option key={e.id} value={e.id}>
                {e.name}{e.state ? ` (${e.state})` : ''}
                {mlsWithTemplate.has(e.id) ? ' ✓' : ''}
              </option>
            ))}
          </select>
        </div>
        {saving && <Loader2 size={16} className="animate-spin text-primary mb-2" />}
      </div>

      {/* Existing templates summary (when no MLS selected) */}
      {!selectedMlsId && templates.length > 0 && (
        <div className="border border-base-300 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-base-300">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-black/50">MLS Board</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-black/50">Items</th>
                <th className="w-16 px-4 py-2.5 text-right text-xs font-semibold text-black/50">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((tpl, idx) => {
                const mls = mlsEntries.find(e => e.id === tpl.mlsId);
                return (
                  <tr
                    key={tpl.id}
                    className={`border-b border-base-300 last:border-0 cursor-pointer hover:bg-blue-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                    onClick={() => setSelectedMlsId(tpl.mlsId)}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Globe size={13} className="text-primary" />
                        <span className="text-xs font-medium">{mls?.name ?? tpl.mlsId}</span>
                        {mls?.state && <span className="text-xs text-black/40">({mls.state})</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="badge badge-sm badge-outline">{tpl.items.length} items</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        variant="ghost"
                        size="xs"
                        square
                        onClick={e => { e.stopPropagation(); setDeleteTemplateId(tpl.id); }}
                      >
                        <Trash2 size={13} className="text-red-400" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!selectedMlsId && templates.length === 0 && (
        <div className="text-center py-10 text-black/30 text-xs border border-base-300 rounded-xl">
          No MLS templates yet. Select an MLS board above to create one.
        </div>
      )}

      {/* Item editor for selected MLS */}
      {selectedMlsId && (
        <>
          <div className="flex items-center gap-2">
            <Globe size={14} className="text-primary" />
            <span className="text-sm font-semibold text-black">{selectedMlsName}</span>
            <span className="text-xs text-black/40">— extra {checklistType === 'dd' ? 'DD' : 'compliance'} items</span>
            {currentTemplate && (
              <button
                className="ml-auto text-xs text-red-400 hover:text-red-600 flex items-center gap-1"
                onClick={() => setDeleteTemplateId(currentTemplate.id)}
              >
                <Trash2 size={12} /> Remove template
              </button>
            )}
          </div>

          <div className="border border-base-300 rounded-xl overflow-visible">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-base-300">
                  <th className="w-6 px-2 py-2.5" />
                  <th className="w-8 px-3 py-2.5 text-left text-xs font-semibold text-black/50">#</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-black/50">Item</th>
                  {checklistType === 'dd' && (
                    <th className="w-20 px-3 py-2.5 text-center text-xs font-semibold text-black/50">Required</th>
                  )}
                  <th className="w-16 px-3 py-2.5 text-right text-xs font-semibold text-black/50">Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentItems.length === 0 && (
                  <tr>
                    <td colSpan={checklistType === 'dd' ? 5 : 4} className="text-center py-10 text-black/30 text-xs">
                      No extra items for this MLS yet. Add below.
                    </td>
                  </tr>
                )}
                {currentItems.map((item, idx) => (
                  <tr
                    key={item.id}
                    draggable
                    onDragStart={() => { dragIdRef.current = item.id; }}
                    onDragOver={e => { e.preventDefault(); setDragOverId(item.id); }}
                    onDrop={() => { if (dragIdRef.current) handleReorder(dragIdRef.current, item.id); setDragOverId(null); }}
                    onDragEnd={() => { dragIdRef.current = null; setDragOverId(null); }}
                    className={`border-b border-base-300 last:border-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${dragOverId === item.id ? 'border-t-2 border-blue-400' : ''}`}
                  >
                    <td className="px-2 py-2 cursor-grab text-gray-300 hover:text-gray-500">
                      <GripVertical size={14} />
                    </td>
                    <td className="px-3 py-2 text-xs text-black/30 font-mono">{idx + 1}</td>
                    <td className="px-3 py-2">
                      {editingId === item.id ? (
                        <div className="flex gap-1">
                          <input
                            autoFocus
                            className="input input-bordered input-xs flex-1"
                            value={editVal}
                            onChange={e => setEditVal(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { renameItem(item.id, editVal); setEditingId(null); }
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                          />
                          <Button variant="success" size="xs" square onClick={() => { renameItem(item.id, editVal); setEditingId(null); }}>
                            <Check size={11} />
                          </Button>
                          <Button variant="ghost" size="xs" square onClick={() => setEditingId(null)}>
                            <X size={11} />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs font-medium">{item.title}</span>
                      )}
                    </td>
                    {checklistType === 'dd' && (
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => toggleRequired(item.id)}
                          className={`btn btn-xs rounded-full px-2 ${isDD(item) && item.required ? 'btn-error text-white' : 'btn-ghost border border-base-300'}`}
                        >
                          {isDD(item) && item.required ? '★ Req' : '☆ Opt'}
                        </button>
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <div className="relative inline-flex justify-end w-full">
                        <Button
                          variant="ghost"
                          size="xs"
                          square
                          onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === item.id ? null : item.id); }}
                        >
                          <MoreVertical size={13} />
                        </Button>
                        {openMenuId === item.id && (
                          <div
                            className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-[200] min-w-36 py-1 text-sm"
                            onMouseDown={e => e.stopPropagation()}
                          >
                            <button
                              className="w-full text-left px-3 py-1.5 hover:bg-gray-100 flex items-center gap-2"
                              onClick={() => { setEditingId(item.id); setEditVal(item.title); setOpenMenuId(null); }}
                            >
                              <Pencil size={12} /> Edit Title
                            </button>
                            {checklistType === 'dd' && (
                              <button
                                className="w-full text-left px-3 py-1.5 hover:bg-gray-100 flex items-center gap-2"
                                onClick={() => { toggleRequired(item.id); setOpenMenuId(null); }}
                              >
                                <Star size={12} /> {isDD(item) && item.required ? 'Mark Optional' : 'Mark Required'}
                              </button>
                            )}
                            <div className="border-t border-gray-100 my-1" />
                            <button
                              className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-600 flex items-center gap-2"
                              onClick={() => { setDeleteItemId(item.id); setOpenMenuId(null); }}
                            >
                              <Trash2 size={12} /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            <input
              className="input input-bordered flex-1 text-sm"
              placeholder={`Add an extra ${checklistType === 'dd' ? 'DD' : 'compliance'} item for ${selectedMlsName}…`}
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addItem()}
            />
            <Button variant="primary" className="gap-1.5" onClick={addItem}>
              <Plus size={14} /> Add
            </Button>
          </div>
        </>
      )}

      <ConfirmModal
        isOpen={deleteItemId !== null}
        title="Remove this item?"
        message="Remove this item from the MLS template?"
        confirmLabel="Remove"
        onConfirm={() => { if (deleteItemId) { deleteItem(deleteItemId); setDeleteItemId(null); } }}
        onCancel={() => setDeleteItemId(null)}
      />
      <ConfirmModal
        isOpen={deleteTemplateId !== null}
        title="Delete MLS template?"
        message="This will remove all custom items for this MLS board. Master items still apply."
        confirmLabel="Delete"
        onConfirm={() => { if (deleteTemplateId) { deleteTemplate(deleteTemplateId); setDeleteTemplateId(null); } }}
        onCancel={() => setDeleteTemplateId(null)}
      />
    </div>
  );
}
