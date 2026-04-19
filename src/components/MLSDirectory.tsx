import React, { useState, useRef } from 'react';
import {
  Plus, Pencil, Trash2, X, Save, Globe, MapPin,
  FileText, ArrowLeft, Link, StickyNote,
  FilePlus, CheckCircle2, Circle, MoreVertical,
  Upload, Loader2, Paperclip, Copy, TableProperties,
} from 'lucide-react';
import { MlsEntry, MlsDocument } from '../types';
// generateId removed - using crypto.randomUUID() for UUID-compatible IDs
import { ConfirmModal } from './ConfirmModal';
import { Button } from './ui/Button';
import { supabase } from '../lib/supabase';
import { FormSchemaViewer } from './FormSchemaViewer';

interface Props {
  mls: MlsEntry[];
  onUpdate: (updated: MlsEntry[]) => void;
}

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];

const DOC_CATEGORIES: { value: MlsDocument['category']; label: string; color: string }[] = [
  { value: 'listing',     label: 'Listing',     color: 'badge-primary'   },
  { value: 'disclosure',  label: 'Disclosure',  color: 'badge-warning'   },
  { value: 'addendum',    label: 'Addendum',    color: 'badge-info'      },
  { value: 'contract',    label: 'Contract',    color: 'badge-success'   },
  { value: 'compliance',  label: 'Compliance',  color: 'badge-secondary' },
  { value: 'other',       label: 'Other',       color: 'badge-ghost'     },
];

const getCatStyle = (cat: MlsDocument['category']) =>
  DOC_CATEGORIES.find(d => d.value === cat)?.color ?? 'badge-ghost';
const getCatLabel = (cat: MlsDocument['category']) =>
  DOC_CATEGORIES.find(d => d.value === cat)?.label ?? cat;

const emptyEntry = (): Omit<MlsEntry, 'id' | 'createdAt' | 'documents'> => ({
  name: '', url: '', state: '', notes: '',
});

const emptyDoc = (): Omit<MlsDocument, 'id'> => ({
  name: '', category: 'listing', required: false, notes: '', template_pdf_path: null,
});

type RightTab = 'documents' | 'schema';

export const MLSDirectory: React.FC<Props> = ({ mls, onUpdate }) => {
  const [selected, setSelected]         = useState<string | null>(null);
  const [stateFilter, setStateFilter]   = useState('all');
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editing, setEditing]           = useState<MlsEntry | null>(null);
  const [entryForm, setEntryForm]       = useState(emptyEntry());
  const [deleteId, setDeleteId]         = useState<string | null>(null);
  const [mlsMenuId, setMlsMenuId]       = useState<string | null>(null);
  const [rightTab, setRightTab]         = useState<RightTab>('documents');

  const [showDocModal, setShowDocModal]   = useState(false);
  const [editingDoc, setEditingDoc]       = useState<MlsDocument | null>(null);
  const [docForm, setDocForm]             = useState<Omit<MlsDocument, 'id'>>(emptyDoc());
  const [deleteDocId, setDeleteDocId]     = useState<string | null>(null);
  const [copyDocId, setCopyDocId]         = useState<string | null>(null);
  const [copyTargetId, setCopyTargetId]   = useState<string>('');

  // PDF template upload state
  const [pdfUploading, setPdfUploading]   = useState(false);
  const [pdfError, setPdfError]           = useState<string | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const allStates = Array.from(new Set(mls.map(m => m.state).filter(Boolean))).sort();
  const filtered  = stateFilter === 'all' ? mls : mls.filter(m => m.state === stateFilter);
  const selectedEntry = mls.find(m => m.id === selected) ?? null;

  /* ── Entry CRUD ── */
  const openAdd = () => {
    setEditing(null);
    setEntryForm(emptyEntry());
    setShowEntryModal(true);
  };
  const openEditEntry = (e: MlsEntry) => {
    setEditing(e);
    setEntryForm({ name: e.name, url: e.url, state: e.state, notes: e.notes ?? '' });
    setShowEntryModal(true);
  };
  const saveEntry = () => {
    if (!entryForm.name.trim() || !entryForm.state) return;
    if (editing) {
      onUpdate(mls.map(m => m.id === editing.id ? { ...editing, ...entryForm } : m));
    } else {
      const ne: MlsEntry = {
        ...entryForm,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        documents: [],
      };
      onUpdate([ne, ...mls]);
    }
    setShowEntryModal(false);
  };
  const confirmDeleteEntry = () => {
    if (!deleteId) return;
    if (selected === deleteId) setSelected(null);
    onUpdate(mls.filter(m => m.id !== deleteId));
    setDeleteId(null);
  };

  /* ── Document CRUD ── */
  const openAddDoc = () => {
    setEditingDoc(null);
    setDocForm(emptyDoc());
    setPdfError(null);
    setShowDocModal(true);
  };
  const openEditDoc = (doc: MlsDocument) => {
    setEditingDoc(doc);
    setDocForm({
      name: doc.name,
      category: doc.category,
      required: doc.required,
      notes: doc.notes ?? '',
      template_pdf_path: doc.template_pdf_path ?? null,
    });
    setPdfError(null);
    setShowDocModal(true);
  };
  const saveDoc = () => {
    if (!docForm.name.trim() || !selectedEntry) return;
    let updated: MlsEntry;
    if (editingDoc) {
      updated = {
        ...selectedEntry,
        documents: selectedEntry.documents.map(d =>
          d.id === editingDoc.id ? { ...editingDoc, ...docForm } : d
        ),
      };
    } else {
      const nd: MlsDocument = { ...docForm, id: crypto.randomUUID() };
      updated = { ...selectedEntry, documents: [nd, ...(selectedEntry.documents ?? [])] };
    }
    onUpdate(mls.map(m => m.id === updated.id ? updated : m));
    setShowDocModal(false);
  };
  const toggleRequired = (docId: string) => {
    if (!selectedEntry) return;
    const updated = {
      ...selectedEntry,
      documents: selectedEntry.documents.map(d =>
        d.id === docId ? { ...d, required: !d.required } : d
      ),
    };
    onUpdate(mls.map(m => m.id === updated.id ? updated : m));
  };
  const confirmDeleteDoc = () => {
    if (!deleteDocId || !selectedEntry) return;
    const updated = {
      ...selectedEntry,
      documents: selectedEntry.documents.filter(d => d.id !== deleteDocId),
    };
    onUpdate(mls.map(m => m.id === updated.id ? updated : m));
    setDeleteDocId(null);
  };

  /* ── Copy Document to another MLS ── */
  const copyDocToMls = () => {
    if (!copyDocId || !copyTargetId || !selectedEntry) return;
    const doc = selectedEntry.documents.find(d => d.id === copyDocId);
    if (!doc) return;
    const target = mls.find(m => m.id === copyTargetId);
    if (!target) return;
    const newDoc: MlsDocument = { ...doc, id: crypto.randomUUID() };
    const updatedTarget = { ...target, documents: [...(target.documents ?? []), newDoc] };
    onUpdate(mls.map(m => m.id === updatedTarget.id ? updatedTarget : m));
    setCopyDocId(null);
    setCopyTargetId('');
  };

  /* ── PDF Template Upload ── */
  const handlePdfUpload = async (file: File) => {
    if (!selectedEntry) return;
    if (file.type !== 'application/pdf') {
      setPdfError('Please upload a PDF file.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setPdfError('File too large (max 20MB).');
      return;
    }

    setPdfUploading(true);
    setPdfError(null);

    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${selectedEntry.id}/${crypto.randomUUID()}/${safeName}`;

      const { error: uploadErr } = await supabase.storage
        .from('form-templates')
        .upload(storagePath, file, { upsert: true });

      if (uploadErr) throw new Error(uploadErr.message);

      setDocForm(f => ({ ...f, template_pdf_path: storagePath }));
    } catch (err: any) {
      setPdfError(err?.message || 'Upload failed. Try again.');
    } finally {
      setPdfUploading(false);
    }
  };

  const handleRemoveTemplate = () => {
    setDocForm(f => ({ ...f, template_pdf_path: null }));
  };

  /* ── Render ── */
  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left: MLS List ── */}
      <div className={`flex flex-col border-r border-base-300 bg-base-100 flex-none
        ${selectedEntry ? 'hidden md:flex w-72' : 'flex w-full md:w-72'}`}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-base-300 flex-none">
          <div>
            <h1 className="text-base font-bold text-base-content">MLS Directory</h1>
            <p className="text-xs text-base-content/40 mt-0.5">{mls.length} board{mls.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={openAdd} className="btn btn-primary btn-xs gap-1">
            <Plus size={12} /> Add
          </button>
        </div>

        {/* State filter */}
        <div className="px-4 py-2 border-b border-base-300 flex-none">
          <select
            value={stateFilter}
            onChange={e => setStateFilter(e.target.value)}
            className="select select-bordered select-xs w-full"
          >
            <option value="all">All States ({mls.length})</option>
            {allStates.map(s => (
              <option key={s} value={s}>{s} ({mls.filter(m => m.state === s).length})</option>
            ))}
          </select>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto py-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-base-content/30">
              <Globe size={32} strokeWidth={1} />
              <p className="text-xs text-center px-4">No MLS boards yet — click Add to get started</p>
            </div>
          ) : (
            filtered.map(entry => (
              <div
                key={entry.id}
                className={`relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-base-200 group
                  ${selected === entry.id ? 'bg-primary/10 border-r-2 border-primary' : ''}`}
              >
                <button
                  onClick={() => setSelected(entry.id)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <div className="w-8 h-8 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-center flex-none">
                    <Globe size={14} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-base-content truncate">{entry.name}</div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <MapPin size={10} className="text-base-content/40 flex-none" />
                      <span className="text-xs text-base-content/50">{entry.state}</span>
                      {(entry.documents?.length ?? 0) > 0 && (
                        <span className="ml-auto text-xs text-base-content/40 flex items-center gap-0.5">
                          <FileText size={10} />
                          {entry.documents.length}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                {/* 3-dot menu */}
                <div className="relative flex-none">
                  <button
                    onClick={e => { e.stopPropagation(); setMlsMenuId(mlsMenuId === entry.id ? null : entry.id); }}
                    className="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100"
                  >
                    <MoreVertical size={13} />
                  </button>
                  {mlsMenuId === entry.id && (
                    <div
                      className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl min-w-[140px] py-1"
                      onMouseLeave={() => setMlsMenuId(null)}
                    >
                      <button
                        className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        onClick={() => { setMlsMenuId(null); setSelected(entry.id); }}
                      >
                        <Globe size={12} /> View
                      </button>
                      <button
                        className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                        onClick={() => { setMlsMenuId(null); setDeleteId(entry.id); }}
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Right: Profile ── */}
      {selectedEntry ? (
        <div className="flex-1 flex flex-col overflow-hidden bg-base-100">

          {/* Profile header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-base-300 flex-none">
            <button
              onClick={() => setSelected(null)}
              className="btn btn-ghost btn-xs btn-square md:hidden"
            >
              <ArrowLeft size={14} />
            </button>
            <div className="w-10 h-10 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-center flex-none">
              <Globe size={18} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-base text-base-content">{selectedEntry.name}</h2>
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                <span className="flex items-center gap-1 text-xs text-base-content/50">
                  <MapPin size={11} /> {selectedEntry.state}
                </span>
                {selectedEntry.url && (
                  <span className="flex items-center gap-1 text-xs text-base-content/50">
                    <Link size={11} /> {selectedEntry.url}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-1 flex-none">
              <button onClick={() => openEditEntry(selectedEntry)} className="btn btn-ghost btn-sm gap-1">
                <Pencil size={13} /> Edit Info
              </button>
              <button
                onClick={() => setDeleteId(selectedEntry.id)}
                className="btn btn-ghost btn-sm text-error hover:bg-error/10"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          {/* Notes row */}
          {selectedEntry.notes && (
            <div className="flex items-start gap-2 px-6 py-3 border-b border-base-300 bg-base-200/50 flex-none">
              <StickyNote size={13} className="text-base-content/40 flex-none mt-0.5" />
              <p className="text-xs text-base-content/60">{selectedEntry.notes}</p>
            </div>
          )}

          {/* ── Tab bar ── */}
          <div className="flex border-b border-base-300 flex-none px-6 gap-1 pt-1">
            <button
              onClick={() => setRightTab('documents')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors
                ${rightTab === 'documents'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-base-content/50 hover:text-base-content'}`}
            >
              <FileText size={12} /> Documents
              {(selectedEntry.documents?.length ?? 0) > 0 && (
                <span className="badge badge-xs badge-ghost">{selectedEntry.documents.length}</span>
              )}
            </button>
            <button
              onClick={() => setRightTab('schema')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors
                ${rightTab === 'schema'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-base-content/50 hover:text-base-content'}`}
            >
              <TableProperties size={12} /> Form Schema
            </button>
          </div>

          {/* ── Tab content ── */}
          {rightTab === 'schema' ? (
            <div className="flex-1 overflow-hidden">
              <FormSchemaViewer
                templatePdfPath={
                  selectedEntry.documents
                    ?.find(d => d.category === 'contract' && d.template_pdf_path)
                    ?.template_pdf_path ?? null
                }
              />
            </div>
          ) : (
            /* ── Documents tab (existing content) ── */
            <div className="flex-1 overflow-auto px-6 py-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-sm text-base-content">Required Documents & PDF Forms</h3>
                  <p className="text-xs text-base-content/40 mt-0.5">
                    Forms required by this MLS — upload blank PDF templates to improve AI extraction accuracy
                  </p>
                </div>
                <button onClick={openAddDoc} className="btn btn-primary btn-sm gap-1">
                  <FilePlus size={13} /> Add Form
                </button>
              </div>

              {/* Stats row */}
              {(selectedEntry.documents?.length ?? 0) > 0 && (
                <div className="flex gap-3 mb-4 flex-wrap">
                  {DOC_CATEGORIES.map(cat => {
                    const count = selectedEntry.documents.filter(d => d.category === cat.value).length;
                    if (!count) return null;
                    return (
                      <div key={cat.value} className={`badge ${cat.color} badge-sm gap-1`}>
                        {cat.label}: {count}
                      </div>
                    );
                  })}
                  <div className="badge badge-error badge-sm gap-1 ml-auto">
                    Required: {selectedEntry.documents.filter(d => d.required).length}
                  </div>
                  {selectedEntry.documents.some(d => d.template_pdf_path) && (
                    <div className="badge badge-success badge-sm gap-1">
                      <Paperclip size={9} /> Templates: {selectedEntry.documents.filter(d => d.template_pdf_path).length}
                    </div>
                  )}
                </div>
              )}

              {/* Document list */}
              {(selectedEntry.documents?.length ?? 0) === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3 text-base-content/30 border-2 border-dashed border-base-300 rounded-2xl">
                  <FileText size={36} strokeWidth={1} />
                  <div className="text-center">
                    <p className="text-sm font-medium text-base-content/40">No forms added yet</p>
                    <p className="text-xs mt-1">Add PDF forms required by {selectedEntry.name} for transactions</p>
                  </div>
                  <button onClick={openAddDoc} className="btn btn-primary btn-sm gap-1">
                    <FilePlus size={13} /> Add First Form
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {selectedEntry.documents.map(doc => (
                    <div
                      key={doc.id}
                      className={`flex items-start gap-3 p-4 rounded-xl border transition-colors
                        ${doc.required
                          ? 'border-error/30 bg-error/5'
                          : 'border-base-300 bg-base-200/50'}`}
                    >
                      {/* Required toggle */}
                      <button
                        onClick={() => toggleRequired(doc.id)}
                        className={`flex-none mt-0.5 transition-colors ${doc.required ? 'text-error' : 'text-base-content/25 hover:text-base-content/50'}`}
                        title={doc.required ? 'Mark as optional' : 'Mark as required'}
                      >
                        {doc.required
                          ? <CheckCircle2 size={18} />
                          : <Circle size={18} />}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-base-content">{doc.name}</span>
                          <span className={`badge ${getCatStyle(doc.category)} badge-xs`}>
                            {getCatLabel(doc.category)}
                          </span>
                          {doc.required && (
                            <span className="badge badge-error badge-xs">Required</span>
                          )}
                          {doc.template_pdf_path && (
                            <span className="badge badge-success badge-xs gap-0.5" title="Blank template PDF uploaded — AI will use this as a reference during extraction">
                              <Paperclip size={9} /> Template
                            </span>
                          )}
                        </div>
                        {doc.notes && (
                          <p className="text-xs text-base-content/50 mt-1">{doc.notes}</p>
                        )}
                        {doc.template_pdf_path && (
                          <p className="text-xs text-success/70 mt-1 flex items-center gap-1">
                            <Paperclip size={10} />
                            Blank template uploaded — AI uses this for extraction reference
                          </p>
                        )}
                      </div>

                      <div className="flex gap-1 flex-none">
                        <button onClick={() => openEditDoc(doc)} className="btn btn-ghost btn-xs btn-square">
                          <Pencil size={11} />
                        </button>
                        <button
                          onClick={() => { setCopyDocId(doc.id); setCopyTargetId(''); }}
                          className="btn btn-ghost btn-xs btn-square text-primary hover:bg-primary/10"
                          title="Copy to another MLS"
                        >
                          <Copy size={11} />
                        </button>
                        <button
                          onClick={() => setDeleteDocId(doc.id)}
                          className="btn btn-ghost btn-xs btn-square text-error hover:bg-error/10"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Empty state when nothing selected (desktop) */
        <div className="flex-1 hidden md:flex flex-col items-center justify-center gap-4 text-base-content/25 bg-base-50">
          <Globe size={56} strokeWidth={1} />
          <div className="text-center">
            <p className="font-semibold text-base-content/40">Select an MLS board</p>
            <p className="text-sm mt-1">Click a board on the left to view its profile and required documents</p>
          </div>
        </div>
      )}

      {/* ── Add/Edit MLS Entry Modal ── */}
      {showEntryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-base-300">
              <h2 className="font-bold text-base">{editing ? 'Edit MLS Board' : 'Add MLS Board'}</h2>
              <button onClick={() => setShowEntryModal(false)} className="btn btn-ghost btn-xs btn-square">
                <X size={14} />
              </button>
            </div>
            <div className="flex flex-col gap-4 px-6 py-5 overflow-auto">
              <div>
                <label className="label label-text text-xs font-semibold mb-1">MLS Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Bright MLS, FMLS, HAR…"
                  value={entryForm.name}
                  onChange={e => setEntryForm(f => ({ ...f, name: e.target.value }))}
                  className="input input-bordered input-sm w-full"
                />
              </div>
              <div>
                <label className="label label-text text-xs font-semibold mb-1">State *</label>
                <select
                  value={entryForm.state}
                  onChange={e => setEntryForm(f => ({ ...f, state: e.target.value }))}
                  className="select select-bordered select-sm w-full"
                >
                  <option value="">Select state…</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label label-text text-xs font-semibold mb-1">Portal URL</label>
                <input
                  type="text"
                  placeholder="e.g. https://matrix.brightmls.com"
                  value={entryForm.url}
                  onChange={e => setEntryForm(f => ({ ...f, url: e.target.value }))}
                  className="input input-bordered input-sm w-full"
                />
              </div>
              <div>
                <label className="label label-text text-xs font-semibold mb-1">Notes</label>
                <textarea
                  placeholder="Login instructions, contact info, tips…"
                  value={entryForm.notes}
                  onChange={e => setEntryForm(f => ({ ...f, notes: e.target.value }))}
                  className="textarea textarea-bordered textarea-sm w-full h-20 resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-base-300">
              <Button variant="ghost" onClick={() => setShowEntryModal(false)}>Cancel</Button>
              <button
                onClick={saveEntry}
                disabled={!entryForm.name.trim() || !entryForm.state}
                className="btn btn-primary btn-sm gap-2"
              >
                <Save size={13} /> {editing ? 'Save Changes' : 'Add MLS'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add/Edit Document Modal ── */}
      {showDocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-base-300">
              <h2 className="font-bold text-base">{editingDoc ? 'Edit Document' : 'Add Required Form'}</h2>
              <button onClick={() => setShowDocModal(false)} className="btn btn-ghost btn-xs btn-square">
                <X size={14} />
              </button>
            </div>
            <div className="flex flex-col gap-4 px-6 py-5 overflow-auto">
              <div>
                <label className="label label-text text-xs font-semibold mb-1">Form / Document Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Seller Disclosure, Lead Paint Addendum…"
                  value={docForm.name}
                  onChange={e => setDocForm(f => ({ ...f, name: e.target.value }))}
                  className="input input-bordered input-sm w-full"
                />
              </div>
              <div>
                <label className="label label-text text-xs font-semibold mb-1">Category *</label>
                <select
                  value={docForm.category}
                  onChange={e => setDocForm(f => ({ ...f, category: e.target.value as MlsDocument['category'] }))}
                  className="select select-bordered select-sm w-full"
                >
                  {DOC_CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label label-text text-xs font-semibold mb-1">Notes</label>
                <textarea
                  placeholder="When is this needed? Any special instructions…"
                  value={docForm.notes}
                  onChange={e => setDocForm(f => ({ ...f, notes: e.target.value }))}
                  className="textarea textarea-bordered textarea-sm w-full h-16 resize-none"
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={docForm.required}
                  onChange={e => setDocForm(f => ({ ...f, required: e.target.checked }))}
                  className="checkbox checkbox-error checkbox-sm"
                />
                <div>
                  <span className="text-sm font-semibold text-base-content">Mark as Required</span>
                  <p className="text-xs text-base-content/40 mt-0.5">Required forms trigger an alert if missing from a deal</p>
                </div>
              </label>

              {/* ── Blank Template PDF Upload ── */}
              <div className="border border-base-300 rounded-xl p-4 bg-base-200/40">
                <div className="flex items-start gap-2 mb-3">
                  <Paperclip size={14} className="text-primary mt-0.5 flex-none" />
                  <div>
                    <p className="text-xs font-semibold text-base-content">Blank Template PDF</p>
                    <p className="text-xs text-base-content/50 mt-0.5">
                      Upload the blank form so the AI can use it as a reference map during contract extraction
                    </p>
                  </div>
                </div>

                {docForm.template_pdf_path ? (
                  <div className="flex items-center gap-2 p-2 bg-success/10 border border-success/30 rounded-lg">
                    <Paperclip size={13} className="text-success flex-none" />
                    <span className="text-xs text-success font-medium flex-1 truncate">
                      Template uploaded ✓
                    </span>
                    <button
                      onClick={handleRemoveTemplate}
                      className="btn btn-ghost btn-xs btn-square text-error hover:bg-error/10"
                      title="Remove template"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ) : (
                  <div>
                    <input
                      ref={pdfInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handlePdfUpload(file);
                        e.target.value = '';
                      }}
                    />
                    <button
                      onClick={() => pdfInputRef.current?.click()}
                      disabled={pdfUploading}
                      className="btn btn-outline btn-sm gap-2 w-full"
                    >
                      {pdfUploading ? (
                        <><Loader2 size={13} className="animate-spin" /> Uploading…</>
                      ) : (
                        <><Upload size={13} /> Upload Blank PDF Template</>
                      )}
                    </button>
                  </div>
                )}

                {pdfError && (
                  <p className="text-xs text-error mt-2">{pdfError}</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-base-300">
              <Button variant="ghost" onClick={() => setShowDocModal(false)}>Cancel</Button>
              <button
                onClick={saveDoc}
                disabled={!docForm.name.trim() || pdfUploading}
                className="btn btn-primary btn-sm gap-2"
              >
                <Save size={13} /> {editingDoc ? 'Save Changes' : 'Add Form'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Copy Document to MLS Modal ── */}
      {copyDocId && selectedEntry && (() => {
        const doc = selectedEntry.documents.find(d => d.id === copyDocId);
        const otherMls = mls.filter(m => m.id !== selectedEntry.id);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-sm flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-base-300">
                <div>
                  <h2 className="font-bold text-sm">Copy Form to Another MLS</h2>
                  <p className="text-xs text-base-content/40 mt-0.5 truncate max-w-[240px]">{doc?.name}</p>
                </div>
                <button onClick={() => setCopyDocId(null)} className="btn btn-ghost btn-xs btn-square">
                  <X size={14} />
                </button>
              </div>
              <div className="px-6 py-5">
                {otherMls.length === 0 ? (
                  <p className="text-sm text-base-content/50 text-center py-4">No other MLS boards to copy to. Add one first.</p>
                ) : (
                  <div>
                    <label className="label label-text text-xs font-semibold mb-1">Select destination MLS</label>
                    <select
                      value={copyTargetId}
                      onChange={e => setCopyTargetId(e.target.value)}
                      className="select select-bordered select-sm w-full"
                    >
                      <option value="">Choose MLS…</option>
                      {otherMls.map(m => (
                        <option key={m.id} value={m.id}>{m.name} ({m.state})</option>
                      ))}
                    </select>
                    <p className="text-xs text-base-content/40 mt-2">
                      The form name, category, notes, required flag, and template PDF will all be copied.
                    </p>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 px-6 py-4 border-t border-base-300">
                <button onClick={() => setCopyDocId(null)} className="btn btn-ghost btn-sm">Cancel</button>
                <button
                  onClick={copyDocToMls}
                  disabled={!copyTargetId}
                  className="btn btn-primary btn-sm gap-2"
                >
                  <Copy size={13} /> Copy Form
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Delete MLS Entry Confirm ── */}
      <ConfirmModal
        isOpen={deleteId !== null}
        title="Remove MLS Board?"
        message="This will permanently delete this MLS and all its associated document requirements."
        confirmLabel="Delete"
        onConfirm={confirmDeleteEntry}
        onCancel={() => setDeleteId(null)}
      />

      {/* ── Delete Document Confirm ── */}
      <ConfirmModal
        isOpen={deleteDocId !== null}
        title="Remove Document?"
        message="This document requirement will be removed from this MLS profile."
        confirmLabel="Delete"
        onConfirm={confirmDeleteDoc}
        onCancel={() => setDeleteDocId(null)}
      />
    </div>
  );
};
