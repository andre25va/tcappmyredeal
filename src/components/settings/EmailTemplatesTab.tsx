import React, { useState } from 'react';
import { Mail, Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import { EmailTemplate, ConfirmationButton } from '../../types';
import { generateId } from '../../utils/helpers';
import { ConfirmModal } from '../ConfirmModal';

const MERGE_TAGS = [
  { tag: '{{address}}', desc: 'Property street address' },
  { tag: '{{city}}', desc: 'City' },
  { tag: '{{state}}', desc: 'State' },
  { tag: '{{zipCode}}', desc: 'Zip code' },
  { tag: '{{mlsNumber}}', desc: 'MLS number' },
  { tag: '{{contractPrice}}', desc: 'Contract price (formatted)' },
  { tag: '{{listPrice}}', desc: 'List price (formatted)' },
  { tag: '{{contractDate}}', desc: 'Contract date (formatted)' },
  { tag: '{{closingDate}}', desc: 'Closing date (formatted)' },
  { tag: '{{milestone}}', desc: 'Current milestone/status' },
  { tag: '{{agentName}}', desc: 'Representing agent full name' },
  { tag: '{{agentPhone}}', desc: 'Representing agent phone number' },
  { tag: '{{agentEmail}}', desc: 'Representing agent email address' },
  { tag: '{{clientName}}', desc: 'Client name (buyer or seller we represent)' },
  { tag: '{{agents}}', desc: 'Auto-populated agent info block' },
  { tag: '{{contacts}}', desc: 'Auto-populated contact list' },
  { tag: '{{pendingDocs}}', desc: 'Pending document requests' },
  { tag: '{{reminders}}', desc: 'Upcoming reminders / key dates' },
];

interface TemplateFormState { name: string; subject: string; body: string; buttons: ConfirmationButton[]; category: string; }
function emptyFormState(): TemplateFormState { return { name: '', subject: '', body: '', buttons: [], category: 'General' }; }
function templateToFormState(t: EmailTemplate): TemplateFormState { return { name: t.name, subject: t.subject, body: t.body, buttons: t.buttons.map(b => ({ ...b })), category: t.category || 'General' }; }

interface EmailTemplatesTabProps { emailTemplates: EmailTemplate[]; onSave: (templates: EmailTemplate[]) => void; }

export function EmailTemplatesTab({ emailTemplates, onSave }: EmailTemplatesTabProps) {
  const [selectedId, setSelectedId] = useState<string | null>(emailTemplates[0]?.id ?? null);
  const [form, setForm] = useState<TemplateFormState | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showMergeTags, setShowMergeTags] = useState(false);

  const selectedTemplate = emailTemplates.find(t => t.id === selectedId) ?? null;
  const startEdit = (t: EmailTemplate) => { setSelectedId(t.id); setForm(templateToFormState(t)); setIsNew(false); };
  const startNew = () => { setSelectedId(null); setForm(emptyFormState()); setIsNew(true); };
  const cancelEdit = () => { setForm(null); setIsNew(false); if (!selectedTemplate && emailTemplates.length > 0) setSelectedId(emailTemplates[0].id); };

  const saveForm = () => {
    if (!form || !form.name.trim()) return;
    const now = new Date().toISOString();
    if (isNew) {
      const newTemplate: EmailTemplate = { id: generateId(), name: form.name.trim(), subject: form.subject.trim(), body: form.body, buttons: form.buttons, category: form.category, createdAt: now, updatedAt: now };
      onSave([...emailTemplates, newTemplate]); setSelectedId(newTemplate.id);
    } else {
      onSave(emailTemplates.map(t => t.id === selectedId ? { ...t, name: form.name.trim(), subject: form.subject.trim(), body: form.body, buttons: form.buttons, category: form.category, updatedAt: now } : t));
    }
    setForm(null); setIsNew(false);
  };

  const deleteTemplate = (id: string) => {
    const updated = emailTemplates.filter(t => t.id !== id);
    onSave(updated); setDeleteConfirmId(null); setForm(null); setIsNew(false); setSelectedId(updated[0]?.id ?? null);
  };

  const updateButton = (idx: number, field: keyof ConfirmationButton, value: string) => { if (!form) return; setForm({ ...form, buttons: form.buttons.map((b, i) => i === idx ? { ...b, [field]: value } : b) }); };
  const addButton = () => { if (!form) return; setForm({ ...form, buttons: [...form.buttons, { id: generateId(), label: '', replyText: '' }] }); };
  const removeButton = (idx: number) => { if (!form) return; setForm({ ...form, buttons: form.buttons.filter((_, i) => i !== idx) }); };

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-56 shrink-0 border-r border-base-300 flex flex-col overflow-y-auto bg-base-200">
        <div className="p-3 border-b border-base-300 flex items-center justify-between">
          <p className="text-xs font-bold text-base-content uppercase tracking-wide">Templates</p>
          <button className="btn btn-xs btn-primary gap-1" onClick={startNew}><Plus size={10} /> New</button>
        </div>
        <div className="flex-1 p-2 space-y-1">
          {emailTemplates.length === 0 && <p className="text-xs text-base-content/40 text-center py-4">No templates yet</p>}
          {emailTemplates.map(t => (
            <button key={t.id} onClick={() => { if (!form) startEdit(t); else setSelectedId(t.id); }} className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all text-xs ${selectedId === t.id ? 'bg-base-100 border-primary/40 shadow-sm font-semibold' : 'bg-transparent border-transparent hover:bg-base-100 hover:border-base-300 text-base-content/70'}`}>
              <div className="flex items-center gap-2"><Mail size={10} className={selectedId === t.id ? 'text-primary' : 'text-base-content/40'} /><span className="truncate">{t.name}</span></div>
              <div className="text-base-content/40 text-[10px] mt-0.5">{t.buttons.length} btn{t.buttons.length !== 1 ? 's' : ''}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        <div className="mb-4 border border-base-300 rounded-xl overflow-hidden">
          <button className="w-full flex items-center justify-between px-4 py-2.5 bg-base-200 text-xs font-semibold text-base-content/70 hover:bg-base-300" onClick={() => setShowMergeTags(v => !v)}>
            <span>📌 Available Merge Tags</span><span>{showMergeTags ? '▲ Hide' : '▼ Show'}</span>
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
        {form ? (
          <div className="max-w-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">{isNew ? 'New Template' : `Editing: ${selectedTemplate?.name ?? ''}`}</h3>
              <div className="flex gap-2">
                <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>Cancel</button>
                <button className="btn btn-primary btn-sm gap-1" onClick={saveForm} disabled={!form.name.trim()}><Check size={13} /> Save Template</button>
                {!isNew && selectedId && <button className="btn btn-error btn-outline btn-sm gap-1" onClick={() => setDeleteConfirmId(selectedId)}><Trash2 size={13} /> Delete</button>}
              </div>
            </div>
            <div><label className="label py-0.5"><span className="label-text text-xs font-medium">Template Name</span></label><input className="input input-bordered input-sm w-full" placeholder="e.g. Introduction Email" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className="label py-0.5"><span className="label-text text-xs font-medium">Category</span></label><select className="select select-bordered select-sm w-full" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{['General', 'Intro', 'Reminders', 'Document Requests', 'Closing', 'Compliance'].map(cat => (<option key={cat} value={cat}>{cat}</option>))}</select></div>
            <div><label className="label py-0.5"><span className="label-text text-xs font-medium">Subject</span></label><input className="input input-bordered input-sm w-full font-mono text-xs" placeholder="e.g. Transaction Introduction — {{address}}" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} /></div>
            <div><label className="label py-0.5"><span className="label-text text-xs font-medium">Body</span></label><textarea className="textarea textarea-bordered w-full font-mono text-xs" rows={16} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} spellCheck={false} /></div>
            <div className="border border-base-300 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div><p className="text-xs font-bold">Confirmation Buttons</p><p className="text-xs text-base-content/50 mt-0.5">Each button opens a pre-filled reply email</p></div>
                <button className="btn btn-xs btn-outline gap-1" onClick={addButton}><Plus size={10} /> Add Button</button>
              </div>
              {form.buttons.length === 0 && <p className="text-xs text-base-content/40 text-center py-2">No confirmation buttons yet</p>}
              {form.buttons.map((btn, idx) => (
                <div key={btn.id} className="bg-base-200 rounded-lg p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between"><p className="text-xs font-semibold">Button {idx + 1}</p><button className="btn btn-ghost btn-xs text-error" onClick={() => removeButton(idx)}><Trash2 size={11} /></button></div>
                  <div><label className="label py-0"><span className="label-text text-xs">Label</span></label><input className="input input-bordered input-xs w-full" placeholder="e.g. ✅ Confirm Receipt" value={btn.label} onChange={e => updateButton(idx, 'label', e.target.value)} /></div>
                  <div><label className="label py-0"><span className="label-text text-xs">Reply Text</span></label><input className="input input-bordered input-xs w-full font-mono" placeholder="e.g. I confirm receipt for {{address}}" value={btn.replyText} onChange={e => updateButton(idx, 'replyText', e.target.value)} /></div>
                </div>
              ))}
            </div>
          </div>
        ) : selectedTemplate ? (
          <div className="max-w-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-2"><Mail size={14} className="text-primary" />{selectedTemplate.name}</h3>
              <div className="flex gap-2">
                <button className="btn btn-sm btn-primary gap-1" onClick={() => startEdit(selectedTemplate)}><Pencil size={12} /> Edit</button>
                <button className="btn btn-sm btn-error btn-outline gap-1" onClick={() => setDeleteConfirmId(selectedTemplate.id)}><Trash2 size={12} /> Delete</button>
              </div>
            </div>
            <div className="bg-base-200 rounded-xl p-3"><p className="text-xs font-semibold text-base-content/50 mb-1">SUBJECT:</p><p className="text-xs font-mono">{selectedTemplate.subject}</p></div>
            <div className="bg-base-200 rounded-xl p-3"><p className="text-xs font-semibold text-base-content/50 mb-1">BODY PREVIEW:</p><pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">{selectedTemplate.body}</pre></div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
            <Mail size={32} className="text-base-content/20" />
            <p className="text-sm text-base-content/40">Select a template or create a new one</p>
            <button className="btn btn-sm btn-primary gap-1" onClick={startNew}><Plus size={13} /> New Template</button>
          </div>
        )}
      </div>
      <ConfirmModal isOpen={deleteConfirmId !== null} title="Delete this email template?" message={`"${emailTemplates.find(t => t.id === deleteConfirmId)?.name ?? ''}" will be permanently deleted.`} confirmLabel="Delete" onConfirm={() => { if (deleteConfirmId) deleteTemplate(deleteConfirmId); }} onCancel={() => setDeleteConfirmId(null)} />
    </div>
  );
}
