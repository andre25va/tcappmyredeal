import React, { useState, useRef, useEffect } from 'react';
import { Plus, Pencil, Trash2, X, Check, GripVertical, MoreVertical, Shield } from 'lucide-react';
import { ComplianceMasterItem } from '../../types';
import { generateId } from '../../utils/helpers';
import { ConfirmModal } from '../ConfirmModal';
import { Button } from '@/components/ui/Button';

interface ComplianceChecklistTabProps {
  items: ComplianceMasterItem[];
  onSave: (items: ComplianceMasterItem[]) => void;
}

export function ComplianceChecklistTab({ items, onSave }: ComplianceChecklistTabProps) {
  const [newTitle, setNewTitle] = useState('');
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);

  useEffect(() => {
    const handler = () => setOpenMenuId(null);
    if (openMenuId) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenuId]);

  const addItem = () => { const t = newTitle.trim(); if (!t) return; onSave([...items, { id: generateId(), title: t, order: items.length }]); setNewTitle(''); };
  const deleteItem = (id: string) => onSave(items.filter(i => i.id !== id));
  const renameItem = (id: string, title: string) => onSave(items.map(i => i.id === id ? { ...i, title } : i));
  const handleReorder = (dragId: string, dropId: string) => {
    if (dragId === dropId) return;
    const arr = [...items];
    const fromIdx = arr.findIndex(i => i.id === dragId);
    const toIdx = arr.findIndex(i => i.id === dropId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, moved);
    onSave(arr.map((i, o) => ({ ...i, order: o })));
  };

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-5">
      <div>
        <h2 className="text-base font-bold text-black">Compliance Checklist Master Items</h2>
        <p className="text-xs text-black/50 mt-0.5">These items appear in every Compliance Template.</p>
        <div className="mt-2 flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <Shield size={13} className="text-green-600 mt-0.5 shrink-0" />
          <p className="text-xs text-green-800"><strong>Compliance</strong> asks <em>"Is the file complete and correct?"</em></p>
        </div>
      </div>
      <div className="border border-base-300 rounded-xl overflow-visible">
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 border-b border-base-300">
            <th className="w-6 px-2 py-2.5"></th>
            <th className="w-8 px-3 py-2.5 text-left text-xs font-semibold text-black/50">#</th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold text-black/50">Item</th>
            <th className="w-16 px-3 py-2.5 text-right text-xs font-semibold text-black/50">Actions</th>
          </tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={4} className="text-center py-10 text-black/30 text-xs">No items yet.</td></tr>}
            {items.map((item, idx) => (
              <tr key={item.id} draggable onDragStart={() => { dragIdRef.current = item.id; }} onDragOver={(e) => { e.preventDefault(); setDragOverId(item.id); }} onDrop={() => { if (dragIdRef.current) handleReorder(dragIdRef.current, item.id); setDragOverId(null); }} onDragEnd={() => { dragIdRef.current = null; setDragOverId(null); }} className={`border-b border-base-300 last:border-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${dragOverId === item.id ? 'border-t-2 border-blue-400' : ''}`}>
                <td className="px-2 py-2 cursor-grab text-gray-300 hover:text-gray-500"><GripVertical size={14} /></td>
                <td className="px-3 py-2 text-xs text-black/30 font-mono">{idx + 1}</td>
                <td className="px-3 py-2">
                  {editingId === item.id ? (
                    <div className="flex gap-1">
                      <input autoFocus className="input input-bordered input-xs flex-1" value={editVal} onChange={e => setEditVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { renameItem(item.id, editVal); setEditingId(null); } if (e.key === 'Escape') setEditingId(null); }} />
                      <Button variant="success" size="xs" square onClick={() => { renameItem(item.id, editVal); setEditingId(null); }}><Check size={11} /></Button>
                      <Button variant="ghost" size="xs" square onClick={() => setEditingId(null)}><X size={11} /></Button>
                    </div>
                  ) : <span className="text-xs font-medium">{item.title}</span>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-0.5">
                    <div className="relative inline-block">
                      <Button variant="ghost" size="xs" square onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === item.id ? null : item.id); }}><MoreVertical size={13} /></Button>
                      {openMenuId === item.id && (
                        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-[200] min-w-36 py-1 text-sm" onMouseDown={e => e.stopPropagation()}>
                          <button className="w-full text-left px-3 py-1.5 hover:bg-gray-100 flex items-center gap-2" onClick={() => { setEditingId(item.id); setEditVal(item.title); setOpenMenuId(null); }}><Pencil size={12} /> Edit Title</button>
                          <div className="border-t border-gray-100 my-1" />
                          <button className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-600 flex items-center gap-2" onClick={() => { setDeleteItemId(item.id); setOpenMenuId(null); }}><Trash2 size={12} /> Delete</button>
                        </div>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <input className="input input-bordered flex-1 text-sm" placeholder="Type a compliance checklist item and press Enter…" value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && addItem()} />
        <Button variant="primary" className="gap-1.5" onClick={addItem}><Plus size={14} /> Add</Button>
      </div>
      <ConfirmModal isOpen={deleteItemId !== null} title="Remove this item?" message="Remove this item from the master compliance checklist?" confirmLabel="Remove" onConfirm={() => { if (deleteItemId) { deleteItem(deleteItemId); setDeleteItemId(null); } }} onCancel={() => setDeleteItemId(null)} />
    </div>
  );
}
