import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, X, Check, GripVertical, MoreVertical,
  Star, Loader2, AlertCircle, Zap,
} from 'lucide-react';
import { DDMasterItem } from '../../types';
import { generateId } from '../../utils/helpers';
import { ConfirmModal } from '../ConfirmModal';
import { Button } from '../ui/Button';
import { supabase } from '../../lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

type LoanTypeKey = 'financed' | 'cash';

interface LoanTypeOption {
  key: LoanTypeKey;
  label: string;
  description: string;
  badge: string;
}

const LOAN_TYPE_OPTIONS: LoanTypeOption[] = [
  {
    key: 'financed',
    label: 'Financed Deals',
    description: 'Conventional, FHA, VA, USDA',
    badge: 'Loan Required',
  },
  {
    key: 'cash',
    label: 'Cash Deals',
    description: 'No financing contingency',
    badge: 'Cash Only',
  },
];

interface LoanTypeTemplate {
  id: string | null;
  loanType: LoanTypeKey;
  items: DDMasterItem[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ChecklistLoanTypeSubTab() {
  const [templates, setTemplates] = useState<LoanTypeTemplate[]>([
    { id: null, loanType: 'financed', items: [] },
    { id: null, loanType: 'cash', items: [] },
  ]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedLoanType, setSelectedLoanType] = useState<LoanTypeKey>('financed');
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);

  // Load loan-type templates from checklist_templates
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('checklist_templates')
        .select(`id, name, loan_type, checklist_template_items ( id, title, is_required, sort_order )`)
        .eq('checklist_type', 'dd')
        .eq('is_active', true)
        .not('loan_type', 'is', null)
        .is('mls_id', null)
        .is('contact_id', null);

      if (error) throw error;

      setTemplates(
        LOAN_TYPE_OPTIONS.map(opt => {
          const row = (data ?? []).find(r => r.loan_type === opt.key);
          return {
            id: row?.id ?? null,
            loanType: opt.key,
            items: row
              ? ((row.checklist_template_items ?? []) as any[])
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((i, idx) => ({
                    id: i.id,
                    title: i.title,
                    required: i.is_required ?? false,
                    order: i.sort_order ?? idx,
                  }))
              : [],
          };
        })
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = () => setOpenMenuId(null);
    if (openMenuId) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenuId]);

  const currentTemplate = templates.find(t => t.loanType === selectedLoanType)!;
  const currentItems = currentTemplate?.items ?? [];

  // Save items for selected loan type
  const saveItems = async (items: DDMasterItem[]) => {
    setSaving(true);
    try {
      let templateId = currentTemplate?.id;
      const option = LOAN_TYPE_OPTIONS.find(o => o.key === selectedLoanType)!;

      if (!templateId) {
        const { data, error } = await supabase
          .from('checklist_templates')
          .insert({
            name: `${option.label} DD Template`,
            checklist_type: 'dd',
            deal_type: 'buyer',
            is_active: true,
            loan_type: selectedLoanType,
            mls_id: null,
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
          is_required: item.required ?? false,
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
    const item: DDMasterItem = { id: generateId(), title: t, required: false, order: currentItems.length };
    saveItems([...currentItems, item]);
    setNewTitle('');
  };

  const deleteItem = (id: string) => saveItems(currentItems.filter(i => i.id !== id));

  const toggleRequired = (id: string) =>
    saveItems(currentItems.map(i => i.id === id ? { ...i, required: !i.required } : i));

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-black/30">
        <Loader2 size={20} className="animate-spin mr-2" /> Loading…
      </div>
    );
  }

  const selectedOption = LOAN_TYPE_OPTIONS.find(o => o.key === selectedLoanType)!;

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-5">
      {/* Header */}
      <div>
        <h2 className="text-base font-bold text-black">Loan Type DD Templates</h2>
        <p className="text-xs text-black/50 mt-0.5">
          Extra due diligence items added based on how the deal is financed — merged on top of master items when a deal is created.
        </p>
        <div className="mt-2 flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          <AlertCircle size={13} className="text-blue-500 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-700">
            Financed items are added for Conventional, FHA, VA, and USDA deals. Cash deals use the cash list (if any). Neither ever replaces required master items.
          </p>
        </div>
      </div>

      {/* Loan Type Selector */}
      <div className="flex gap-3">
        {LOAN_TYPE_OPTIONS.map(opt => {
          const tpl = templates.find(t => t.loanType === opt.key);
          const count = tpl?.items.length ?? 0;
          const isSelected = selectedLoanType === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => setSelectedLoanType(opt.key)}
              className={`flex-1 rounded-xl border-2 px-4 py-3 text-left transition-all ${
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-base-300 bg-white hover:border-primary/40'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Zap size={13} className={isSelected ? 'text-primary' : 'text-black/30'} />
                <span className={`text-xs font-semibold ${isSelected ? 'text-primary' : 'text-black/70'}`}>
                  {opt.label}
                </span>
                <span className={`ml-auto badge badge-sm ${isSelected ? 'badge-primary' : 'badge-outline'}`}>
                  {count} items
                </span>
              </div>
              <p className="text-xs text-black/40">{opt.description}</p>
            </button>
          );
        })}
        {saving && <Loader2 size={16} className="animate-spin text-primary self-center" />}
      </div>

      {/* Item editor */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Zap size={14} className="text-primary" />
          <span className="text-sm font-semibold text-black">{selectedOption.label}</span>
          <span className="text-xs text-black/40">— extra DD items</span>
          <span className="ml-auto badge badge-sm badge-outline">{selectedOption.description}</span>
        </div>

        <div className="border border-base-300 rounded-xl overflow-visible">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-base-300">
                <th className="w-6 px-2 py-2.5" />
                <th className="w-8 px-3 py-2.5 text-left text-xs font-semibold text-black/50">#</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-black/50">Item</th>
                <th className="w-20 px-3 py-2.5 text-center text-xs font-semibold text-black/50">Required</th>
                <th className="w-16 px-3 py-2.5 text-right text-xs font-semibold text-black/50">Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentItems.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-black/30 text-xs">
                    No extra items for {selectedOption.label.toLowerCase()} yet. Add below.
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
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => toggleRequired(item.id)}
                      className={`btn btn-xs rounded-full px-2 ${item.required ? 'btn-error text-white' : 'btn-ghost border border-base-300'}`}
                    >
                      {item.required ? '★ Req' : '☆ Opt'}
                    </button>
                  </td>
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
                          <button
                            className="w-full text-left px-3 py-1.5 hover:bg-gray-100 flex items-center gap-2"
                            onClick={() => { toggleRequired(item.id); setOpenMenuId(null); }}
                          >
                            <Star size={12} /> {item.required ? 'Mark Optional' : 'Mark Required'}
                          </button>
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

        <div className="flex gap-2 mt-3">
          <input
            className="input input-bordered flex-1 text-sm"
            placeholder={`Add a DD item for ${selectedOption.label.toLowerCase()}…`}
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addItem()}
          />
          <Button variant="primary" className="gap-1.5" onClick={addItem}>
            <Plus size={14} /> Add
          </Button>
        </div>
      </div>

      <ConfirmModal
        isOpen={deleteItemId !== null}
        title="Remove this item?"
        message="Remove this item from the loan type template?"
        confirmLabel="Remove"
        onConfirm={() => { if (deleteItemId) { deleteItem(deleteItemId); setDeleteItemId(null); } }}
        onCancel={() => setDeleteItemId(null)}
      />
    </div>
  );
}
