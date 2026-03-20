import { useAuth } from '../contexts/AuthContext';
import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import {
  CheckCircle2, Circle, Plus, Trash2, ClipboardList, Shield,
  Star, AlertCircle, Home, Eye, EyeOff, Pencil, Check, X, Lock, ChevronRight,
  MoreVertical, StickyNote, User, RotateCcw, GripVertical,
} from 'lucide-react';
import { Deal, ComplianceTemplate, ChecklistItem, AppUser, ContactRecord } from '../types';
import { checklistProgress, generateId, formatDate, daysUntil } from '../utils/helpers';
import { ConfirmModal } from './ConfirmModal';
import { SmartChecklistSuggestions } from './SmartChecklistSuggestions';

interface Props { deal: Deal; onUpdate: (d: Deal) => void; users?: AppUser[]; contactRecords?: ContactRecord[]; complianceTemplates?: any[]; }

// ─── Property-type auto-inject templates ──────────────────────────────────────
const CONDO_HOA_ITEMS: { title: string; required: boolean }[] = [
  { title: 'HOA Documents Received (CC&Rs, Bylaws, Rules)', required: true },
  { title: 'HOA Dues & Special Assessments Verified', required: true },
  { title: 'Condo Association Certificate / Questionnaire', required: true },
  { title: 'Master Insurance Policy Review', required: true },
  { title: 'Reserve Fund Study Review', required: false },
  { title: 'Pet & Rental Restrictions Confirmed', required: false },
  { title: 'Pending Litigation Check (Association)', required: true },
];

const MULTIFAMILY_ITEMS: { title: string; required: boolean }[] = [
  { title: 'Rent Roll Review (all units)', required: true },
  { title: 'Lease Agreements Reviewed (all units)', required: true },
  { title: 'Individual Unit Inspections Scheduled', required: true },
  { title: 'Tenant Estoppel Letters Obtained', required: true },
  { title: 'Income & Expense Statement (trailing 12 months)', required: true },
  { title: 'Building Permits & Code Violations Check', required: true },
  { title: 'Environmental / Phase I Assessment', required: false },
  { title: 'Multi-Family Addendum PDF Attached', required: true },
  { title: 'Zoning Compliance Verification', required: false },
];

// ─── Read-only DD Table Row (main view — completion via View All only) ─────────
const DDTableRow: React.FC<{
  item: ChecklistItem;
  rowIndex: number;   // 0-based for alternating colour
  rowNum: number;     // display number
  onDelete: () => void;
  onNote: (note: string) => void;
  onRename: (title: string) => void;
  onUndo: () => void;
  showCompleted: boolean;
  dragging?: boolean;
  dragOver?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
}> = ({ item, rowIndex, rowNum, onDelete, onNote, onRename, onUndo, showCompleted, dragging, dragOver, onDragStart, onDragOver, onDrop, onDragEnd }) => {
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteVal, setNoteVal]   = useState(item.notes ?? '');
  const [editing, setEditing]   = useState(false);
  const [editVal, setEditVal]   = useState(item.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) editRef.current?.focus(); }, [editing]);

  if (item.completed && !showCompleted) return null;

  const overdue = item.dueDate && !item.completed && daysUntil(item.dueDate) < 0;
  const dueSoon = item.dueDate && !item.completed && daysUntil(item.dueDate) <= 3 && daysUntil(item.dueDate) >= 0;

  // Alternating row colours — override with status highlight if overdue/due-soon
  const rowBg = overdue
    ? 'bg-red-50'
    : dueSoon
    ? 'bg-yellow-50'
    : item.completed
    ? (rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50')
    : (rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50');

  return (
    <div
      className={`flex items-stretch border-b border-gray-200 last:border-0 transition-colors group ${rowBg} ${item.completed ? 'opacity-60' : ''} ${dragging ? 'opacity-40' : ''} ${dragOver ? 'border-t-2 border-blue-500' : ''}`}
      draggable={true}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {/* Drag handle */}
      <div
        className="w-6 flex-none flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 border-r border-gray-200 py-2.5"
        title="Drag to reorder"
        onMouseDown={e => e.stopPropagation()}
      >
        <GripVertical size={13} />
      </div>
      {/* Row number */}
      <div className="w-9 flex-none flex items-center justify-center text-xs text-gray-400 font-mono select-none border-r border-gray-200 py-2.5">
        {rowNum}
      </div>

      {/* Status icon — read-only, tooltip points to View All */}
      <div
        className="w-9 flex-none flex items-center justify-center border-r border-gray-200 py-2.5"
        title={item.completed ? `Completed by ${item.completedBy ?? 'TC Staff'}` : 'Open View All to mark complete'}
      >
        {item.completed
          ? <CheckCircle2 size={15} className="text-success" />
          : <Circle size={15} className="text-gray-300" />}
      </div>

      {/* Title */}
      <div className="flex-1 min-w-0 px-3 py-2.5">
        {editing ? (
          <div className="flex gap-1">
            <input
              ref={editRef}
              className="input input-bordered input-xs flex-1"
              value={editVal}
              onChange={e => setEditVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { onRename(editVal); setEditing(false); }
                if (e.key === 'Escape') { setEditVal(item.title); setEditing(false); }
              }}
            />
            <button className="btn btn-success btn-xs btn-square" onClick={() => { onRename(editVal); setEditing(false); }}><Check size={11} /></button>
            <button className="btn btn-ghost btn-xs btn-square" onClick={() => { setEditVal(item.title); setEditing(false); }}><X size={11} /></button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`text-sm leading-snug cursor-text text-black ${item.completed ? 'line-through text-gray-400' : ''}`}
              onDoubleClick={() => { setEditVal(item.title); setEditing(true); }}
              title="Double-click to rename"
            >{item.title}</span>
            {item.required && !item.completed && (
              <span className="badge badge-xs badge-error gap-0.5"><Star size={8} /> Req</span>
            )}
            {item.dueDate && (
              <span className={`text-xs ${overdue ? 'text-red-600 font-semibold' : dueSoon ? 'text-yellow-600' : 'text-gray-400'}`}>
                {overdue ? '⚠' : dueSoon ? '⏰' : '📅'} {formatDate(item.dueDate)}
              </span>
            )}
          </div>
        )}
        {item.notes && !noteOpen && (
          <p className="text-xs text-gray-400 italic mt-0.5 truncate">{item.notes}</p>
        )}
        {noteOpen && (
          <div className="flex gap-1.5 mt-1.5" onClick={e => e.stopPropagation()}>
            <input
              className="input input-bordered input-xs flex-1"
              placeholder="Add note..."
              value={noteVal}
              autoFocus
              onChange={e => setNoteVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { onNote(noteVal); setNoteOpen(false); }
                if (e.key === 'Escape') setNoteOpen(false);
              }}
            />
            <button className="btn btn-primary btn-xs" onClick={() => { onNote(noteVal); setNoteOpen(false); }}>Save</button>
            <button className="btn btn-ghost btn-xs" onClick={() => setNoteOpen(false)}>Cancel</button>
          </div>
        )}
      </div>

      {/* 3-dot menu */}
      <DDRowMenu
        item={item}
        onRename={() => { setEditVal(item.title); setEditing(true); }}
        onNote={() => setNoteOpen(v => !v)}
        onDelete={() => setConfirmDelete(true)}
        onUndo={onUndo}
      />
      <ConfirmModal
        isOpen={confirmDelete}
        title="Delete Checklist Item?"
        message="Delete this checklist item? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => { setConfirmDelete(false); onDelete(); }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
};

// ─── 3-dot row menu for DD checklist items ─────────────────────────────────────
const DDRowMenu: React.FC<{
  item: ChecklistItem;
  onRename: () => void;
  onNote: () => void;
  onDelete: () => void;
  onUndo: () => void;
}> = ({ item, onRename, onNote, onDelete, onUndo }) => {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 4, left: rect.right - 185 });
    setOpen(v => !v);
  };

  return (
    <div
      className={`w-10 flex-none flex items-center justify-center border-l border-gray-200 relative transition-opacity ${open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}`}
      onClick={e => e.stopPropagation()}
    >
      <button
        ref={btnRef}
        className="btn btn-ghost btn-xs btn-square"
        onClick={handleOpen}
        title="More options"
      >
        <MoreVertical size={14} />
      </button>
      {open && ReactDOM.createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, zIndex: 99999, boxShadow: '0 8px 28px rgba(0,0,0,0.22)', backgroundColor: '#ffffff' }}
          className="border border-gray-300 rounded-lg py-1 min-w-[185px]"
        >
          {/* Completed By display */}
          {item.completed ? (
            <div className="px-3 py-2 border-b border-gray-100 mb-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Completed By</p>
              <div className="flex items-center gap-1.5">
                <User size={11} className="text-success flex-none" />
                <span className="text-xs text-success font-medium truncate">{item.completedBy ?? 'TC Staff'}</span>
              </div>
              {item.completedAt && (
                <p className="text-xs text-gray-400 mt-0.5 pl-4">{new Date(item.completedAt).toLocaleDateString()}</p>
              )}
            </div>
          ) : (
            <div className="px-3 py-2 border-b border-gray-100 mb-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Completed By</p>
              <p className="text-xs text-gray-400 italic">Not yet completed</p>
            </div>
          )}

          {/* Mark Incomplete — only for completed items */}
          {item.completed && (
            <button
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-amber-600 hover:bg-amber-50 font-medium"
              onClick={() => { setOpen(false); onUndo(); }}
            >
              <RotateCcw size={12} /> Mark Incomplete
            </button>
          )}

          <button
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-black hover:bg-gray-50"
            onClick={() => { setOpen(false); onRename(); }}
          >
            <Pencil size={12} /> Edit Title
          </button>
          <button
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-black hover:bg-gray-50"
            onClick={() => { setOpen(false); onNote(); }}
          >
            <StickyNote size={12} /> {item.notes ? 'Edit Note' : 'Add Note'}
          </button>
          <div className="border-t border-gray-100 mt-1 pt-1">
            <button
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-500 hover:bg-red-50"
              onClick={() => { setOpen(false); onDelete(); }}
            >
              <Trash2 size={12} /> Delete Item
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

// ─── Table header ──────────────────────────────────────────────────────────────
const TableHeader: React.FC<{ actionColWidth?: string }> = ({ actionColWidth = 'w-10' }) => (
  <div className="flex items-center bg-gray-100 border-b border-gray-300 sticky top-0 z-10">
    <div className="w-9 flex-none text-center py-2 text-xs font-bold text-gray-500 border-r border-gray-300">#</div>
    <div className="w-9 flex-none text-center py-2 text-xs font-bold text-gray-500 border-r border-gray-300">✓</div>
    <div className="flex-1 px-3 py-2 text-xs font-bold text-gray-500">Item</div>
    <div className={`${actionColWidth} flex-none border-l border-gray-300 py-2`} />
  </div>
);

// ─── 3-dot menu for Compliance checklist items ─────────────────────────────────
const ComplianceRowMenu: React.FC<{
  item: ChecklistItem;
  onRename: () => void;
  onNote: () => void;
  onDelete: () => void;
  onToggle: () => void;
}> = ({ item, onRename, onNote, onDelete, onToggle }) => {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const openMenu = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.right - 176 });
    }
    setOpen(v => !v);
  };

  return (
    <div className="flex-none flex items-center" onClick={e => e.stopPropagation()}>
      <button
        ref={btnRef}
        className="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100 focus:opacity-100"
        onClick={openMenu}
        title="More options"
      >
        <MoreVertical size={13} />
      </button>
      {open && ReactDOM.createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, zIndex: 99999, minWidth: 176 }}
          className="bg-white border border-gray-200 rounded-lg shadow-xl py-1 text-sm"
        >
          {/* Toggle complete */}
          <button
            className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left ${item.completed ? 'text-amber-600' : 'text-green-700'}`}
            onClick={() => { onToggle(); setOpen(false); }}
          >
            {item.completed
              ? <><RotateCcw size={13} /> Mark Incomplete</>
              : <><CheckCircle2 size={13} /> Mark Complete</>}
          </button>
          <div className="border-t border-gray-100 my-1" />
          <button
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left text-black"
            onClick={() => { onRename(); setOpen(false); }}
          ><Pencil size={13} /> Edit Title</button>
          <button
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left text-black"
            onClick={() => { onNote(); setOpen(false); }}
          ><AlertCircle size={13} />{item.notes ? 'Edit Note' : 'Add Note'}</button>
          <div className="border-t border-gray-100 my-1" />
          <button
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-red-50 text-left text-red-600"
            onClick={() => { onDelete(); setOpen(false); }}
          ><Trash2 size={13} /> Delete Item</button>
        </div>,
        document.body
      )}
    </div>
  );
};

// ─── Reusable Item Row (used by Compliance) ────────────────────────────────────
const ItemRow: React.FC<{
  item: ChecklistItem;
  onToggle: () => void;
  onDelete: () => void;
  onNote: (note: string) => void;
  onRename: (title: string) => void;
  showCompleted: boolean;
  dragging?: boolean;
  dragOver?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
}> = ({ item, onToggle, onDelete, onNote, onRename, showCompleted, dragging, dragOver, onDragStart, onDragOver, onDrop, onDragEnd }) => {
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteVal, setNoteVal]   = useState(item.notes ?? '');
  const [editing, setEditing]   = useState(false);
  const [editVal, setEditVal]   = useState(item.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) editRef.current?.focus(); }, [editing]);

  if (item.completed && !showCompleted) return null;

  const overdue  = item.dueDate && !item.completed && daysUntil(item.dueDate) < 0;
  const dueSoon  = item.dueDate && !item.completed && daysUntil(item.dueDate) <= 3 && daysUntil(item.dueDate) >= 0;

  return (
    <div
      className={`rounded-lg border transition-all group ${
        item.completed ? 'bg-base-100 border-base-200 opacity-50' :
        overdue        ? 'bg-error/5 border-error/30' :
        dueSoon        ? 'bg-warning/5 border-warning/30' :
                         'bg-base-100 border-base-300 hover:border-primary/30'
      } ${dragging ? 'opacity-40' : ''} ${dragOver ? 'border-t-2 border-blue-500' : ''}`}
      draggable={true}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className="flex items-start gap-2 px-2.5 py-2">
        <div className="flex-none mt-0.5 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500" title="Drag to reorder">
          <GripVertical size={13} />
        </div>
        <button className="flex-none mt-0.5 hover:scale-110 transition-transform" onClick={onToggle}>
          {item.completed
            ? <CheckCircle2 size={15} className="text-success" />
            : <Circle size={15} className="opacity-30 hover:opacity-70" />}
        </button>
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex gap-1">
              <input
                ref={editRef}
                className="input input-bordered input-xs flex-1"
                value={editVal}
                onChange={e => setEditVal(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { onRename(editVal); setEditing(false); }
                  if (e.key === 'Escape') { setEditVal(item.title); setEditing(false); }
                }}
              />
              <button className="btn btn-success btn-xs btn-square" onClick={() => { onRename(editVal); setEditing(false); }}><Check size={11} /></button>
              <button className="btn btn-ghost btn-xs btn-square" onClick={() => { setEditVal(item.title); setEditing(false); }}><X size={11} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={`text-sm leading-snug cursor-text ${item.completed ? 'line-through text-base-content/40' : 'text-base-content'}`}
                onDoubleClick={() => { setEditVal(item.title); setEditing(true); }}
                title="Double-click to rename"
              >{item.title}</span>
              {item.required && !item.completed && (
                <span className="badge badge-xs badge-error gap-0.5"><Star size={8} /> Req</span>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {item.dueDate && (
              <span className={`text-xs ${overdue ? 'text-error font-semibold' : dueSoon ? 'text-warning' : 'text-base-content/40'}`}>
                {overdue ? '⚠ Overdue · ' : dueSoon ? '⏰ Soon · ' : '📅 '}
                {formatDate(item.dueDate)}
              </span>
            )}
            {item.completedBy && <span className="text-xs text-success/70">✓ {item.completedBy}</span>}
            {item.notes && !noteOpen && (
              <span className="text-xs text-base-content/40 italic truncate max-w-48">{item.notes}</span>
            )}
          </div>
          {noteOpen && (
            <div className="flex gap-1.5 mt-1.5" onClick={e => e.stopPropagation()}>
              <input
                className="input input-bordered input-xs flex-1"
                placeholder="Add note..."
                value={noteVal}
                autoFocus
                onChange={e => setNoteVal(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { onNote(noteVal); setNoteOpen(false); }
                  if (e.key === 'Escape') setNoteOpen(false);
                }}
              />
              <button className="btn btn-primary btn-xs" onClick={() => { onNote(noteVal); setNoteOpen(false); }}>Save</button>
              <button className="btn btn-ghost btn-xs" onClick={() => setNoteOpen(false)}>Cancel</button>
            </div>
          )}
        </div>
        <ComplianceRowMenu
          item={item}
          onToggle={onToggle}
          onRename={() => { setEditVal(item.title); setEditing(true); }}
          onNote={() => setNoteOpen(v => !v)}
          onDelete={() => setConfirmDelete(true)}
        />
      </div>
      <ConfirmModal
        isOpen={confirmDelete}
        title="Delete Checklist Item?"
        message="Delete this checklist item? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => { setConfirmDelete(false); onDelete(); }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
};

// ─── Compliance Section ────────────────────────────────────────────────────────
const ComplianceSection: React.FC<{
  items: ChecklistItem[];
  showCompleted: boolean;
  onToggle: (id: string) => void;
  onAdd: (title: string, dueDate: string) => void;
  onDelete: (id: string) => void;
  onNote: (id: string, note: string) => void;
  onRename: (id: string, title: string) => void;
  onReorder?: (dragId: string, dropId: string) => void;
  bare?: boolean;  // when true, skip the header/wrapper (used inside ComplianceTabPanel)
}> = ({ items, showCompleted, onToggle, onAdd, onDelete, onNote, onRename, onReorder, bare }) => {
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate]   = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const compDragId = useRef<string | null>(null);
  const [compOverId, setCompOverId] = useState<string | null>(null);

  const submit = () => {
    if (!newTitle.trim()) return;
    onAdd(newTitle.trim(), newDate);
    setNewTitle(''); setNewDate('');
    inputRef.current?.focus();
  };

  const inner = (
    <>
      <div className="flex gap-2 items-center mb-3">
        <input
          ref={inputRef}
          className="input input-bordered input-sm flex-1"
          placeholder="+ Add compliance item... (press Enter)"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        />
        <input type="date" className="input input-bordered input-sm w-32 flex-none" value={newDate} onChange={e => setNewDate(e.target.value)} />
        <button className="btn btn-secondary btn-sm gap-1 flex-none" onClick={submit}><Plus size={13} /> Add</button>
      </div>
      <div className="space-y-1.5">
        {items.length === 0 && (
          <p className="text-xs text-base-content/30 text-center py-4 border border-dashed border-base-300 rounded-xl">
            No compliance items yet — add items above or load a template
          </p>
        )}
        {[...items].sort((a, b) => Number(a.completed) - Number(b.completed)).map(item => (
          <ItemRow
            key={item.id}
            item={item}
            showCompleted={showCompleted}
            onToggle={() => onToggle(item.id)}
            onDelete={() => onDelete(item.id)}
            onNote={(note) => onNote(item.id, note)}
            onRename={(title) => onRename(item.id, title)}
            dragging={compDragId.current === item.id}
            dragOver={compOverId === item.id}
            onDragStart={() => { compDragId.current = item.id; }}
            onDragOver={(e) => { e.preventDefault(); setCompOverId(item.id); }}
            onDrop={() => { if (compDragId.current && onReorder) onReorder(compDragId.current, item.id); setCompOverId(null); }}
            onDragEnd={() => { compDragId.current = null; setCompOverId(null); }}
          />
        ))}
      </div>
    </>
  );

  if (bare) return <div className="flex flex-col gap-0">{inner}</div>;

  const prog = checklistProgress(items);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 bg-secondary/10 border border-secondary/20 rounded-xl p-3">
        <Shield size={15} className="text-secondary flex-none" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-base-content">Compliance Checklist</p>
          <p className="text-xs text-base-content/50">Broker/company provided items per deal</p>
        </div>
        <div className="flex items-center gap-2 flex-none">
          <progress className="progress progress-secondary w-20 h-2" value={prog.percent} max={100} />
          <span className="text-xs font-bold text-secondary">{prog.percent}%</span>
          <span className="badge badge-secondary badge-sm">{prog.completed}/{prog.total}</span>
        </div>
      </div>
      {inner}
    </div>
  );
};

// ─── Compliance Tab Panel ─────────────────────────────────────────────────────
const ComplianceTabPanel: React.FC<{
  deal: Deal;
  complianceTemplates: ComplianceTemplate[];
  contactRecords: ContactRecord[];
  showCompleted: boolean;
  onToggle: (id: string) => void;
  onAdd: (title: string, dueDate: string) => void;
  onDelete: (id: string) => void;
  onNote: (id: string, note: string) => void;
  onRename: (id: string, title: string) => void;
  onLoadTemplate: (tplId: string) => void;
  onSetTemplateId: (tplId: string) => void;
  onReorder?: (dragId: string, dropId: string) => void;
}> = ({ deal, complianceTemplates, contactRecords, showCompleted, onToggle, onAdd, onDelete, onNote, onRename, onLoadTemplate, onSetTemplateId, onReorder }) => {
  const [listOpen, setListOpen] = useState(true);
  const [confirmLoad, setConfirmLoad] = useState<{ tplId: string; name: string } | null>(null);

  // Determine current template — manual override OR auto-wired from agent client
  const autoTpl = (complianceTemplates ?? []).find((t) =>
    (t.agentClientIds ?? (t.agentClientId ? [t.agentClientId] : [])).includes(deal.agentClientId ?? '')
  );
  const currentTplId = deal.complianceTemplateId ?? autoTpl?.id ?? '';
  const currentTpl = (complianceTemplates ?? []).find((t) => t.id === currentTplId);
  const agentClient = contactRecords?.find(c => c.id === deal.agentClientId);

  const handleSelectTemplate = (tplId: string) => {
    if (!tplId) return;
    const tpl = (complianceTemplates ?? []).find((t) => t.id === tplId);
    if (!tpl) return;
    if (deal.complianceChecklist.length > 0) {
      setConfirmLoad({ tplId, name: tpl.name });
    } else {
      onLoadTemplate(tplId);
    }
  };

  const prog = checklistProgress(deal.complianceChecklist);

  return (
    <div className="overflow-y-auto flex-1 min-h-0 pr-0.5 flex flex-col gap-3">

      {/* ── Template Selector ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <Shield size={14} className="text-secondary flex-none" />
          <span className="text-sm font-semibold text-black">Compliance Template</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            className="select select-bordered select-sm flex-1 min-w-[160px] text-black bg-white"
            value={currentTplId}
            onChange={e => handleSelectTemplate(e.target.value)}
          >
            <option value="">— Select a template —</option>
            {(complianceTemplates ?? []).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {currentTpl && (
            <span className="badge badge-sm bg-blue-100 text-blue-700 border-0 gap-1">
              <Shield size={9} /> {currentTpl.name}
              {currentTpl.inspectionPeriodDays ? ` · ${currentTpl.inspectionPeriodDays}d inspection` : ''}
            </span>
          )}
        </div>

        {!currentTpl && complianceTemplates.length === 0 && (
          <p className="text-xs text-gray-400 mt-2 italic">No templates yet — create one in the Compliance menu.</p>
        )}

        {autoTpl && !deal.complianceTemplateId && (
          <p className="text-xs text-blue-500 mt-1.5">
            ↑ Auto-matched from agent client{agentClient ? ` (${agentClient.fullName})` : ''}
          </p>
        )}
      </div>

      {/* ── Checklist Items — Collapsible ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* Clickable header */}
        <button
          className="w-full flex items-center gap-3 px-4 py-3 bg-secondary/10 border-b border-secondary/20 hover:bg-secondary/15 transition-colors"
          onClick={() => setListOpen(o => !o)}
        >
          <Shield size={14} className="text-secondary flex-none" />
          <div className="flex-1 text-left">
            <p className="text-sm font-bold text-black">Compliance Checklist</p>
            <p className="text-xs text-black/40">Broker/company items per deal</p>
          </div>
          <div className="flex items-center gap-2 flex-none">
            <progress className="progress progress-secondary w-20 h-2" value={prog.percent} max={100} />
            <span className="text-xs font-bold text-secondary">{prog.percent}%</span>
            <span className="badge badge-secondary badge-sm">{prog.completed}/{prog.total}</span>
            <ChevronRight size={14} className={`text-secondary transition-transform ${listOpen ? 'rotate-90' : ''}`} />
          </div>
        </button>

        {/* Items list — collapsible */}
        {listOpen && (
          <div className="p-3">
            <ComplianceSection
              items={deal.complianceChecklist}
              showCompleted={showCompleted}
              onToggle={onToggle}
              onAdd={onAdd}
              onDelete={onDelete}
              onNote={onNote}
              onRename={onRename}
              onReorder={onReorder}
              bare
            />
          </div>
        )}
      </div>

      {/* ── Confirm overwrite modal ── */}
      {confirmLoad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 flex flex-col gap-4">
            <h3 className="font-bold text-black text-base">Replace checklist?</h3>
            <p className="text-sm text-black/70">
              Loading <strong>"{confirmLoad.name}"</strong> will replace the {deal.complianceChecklist.length} existing item{deal.complianceChecklist.length !== 1 ? 's' : ''} with the template's items.
            </p>
            <p className="text-xs text-gray-400">This cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmLoad(null)}>Cancel</button>
              <button
                className="btn btn-error btn-sm"
                onClick={() => { onLoadTemplate(confirmLoad.tplId); setConfirmLoad(null); }}
              >
                Yes, replace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────────
export const WorkspaceChecklists: React.FC<Props> = ({ deal, onUpdate, users = [], contactRecords = [], complianceTemplates = [] }) => {
  const { profile } = useAuth();
  const userName = profile?.name || 'TC Staff';
  const [activeTab, setActiveTab]               = useState<'dd' | 'compliance'>('dd');
  const [showCompleted, setShowCompleted]       = useState(true);
  const [showViewModal, setShowViewModal]       = useState(false);
  const [completingId, setCompletingId]         = useState<string | null>(null);
  const [completionDate, setCompletionDate]     = useState('');
  const [completionUser, setCompletionUser]     = useState('');
  const [viewFilter, setViewFilter]             = useState<'all' | 'incomplete' | 'complete'>('all');
  const [addOpen, setAddOpen]                   = useState(false);
  const [addTitle, setAddTitle]                 = useState('');
  const [addReq, setAddReq]                     = useState(false);
  const addRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (addOpen) addRef.current?.focus(); }, [addOpen]);

  // ── DD drag-and-drop ───────────────────────────────────────────────────────
  const ddDragId = useRef<string | null>(null);
  const [ddOverId, setDdOverId] = useState<string | null>(null);

  const reorderDD = (dragId: string, dropId: string) => {
    if (dragId === dropId) return;
    const arr = [...deal.dueDiligenceChecklist];
    const fromIdx = arr.findIndex(i => i.id === dragId);
    const toIdx   = arr.findIndex(i => i.id === dropId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [item] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, item);
    onUpdate({ ...deal, dueDiligenceChecklist: arr, updatedAt: new Date().toISOString() });
  };

  // ── Compliance drag-and-drop ───────────────────────────────────────────────
  const reorderCompliance = (dragId: string, dropId: string) => {
    if (dragId === dropId) return;
    const arr = [...deal.complianceChecklist];
    const fromIdx = arr.findIndex(i => i.id === dragId);
    const toIdx   = arr.findIndex(i => i.id === dropId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [item] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, item);
    onUpdate({ ...deal, complianceChecklist: arr, updatedAt: new Date().toISOString() });
  };

  // ── Auto-inject property-type items ────────────────────────────────────────
  useEffect(() => {
    const isCondo = deal.propertyType === 'condo';
    const isMulti = deal.propertyType === 'multi-family';
    const existingIds = new Set(deal.dueDiligenceChecklist.map(i => i.source ?? ''));

    const toAdd: ChecklistItem[] = [];

    if (isCondo && !existingIds.has('auto-condo')) {
      CONDO_HOA_ITEMS.forEach(({ title, required }) => {
        toAdd.push({ id: generateId(), title, completed: false, category: 'HOA & Property', required, autoGenerated: true, source: 'auto-condo' });
      });
    }
    if (isMulti && !existingIds.has('auto-multifamily')) {
      MULTIFAMILY_ITEMS.forEach(({ title, required }) => {
        toAdd.push({ id: generateId(), title, completed: false, category: 'HOA & Property', required, autoGenerated: true, source: 'auto-multifamily' });
      });
    }

    const filtered = deal.dueDiligenceChecklist.filter(i => {
      if (i.source === 'auto-condo' && !isCondo)       return false;
      if (i.source === 'auto-multifamily' && !isMulti) return false;
      return true;
    });

    if (toAdd.length > 0 || filtered.length !== deal.dueDiligenceChecklist.length) {
      onUpdate({ ...deal, dueDiligenceChecklist: [...filtered, ...toAdd], updatedAt: new Date().toISOString() });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal.propertyType]);

  const log = (d: Deal, msg: string): Deal => ({
    ...d,
    activityLog: [{ id: generateId(), timestamp: new Date().toISOString(), action: msg, user: userName, type: 'checklist' }, ...d.activityLog],
    updatedAt: new Date().toISOString(),
  });

  // ── DD handlers (completion only from modal) ───────────────────────────────
  const completeDDFromModal = (id: string) => {
    const item = deal.dueDiligenceChecklist.find(i => i.id === id)!;
    const dateStr = completionDate || new Date().toISOString().split('T')[0];
    const userStr = completionUser || users.find(u => u.active)?.name || userName;
    onUpdate(log({
      ...deal,
      dueDiligenceChecklist: deal.dueDiligenceChecklist.map(i =>
        i.id === id ? { ...i, completed: true, completedAt: new Date(dateStr + 'T12:00:00').toISOString(), completedBy: userStr } : i
      ),
    }, `DD: "${item.title}" completed by ${userStr}`));
    setCompletingId(null); setCompletionDate(''); setCompletionUser('');
  };

  const uncompleteDD = (id: string) => {
    const item = deal.dueDiligenceChecklist.find(i => i.id === id)!;
    onUpdate(log({
      ...deal,
      dueDiligenceChecklist: deal.dueDiligenceChecklist.map(i =>
        i.id === id ? { ...i, completed: false, completedAt: undefined, completedBy: undefined } : i
      ),
    }, `DD: "${item.title}" marked incomplete`));
  };

  const addDD = (title: string, required: boolean) => {
    onUpdate(log({
      ...deal,
      dueDiligenceChecklist: [...deal.dueDiligenceChecklist, { id: generateId(), title, completed: false, required }],
    }, `DD item added: "${title}"`));
    setAddTitle(''); setAddReq(false); setAddOpen(false);
  };

  const deleteDD = (id: string) => {
    const item = deal.dueDiligenceChecklist.find(i => i.id === id);
    onUpdate(log({ ...deal, dueDiligenceChecklist: deal.dueDiligenceChecklist.filter(i => i.id !== id) }, `DD item deleted: "${item?.title}"`));
  };

  const noteDD = (id: string, note: string) => onUpdate({
    ...deal,
    dueDiligenceChecklist: deal.dueDiligenceChecklist.map(i => i.id === id ? { ...i, notes: note } : i),
    updatedAt: new Date().toISOString(),
  });

  const renameDD = (id: string, title: string) => {
    if (!title.trim()) return;
    onUpdate(log({
      ...deal,
      dueDiligenceChecklist: deal.dueDiligenceChecklist.map(i => i.id === id ? { ...i, title: title.trim() } : i),
    }, `DD item renamed: "${title}"`));
  };

  // ── Compliance handlers ────────────────────────────────────────────────────
  const toggleComp = (id: string) => {
    const item = deal.complianceChecklist.find(i => i.id === id)!;
    const completed = !item.completed;
    onUpdate(log({
      ...deal,
      complianceChecklist: deal.complianceChecklist.map(i =>
        i.id === id ? { ...i, completed, completedAt: completed ? new Date().toISOString() : undefined, completedBy: completed ? userName : undefined } : i
      ),
    }, `Compliance: "${item.title}" marked ${completed ? 'complete ✓' : 'incomplete'}`));
  };

  const addComp = (title: string, dueDate: string) => {
    onUpdate(log({
      ...deal,
      complianceChecklist: [...deal.complianceChecklist, { id: generateId(), title, completed: false, dueDate: dueDate || undefined }],
    }, `Compliance item added: "${title}"`));
  };

  const deleteComp = (id: string) => {
    const item = deal.complianceChecklist.find(i => i.id === id);
    onUpdate(log({ ...deal, complianceChecklist: deal.complianceChecklist.filter(i => i.id !== id) }, `Compliance item deleted: "${item?.title}"`));
  };

  const noteComp = (id: string, note: string) => onUpdate({
    ...deal,
    complianceChecklist: deal.complianceChecklist.map(i => i.id === id ? { ...i, notes: note } : i),
    updatedAt: new Date().toISOString(),
  });

  const renameComp = (id: string, title: string) => {
    if (!title.trim()) return;
    onUpdate(log({
      ...deal,
      complianceChecklist: deal.complianceChecklist.map(i => i.id === id ? { ...i, title: title.trim() } : i),
    }, `Compliance item renamed: "${title}"`));
  };

  // ── Progress ───────────────────────────────────────────────────────────────
  const ddProg   = checklistProgress(deal.dueDiligenceChecklist);
  const compProg = checklistProgress(deal.complianceChecklist);
  const ddRequiredPending   = deal.dueDiligenceChecklist.filter(i => i.required && !i.completed).length;
  const compRequiredPending = deal.complianceChecklist.filter(i => i.required && !i.completed).length;

  // Split DD items into standard vs auto-injected
  const standardItems  = deal.dueDiligenceChecklist.filter(i => !i.autoGenerated);
  const autoCondoItems = deal.dueDiligenceChecklist.filter(i => i.source === 'auto-condo');
  const autoMultiItems = deal.dueDiligenceChecklist.filter(i => i.source === 'auto-multifamily');

  const sortIncompleteFirst = (arr: ChecklistItem[]) =>
    [...arr].sort((a, b) => Number(a.completed) - Number(b.completed));

  const visibleStandard  = sortIncompleteFirst(showCompleted ? standardItems  : standardItems.filter(i => !i.completed));
  const visibleCondo     = sortIncompleteFirst(showCompleted ? autoCondoItems : autoCondoItems.filter(i => !i.completed));
  const visibleMulti     = sortIncompleteFirst(showCompleted ? autoMultiItems : autoMultiItems.filter(i => !i.completed));

  // Modal data — split into standard vs auto-injected
  const modalAll        = deal.dueDiligenceChecklist;
  const modalStandard   = modalAll.filter(i => !i.autoGenerated);
  const modalCondoItems = modalAll.filter(i => i.source === 'auto-condo');
  const modalMultiItems = modalAll.filter(i => i.source === 'auto-multifamily');

  const applyFilter = (items: ChecklistItem[]) =>
    viewFilter === 'incomplete' ? items.filter(i => !i.completed)
    : viewFilter === 'complete'  ? items.filter(i =>  i.completed)
    : items;

  const modalFilteredStandard = applyFilter(modalStandard);
  const modalFilteredCondo    = applyFilter(modalCondoItems);
  const modalFilteredMulti    = applyFilter(modalMultiItems);

  const modalTotalDone = modalAll.filter(i => i.completed).length;
  const modalTotalLeft = modalAll.filter(i => !i.completed).length;

  // Render a table block (shared helper)
  const renderTableBlock = (
    items: ChecklistItem[],
    allItems: ChecklistItem[],
    label: string,
    labelBg: string,
    rowOffset: number,
  ) => {
    let visibleCount = 0;
    return (
      <div className="border border-gray-300 rounded-xl overflow-hidden flex-none">
        {/* Section label */}
        <div className={`px-3 py-1.5 flex items-center gap-2 border-b border-gray-300 ${labelBg}`}>
          <span className="text-xs font-bold text-black uppercase tracking-wide">{label}</span>
          <span className="text-xs text-gray-500 ml-auto">{allItems.filter(i => i.completed).length}/{allItems.length} complete</span>
        </div>
        <TableHeader />
        {items.length === 0 && (
          <div className="py-5 text-center text-xs text-gray-400">
            {allItems.length > 0 ? '🎉 All items complete!' : 'No items'}
          </div>
        )}
        {items.map(item => {
          visibleCount++;
          return (
            <DDTableRow
              key={item.id}
              item={item}
              rowIndex={visibleCount - 1}
              rowNum={rowOffset + visibleCount}
              onDelete={() => deleteDD(item.id)}
              onNote={(note) => noteDD(item.id, note)}
              onRename={(title) => renameDD(item.id, title)}
              onUndo={() => uncompleteDD(item.id)}
              showCompleted={showCompleted}
              dragging={ddDragId.current === item.id}
              dragOver={ddOverId === item.id}
              onDragStart={() => { ddDragId.current = item.id; }}
              onDragOver={(e) => { e.preventDefault(); setDdOverId(item.id); }}
              onDrop={() => { if (ddDragId.current) reorderDD(ddDragId.current, item.id); setDdOverId(null); }}
              onDragEnd={() => { ddDragId.current = null; setDdOverId(null); }}
            />
          );
        })}
      </div>
    );
  };

  return (
    <>
    <div className="p-4 flex flex-col gap-3 h-full min-h-0">
      {/* Tab switcher + controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1.5 flex-1">
          <button
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'dd' ? 'bg-primary text-primary-content' : 'bg-base-200 text-base-content hover:bg-base-300'}`}
            onClick={() => setActiveTab('dd')}
          >
            <ClipboardList size={13} />
            Due Diligence
            {ddRequiredPending > 0 && <span className="badge badge-error badge-xs">{ddRequiredPending}</span>}
            <span className={`badge badge-xs ${activeTab === 'dd' ? 'bg-white/20 text-white' : 'badge-ghost'}`}>{ddProg.percent}%</span>
          </button>
          <button
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'compliance' ? 'bg-secondary text-secondary-content' : 'bg-base-200 text-base-content hover:bg-base-300'}`}
            onClick={() => setActiveTab('compliance')}
          >
            <Shield size={13} />
            Compliance
            {compRequiredPending > 0 && <span className="badge badge-error badge-xs">{compRequiredPending}</span>}
            <span className={`badge badge-xs ${activeTab === 'compliance' ? 'bg-white/20 text-white' : 'badge-ghost'}`}>{compProg.percent}%</span>
          </button>
        </div>
        <button
          className="btn btn-ghost btn-xs gap-1 text-base-content/50"
          onClick={() => setShowCompleted(v => !v)}
        >
          {showCompleted ? <EyeOff size={12} /> : <Eye size={12} />}
          {showCompleted ? 'Hide done' : 'Show done'}
        </button>
        {activeTab === 'dd' && (
          <button
            className="btn btn-outline btn-xs gap-1"
            onClick={() => { setShowViewModal(true); setViewFilter('all'); }}
          >
            <Eye size={11}/> View All
          </button>
        )}
      </div>

      {/* Smart Checklist Suggestions */}
      <SmartChecklistSuggestions deal={deal} onUpdate={onUpdate} />

      {/* DD Tab */}
      {activeTab === 'dd' && (
        <div className="flex flex-col gap-3 overflow-y-auto flex-1 min-h-0 pr-0.5">

          {/* Overall progress bar */}
          <div className="flex flex-wrap items-center gap-2 bg-gray-50 rounded-xl p-2.5 border border-gray-200 flex-none">
            <ClipboardList size={14} className="text-primary opacity-70 shrink-0" />
            <div className="flex-1 min-w-[120px]">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-black whitespace-nowrap">Overall DD Progress</p>
                <span className="text-xs font-bold text-black whitespace-nowrap">{ddProg.completed}/{ddProg.total}</span>
              </div>
              <progress className="progress progress-primary h-2 w-full" value={ddProg.percent} max={100} />
            </div>
            {ddRequiredPending > 0 && (
              <div className="flex items-center gap-1 text-red-600 text-xs font-bold shrink-0">
                <AlertCircle size={12} /> {ddRequiredPending} req'd
              </div>
            )}
            <div className="flex items-center gap-1 text-xs text-gray-400 shrink-0 border-l border-gray-200 pl-2">
              <Lock size={10} />
              <span className="hidden sm:inline">Complete via View All</span>
              <span className="sm:hidden">View All</span>
            </div>
          </div>

          {/* ── Standard DD items table ──────────────────────────────────── */}
          <div className="border border-gray-300 rounded-xl overflow-hidden flex-none">
            <div className="px-3 py-1.5 flex items-center gap-2 border-b border-gray-300 bg-gray-100">
              <ClipboardList size={12} className="text-gray-600" />
              <span className="text-xs font-bold text-black uppercase tracking-wide">Due Diligence Items</span>
              <span className="text-xs text-gray-500 ml-auto">{standardItems.filter(i => i.completed).length}/{standardItems.length} complete</span>
            </div>
            <TableHeader />

            {visibleStandard.length === 0 && (
              <div className="py-5 text-center text-xs text-gray-400">
                {standardItems.length > 0 ? '🎉 All items complete!' : 'No items yet'}
              </div>
            )}
            {(() => {
              let rowCount = 0;
              return visibleStandard.map(item => {
                rowCount++;
                return (
                  <DDTableRow
                    key={item.id}
                    item={item}
                    rowIndex={rowCount - 1}
                    rowNum={rowCount}
                    onDelete={() => deleteDD(item.id)}
                    onNote={(note) => noteDD(item.id, note)}
                    onRename={(title) => renameDD(item.id, title)}
                    onUndo={() => uncompleteDD(item.id)}
                    showCompleted={showCompleted}
                    dragging={ddDragId.current === item.id}
                    dragOver={ddOverId === item.id}
                    onDragStart={() => { ddDragId.current = item.id; }}
                    onDragOver={(e) => { e.preventDefault(); setDdOverId(item.id); }}
                    onDrop={() => { if (ddDragId.current) reorderDD(ddDragId.current, item.id); setDdOverId(null); }}
                    onDragEnd={() => { ddDragId.current = null; setDdOverId(null); }}
                  />
                );
              });
            })()}

            {/* Add item row */}
            {!addOpen ? (
              <div className="flex border-t border-gray-200 bg-white">
                <div className="w-9 border-r border-gray-200" />
                <div className="w-9 border-r border-gray-200" />
                <button
                  className="flex-1 btn btn-ghost btn-xs gap-1 text-gray-400 hover:text-primary justify-start px-3 rounded-none"
                  onClick={() => setAddOpen(true)}
                >
                  <Plus size={11} /> Add item to this deal's checklist
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-t border-gray-300">
                <input
                  ref={addRef}
                  className="input input-bordered input-xs flex-1"
                  placeholder="New DD item..."
                  value={addTitle}
                  onChange={e => setAddTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && addTitle.trim()) addDD(addTitle, addReq);
                    if (e.key === 'Escape') { setAddOpen(false); setAddTitle(''); }
                  }}
                />
                <label className="flex items-center gap-1 text-xs cursor-pointer select-none whitespace-nowrap text-black">
                  <input type="checkbox" className="checkbox checkbox-xs checkbox-error" checked={addReq} onChange={e => setAddReq(e.target.checked)} />
                  Required
                </label>
                <button className="btn btn-primary btn-xs" onClick={() => { if (addTitle.trim()) addDD(addTitle, addReq); }}>Add</button>
                <button className="btn btn-ghost btn-xs btn-square" onClick={() => { setAddOpen(false); setAddTitle(''); }}><X size={11} /></button>
              </div>
            )}
          </div>

          {/* ── Auto-injected: Condo HOA ─────────────────────────────────── */}
          {autoCondoItems.length > 0 && (
            <div className="border border-gray-300 rounded-xl overflow-hidden flex-none">
              <div className="px-3 py-1.5 flex items-center gap-2 border-b border-gray-300 bg-gray-200">
                <Home size={12} className="text-gray-700" />
                <span className="text-xs font-bold text-black uppercase tracking-wide">HOA / Condo Items</span>
                <span className="badge badge-xs bg-gray-400 text-white border-0 ml-1">Auto-added</span>
                <span className="text-xs text-gray-500 ml-auto">{autoCondoItems.filter(i => i.completed).length}/{autoCondoItems.length} complete</span>
              </div>
              <TableHeader />
              {visibleCondo.length === 0 ? (
                <div className="py-5 text-center text-xs text-gray-400">🎉 All HOA items complete!</div>
              ) : (
                (() => {
                  let c = 0;
                  return visibleCondo.map(item => {
                    c++;
                    return (
                      <DDTableRow
                        key={item.id}
                        item={item}
                        rowIndex={c - 1}
                        rowNum={c}
                        onDelete={() => deleteDD(item.id)}
                        onNote={(note) => noteDD(item.id, note)}
                        onRename={(title) => renameDD(item.id, title)}
                        onUndo={() => uncompleteDD(item.id)}
                        showCompleted={showCompleted}
                        dragging={ddDragId.current === item.id}
                        dragOver={ddOverId === item.id}
                        onDragStart={() => { ddDragId.current = item.id; }}
                        onDragOver={(e) => { e.preventDefault(); setDdOverId(item.id); }}
                        onDrop={() => { if (ddDragId.current) reorderDD(ddDragId.current, item.id); setDdOverId(null); }}
                        onDragEnd={() => { ddDragId.current = null; setDdOverId(null); }}
                      />
                    );
                  });
                })()
              )}
            </div>
          )}

          {/* ── Auto-injected: Multi-Family ──────────────────────────────── */}
          {autoMultiItems.length > 0 && (
            <div className="border border-gray-300 rounded-xl overflow-hidden flex-none">
              <div className="px-3 py-1.5 flex items-center gap-2 border-b border-gray-300 bg-gray-200">
                <Home size={12} className="text-gray-700" />
                <span className="text-xs font-bold text-black uppercase tracking-wide">Multi-Family Items</span>
                <span className="badge badge-xs bg-gray-400 text-white border-0 ml-1">Auto-added</span>
                <span className="text-xs text-gray-500 ml-auto">{autoMultiItems.filter(i => i.completed).length}/{autoMultiItems.length} complete</span>
              </div>
              <TableHeader />
              {visibleMulti.length === 0 ? (
                <div className="py-5 text-center text-xs text-gray-400">🎉 All multi-family items complete!</div>
              ) : (
                (() => {
                  let c = 0;
                  return visibleMulti.map(item => {
                    c++;
                    return (
                      <DDTableRow
                        key={item.id}
                        item={item}
                        rowIndex={c - 1}
                        rowNum={c}
                        onDelete={() => deleteDD(item.id)}
                        onNote={(note) => noteDD(item.id, note)}
                        onRename={(title) => renameDD(item.id, title)}
                        onUndo={() => uncompleteDD(item.id)}
                        showCompleted={showCompleted}
                        dragging={ddDragId.current === item.id}
                        dragOver={ddOverId === item.id}
                        onDragStart={() => { ddDragId.current = item.id; }}
                        onDragOver={(e) => { e.preventDefault(); setDdOverId(item.id); }}
                        onDrop={() => { if (ddDragId.current) reorderDD(ddDragId.current, item.id); setDdOverId(null); }}
                        onDragEnd={() => { ddDragId.current = null; setDdOverId(null); }}
                      />
                    );
                  });
                })()
              )}
            </div>
          )}

        </div>
      )}

      {/* Compliance Tab */}
      {activeTab === 'compliance' && (
        <ComplianceTabPanel
          deal={deal}
          complianceTemplates={complianceTemplates}
          contactRecords={contactRecords}
          showCompleted={showCompleted}
          onToggle={toggleComp}
          onAdd={addComp}
          onDelete={deleteComp}
          onNote={noteComp}
          onRename={renameComp}
          onLoadTemplate={(tplId: string) => {
            const tpl = (complianceTemplates ?? []).find((t) => t.id === tplId);
            if (!tpl) return;
            const loadedItems: ChecklistItem[] = tpl.items.map((i: { title: string; required?: boolean }) => ({
              id: generateId(),
              title: i.title,
              completed: false,
              required: i.required ?? false,
            }));
            onUpdate({
              ...deal,
              complianceTemplateId: tplId,
              complianceChecklist: loadedItems,
              activityLog: [
                ...(deal.activityLog ?? []),
                { id: generateId(), action: `Compliance template loaded: "${tpl.name}"`, timestamp: new Date().toISOString(), user: userName, type: 'note' as const },
              ],
            });
          }}
          onSetTemplateId={(tplId: string) => {
            onUpdate({ ...deal, complianceTemplateId: tplId });
          }}
          onReorder={reorderCompliance}
        />
      )}
    </div>

    {/* ── DD View All Modal ─────────────────────────────────────────────────── */}
    {showViewModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex items-start justify-between p-5 border-b border-base-300 flex-none">
            <div>
              <h2 className="font-bold text-base text-black">Due Diligence Checklist</h2>
              <p className="text-xs text-gray-500 mt-0.5 font-medium">
                📍 {deal.propertyAddress}{deal.city ? `, ${deal.city}` : ''}{deal.state ? `, ${deal.state}` : ''}
              </p>
              <div className="flex gap-3 mt-2 text-xs">
                <span className="text-success font-semibold">✓ {modalTotalDone} complete</span>
                <span className="text-warning font-semibold">◦ {modalTotalLeft} remaining</span>
              </div>
            </div>
            <button className="btn btn-ghost btn-xs btn-square" onClick={() => { setShowViewModal(false); setCompletingId(null); }}>
              <X size={14}/>
            </button>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 px-5 pt-3 flex-none">
            {(['all', 'incomplete', 'complete'] as const).map(f => (
              <button key={f} onClick={() => setViewFilter(f)}
                className={`btn btn-xs rounded-lg ${viewFilter === f ? 'btn-primary' : 'btn-ghost'}`}>
                {f === 'all' ? `All (${modalAll.length})` : f === 'incomplete' ? `Remaining (${modalTotalLeft})` : `Completed (${modalTotalDone})`}
              </button>
            ))}
          </div>

          {/* Sectioned item list — completion happens here */}
          <div className="flex-1 overflow-y-auto">

            {/* ── Shared row renderer ──────────────────────────────────────── */}
            {(() => {
              const renderModalRows = (items: ChecklistItem[], globalOffset: number) =>
                items.map((item, idx) => {
                  const isConfirming = completingId === item.id;
                  return (
                    <div key={item.id} className={`border-b border-gray-200 last:border-0 ${
                      idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                    } ${item.completed ? 'opacity-60' : ''}`}>
                      <div className="flex items-stretch">
                        <div className="w-9 flex-none flex items-center justify-center text-xs text-gray-400 font-mono select-none border-r border-gray-200 py-3">
                          {globalOffset + idx + 1}
                        </div>
                        <div className="w-9 flex-none flex items-center justify-center border-r border-gray-200 py-3">
                          {item.completed ? <CheckCircle2 size={15} className="text-success"/> : <Circle size={15} className="text-gray-300"/>}
                        </div>
                        <div className="flex-1 min-w-0 px-3 py-2.5">
                          <p className={`text-sm leading-snug ${item.completed ? 'text-gray-400 line-through' : 'text-black'}`}>
                            {item.title}
                            {item.required && !item.completed && <span className="ml-1 text-red-500 text-xs">*</span>}
                          </p>
                          {item.completed && item.completedBy && (
                            <p className="text-xs text-success mt-0.5">
                              ✓ <span className="font-medium">{item.completedBy}</span>
                              {item.completedAt && <span> · {new Date(item.completedAt).toLocaleDateString()}</span>}
                            </p>
                          )}
                        </div>
                        <div className="w-28 flex-none flex items-center justify-end gap-1 px-2 py-2.5 border-l border-gray-200">
                          {!item.completed && !isConfirming && (
                            <button className="btn btn-xs btn-outline btn-success gap-1" onClick={() => { setCompletingId(item.id); setCompletionDate(new Date().toISOString().split('T')[0]); setCompletionUser(users.find(u => u.active)?.name ?? ''); }}>
                              <Check size={11}/> Complete
                            </button>
                          )}
                          {!item.completed && isConfirming && (
                            <button className="btn btn-xs btn-ghost text-gray-400" onClick={() => setCompletingId(null)}>Cancel</button>
                          )}
                          {item.completed && (
                            <button className="btn btn-xs btn-ghost text-gray-400" onClick={() => uncompleteDD(item.id)} title="Mark incomplete">
                              <X size={11}/> Undo
                            </button>
                          )}
                        </div>
                      </div>
                      {isConfirming && (
                        <div className="mx-9 mb-3 mt-0 px-3 py-3 bg-gray-50 border border-gray-300 rounded-xl flex flex-col gap-2.5">
                          <p className="text-xs font-semibold text-gray-700">Confirm completion details:</p>
                          <div className="flex gap-3 flex-wrap">
                            <div className="flex flex-col gap-1 flex-1 min-w-[130px]">
                              <label className="text-xs text-gray-500 font-medium">Completion Date</label>
                              <input type="date" className="input input-xs input-bordered border-gray-300 bg-white text-black" value={completionDate} onChange={e => setCompletionDate(e.target.value)}/>
                            </div>
                            <div className="flex flex-col gap-1 flex-1 min-w-[130px]">
                              <label className="text-xs text-gray-500 font-medium">Completed By</label>
                              {users.length > 0 ? (
                                <select className="select select-xs select-bordered border-gray-300 bg-white text-black" value={completionUser} onChange={e => setCompletionUser(e.target.value)}>
                                  <option value="">Select user…</option>
                                  {users.filter(u => u.active).map(u => <option key={u.id} value={u.name}>{u.name} ({u.role})</option>)}
                                </select>
                              ) : (
                                <input className="input input-xs input-bordered border-gray-300 bg-white text-black" placeholder="Enter name…" value={completionUser} onChange={e => setCompletionUser(e.target.value)}/>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2 justify-end pt-0.5">
                            <button className="btn btn-ghost btn-xs" onClick={() => setCompletingId(null)}>Cancel</button>
                            <button className="btn btn-success btn-xs gap-1" onClick={() => completeDDFromModal(item.id)} disabled={!completionUser.trim()}>
                              <Check size={11}/> Confirm Complete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                });

              const colHeader = (
                <div className="flex items-center bg-gray-100 border-b border-gray-300 sticky top-0 z-10">
                  <div className="w-9 flex-none text-center py-2 text-xs font-bold text-gray-500 border-r border-gray-300">#</div>
                  <div className="w-9 flex-none text-center py-2 text-xs font-bold text-gray-500 border-r border-gray-300">✓</div>
                  <div className="flex-1 px-3 py-2 text-xs font-bold text-gray-500">Item</div>
                  <div className="w-28 flex-none border-l border-gray-300 py-2" />
                </div>
              );

              const hasAutoItems = modalCondoItems.length > 0 || modalMultiItems.length > 0;

              return (
                <>
                  {/* ── Standard DD section ── */}
                  {hasAutoItems && (
                    <div className="px-3 py-1.5 flex items-center gap-2 bg-gray-200 border-b border-gray-300">
                      <span className="text-xs font-bold text-black uppercase tracking-wide">Due Diligence Items</span>
                      <span className="text-xs text-gray-500 ml-auto">{modalStandard.filter(i=>i.completed).length}/{modalStandard.length} complete</span>
                    </div>
                  )}
                  {colHeader}
                  {modalFilteredStandard.length === 0
                    ? <div className="text-center text-gray-400 py-6 text-sm">{modalStandard.length > 0 ? '🎉 All standard items complete!' : 'No items.'}</div>
                    : renderModalRows(modalFilteredStandard, 0)
                  }

                  {/* ── HOA / Condo section ── */}
                  {modalCondoItems.length > 0 && (
                    <>
                      <div className="px-3 py-1.5 flex items-center gap-2 bg-gray-200 border-t-2 border-b border-gray-400 mt-2">
                        <span className="text-xs font-bold text-black uppercase tracking-wide">HOA / Condo Items</span>
                        <span className="badge badge-xs bg-gray-500 text-white border-0 ml-1">Auto-added</span>
                        <span className="text-xs text-gray-500 ml-auto">{modalCondoItems.filter(i=>i.completed).length}/{modalCondoItems.length} complete</span>
                      </div>
                      {colHeader}
                      {modalFilteredCondo.length === 0
                        ? <div className="text-center text-gray-400 py-6 text-sm">🎉 All HOA items complete!</div>
                        : renderModalRows(modalFilteredCondo, modalFilteredStandard.length)
                      }
                    </>
                  )}

                  {/* ── Multi-Family section ── */}
                  {modalMultiItems.length > 0 && (
                    <>
                      <div className="px-3 py-1.5 flex items-center gap-2 bg-gray-200 border-t-2 border-b border-gray-400 mt-2">
                        <span className="text-xs font-bold text-black uppercase tracking-wide">Multi-Family Items</span>
                        <span className="badge badge-xs bg-gray-500 text-white border-0 ml-1">Auto-added</span>
                        <span className="text-xs text-gray-500 ml-auto">{modalMultiItems.filter(i=>i.completed).length}/{modalMultiItems.length} complete</span>
                      </div>
                      {colHeader}
                      {modalFilteredMulti.length === 0
                        ? <div className="text-center text-gray-400 py-6 text-sm">🎉 All multi-family items complete!</div>
                        : renderModalRows(modalFilteredMulti, modalFilteredStandard.length + modalFilteredCondo.length)
                      }
                    </>
                  )}

                  {/* Empty state when all sections filtered out */}
                  {modalFilteredStandard.length === 0 && modalFilteredCondo.length === 0 && modalFilteredMulti.length === 0 && !hasAutoItems && (
                    <div className="text-center text-gray-400 py-10 text-sm">No items match this filter.</div>
                  )}
                </>
              );
            })()}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-base-300 flex-none flex justify-end">
            <button className="btn btn-sm btn-ghost" onClick={() => { setShowViewModal(false); setCompletingId(null); }}>Close</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};
