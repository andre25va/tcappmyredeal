import React, { useState, useRef, useEffect } from 'react';
import {
  Users, FileDown, Plus, Pencil, Trash2, X, Check,
  Download, Building2, ClipboardList, Globe, Shield,
  UserCheck, AlertCircle, Mail, GripVertical, MoreVertical, Star,
  Copy, CheckCheck, Ban, Link, ExternalLink, Search,
} from 'lucide-react';
import { AppUser, UserRole, Deal, ContactRecord, MlsEntry, ComplianceTemplate, EmailTemplate, ConfirmationButton, ComplianceMasterItem, DDMasterItem } from '../types';
import { generateId } from '../utils/helpers';
import { ConfirmModal } from './ConfirmModal';

interface Props {
  users: AppUser[];
  onSaveUsers: (users: AppUser[]) => void;
  deals: Deal[];
  contactRecords: ContactRecord[];
  mlsEntries: MlsEntry[];
  complianceTemplates: ComplianceTemplate[];
  storageMode: string;
  emailTemplates: EmailTemplate[];
  onSaveEmailTemplates: (templates: EmailTemplate[]) => void;
  complianceMasterItems: ComplianceMasterItem[];
  onSaveComplianceMasterItems: (items: ComplianceMasterItem[]) => void;
  ddMasterItems: DDMasterItem[];
  onSaveDdMasterItems: (items: DDMasterItem[]) => void;
}

type SettingsTab = 'team' | 'reports' | 'email-templates' | 'compliance-checklist' | 'dd-checklist' | 'license-links';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  tc: 'Transaction Coordinator',
  staff: 'Staff',
};

// ── CSV helpers ──────────────────────────────────────────────────────────────
function toCSV(headers: string[], rows: (string | number | boolean | undefined | null)[][]): string {
  const escape = (v: string | number | boolean | undefined | null) => {
    const s = v == null ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map(r => r.map(escape).join(',')).join('\n');
}

function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── User form modal ───────────────────────────────────────────────────────────
interface UserFormProps {
  user?: AppUser;
  onSave: (u: AppUser) => void;
  onClose: () => void;
}
function UserForm({ user, onSave, onClose }: UserFormProps) {
  const [name,   setName]  = useState(user?.name  ?? '');
  const [email,  setEmail] = useState(user?.email ?? '');
  const [role,   setRole]  = useState<UserRole>(user?.role ?? 'staff');

  const save = () => {
    if (!name.trim() || !email.trim()) return;
    onSave({
      id: user?.id ?? generateId(),
      name: name.trim(),
      email: email.trim(),
      role,
      active: user?.active ?? true,
      createdAt: user?.createdAt ?? new Date().toISOString(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base">{user ? 'Edit User' : 'Add User'}</h3>
          <button className="btn btn-ghost btn-xs btn-square" onClick={onClose}><X size={14}/></button>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="label py-0.5"><span className="label-text text-xs font-medium">Full Name</span></label>
            <input
              className="input input-bordered input-sm w-full"
              placeholder="e.g. Maria Lopez"
              value={name} onChange={e => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="label py-0.5"><span className="label-text text-xs font-medium">Email</span></label>
            <input
              type="email"
              className="input input-bordered input-sm w-full"
              placeholder="maria@tcoffice.com"
              value={email} onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="label py-0.5"><span className="label-text text-xs font-medium">Role</span></label>
            <select className="select select-bordered select-sm w-full" value={role} onChange={e => setRole(e.target.value as UserRole)}>
              {(Object.keys(ROLE_LABELS) as UserRole[]).map(r => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={!name.trim() || !email.trim()}>
            <Check size={13}/> Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Email Templates Tab ───────────────────────────────────────────────────────
const MERGE_TAGS = [
  { tag: '{{address}}',       desc: 'Property street address' },
  { tag: '{{city}}',          desc: 'City' },
  { tag: '{{state}}',         desc: 'State' },
  { tag: '{{zipCode}}',       desc: 'Zip code' },
  { tag: '{{mlsNumber}}',     desc: 'MLS number' },
  { tag: '{{contractPrice}}', desc: 'Contract price (formatted)' },
  { tag: '{{listPrice}}',     desc: 'List price (formatted)' },
  { tag: '{{contractDate}}',  desc: 'Contract date (formatted)' },
  { tag: '{{closingDate}}',   desc: 'Closing date (formatted)' },
  { tag: '{{milestone}}',     desc: 'Current milestone/status' },
  { tag: '{{agents}}',        desc: 'Auto-populated agent info block' },
  { tag: '{{contacts}}',      desc: 'Auto-populated contact list' },
  { tag: '{{pendingDocs}}',   desc: 'Pending document requests' },
  { tag: '{{reminders}}',     desc: 'Upcoming reminders / key dates' },
];

interface TemplateFormState {
  name: string;
  subject: string;
  body: string;
  buttons: ConfirmationButton[];
}

function emptyFormState(): TemplateFormState {
  return { name: '', subject: '', body: '', buttons: [] };
}

function templateToFormState(t: EmailTemplate): TemplateFormState {
  return { name: t.name, subject: t.subject, body: t.body, buttons: t.buttons.map(b => ({ ...b })) };
}

interface EmailTemplatesTabProps {
  emailTemplates: EmailTemplate[];
  onSave: (templates: EmailTemplate[]) => void;
}

function EmailTemplatesTab({ emailTemplates, onSave }: EmailTemplatesTabProps) {
  const [selectedId, setSelectedId] = useState<string | null>(emailTemplates[0]?.id ?? null);
  const [form, setForm] = useState<TemplateFormState | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showMergeTags, setShowMergeTags] = useState(false);

  const selectedTemplate = emailTemplates.find(t => t.id === selectedId) ?? null;

  const startEdit = (t: EmailTemplate) => {
    setSelectedId(t.id);
    setForm(templateToFormState(t));
    setIsNew(false);
  };

  const startNew = () => {
    setSelectedId(null);
    setForm(emptyFormState());
    setIsNew(true);
  };

  const cancelEdit = () => {
    setForm(null);
    setIsNew(false);
    if (!selectedTemplate && emailTemplates.length > 0) {
      setSelectedId(emailTemplates[0].id);
    }
  };

  const saveForm = () => {
    if (!form || !form.name.trim()) return;
    const now = new Date().toISOString();
    if (isNew) {
      const newTemplate: EmailTemplate = {
        id: generateId(),
        name: form.name.trim(),
        subject: form.subject.trim(),
        body: form.body,
        buttons: form.buttons,
        createdAt: now,
        updatedAt: now,
      };
      const updated = [...emailTemplates, newTemplate];
      onSave(updated);
      setSelectedId(newTemplate.id);
    } else {
      const updated = emailTemplates.map(t =>
        t.id === selectedId
          ? { ...t, name: form.name.trim(), subject: form.subject.trim(), body: form.body, buttons: form.buttons, updatedAt: now }
          : t
      );
      onSave(updated);
    }
    setForm(null);
    setIsNew(false);
  };

  const deleteTemplate = (id: string) => {
    const updated = emailTemplates.filter(t => t.id !== id);
    onSave(updated);
    setDeleteConfirmId(null);
    setForm(null);
    setIsNew(false);
    setSelectedId(updated[0]?.id ?? null);
  };

  const updateButton = (idx: number, field: keyof ConfirmationButton, value: string) => {
    if (!form) return;
    const buttons = form.buttons.map((b, i) => i === idx ? { ...b, [field]: value } : b);
    setForm({ ...form, buttons });
  };

  const addButton = () => {
    if (!form) return;
    setForm({ ...form, buttons: [...form.buttons, { id: generateId(), label: '', replyText: '' }] });
  };

  const removeButton = (idx: number) => {
    if (!form) return;
    setForm({ ...form, buttons: form.buttons.filter((_, i) => i !== idx) });
  };

  const editing = form !== null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: template list */}
      <div className="w-56 shrink-0 border-r border-base-300 flex flex-col overflow-y-auto bg-base-200">
        <div className="p-3 border-b border-base-300 flex items-center justify-between">
          <p className="text-xs font-bold text-base-content uppercase tracking-wide">Templates</p>
          <button
            className="btn btn-xs btn-primary gap-1"
            onClick={startNew}
          >
            <Plus size={10} /> New
          </button>
        </div>
        <div className="flex-1 p-2 space-y-1">
          {emailTemplates.length === 0 && (
            <p className="text-xs text-base-content/40 text-center py-4">No templates yet</p>
          )}
          {emailTemplates.map(t => (
            <button
              key={t.id}
              onClick={() => { if (!editing) { startEdit(t); } else { setSelectedId(t.id); } }}
              className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all text-xs ${
                selectedId === t.id
                  ? 'bg-base-100 border-primary/40 shadow-sm text-base-content font-semibold'
                  : 'bg-transparent border-transparent hover:bg-base-100 hover:border-base-300 text-base-content/70'
              }`}
            >
              <div className="flex items-center gap-2">
                <Mail size={10} className={selectedId === t.id ? 'text-primary' : 'text-base-content/40'} />
                <span className="truncate">{t.name}</span>
              </div>
              <div className="text-base-content/40 text-[10px] mt-0.5">
                {t.buttons.length} btn{t.buttons.length !== 1 ? 's' : ''}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: form or view */}
      <div className="flex-1 overflow-y-auto p-5">
        {/* ── Merge tag reference (collapsible) ── */}
        <div className="mb-4 border border-base-300 rounded-xl overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-2.5 bg-base-200 text-xs font-semibold text-base-content/70 hover:bg-base-300 transition-colors"
            onClick={() => setShowMergeTags(v => !v)}
          >
            <span>📌 Available Merge Tags</span>
            <span>{showMergeTags ? '▲ Hide' : '▼ Show'}</span>
          </button>
          {showMergeTags && (
            <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-1">
              {MERGE_TAGS.map(({ tag, desc }) => (
                <div key={tag} className="flex items-start gap-2 text-xs">
                  <code className="bg-base-200 px-1.5 py-0.5 rounded font-mono text-primary shrink-0">{tag}</code>
                  <span className="text-base-content/60">{desc}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Edit / New form ── */}
        {editing && form ? (
          <div className="max-w-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-base-content">
                {isNew ? 'New Template' : `Editing: ${selectedTemplate?.name ?? ''}`}
              </h3>
              <div className="flex gap-2">
                <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>Cancel</button>
                <button
                  className="btn btn-primary btn-sm gap-1"
                  onClick={saveForm}
                  disabled={!form.name.trim()}
                >
                  <Check size={13} /> Save Template
                </button>
                {!isNew && selectedId && (
                  <button
                    className="btn btn-error btn-outline btn-sm gap-1"
                    onClick={() => setDeleteConfirmId(selectedId)}
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                )}
              </div>
            </div>

            {/* Template Name */}
            <div>
              <label className="label py-0.5"><span className="label-text text-xs font-medium">Template Name</span></label>
              <input
                className="input input-bordered input-sm w-full"
                placeholder="e.g. Introduction Email"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </div>

            {/* Subject */}
            <div>
              <label className="label py-0.5">
                <span className="label-text text-xs font-medium">Subject</span>
                <span className="label-text-alt text-xs text-base-content/40">supports {'{{merge}}'} tags</span>
              </label>
              <input
                className="input input-bordered input-sm w-full font-mono text-xs"
                placeholder="e.g. Transaction Introduction — {{address}}, {{city}}, {{state}}"
                value={form.subject}
                onChange={e => setForm({ ...form, subject: e.target.value })}
              />
            </div>

            {/* Body */}
            <div>
              <label className="label py-0.5">
                <span className="label-text text-xs font-medium">Body</span>
                <span className="label-text-alt text-xs text-base-content/40">supports {'{{merge}}'} tags</span>
              </label>
              <textarea
                className="textarea textarea-bordered w-full font-mono text-xs"
                rows={16}
                placeholder="Hello Everyone,&#10;&#10;..."
                value={form.body}
                onChange={e => setForm({ ...form, body: e.target.value })}
                spellCheck={false}
              />
            </div>

            {/* Confirmation Buttons */}
            <div className="border border-base-300 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-base-content">Confirmation Buttons</p>
                  <p className="text-xs text-base-content/50 mt-0.5">Each button opens a pre-filled reply request email</p>
                </div>
                <button className="btn btn-xs btn-outline gap-1" onClick={addButton}>
                  <Plus size={10} /> Add Button
                </button>
              </div>

              {form.buttons.length === 0 && (
                <p className="text-xs text-base-content/40 text-center py-2">No confirmation buttons yet</p>
              )}

              {form.buttons.map((btn, idx) => (
                <div key={btn.id} className="bg-base-200 rounded-lg p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-base-content">Button {idx + 1}</p>
                    <button
                      className="btn btn-ghost btn-xs text-error"
                      onClick={() => removeButton(idx)}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                  <div>
                    <label className="label py-0"><span className="label-text text-xs">Label (shown on button)</span></label>
                    <input
                      className="input input-bordered input-xs w-full"
                      placeholder='e.g. ✅ Confirm Receipt'
                      value={btn.label}
                      onChange={e => updateButton(idx, 'label', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label py-0">
                      <span className="label-text text-xs">Reply Text (pre-filled body)</span>
                      <span className="label-text-alt text-xs text-base-content/40">supports {'{{merge}}'} tags</span>
                    </label>
                    <input
                      className="input input-bordered input-xs w-full font-mono"
                      placeholder='e.g. I confirm receipt of documents for {{address}}'
                      value={btn.replyText}
                      onChange={e => updateButton(idx, 'replyText', e.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ── View mode: show selected template details ── */
          selectedTemplate ? (
            <div className="max-w-2xl flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-base-content flex items-center gap-2">
                    <Mail size={14} className="text-primary" />
                    {selectedTemplate.name}
                  </h3>
                  {selectedTemplate.isDefault && (
                    <span className="badge badge-sm badge-outline mt-1">Default</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn btn-sm btn-primary gap-1"
                    onClick={() => startEdit(selectedTemplate)}
                  >
                    <Pencil size={12} /> Edit
                  </button>
                  <button
                    className="btn btn-sm btn-error btn-outline gap-1"
                    onClick={() => setDeleteConfirmId(selectedTemplate.id)}
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>

              <div className="bg-base-200 rounded-xl p-3">
                <p className="text-xs font-semibold text-base-content/50 mb-1">SUBJECT:</p>
                <p className="text-xs font-mono text-base-content">{selectedTemplate.subject}</p>
              </div>

              <div className="bg-base-200 rounded-xl p-3">
                <p className="text-xs font-semibold text-base-content/50 mb-1">BODY PREVIEW:</p>
                <pre className="text-xs font-mono text-base-content whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                  {selectedTemplate.body}
                </pre>
              </div>

              {selectedTemplate.buttons.length > 0 && (
                <div className="border border-base-300 rounded-xl p-3 flex flex-col gap-2">
                  <p className="text-xs font-semibold text-base-content">
                    Confirmation Buttons ({selectedTemplate.buttons.length})
                  </p>
                  {selectedTemplate.buttons.map(btn => (
                    <div key={btn.id} className="bg-base-200 rounded-lg p-2.5 text-xs">
                      <p className="font-semibold text-base-content">{btn.label}</p>
                      <p className="text-base-content/60 mt-0.5 font-mono italic">Reply: &quot;{btn.replyText}&quot;</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
              <Mail size={32} className="text-base-content/20" />
              <p className="text-sm text-base-content/40">Select a template or create a new one</p>
              <button className="btn btn-sm btn-primary gap-1" onClick={startNew}>
                <Plus size={13} /> New Template
              </button>
            </div>
          )
        )}
      </div>

      {/* Delete confirm modal */}
      <ConfirmModal
        isOpen={deleteConfirmId !== null}
        title="Delete this email template?"
        message={`"${emailTemplates.find(t => t.id === deleteConfirmId)?.name ?? ''}" will be permanently deleted.`}
        confirmLabel="Delete"
        onConfirm={() => { if (deleteConfirmId) deleteTemplate(deleteConfirmId); }}
        onCancel={() => setDeleteConfirmId(null)}
      />
    </div>
  );
}

// ── Compliance Checklist Tab ──────────────────────────────────────────────────
/* ─── DD Checklist Tab ───────────────────────────────────────── */
interface DDChecklistTabProps {
  items: DDMasterItem[];
  onSave: (items: DDMasterItem[]) => void;
}

function DDChecklistTab({ items, onSave }: DDChecklistTabProps) {
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

  const addItem = () => {
    const t = newTitle.trim();
    if (!t) return;
    onSave([...items, { id: generateId(), title: t, required: false, order: items.length }]);
    setNewTitle('');
  };

  const deleteItem = (id: string) => onSave(items.filter(i => i.id !== id));

  const toggleRequired = (id: string) =>
    onSave(items.map(i => i.id === id ? { ...i, required: !i.required } : i));

  const renameItem = (id: string, title: string) => {
    onSave(items.map(i => i.id === id ? { ...i, title } : i));
  };

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
        <h2 className="text-base font-bold text-black">Due Diligence Master Checklist</h2>
        <p className="text-xs text-black/50 mt-0.5">
          These are your TC operational workflow items — <strong>what needs to get done</strong> on every deal.
          Add, remove, or reorder them here. They apply to every transaction's DD checklist.
        </p>
        <div className="mt-2 flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          <AlertCircle size={13} className="text-blue-500 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-700">
            <strong>Due Diligence</strong> asks <em>"What needs to get done?"</em> — these are your internal TC workflow steps, independent of the broker's compliance requirements.
          </p>
        </div>
      </div>

      {/* Items table */}
      <div className="border border-base-300 rounded-xl overflow-visible">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-base-300">
              <th className="w-6 px-2 py-2.5"></th>
              <th className="w-8 px-3 py-2.5 text-left text-xs font-semibold text-black/50">#</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-black/50">Item</th>
              <th className="w-20 px-3 py-2.5 text-center text-xs font-semibold text-black/50">Required</th>
              <th className="w-16 px-3 py-2.5 text-right text-xs font-semibold text-black/50">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-10 text-black/30 text-xs">
                  No items yet. Add your first due diligence item below.
                </td>
              </tr>
            )}
            {items.map((item, idx) => (
              <tr
                key={item.id}
                draggable={true}
                onDragStart={() => { dragIdRef.current = item.id; }}
                onDragOver={(e) => { e.preventDefault(); setDragOverId(item.id); }}
                onDrop={() => { if (dragIdRef.current) handleReorder(dragIdRef.current, item.id); setDragOverId(null); }}
                onDragEnd={() => { dragIdRef.current = null; setDragOverId(null); }}
                className={`border-b border-base-300 last:border-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${dragOverId === item.id ? 'border-t-2 border-blue-400' : ''} ${dragIdRef.current === item.id ? 'opacity-40' : ''}`}
              >
                <td className="px-2 py-2 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 w-6">
                  <GripVertical size={14} />
                </td>
                <td className="px-3 py-2 text-xs text-black/30 font-mono">{idx + 1}</td>
                <td className="px-3 py-2">
                  {editingId === item.id ? (
                    <div className="flex gap-1">
                      <input
                        autoFocus
                        className="input input-bordered input-xs flex-1 text-black"
                        value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { renameItem(item.id, editVal); setEditingId(null); }
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                      />
                      <button className="btn btn-success btn-xs btn-square" onClick={() => { renameItem(item.id, editVal); setEditingId(null); }}><Check size={11} /></button>
                      <button className="btn btn-ghost btn-xs btn-square" onClick={() => setEditingId(null)}><X size={11} /></button>
                    </div>
                  ) : (
                    <span className="text-xs text-black font-medium">{item.title}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  <button
                    onClick={() => toggleRequired(item.id)}
                    title={item.required ? 'Mark as optional' : 'Mark as required'}
                    className={`btn btn-xs rounded-full px-2 ${item.required ? 'btn-error text-white' : 'btn-ghost text-black/30 border border-base-300'}`}
                  >
                    {item.required ? '★ Req' : '☆ Opt'}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-0.5">
                    <div className="relative inline-block">
                      <button
                        className="btn btn-ghost btn-xs btn-square"
                        onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === item.id ? null : item.id); }}
                        title="Options"
                      >
                        <MoreVertical size={13} />
                      </button>
                      {openMenuId === item.id && (
                        <div
                          className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-[200] min-w-36 py-1 text-sm"
                          onMouseDown={e => e.stopPropagation()}
                        >
                          <button
                            className="w-full text-left px-3 py-1.5 hover:bg-gray-100 text-black flex items-center gap-2"
                            onClick={() => { setEditingId(item.id); setEditVal(item.title); setOpenMenuId(null); }}
                          >
                            <Pencil size={12} /> Edit Title
                          </button>
                          <button
                            className="w-full text-left px-3 py-1.5 hover:bg-gray-100 text-black flex items-center gap-2"
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
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add new item */}
      <div className="flex gap-2">
        <input
          className="input input-bordered flex-1 text-sm text-black"
          placeholder="Type a due diligence item and press Enter…"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addItem()}
        />
        <button onClick={addItem} className="btn btn-primary btn-sm gap-1.5">
          <Plus size={14} /> Add
        </button>
      </div>
      <p className="text-xs text-black/30">
        Tip: Press Enter to add quickly. {items.filter(i => i.required).length} required items, {items.filter(i => !i.required).length} optional items.
      </p>
      <ConfirmModal
        isOpen={deleteItemId !== null}
        title="Remove this item?"
        message="Remove this item from the master DD checklist?"
        confirmLabel="Remove"
        onConfirm={() => { if (deleteItemId) { deleteItem(deleteItemId); setDeleteItemId(null); } }}
        onCancel={() => setDeleteItemId(null)}
      />
    </div>
  );
}

/* ─── Compliance Checklist Tab ───────────────────────────────── */
interface ComplianceChecklistTabProps {
  items: ComplianceMasterItem[];
  onSave: (items: ComplianceMasterItem[]) => void;
}

function ComplianceChecklistTab({ items, onSave }: ComplianceChecklistTabProps) {
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

  const addItem = () => {
    const t = newTitle.trim();
    if (!t) return;
    onSave([...items, { id: generateId(), title: t, order: items.length }]);
    setNewTitle('');
  };

  const deleteItem = (id: string) => onSave(items.filter(i => i.id !== id));

  const renameItem = (id: string, title: string) => {
    onSave(items.map(i => i.id === id ? { ...i, title } : i));
  };

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
        <p className="text-xs text-black/50 mt-0.5">
          These items appear in every Compliance Template. Add, remove, or reorder them here.
          In each template you can choose which items to include and add custom items specific to that template.
        </p>
        <div className="mt-2 flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <Shield size={13} className="text-green-600 mt-0.5 shrink-0" />
          <p className="text-xs text-green-800">
            <strong>Compliance</strong> asks <em>"Is the file complete and correct?"</em> — these are broker/legal requirements that verify the transaction is audit-ready and properly documented.
          </p>
        </div>
      </div>

      {/* Items table */}
      <div className="border border-base-300 rounded-xl overflow-visible">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-base-300">
              <th className="w-6 px-2 py-2.5"></th>
              <th className="w-8 px-3 py-2.5 text-left text-xs font-semibold text-black/50">#</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-black/50">Item</th>
              <th className="w-16 px-3 py-2.5 text-right text-xs font-semibold text-black/50">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-10 text-black/30 text-xs">
                  No items yet. Add your first compliance checklist item below.
                </td>
              </tr>
            )}
            {items.map((item, idx) => (
              <tr
                key={item.id}
                draggable={true}
                onDragStart={() => { dragIdRef.current = item.id; }}
                onDragOver={(e) => { e.preventDefault(); setDragOverId(item.id); }}
                onDrop={() => { if (dragIdRef.current) handleReorder(dragIdRef.current, item.id); setDragOverId(null); }}
                onDragEnd={() => { dragIdRef.current = null; setDragOverId(null); }}
                className={`border-b border-base-300 last:border-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${dragOverId === item.id ? 'border-t-2 border-blue-400' : ''} ${dragIdRef.current === item.id ? 'opacity-40' : ''}`}
              >
                <td className="px-2 py-2 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 w-6">
                  <GripVertical size={14} />
                </td>
                <td className="px-3 py-2 text-xs text-black/30 font-mono">{idx + 1}</td>
                <td className="px-3 py-2">
                  {editingId === item.id ? (
                    <div className="flex gap-1">
                      <input
                        autoFocus
                        className="input input-bordered input-xs flex-1 text-black"
                        value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { renameItem(item.id, editVal); setEditingId(null); }
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                      />
                      <button className="btn btn-success btn-xs btn-square" onClick={() => { renameItem(item.id, editVal); setEditingId(null); }}><Check size={11} /></button>
                      <button className="btn btn-ghost btn-xs btn-square" onClick={() => setEditingId(null)}><X size={11} /></button>
                    </div>
                  ) : (
                    <span className="text-xs text-black font-medium">{item.title}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-0.5">
                    <div className="relative inline-block">
                      <button
                        className="btn btn-ghost btn-xs btn-square"
                        onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === item.id ? null : item.id); }}
                        title="Options"
                      >
                        <MoreVertical size={13} />
                      </button>
                      {openMenuId === item.id && (
                        <div
                          className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-[200] min-w-36 py-1 text-sm"
                          onMouseDown={e => e.stopPropagation()}
                        >
                          <button
                            className="w-full text-left px-3 py-1.5 hover:bg-gray-100 text-black flex items-center gap-2"
                            onClick={() => { setEditingId(item.id); setEditVal(item.title); setOpenMenuId(null); }}
                          >
                            <Pencil size={12} /> Edit Title
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
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add new item */}
      <div className="flex gap-2">
        <input
          className="input input-bordered flex-1 text-sm text-black"
          placeholder="Type a compliance checklist item and press Enter…"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addItem()}
        />
        <button onClick={addItem} className="btn btn-primary btn-sm gap-1.5">
          <Plus size={14} /> Add
        </button>
      </div>
      <p className="text-xs text-black/30">Tip: Press Enter to add quickly. These items show in all compliance templates.</p>
      <ConfirmModal
        isOpen={deleteItemId !== null}
        title="Remove this item?"
        message="Remove this item from the master compliance checklist?"
        confirmLabel="Remove"
        onConfirm={() => { if (deleteItemId) { deleteItem(deleteItemId); setDeleteItemId(null); } }}
        onCancel={() => setDeleteItemId(null)}
      />
    </div>
  );
}

// ── License Lookup Links Tab ──────────────────────────────────────────────────
interface StateLicenseLink {
  state_code: string;
  state_name: string;
  lookup_url: string | null;
  notes: string | null;
  updated_at: string | null;
}

// ── State License Popup ───────────────────────────────────────────────────────
interface StateLicensePopupProps {
  state: StateLicenseLink;
  onClose: () => void;
  onSave: (stateCode: string, url: string | null) => Promise<void>;
  saving: boolean;
}

function StateLicensePopup({ state, onClose, onSave, saving }: StateLicensePopupProps) {
  const [url, setUrl] = React.useState(state.lookup_url || '');
  const hasUrl = !!url.trim();

  const handleSave = () => onSave(state.state_code, url.trim() || null);
  const handleLookup = () => {
    if (hasUrl) window.open(url.trim(), '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-5"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black text-base-content">{state.state_code}</span>
              {state.lookup_url && (
                <span className="badge badge-success badge-sm gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-success-content inline-block" />
                  Configured
                </span>
              )}
            </div>
            <p className="text-sm text-base-content/60 mt-0.5">{state.state_name}</p>
          </div>
          <button className="btn btn-ghost btn-xs btn-square flex-none" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        {/* URL input */}
        <div>
          <label className="label py-0.5">
            <span className="label-text text-xs font-medium">License Lookup Portal URL</span>
          </label>
          <input
            autoFocus
            className="input input-bordered w-full font-mono text-xs"
            placeholder="https://…"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') onClose();
            }}
          />
          <p className="text-xs text-base-content/40 mt-1">
            Paste the URL of the {state.state_name} agent license search portal.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          {/* Look Up License — primary CTA */}
          <button
            className="btn btn-primary w-full gap-2"
            onClick={handleLookup}
            disabled={!hasUrl}
          >
            <ExternalLink size={15} />
            Look Up License
          </button>

          {/* Save + Cancel row */}
          <div className="flex gap-2">
            <button className="btn btn-ghost btn-sm flex-1" onClick={onClose}>Cancel</button>
            <button
              className="btn btn-neutral btn-sm flex-1 gap-1"
              onClick={handleSave}
              disabled={saving}
            >
              {saving
                ? <span className="loading loading-spinner loading-xs" />
                : <Check size={13} />}
              Save URL
            </button>
            {state.lookup_url && (
              <button
                className="btn btn-ghost btn-sm text-error"
                title="Clear URL"
                onClick={() => onSave(state.state_code, null)}
                disabled={saving}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LicenseLinksTab() {
  const [states, setStates] = React.useState<StateLicenseLink[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [activeState, setActiveState] = React.useState<StateLicenseLink | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const token = localStorage.getItem('tc_token') || '';

  const load = React.useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/license-links', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setStates(data.states || []);
    } catch (e: any) {
      setFetchError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  React.useEffect(() => { load(); }, [load]);

  const handleSave = async (stateCode: string, url: string | null) => {
    setSaving(true);
    try {
      const res = await fetch('/api/license-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ state_code: stateCode, lookup_url: url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setStates(prev => prev.map(s =>
        s.state_code === stateCode
          ? { ...s, lookup_url: url, updated_at: new Date().toISOString() }
          : s
      ));
      // Update the active state in the popup so the badge refreshes
      setActiveState(prev => prev?.state_code === stateCode
        ? { ...prev, lookup_url: url, updated_at: new Date().toISOString() }
        : prev
      );
      // Close popup after clearing (delete action)
      if (url === null) setActiveState(null);
    } catch (e: any) {
      // keep popup open on error
    } finally {
      setSaving(false);
    }
  };

  const filteredStates = states.filter(s =>
    s.state_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.state_code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const configuredCount = states.filter(s => s.lookup_url).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="loading loading-spinner loading-md text-primary" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="max-w-xl mx-auto mt-8 bg-error/10 border border-error/20 rounded-xl p-4 text-sm text-error flex items-center gap-2">
        <AlertCircle size={16} className="flex-none" /> {fetchError}
        <button className="btn btn-xs btn-ghost ml-auto" onClick={load}>Retry</button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-5">
      {/* Header */}
      <div>
        <h2 className="text-base font-bold text-black">Agent License Lookup</h2>
        <p className="text-xs text-black/50 mt-0.5">
          Click any state to set its license portal URL and look up an agent's license number &amp; expiration date.
        </p>
      </div>

      {/* Stats */}
      <div className="flex gap-3">
        <div className="stat bg-base-200 rounded-xl p-3 flex-1 min-w-[80px]">
          <div className="stat-title text-xs">Total States</div>
          <div className="stat-value text-2xl">{states.length}</div>
        </div>
        <div className="stat bg-success/10 rounded-xl p-3 flex-1 min-w-[80px]">
          <div className="stat-title text-xs text-success/70">Configured</div>
          <div className="stat-value text-2xl text-success">{configuredCount}</div>
        </div>
        <div className="stat bg-base-200 rounded-xl p-3 flex-1 min-w-[80px]">
          <div className="stat-title text-xs text-base-content/50">Remaining</div>
          <div className="stat-value text-2xl text-base-content/30">{states.length - configuredCount}</div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/30" />
        <input
          className="input input-bordered input-sm w-full pl-8"
          placeholder="Filter states…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      {/* States table — click row to open popup */}
      <div className="border border-base-300 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-base-300">
              <th className="w-20 px-4 py-2.5 text-left text-xs font-semibold text-black/50">State</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-black/50">Portal</th>
              <th className="w-28 px-4 py-2.5 text-right text-xs font-semibold text-black/50">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredStates.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center py-10 text-black/30 text-xs">
                  No states match your search.
                </td>
              </tr>
            )}
            {filteredStates.map((s, idx) => {
              const hasUrl = !!s.lookup_url;
              return (
                <tr
                  key={s.state_code}
                  className={`border-b border-base-300 last:border-0 cursor-pointer transition-colors hover:bg-primary/5 active:bg-primary/10 ${
                    idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                  }`}
                  onClick={() => setActiveState(s)}
                >
                  {/* State */}
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-bold text-xs text-black">{s.state_code}</span>
                      <span className="text-[11px] text-black/40">{s.state_name}</span>
                    </div>
                  </td>

                  {/* Portal status */}
                  <td className="px-4 py-3">
                    {hasUrl ? (
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-success flex-none" />
                        <span className="text-xs text-base-content/50 font-mono truncate max-w-[220px]" title={s.lookup_url!}>
                          {s.lookup_url}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-black/25 italic">No portal set — click to add</span>
                    )}
                  </td>

                  {/* Action */}
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {hasUrl && (
                        <a
                          href={s.lookup_url!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-primary btn-xs gap-1"
                          title="Look Up License"
                          onClick={e => e.stopPropagation()}
                        >
                          <ExternalLink size={11} /> Look Up
                        </a>
                      )}
                      <button
                        className="btn btn-ghost btn-xs"
                        title={hasUrl ? 'Edit portal URL' : 'Add portal URL'}
                        onClick={() => setActiveState(s)}
                      >
                        <Pencil size={12} className="text-base-content/40" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-black/30 text-center">
        {configuredCount} of {states.length} states configured · Click any row to manage its portal URL
      </p>

      {/* State popup */}
      {activeState && (
        <StateLicensePopup
          state={activeState}
          onClose={() => setActiveState(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}
    </div>
  );
}


// ── Access & Users Tab ────────────────────────────────────────────────────────

interface AllowedUser {
  id: string;
  phone: string;
  name: string;
  role: string;
  email: string | null;
  is_demo: boolean;
  is_active: boolean;
  created_at: string;
  profile_id: string | null;
  last_login: string | null;
  active_sessions: number;
}

const ACCESS_ROLE_INFO: Record<string, { label: string; color: string }> = {
  admin:  { label: 'Admin',   color: 'badge-error' },
  tc:     { label: 'TC',      color: 'badge-primary' },
  staff:  { label: 'Staff',   color: 'badge-neutral' },
  viewer: { label: 'Viewer',  color: 'badge-ghost' },
};

function formatPhoneDisplay(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  const local = digits.startsWith('1') ? digits.slice(1) : digits;
  if (local.length === 10) return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
  return e164;
}

function timeAgoShort(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface UserAccessFormProps {
  user?: AllowedUser;
  onSave: (data: any) => void;
  onClose: () => void;
  saving: boolean;
}

function UserAccessForm({ user, onSave, onClose, saving }: UserAccessFormProps) {
  const [rawPhone, setRawPhone] = React.useState(user ? formatPhoneDisplay(user.phone) : '');
  const [name, setName] = React.useState(user?.name ?? '');
  const [role, setRole] = React.useState(user?.role ?? 'tc');
  const [email, setEmail] = React.useState(user?.email ?? '');
  const [isDemo, setIsDemo] = React.useState(user?.is_demo ?? false);
  const [phoneError, setPhoneError] = React.useState('');

  const formatPhoneInput = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const phoneDigits = rawPhone.replace(/\D/g, '');
  const phoneValid = phoneDigits.length === 10;

  const save = () => {
    if (!phoneValid) { setPhoneError('Enter a valid 10-digit US phone number'); return; }
    if (!name.trim()) return;
    onSave({ phone: rawPhone, name: name.trim(), role, email: email.trim() || null, is_demo: isDemo });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base">{user ? 'Edit User' : 'Add User'}</h3>
          <button className="btn btn-ghost btn-xs btn-square" onClick={onClose}><X size={14} /></button>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="label py-0.5">
              <span className="label-text text-xs font-medium">Phone Number *</span>
              {user && <span className="label-text-alt text-xs text-base-content/40">Cannot change</span>}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-base-content/40 font-mono select-none">+1</span>
              <input
                className={`input input-bordered input-sm w-full pl-8 font-mono ${phoneError ? 'input-error' : ''}`}
                placeholder="(312) 555-0100"
                value={rawPhone}
                onChange={e => { setRawPhone(formatPhoneInput(e.target.value)); setPhoneError(''); }}
                disabled={!!user}
                maxLength={14}
              />
            </div>
            {phoneError && <p className="text-xs text-error mt-0.5">{phoneError}</p>}
          </div>

          <div>
            <label className="label py-0.5"><span className="label-text text-xs font-medium">Full Name *</span></label>
            <input
              className="input input-bordered input-sm w-full"
              placeholder="e.g. Maria Lopez"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="label py-0.5"><span className="label-text text-xs font-medium">Role</span></label>
            <select className="select select-bordered select-sm w-full" value={role} onChange={e => setRole(e.target.value)}>
              <option value="admin">Admin</option>
              <option value="tc">Transaction Coordinator</option>
              <option value="staff">Staff</option>
              <option value="viewer">Viewer (read-only)</option>
            </select>
          </div>

          <div>
            <label className="label py-0.5">
              <span className="label-text text-xs font-medium">Email for OTP</span>
              <span className="label-text-alt text-xs text-base-content/40">optional</span>
            </label>
            <input
              type="email"
              className="input input-bordered input-sm w-full"
              placeholder="user@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
            <p className="text-xs text-base-content/40 mt-0.5">If set, user can receive their login code by email instead of SMS.</p>
          </div>

          <label className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl border border-amber-200 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox checkbox-sm checkbox-warning mt-0.5"
              checked={isDemo}
              onChange={e => setIsDemo(e.target.checked)}
            />
            <div>
              <p className="text-xs font-semibold text-amber-800">Demo / Presentation Account</p>
              <p className="text-xs text-amber-600 mt-0.5">No OTP required, instant access, viewer role, unlimited concurrent sessions allowed.</p>
            </div>
          </label>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary btn-sm gap-1"
            onClick={save}
            disabled={saving || !name.trim() || !phoneValid}
          >
            {saving ? <span className="loading loading-spinner loading-xs" /> : <Check size={13} />}
            {user ? 'Save Changes' : 'Add User'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AccessUsersTab() {
  const [users, setUsers] = React.useState<AllowedUser[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const [editUser, setEditUser] = React.useState<AllowedUser | undefined>();
  const [deleteTarget, setDeleteTarget] = React.useState<AllowedUser | null>(null);
  const [revokeTarget, setRevokeTarget] = React.useState<AllowedUser | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const token = localStorage.getItem('tc_token') || '';

  const loadUsers = React.useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/auth?action=list-users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load users');
      setUsers(data.users || []);
    } catch (e: any) {
      setFetchError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  React.useEffect(() => { loadUsers(); }, [loadUsers]);

  const copyUserId = (id: string) => {
    navigator.clipboard.writeText(id).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleSave = async (formData: any) => {
    setSaving(true);
    setActionError(null);
    try {
      const isEdit = !!editUser;
      const action = isEdit ? 'edit-user' : 'add-user';
      const body = isEdit ? { id: editUser!.id, ...formData } : formData;
      const res = await fetch(`/api/auth?action=${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      await loadUsers();
      setShowForm(false);
      setEditUser(undefined);
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch('/api/auth?action=delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete');
      await loadUsers();
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    try {
      const res = await fetch('/api/auth?action=edit-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: revokeTarget.id, is_active: !revokeTarget.is_active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      await loadUsers();
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setRevokeTarget(null);
    }
  };

  const activeCount  = users.filter(u => u.is_active && !u.is_demo).length;
  const demoCount    = users.filter(u => u.is_demo).length;
  const revokedCount = users.filter(u => !u.is_active).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="loading loading-spinner loading-md text-primary" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="max-w-xl mx-auto mt-8 bg-error/10 border border-error/20 rounded-xl p-4 text-sm text-error flex items-center gap-2">
        <AlertCircle size={16} className="flex-none" /> {fetchError}
        <button className="btn btn-xs btn-ghost ml-auto" onClick={loadUsers}>Retry</button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-5">
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-3">
        <Shield size={14} className="text-blue-500 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-700 leading-relaxed">
          <strong>Phone-based access control.</strong> Only numbers listed here can log in to TC Command via OTP.
          Each user's <strong>User ID</strong> is assigned on first login and tags all their activity in audit logs.
          The User ID is their <code className="bg-blue-100 px-1 rounded font-mono text-[10px]">profiles.id</code> — used across sessions, audit trail, and communications.
        </p>
      </div>

      {actionError && (
        <div className="flex items-center gap-2 bg-error/10 border border-error/20 rounded-xl px-3 py-2 text-xs text-error">
          <AlertCircle size={13} className="flex-none" /> {actionError}
          <button className="ml-auto btn btn-ghost btn-xs" onClick={() => setActionError(null)}><X size={11} /></button>
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="flex-1 flex gap-3 flex-wrap">
          <div className="stat bg-base-200 rounded-xl p-3 flex-1 min-w-[80px]">
            <div className="stat-title text-xs">Total</div>
            <div className="stat-value text-2xl">{users.length}</div>
          </div>
          <div className="stat bg-success/10 rounded-xl p-3 flex-1 min-w-[80px]">
            <div className="stat-title text-xs text-success/70">Active</div>
            <div className="stat-value text-2xl text-success">{activeCount}</div>
          </div>
          {demoCount > 0 && (
            <div className="stat bg-amber-50 rounded-xl p-3 flex-1 min-w-[80px]">
              <div className="stat-title text-xs text-amber-600">Demo</div>
              <div className="stat-value text-2xl text-amber-500">{demoCount}</div>
            </div>
          )}
          {revokedCount > 0 && (
            <div className="stat bg-base-200 rounded-xl p-3 flex-1 min-w-[80px]">
              <div className="stat-title text-xs text-base-content/40">Revoked</div>
              <div className="stat-value text-2xl text-base-content/30">{revokedCount}</div>
            </div>
          )}
        </div>
        <button
          className="btn btn-primary btn-sm gap-1.5 flex-none"
          onClick={() => { setEditUser(undefined); setShowForm(true); }}
        >
          <Plus size={14} /> Add User
        </button>
      </div>

      {users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-base-content/40">
          <UserCheck size={40} strokeWidth={1.5} />
          <p className="text-sm">No users yet. Add your first team member.</p>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
            <Plus size={13} /> Add First User
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {users.map(u => {
            const ri = ACCESS_ROLE_INFO[u.role] || { label: u.role, color: 'badge-ghost' };
            const initials = u.name.split(' ').map((n: string) => n[0] || '').join('').slice(0, 2).toUpperCase() || '?';
            const isOnline = u.active_sessions > 0;

            return (
              <div
                key={u.id}
                className={`rounded-xl border transition-all ${
                  !u.is_active
                    ? 'bg-base-200/50 border-base-300 opacity-60'
                    : u.is_demo
                    ? 'bg-amber-50/40 border-amber-200'
                    : 'bg-base-100 border-base-300 hover:border-base-400'
                }`}
              >
                <div className="flex items-center gap-3 p-3">
                  <div className="relative flex-none">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                        u.is_active ? 'bg-primary text-primary-content' : 'bg-base-300 text-base-content/40'
                      }`}
                    >
                      {initials}
                    </div>
                    {isOnline && (
                      <span
                        className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-success border-2 border-base-100"
                        title={`${u.active_sessions} active session${u.active_sessions !== 1 ? 's' : ''}`}
                      />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-base-content">{u.name}</span>
                      <span className={`badge badge-sm ${ri.color}`}>{ri.label}</span>
                      {u.is_demo && <span className="badge badge-sm badge-warning gap-1">⚡ Demo</span>}
                      {!u.is_active && <span className="badge badge-sm badge-ghost text-base-content/40">Revoked</span>}
                      {isOnline && !u.is_demo && (
                        <span className="badge badge-sm badge-success gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-success-content inline-block" />
                          Online
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-xs text-base-content/60 font-mono">{formatPhoneDisplay(u.phone)}</span>
                      {u.email && (
                        <span className="text-xs text-base-content/40">{u.email}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {u.profile_id ? (
                        <div className="flex items-center gap-1.5 bg-base-200 rounded-lg px-2 py-0.5">
                          <span className="text-[10px] text-base-content/40 font-mono select-all" title={u.profile_id}>
                            UID: {u.profile_id.slice(0, 8)}…
                          </span>
                          <button
                            className="flex items-center gap-0.5 text-[10px] text-base-content/30 hover:text-primary transition-colors"
                            onClick={() => copyUserId(u.profile_id!)}
                            title="Copy full User ID"
                          >
                            {copiedId === u.profile_id
                              ? <><CheckCheck size={9} className="text-success" /><span className="text-success font-medium">Copied!</span></>
                              : <><Copy size={9} /> copy</>}
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-base-content/25 italic bg-base-200 rounded px-2 py-0.5">
                          UID assigned on first login
                        </span>
                      )}
                      {u.last_login && (
                        <span className="text-[10px] text-base-content/30">
                          Last login: {timeAgoShort(u.last_login)}
                        </span>
                      )}
                      {!u.last_login && u.is_active && !u.is_demo && (
                        <span className="text-[10px] text-base-content/25 italic">Never logged in</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5 flex-none">
                    <button
                      className="btn btn-xs btn-ghost"
                      title={u.is_active ? 'Revoke access' : 'Restore access'}
                      onClick={() => setRevokeTarget(u)}
                    >
                      <Ban size={13} className={u.is_active ? 'text-base-content/30 hover:text-warning' : 'text-success'} />
                    </button>
                    <button
                      className="btn btn-xs btn-ghost"
                      title="Edit user"
                      onClick={() => { setEditUser(u); setShowForm(true); }}
                    >
                      <Pencil size={13} className="text-base-content/40" />
                    </button>
                    <button
                      className="btn btn-xs btn-ghost"
                      title="Delete user"
                      onClick={() => setDeleteTarget(u)}
                    >
                      <Trash2 size={13} className="text-error/50 hover:text-error" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <UserAccessForm
          user={editUser}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditUser(undefined); }}
          saving={saving}
        />
      )}

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title="Remove user access?"
        message={`${deleteTarget?.name ?? 'This user'} will be permanently removed from the whitelist and their sessions invalidated.`}
        confirmLabel="Remove Access"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmModal
        isOpen={revokeTarget !== null}
        title={revokeTarget?.is_active ? 'Revoke access?' : 'Restore access?'}
        message={
          revokeTarget?.is_active
            ? `${revokeTarget.name}'s access will be suspended and all active sessions will be invalidated immediately.`
            : `${revokeTarget?.name}'s access will be restored. They can log in again.`
        }
        confirmLabel={revokeTarget?.is_active ? 'Revoke' : 'Restore'}
        onConfirm={handleRevoke}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
}


// ── Main component ───────────────────────────────────────────────────────────
export const SettingsView: React.FC<Props> = ({
  users, onSaveUsers, deals, contactRecords, mlsEntries, complianceTemplates, storageMode,
  emailTemplates, onSaveEmailTemplates,
  complianceMasterItems, onSaveComplianceMasterItems,
  ddMasterItems = [], onSaveDdMasterItems,
}) => {
  const [tab, setTab]             = useState<SettingsTab>('team');
  const [showForm, setShowForm]   = useState(false);
  const [editUser, setEditUser]   = useState<AppUser | undefined>();
  const [deleteId, setDeleteId]   = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState<string | null>(null);

  const flash = (key: string) => {
    setDownloaded(key);
    setTimeout(() => setDownloaded(null), 2000);
  };

  const saveUser = (u: AppUser) => {
    const exists = users.find(x => x.id === u.id);
    onSaveUsers(exists ? users.map(x => x.id === u.id ? u : x) : [...users, u]);
    setShowForm(false); setEditUser(undefined);
  };

  const confirmDelete = (id: string) => {
    onSaveUsers(users.filter(u => u.id !== id));
    setDeleteId(null);
  };

  const exportTransactions = () => {
    const headers = ['Address', 'City', 'State', 'Zip', 'MLS #', 'Status', 'Side',
      'Property Type', 'List Price', 'Contract Price', 'Contract Date', 'Closing Date',
      'Agent Name', 'Notes', 'Created'];
    const rows = deals.map(d => [
      d.propertyAddress, d.city, d.state, d.zipCode, d.mlsNumber, d.status, d.transactionType,
      d.propertyType, d.listPrice, d.contractPrice, d.contractDate, d.closingDate,
      d.agentName, d.notes, d.createdAt,
    ]);
    downloadCSV('transactions.csv', toCSV(headers, rows));
    flash('transactions');
  };

  const exportContacts = () => {
    const headers = ['Name', 'Email', 'Phone', 'Role', 'Company', 'States', 'MLS IDs', 'Notes', 'Created'];
    const rows = contactRecords.map(c => [
      c.fullName, c.email, c.phone, c.contactType, c.company ?? '',
      '', '', c.notes ?? '', '',
    ]);
    downloadCSV('contacts.csv', toCSV(headers, rows));
    flash('contacts');
  };

  const exportMLS = () => {
    const headers = ['Name', 'State', 'URL', 'Notes', 'Required Documents', 'Created'];
    const rows = mlsEntries.map(m => [
      m.name, m.state, m.url, m.notes ?? '',
      m.documents.filter(d => d.required).map(d => d.name).join('; '),
      m.createdAt,
    ]);
    downloadCSV('mls-directory.csv', toCSV(headers, rows));
    flash('mls');
  };

  const exportCompliance = () => {
    const headers = ['Template Name', 'Agent Client', 'Item', 'Required', 'Order', 'Updated'];
    const rows: (string | number | boolean)[][] = [];
    complianceTemplates.forEach(t => {
      if (t.items.length === 0) {
        rows.push([t.agentClientName ?? '', t.agentClientName ?? '', '(no items)', false, 0, t.updatedAt ?? '']);
      } else {
        t.items.forEach(item => {
          rows.push([t.agentClientName ?? '', t.agentClientName ?? '', item.title, item.required ?? false, item.order ?? 0, t.updatedAt ?? '']);
        });
      }
    });
    downloadCSV('compliance-templates.csv', toCSV(headers, rows));
    flash('compliance');
  };

  const reports = [
    {
      key: 'transactions',
      label: 'Transactions',
      description: `Export all ${deals.length} transaction records`,
      icon: <Building2 size={22} className="text-primary" />,
      count: deals.length,
      action: exportTransactions,
      color: 'border-primary/20 bg-primary/5',
    },
    {
      key: 'contacts',
      label: 'Contacts',
      description: `Export all ${contactRecords.length} contacts from directory`,
      icon: <Users size={22} className="text-secondary" />,
      count: contactRecords.length,
      action: exportContacts,
      color: 'border-secondary/20 bg-secondary/5',
    },
    {
      key: 'mls',
      label: 'MLS Directory',
      description: `Export all ${mlsEntries.length} MLS systems`,
      icon: <Globe size={22} className="text-accent" />,
      count: mlsEntries.length,
      action: exportMLS,
      color: 'border-accent/20 bg-accent/5',
    },
    {
      key: 'compliance',
      label: 'Compliance Templates',
      description: `Export all ${complianceTemplates.length} compliance templates`,
      icon: <ClipboardList size={22} className="text-success" />,
      count: complianceTemplates.length,
      action: exportCompliance,
      color: 'border-success/20 bg-success/5',
    },
  ];


  return (
    <div className="flex flex-col h-full bg-base-100">
      {/* Header */}
      <div className="flex flex-col gap-3 px-6 py-4 border-b border-base-300 flex-none md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-bold text-base-content">Settings</h1>
          <p className="text-xs text-base-content/50 mt-0.5">Manage your team, email templates, and export data</p>
        </div>
        <div className="badge badge-outline badge-sm whitespace-nowrap">{storageMode}</div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-4 flex-none border-b border-base-300 overflow-x-auto">
        {[
          { id: 'team' as SettingsTab,                  label: 'Access & Users',        icon: <Shield size={14}/> },
          { id: 'license-links' as SettingsTab,         label: 'License Lookup',        icon: <Link size={14}/> },
          { id: 'email-templates' as SettingsTab,      label: 'Email Templates',       icon: <Mail size={14}/> },
          { id: 'dd-checklist' as SettingsTab,         label: 'Due Diligence',         icon: <ClipboardList size={14}/> },
          { id: 'compliance-checklist' as SettingsTab, label: 'Compliance Checklist',  icon: <Shield size={14}/> },
          { id: 'reports' as SettingsTab,              label: 'CSV Reports',           icon: <FileDown size={14}/> },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap
              ${tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-base-content/50 hover:text-base-content'}`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className={`flex-1 ${tab === 'email-templates' ? 'overflow-hidden' : 'overflow-y-auto p-6'}`}>
        {tab === 'dd-checklist' && (
          <DDChecklistTab items={ddMasterItems} onSave={onSaveDdMasterItems!} />
        )}
        {tab === 'compliance-checklist' && (
          <ComplianceChecklistTab items={complianceMasterItems} onSave={onSaveComplianceMasterItems} />
        )}
        {tab === 'team' && <AccessUsersTab />}
        {tab === 'license-links' && <LicenseLinksTab />}
        {tab === 'email-templates' && (
          <EmailTemplatesTab emailTemplates={emailTemplates} onSave={onSaveEmailTemplates} />
        )}
        {tab === 'reports' && (
          <div className="max-w-3xl mx-auto flex flex-col gap-5">
            <div className="bg-base-200 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle size={16} className="text-info mt-0.5 flex-none"/>
              <p className="text-xs text-base-content/70 leading-relaxed">
                CSV files include all current data and open directly in Excel, Google Sheets, or any spreadsheet app.
                Downloads happen instantly in your browser.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {reports.map(r => (
                <div key={r.key} className={`rounded-xl border p-5 flex flex-col gap-3 ${r.color}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-base-100 flex items-center justify-center shadow-sm flex-none">
                      {r.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-base-content">{r.label}</div>
                      <div className="text-xs text-base-content/50 mt-0.5">{r.description}</div>
                    </div>
                  </div>
                  <button
                    className={`btn btn-sm w-full gap-1.5 transition-all
                      ${downloaded === r.key ? 'btn-success' : 'btn-neutral'}`}
                    onClick={r.action}
                  >
                    {downloaded === r.key
                      ? <><Check size={13}/> Downloaded!</>
                      : <><Download size={13}/> Export CSV</>}
                  </button>
                </div>
              ))}
            </div>
            <div className="text-center text-xs text-base-content/35 pt-2">
              All exports reflect live data — re-export anytime for the latest snapshot.
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <UserForm
          user={editUser}
          onSave={saveUser}
          onClose={() => { setShowForm(false); setEditUser(undefined); }}
        />
      )}

      <ConfirmModal
        isOpen={deleteId !== null}
        title="Remove this user?"
        message={`${users.find(u => u.id === deleteId)?.name ?? 'This user'} will be removed from the team list.`}
        confirmLabel="Remove"
        onConfirm={() => { if (deleteId) confirmDelete(deleteId); }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
};
