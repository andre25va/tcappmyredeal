import { useAuth } from '../contexts/AuthContext';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload, FileText, Link2, AlertTriangle, CheckCircle2, Clock,
  Plus, X, Info, Download, Sparkles, ChevronDown, ChevronRight,
  Mail, Eye, Loader2, RefreshCw, Trash2, ExternalLink, File,
  Paperclip, Lock, ArrowRight, ChevronUp, MapPin,
} from 'lucide-react';
import { Deal, DocumentRequest, DocRequestType, DocRequestStatus, ChecklistItem } from '../types';
import { docTypeConfig, generateId, formatDateTime } from '../utils/helpers';
import { supabase } from '../lib/supabase';
import { StatusBadge } from './ui/StatusBadge';
import {
import { LoadingSpinner } from './ui/LoadingSpinner';
  ExtractionResult,
  DOC_TYPE_LABELS,
  FIELD_DEAL_MAP,
  fmtExtracted,
  normalizeVal,
  buildDealUpdates,
} from '../utils/contractExtraction';

// ─── Types ────────────────────────────────────────────────────────────────────
interface DealDocument {
  id: string;
  deal_id: string;
  file_name: string;
  storage_path: string;           // path in Supabase bucket e.g. deal_id/uuid.pdf
  file_size_bytes?: number;
  category?: 'purchase_contract' | 'amendment' | 'addendum' | 'other';
  source: 'upload' | 'email';
  gmail_thread_id?: string;
  document_type?: string;         // legacy column kept from original schema
  thread_subject?: string;        // populated from email_thread_links join (not a DB col, runtime only)
  created_at: string;
  extracted_at?: string;
  uploaded_by?: string;
  is_protected?: boolean;
  is_source_of_truth?: boolean;
}

interface DocLink {
  id: string;
  checklist_item_id: string;
  document_id: string;
  linked_at: string;
}

interface LinkedEmailDoc {
  thread_id: string;
  subject: string;
  from_address: string;
  thread_date: string;
  score: number;
  link_method: string;
}

interface Props {
  deal: Deal;
  onUpdate: (d: Deal) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatFileSize = (bytes?: number): string => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// ─── Standalone PDF Preview Modal ────────────────────────────────────────────
function PdfPreviewModal({ doc, onClose }: { doc: DealDocument; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.storage
        .from('deal-documents')
        .createSignedUrl(doc.storage_path, 3600);
      if (error) setErr(error.message);
      else setUrl(data.signedUrl);
    })();
  }, [doc.storage_path]);

  return (
    <div className="fixed inset-0 z-50 flex bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="m-auto bg-base-100 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: '85vw', maxWidth: '1000px', height: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-base-300 flex-none">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-primary" />
            <span className="font-semibold text-sm text-base-content truncate max-w-md">{doc.file_name}</span>
            {doc.category && (
              <span className="badge badge-sm badge-ghost">{DOC_TYPE_LABELS[doc.category] ?? doc.category}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                const { data } = await supabase.storage.from('deal-documents').createSignedUrl(doc.storage_path, 300);
                if (data) window.open(data.signedUrl, '_blank');
              }}
              className="btn btn-ghost btn-xs gap-1"
            >
              <ExternalLink size={12} /> Open in new tab
            </button>
            <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle"><X size={16} /></button>
          </div>
        </div>
        <div className="flex-1 min-h-0 bg-base-200">
          {err ? (
            <div className="flex items-center justify-center h-full text-error text-sm">{err}</div>
          ) : !url ? (
            <LoadingSpinner />
          ) : (
            <iframe src={url} className="w-full h-full" title="Document Preview" />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Inline PDF Viewer (used inside modals) ───────────────────────────────────
function PdfPreview({ filePath }: { filePath: string }) {
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.storage.from('deal-documents').createSignedUrl(filePath, 3600);
      if (error) setErr(error.message);
      else setUrl(data.signedUrl);
    })();
  }, [filePath]);

  if (err) return <div className="flex items-center justify-center h-full text-sm text-error p-4">{err}</div>;
  if (!url) return <LoadingSpinner />;

  return <iframe src={url} className="w-full h-full" title="PDF Preview" />;
}

// ─── Change Comparison Modal (auto-fires after contract/amendment upload) ─────
interface ChangeComparisonProps {
  doc: DealDocument;
  deal: Deal;
  onConfirm: (updates: Partial<Deal>) => void;
  onDismiss: () => void;
}

function ChangeComparisonModal({ doc, deal, onConfirm, onDismiss }: ChangeComparisonProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => { runExtraction(); }, []);

  const runExtraction = async () => {
    setLoading(true);
    setError('');
    try {
      const { data: signed, error: urlErr } = await supabase.storage
        .from('deal-documents')
        .createSignedUrl(doc.storage_path, 300);
      if (urlErr) throw new Error('Could not sign URL: ' + urlErr.message);

      const res = await fetch('/api/extract-contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_url: signed.signedUrl,
          file_name: doc.file_name,
          deal_id: deal.id,
          deal_address: deal.propertyAddress,
        }),
      });

      if (!res.ok) throw new Error(`Extraction failed (${res.status})`);
      const data: ExtractionResult = await res.json();
      setResult(data);

      // Auto-check all fields that are CHANGED vs current deal
      const init: Record<string, boolean> = {};
      data.fields.forEach(f => {
        const defMap = FIELD_DEAL_MAP.find(m => m.key === f.key);
        if (!defMap) return;
        const currentVal = normalizeVal(f.key, defMap.getDealVal(deal));
        const newVal = normalizeVal(f.key, f.value);
        // Only auto-check if value is different from current
        init[f.key] = currentVal !== newVal && !!newVal;
      });
      setChecked(init);
    } catch (e: any) {
      setError(e.message || 'Extraction failed');
    } finally {
      setLoading(false);
    }
  };

  const changedCount = Object.values(checked).filter(Boolean).length;

  const handleConfirm = () => {
    if (!result) return;
    const updates = buildDealUpdates(checked, result);
    onConfirm(updates);
  };

  // Build comparison rows
  const rows = result
    ? FIELD_DEAL_MAP.map(def => {
        const extracted = result.fields.find(f => f.key === def.key);
        if (!extracted) return null;
        const currentVal = def.getDealVal(deal);
        const newVal = fmtExtracted(def.key, extracted.value);
        const isChanged = normalizeVal(def.key, currentVal) !== normalizeVal(def.key, extracted.value);
        return { ...def, currentVal, newVal, isChanged, confidence: extracted.confidence };
      }).filter(Boolean)
    : [];

  const changedRows = rows.filter(r => r!.isChanged);
  const sameRows = rows.filter(r => !r!.isChanged);

  return (
    <div className="fixed inset-0 z-50 flex bg-black/50 backdrop-blur-sm">
      <div
        className="m-auto bg-base-100 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: '92vw', maxWidth: '1200px', height: '88vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-base-300 flex-none">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-primary" />
              <span className="font-semibold text-base-content">
                {doc.category === 'amendment' ? 'Amendment' : 'Contract'} — Review Data Changes
              </span>
            </div>
            <p className="text-xs text-base-content/40 mt-0.5 ml-6">{doc.file_name}</p>
          </div>
          <button onClick={onDismiss} className="btn btn-ghost btn-sm btn-circle"><X size={16} /></button>
        </div>

        {/* Body: PDF left, comparison right */}
        <div className="flex flex-1 min-h-0">

          {/* Left — PDF preview */}
          <div className="w-5/12 border-r border-base-300 flex flex-col flex-none">
            <div className="px-3 py-2 border-b border-base-300 bg-base-50 flex-none">
              <p className="text-xs font-semibold text-base-content/50 uppercase tracking-wide">Document</p>
            </div>
            <div className="flex-1 min-h-0">
              <PdfPreview filePath={doc.storage_path} />
            </div>
          </div>

          {/* Right — comparison table */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-4 py-2.5 border-b border-base-300 bg-base-50 flex-none">
              <p className="text-xs font-semibold text-base-content/50 uppercase tracking-wide">Field Comparison</p>
              {result && !loading && (
                <p className="text-xs text-base-content/40 mt-0.5">
                  {changedRows.length === 0
                    ? 'No changes detected — deal data is up to date'
                    : `${changedRows.length} field${changedRows.length !== 1 ? 's' : ''} changed · check the ones you want to apply`}
                </p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading && (
                <LoadingSpinner label="Extracting contract data…" />
              )}

              {error && !loading && (
                <div className="m-4 rounded-xl bg-error/10 border border-error/20 p-4 space-y-3">
                  <p className="text-sm font-medium text-error">Extraction failed</p>
                  <p className="text-xs text-base-content/60">{error}</p>
                  <button onClick={runExtraction} className="btn btn-sm btn-outline gap-1">
                    <RefreshCw size={13} /> Retry
                  </button>
                </div>
              )}

              {result && !loading && rows.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-base-content/40 p-6">
                  <AlertTriangle size={24} className="opacity-40" />
                  <p className="text-sm">No fields could be extracted from this document.</p>
                  <p className="text-xs">It may not be a standard purchase contract. The file was saved.</p>
                </div>
              )}

              {result && !loading && rows.length > 0 && (
                <>
                  {/* Column headers */}
                  <div className="sticky top-0 bg-base-200 border-b border-base-300 grid grid-cols-[2rem_1fr_1fr_1fr] text-xs font-semibold text-base-content/50 uppercase tracking-wide px-4 py-2 z-10">
                    <div />
                    <div>Field</div>
                    <div>Current Value</div>
                    <div className="flex items-center gap-1 text-primary">
                      <ArrowRight size={11} /> New Value
                    </div>
                  </div>

                  {/* Changed rows first */}
                  {changedRows.map(row => row && (
                    <div
                      key={row.key}
                      className="grid grid-cols-[2rem_1fr_1fr_1fr] items-center px-4 py-2.5 border-b border-base-300 bg-amber-50 hover:bg-amber-100/70 transition-colors"
                    >
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm checkbox-primary"
                        checked={!!checked[row.key]}
                        onChange={e => setChecked(p => ({ ...p, [row.key]: e.target.checked }))}
                      />
                      <div>
                        <p className="text-sm font-medium text-base-content">{row.label}</p>
                        {row.confidence && row.confidence !== 'high' && (
                          <span className={`text-xs px-1 rounded-full ${row.confidence === 'medium' ? 'text-warning' : 'text-error'}`}>
                            {row.confidence} confidence
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-base-content/50 line-through">{row.currentVal || '—'}</div>
                      <div className="text-sm font-semibold text-amber-800">{row.newVal || '—'}</div>
                    </div>
                  ))}

                  {/* Unchanged rows — collapsed toggle */}
                  {sameRows.length > 0 && (
                    <UnchangedRows rows={sameRows as typeof rows} />
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-base-300 flex-none bg-base-50">
          <button onClick={onDismiss} className="btn btn-ghost btn-sm">
            Keep Current Values
          </button>
          <button
            onClick={handleConfirm}
            className="btn btn-primary btn-sm gap-1.5"
            disabled={loading || changedCount === 0}
          >
            <CheckCircle2 size={14} />
            {changedCount === 0 ? 'No Changes Selected' : `Confirm Changes (${changedCount})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// Collapsible unchanged rows section
function UnchangedRows({ rows }: { rows: Array<{ key: string; label: string; currentVal: string; newVal: string } | null> }) {
  const [open, setOpen] = useState(false);
  const valid = rows.filter(Boolean) as Array<{ key: string; label: string; currentVal: string; newVal: string }>;
  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-2 text-xs text-base-content/40 hover:bg-base-200 transition-colors border-b border-base-300"
      >
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {valid.length} unchanged field{valid.length !== 1 ? 's' : ''} {open ? '(hide)' : '(show)'}
      </button>
      {open && valid.map(row => (
        <div
          key={row.key}
          className="grid grid-cols-[2rem_1fr_1fr_1fr] items-center px-4 py-2 border-b border-base-300 opacity-40"
        >
          <div />
          <div className="text-sm text-base-content/60">{row.label}</div>
          <div className="text-sm text-base-content/40">{row.currentVal || '—'}</div>
          <div className="text-sm text-base-content/40 flex items-center gap-1">
            <CheckCircle2 size={11} className="text-success" /> Same
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Manual Extraction Modal (for Extract button on non-contract docs) ────────
interface ExtractionModalProps {
  doc: DealDocument;
  deal: Deal;
  onConfirm: (updates: Partial<Deal>) => void;
  onClose: () => void;
}

function ExtractionModal({ doc, deal, onConfirm, onClose }: ExtractionModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [editedFields, setEditedFields] = useState<Record<string, string>>({});

  useEffect(() => { runExtraction(); }, []);

  const runExtraction = async () => {
    setLoading(true);
    setError('');
    try {
      const { data: signedUrl, error: urlErr } = await supabase.storage
        .from('deal-documents')
        .createSignedUrl(doc.storage_path, 300);
      if (urlErr) throw new Error('Could not generate file URL: ' + urlErr.message);

      const res = await fetch('/api/extract-contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_url: signedUrl.signedUrl,
          file_name: doc.file_name,
          deal_id: deal.id,
          deal_address: deal.propertyAddress,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Extraction failed (${res.status}): ${text}`);
      }

      const data: ExtractionResult = await res.json();
      setResult(data);
      const init: Record<string, string> = {};
      data.fields.forEach(f => { init[f.key] = f.value; });
      setEditedFields(init);
    } catch (e: any) {
      setError(e.message || 'Unknown error during extraction');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!result) return;
    const updates = buildDealUpdates(
      Object.fromEntries(Object.keys(editedFields).map(k => [k, true])),
      { ...result, fields: result.fields.map(f => ({ ...f, value: editedFields[f.key] ?? f.value })) }
    );
    onConfirm(updates);
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-black/50 backdrop-blur-sm">
      <div className="m-auto bg-base-100 rounded-2xl shadow-2xl flex flex-col"
        style={{ width: '90vw', maxWidth: '1200px', height: '85vh' }}>

        <div className="flex items-center justify-between p-4 border-b border-base-300 flex-none">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-primary" />
            <span className="font-semibold text-base-content">Extract Contract Data</span>
            <span className="text-xs text-base-content/40 ml-1">— {doc.file_name}</span>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle"><X size={16} /></button>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="w-1/2 border-r border-base-300 flex flex-col">
            <div className="p-3 border-b border-base-300 flex-none">
              <p className="text-xs font-semibold text-base-content/50 uppercase">Document Preview</p>
            </div>
            <div className="flex-1 overflow-hidden">
              <PdfPreview filePath={doc.storage_path} />
            </div>
          </div>

          <div className="w-1/2 flex flex-col">
            <div className="p-3 border-b border-base-300 flex-none">
              <p className="text-xs font-semibold text-base-content/50 uppercase">Extracted Fields</p>
              {result && <p className="text-xs text-base-content/40 mt-0.5">Review and edit before applying</p>}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loading && (
                <LoadingSpinner label="Extracting with AI…" />
              )}
              {error && !loading && (
                <div className="rounded-xl bg-error/10 border border-error/20 p-4 space-y-3">
                  <p className="text-sm font-medium text-error">Extraction failed</p>
                  <p className="text-xs text-base-content/60">{error}</p>
                  <button onClick={runExtraction} className="btn btn-sm btn-outline gap-1">
                    <RefreshCw size={13} /> Retry
                  </button>
                </div>
              )}
              {result && !loading && (
                <div className="space-y-3">
                  {FIELD_DEAL_MAP.map(({ key, label }) => {
                    const extracted = result.fields.find(f => f.key === key);
                    if (!extracted && !editedFields[key]) return null;
                    const val = editedFields[key] ?? extracted?.value ?? '';
                    const conf = extracted?.confidence;
                    return (
                      <div key={key} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-base-content/60">{label}</label>
                          {conf && (
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                              conf === 'high' ? 'bg-success/15 text-success' :
                              conf === 'medium' ? 'bg-warning/15 text-warning' :
                              'bg-error/10 text-error'
                            }`}>{conf}</span>
                          )}
                        </div>
                        <input
                          className={`input input-sm input-bordered w-full text-sm ${conf === 'low' ? 'border-warning/50' : ''}`}
                          value={val}
                          onChange={e => setEditedFields(p => ({ ...p, [key]: e.target.value }))}
                          placeholder={`Enter ${label.toLowerCase()}…`}
                        />
                      </div>
                    );
                  })}
                  {result.fields.length === 0 && (
                    <div className="text-center py-8 text-base-content/40 text-sm">
                      <AlertTriangle size={22} className="mx-auto mb-2 opacity-40" />
                      <p>No fields could be extracted.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {result && !loading && !error && (
          <div className="flex items-center justify-between p-4 border-t border-base-300 flex-none">
            <button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>
            <div className="flex items-center gap-3">
              <p className="text-xs text-base-content/40">{result.fields.length} field{result.fields.length !== 1 ? 's' : ''} extracted</p>
              <button onClick={handleConfirm} className="btn btn-primary btn-sm gap-1.5">
                <CheckCircle2 size={14} /> Apply to Deal
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Checklist Link Picker ────────────────────────────────────────────────────
interface ChecklistLinkPickerProps {
  doc: DealDocument;
  checklistItems: ChecklistItem[];
  docLinks: DocLink[];
  onLink: (checklistItemId: string) => void;
  onUnlink: (linkId: string) => void;
  onClose: () => void;
}

function ChecklistLinkPicker({ doc, checklistItems, docLinks, onLink, onUnlink, onClose }: ChecklistLinkPickerProps) {
  const linkedItemIds = docLinks
    .filter(l => l.document_id === doc.id)
    .map(l => l.checklist_item_id);

  const incompleteItems = checklistItems.filter(i => !i.completed);
  const completedItems = checklistItems.filter(i => i.completed);

  const renderItem = (item: ChecklistItem) => {
    const isLinked = linkedItemIds.includes(item.id);
    const link = docLinks.find(l => l.document_id === doc.id && l.checklist_item_id === item.id);
    return (
      <button
        key={item.id}
        onClick={() => isLinked && link ? onUnlink(link.id) : onLink(item.id)}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm rounded-lg transition-colors ${
          isLinked ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'hover:bg-base-200 text-base-content'
        }`}
      >
        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-none ${isLinked ? 'bg-primary border-primary' : 'border-base-300'}`}>
          {isLinked && <CheckCircle2 size={10} className="text-white" />}
        </div>
        <span className={`flex-1 truncate ${item.completed ? 'line-through opacity-50' : ''}`}>{item.title}</span>
        {isLinked && <Paperclip size={11} className="text-primary flex-none" />}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="m-auto bg-base-100 rounded-2xl shadow-2xl overflow-hidden"
        style={{ width: 380, maxHeight: '70vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-base-300">
          <div>
            <p className="font-semibold text-sm text-base-content">Link to Checklist Item</p>
            <p className="text-xs text-base-content/40 truncate max-w-xs">{doc.file_name}</p>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-xs btn-circle"><X size={14} /></button>
        </div>
        <div className="overflow-y-auto p-2" style={{ maxHeight: 'calc(70vh - 60px)' }}>
          {checklistItems.length === 0 ? (
            <p className="text-sm text-base-content/40 text-center py-6">No checklist items for this deal.</p>
          ) : (
            <>
              {incompleteItems.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs font-semibold text-base-content/40 uppercase tracking-wide px-2 py-1">Open Items</p>
                  {incompleteItems.map(renderItem)}
                </div>
              )}
              {completedItems.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-base-content/40 uppercase tracking-wide px-2 py-1">Completed Items</p>
                  {completedItems.map(renderItem)}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Document Row ─────────────────────────────────────────────────────────────
interface DocRowProps {
  doc: DealDocument;
  isOriginal: boolean;
  linkedItemTitles: string[];
  onPreview: (doc: DealDocument) => void;
  onExtract: (doc: DealDocument) => void;
  onDelete: (doc: DealDocument) => void;
  onDownload: (doc: DealDocument) => void;
  onLinkChecklist: (doc: DealDocument) => void;
}

function DocRow({ doc, isOriginal, linkedItemTitles, onPreview, onExtract, onDelete, onDownload, onLinkChecklist }: DocRowProps) {
  const isContract = doc.category === 'purchase_contract';
  const isEmail = doc.source === 'email';
  const isPdf = doc.document_type?.includes('pdf') || doc.file_name?.toLowerCase().endsWith('.pdf');

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-base-300 bg-base-100 hover:bg-base-200/50 transition-colors group">
      {/* Icon */}
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-none ${isContract ? 'bg-primary/10' : 'bg-base-300/50'}`}>
        {isPdf ? (
          <FileText size={18} className={isContract ? 'text-primary' : 'text-base-content/50'} />
        ) : (
          <File size={18} className="text-base-content/40" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-base-content truncate max-w-xs">{doc.file_name}</p>
          {isOriginal && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium flex items-center gap-1">
              ⭐ Source of Truth
            </span>
          )}
          {!isOriginal && doc.category && doc.category !== 'purchase_contract' && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-base-300 text-base-content/60">
              {DOC_TYPE_LABELS[doc.category] ?? doc.category}
            </span>
          )}
          {!isOriginal && doc.category === 'purchase_contract' && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-base-200 text-base-content/50">
              Purchase Contract
            </span>
          )}
          {isEmail && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-info/10 text-info flex items-center gap-1">
              <Mail size={10} /> From Email
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <span className="text-xs text-base-content/40">{formatDateTime(doc.created_at)}</span>
          {doc.file_size_bytes && <span className="text-xs text-base-content/30">{formatFileSize(doc.file_size_bytes)}</span>}
          {doc.uploaded_by && <span className="text-xs text-base-content/30">by {doc.uploaded_by}</span>}
          {isEmail && doc.thread_subject && (
            <span className="text-xs text-base-content/40 truncate max-w-xs">✉ {doc.thread_subject}</span>
          )}
          {doc.extracted_at && (
            <span className="text-xs text-success flex items-center gap-1">
              <CheckCircle2 size={11} /> Extracted
            </span>
          )}
          {linkedItemTitles.length > 0 && (
            <span className="text-xs text-primary flex items-center gap-1">
              <Paperclip size={11} />
              {linkedItemTitles.length === 1 ? linkedItemTitles[0] : `${linkedItemTitles.length} checklist items`}
            </span>
          )}
        </div>
      </div>

      {/* Actions — visible on hover */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-none">
        {/* Preview — always available for PDFs */}
        {isPdf && (
          <button onClick={() => onPreview(doc)} className="btn btn-ghost btn-xs btn-circle" title="Preview document">
            <Eye size={13} />
          </button>
        )}
        {/* Download */}
        <button onClick={() => onDownload(doc)} className="btn btn-ghost btn-xs btn-circle" title="Download">
          <Download size={13} />
        </button>
        {/* Extract — for contracts (primary) or any PDF (secondary) */}
        {isPdf && (
          <button
            onClick={() => onExtract(doc)}
            className={`btn btn-xs gap-1 ${isContract ? 'btn-primary' : 'btn-ghost'}`}
            title="Extract data with AI"
          >
            <Sparkles size={11} /> Extract
          </button>
        )}
        {/* Link to checklist */}
        <button
          onClick={() => onLinkChecklist(doc)}
          className="btn btn-ghost btn-xs btn-circle"
          title="Link to checklist item"
        >
          <Paperclip size={13} />
        </button>
        {/* Delete — blocked for original contract */}
        {isOriginal ? (
          <button disabled className="btn btn-ghost btn-xs btn-circle opacity-30 cursor-not-allowed" title="Original contract cannot be deleted">
            <Lock size={13} />
          </button>
        ) : (
          <button onClick={() => onDelete(doc)} className="btn btn-ghost btn-xs btn-circle text-error/60 hover:text-error" title="Delete">
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function WorkspaceDocuments({ deal, onUpdate }: Props) {
  const { profile } = useAuth();
  const userName = profile?.name || 'TC Staff';

  const [docs, setDocs] = useState<DealDocument[]>([]);
  const [docLinks, setDocLinks] = useState<DocLink[]>([]);
  const [linkedEmails, setLinkedEmails] = useState<LinkedEmailDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [docTypeForUpload, setDocTypeForUpload] = useState<DealDocument['category']>('purchase_contract');
  // Option C: Source-of-Truth replacement lock
  const [sotPending, setSotPending] = useState<{ file: File; docType: DealDocument['category'] } | null>(null);
  const [showDocRequests, setShowDocRequests] = useState(true);

  // Modal states
  const [previewDoc, setPreviewDoc] = useState<DealDocument | null>(null);
  const [comparisonDoc, setComparisonDoc] = useState<DealDocument | null>(null);
  const [manualExtractDoc, setManualExtractDoc] = useState<DealDocument | null>(null);
  const [linkingDoc, setLinkingDoc] = useState<DealDocument | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDocuments();
    loadDocLinks();
    loadLinkedEmails();
  }, [deal.id]);

  const loadDocuments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('deal_documents')
      .select('*')
      .eq('deal_id', deal.id)
      .order('created_at', { ascending: false });
    if (!error && data) setDocs(data as DealDocument[]);
    setLoading(false);
  };

  const loadDocLinks = async () => {
    const { data, error } = await supabase
      .from('checklist_document_links')
      .select('*')
      .eq('deal_id', deal.id);
    if (!error && data) setDocLinks(data as DocLink[]);
  };

  const loadLinkedEmails = async () => {
    const { data, error } = await supabase
      .from('email_thread_links')
      .select('gmail_thread_id, score, link_method, thread_subject, thread_from, thread_date')
      .eq('deal_id', deal.id)
      .order('created_at', { ascending: false });
    if (!error && data) {
      setLinkedEmails(data.map((r: any) => ({
        thread_id: r.gmail_thread_id,
        subject: r.thread_subject ?? '(No subject)',
        from_address: r.thread_from ?? '',
        thread_date: r.thread_date ?? '',
        score: r.score ?? 0,
        link_method: r.link_method ?? '',
      })));
    }
  };

  // ─── Upload ─────────────────────────────────────────────────────────────────
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    // Option C: if replacing an existing Source of Truth contract, require confirmation
    const existingSot = docs.find(d => d.category === 'purchase_contract' && d.is_source_of_truth);
    if (docTypeForUpload === 'purchase_contract' && existingSot) {
      setSotPending({ file, docType: docTypeForUpload });
      return;
    }
    await uploadFile(file, docTypeForUpload);
  };

  const uploadFile = async (file: File, docType: DealDocument['category']) => {
    setUploading(true);
    setUploadProgress('Compressing & uploading…');
    try {
      // Send to our API route which flattens PDF then stores to Supabase
      const formData = new FormData();
      formData.append('file', file);
      formData.append('deal_id', deal.id);

      const uploadRes = await fetch('/api/upload-document', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        // Fallback: direct upload if API route unavailable
        await directUpload(file, docType);
        return;
      }

      const { path, file_name, file_size } = await uploadRes.json();
      setUploadProgress('Saving record…');

      // If uploading a new purchase contract, demote previous source-of-truth
      if (docType === 'purchase_contract') {
        await supabase
          .from('deal_documents')
          .update({ is_source_of_truth: false })
          .eq('deal_id', deal.id)
          .eq('category', 'purchase_contract');
      }

      const rec = {
        deal_id: deal.id,
        file_name: file_name || file.name,
        storage_path: path,
        file_size_bytes: file_size,
        category: docType,
        source: 'upload' as const,
        created_at: new Date().toISOString(),
        uploaded_by: userName,
        is_protected: docType === 'purchase_contract' && docs.filter(d => d.category === 'purchase_contract').length === 0,
        is_source_of_truth: docType === 'purchase_contract',
      };

      const { data: inserted, error: dbErr } = await supabase
        .from('deal_documents')
        .insert(rec)
        .select()
        .single();

      if (dbErr) throw dbErr;

      const newDoc = inserted as DealDocument;
      setDocs(prev => [newDoc, ...prev]);

      // Auto-trigger comparison for contracts and amendments
      if (docType === 'purchase_contract' || docType === 'amendment') {
        setTimeout(() => setComparisonDoc(newDoc), 400);
      }
    } catch (e: any) {
      alert('Upload failed: ' + (e.message ?? e));
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  };

  // Fallback direct upload if API route isn't available
  const directUpload = async (file: File, docType: DealDocument['category']) => {
    const ext = file.name.split('.').pop() ?? 'bin';
    const path = `${deal.id}/${generateId()}.${ext}`;

    // Demote previous source-of-truth if uploading a new purchase contract
    if (docType === 'purchase_contract') {
      await supabase
        .from('deal_documents')
        .update({ is_source_of_truth: false })
        .eq('deal_id', deal.id)
        .eq('category', 'purchase_contract');
    }

    const { error: upErr } = await supabase.storage
      .from('deal-documents')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) throw upErr;

    const rec = {
      deal_id: deal.id,
      file_name: file.name,
      storage_path: path,
      file_size_bytes: file.size,
      category: docType,
      source: 'upload' as const,
      created_at: new Date().toISOString(),
      uploaded_by: userName,
      is_protected: docType === 'purchase_contract' && docs.filter(d => d.category === 'purchase_contract').length === 0,
      is_source_of_truth: docType === 'purchase_contract',
    };

    const { data: inserted, error: dbErr } = await supabase
      .from('deal_documents')
      .insert(rec)
      .select()
      .single();
    if (dbErr) throw dbErr;

    const newDoc = inserted as DealDocument;
    setDocs(prev => [newDoc, ...prev]);

    if (docType === 'purchase_contract' || docType === 'amendment') {
      setTimeout(() => setComparisonDoc(newDoc), 400);
    }
  };

  const handleDownload = async (doc: DealDocument) => {
    const { data, error } = await supabase.storage.from('deal-documents').createSignedUrl(doc.storage_path, 300);
    if (error) { alert('Could not generate download link'); return; }
    window.open(data.signedUrl, '_blank');
  };

  const handleDelete = async (doc: DealDocument) => {
    if (!confirm(`Delete "${doc.file_name}"? This cannot be undone.`)) return;
    await supabase.storage.from('deal-documents').remove([doc.storage_path]);
    await supabase.from('deal_documents').delete().eq('id', doc.id);
    setDocs(prev => prev.filter(d => d.id !== doc.id));
  };

  // ─── Extraction handlers ─────────────────────────────────────────────────
  const handleComparisonConfirm = async (updates: Partial<Deal>) => {
    const updated: Deal = { ...deal, ...updates, updatedAt: new Date().toISOString() };
    onUpdate(updated);
    if (comparisonDoc) {
      await supabase.from('deal_documents').update({ extracted_at: new Date().toISOString() }).eq('id', comparisonDoc.id);
      setDocs(prev => prev.map(d => d.id === comparisonDoc.id ? { ...d, extracted_at: new Date().toISOString() } : d));
    }
    setComparisonDoc(null);
  };

  const handleExtractionConfirm = async (updates: Partial<Deal>) => {
    const updated: Deal = { ...deal, ...updates, updatedAt: new Date().toISOString() };
    onUpdate(updated);
    if (manualExtractDoc) {
      await supabase.from('deal_documents').update({ extracted_at: new Date().toISOString() }).eq('id', manualExtractDoc.id);
      setDocs(prev => prev.map(d => d.id === manualExtractDoc.id ? { ...d, extracted_at: new Date().toISOString() } : d));
    }
    setManualExtractDoc(null);
  };

  // ─── Checklist linking ───────────────────────────────────────────────────
  const handleLink = async (checklistItemId: string) => {
    if (!linkingDoc) return;
    const { data, error } = await supabase
      .from('checklist_document_links')
      .insert({
        checklist_item_id: checklistItemId,
        document_id: linkingDoc.id,
        deal_id: deal.id,
        linked_at: new Date().toISOString(),
        linked_by: userName,
      })
      .select()
      .single();
    if (!error && data) {
      setDocLinks(prev => [...prev, data as DocLink]);
    }
  };

  const handleUnlink = async (linkId: string) => {
    await supabase.from('checklist_document_links').delete().eq('id', linkId);
    setDocLinks(prev => prev.filter(l => l.id !== linkId));
  };

  // ─── Derived data ────────────────────────────────────────────────────────
  const contractDocs = docs.filter(d => d.category === 'purchase_contract');
  const amendmentDocs = docs.filter(d => d.category === 'amendment' || d.category === 'addendum');
  const otherDocs = docs.filter(d => d.category === 'other' || !d.category);

  // Source of truth = flagged doc; fallback to oldest purchase_contract
  const originalContractId = contractDocs.length > 0
    ? (contractDocs.find(d => d.is_source_of_truth)?.id
        ?? [...contractDocs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0].id)
    : null;

  // Build a map: doc_id → linked checklist item titles
  const checklistItems: ChecklistItem[] = (deal as any).checklist ?? [];
  const linkedTitlesByDocId: Record<string, string[]> = {};
  docLinks.forEach(link => {
    const item = checklistItems.find(i => i.id === link.checklist_item_id);
    if (!item) return;
    if (!linkedTitlesByDocId[link.document_id]) linkedTitlesByDocId[link.document_id] = [];
    linkedTitlesByDocId[link.document_id].push(item.title);
  });

  const pendingDocRequests = (deal.documentRequests ?? []).filter(r => r.status === 'pending');

  return (
    <div className="p-4 space-y-6 pb-10">

      {/* Option C: Source-of-Truth replacement confirmation modal */}
      {sotPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-base-100 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold text-base-content">Replace Source of Truth?</h3>
                <p className="text-sm text-base-content/60 mt-1">
                  This deal already has a protected contract on file. Replacing it is irreversible.
                </p>
              </div>
            </div>
            {/* Option A: show deal address so TC can confirm they're on the right deal */}
            <div className="rounded-xl bg-base-200 px-4 py-3 space-y-1">
              <p className="text-xs text-base-content/50 font-medium uppercase tracking-wide">This Deal</p>
              <p className="text-sm font-semibold text-base-content">
                {deal.propertyAddress}{deal.city ? `, ${deal.city}` : ''}{deal.state ? ` ${deal.state}` : ''}
              </p>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 space-y-1">
              <p className="text-xs text-amber-700 font-medium uppercase tracking-wide">New File</p>
              <p className="text-sm font-semibold text-amber-900 truncate">{sotPending.file.name}</p>
            </div>
            <p className="text-xs text-base-content/50">
              ⚠️ The current Source of Truth will be demoted. Make sure this is the correct contract for <strong>{deal.propertyAddress}</strong>.
            </p>
            <div className="flex gap-2 justify-end pt-1">
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setSotPending(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-sm btn-error"
                onClick={async () => {
                  const { file, docType } = sotPending;
                  setSotPending(null);
                  await uploadFile(file, docType);
                }}
              >
                Yes, Replace Source of Truth
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Upload hero CTA (no contract yet) ─────────────────────────── */}
      {contractDocs.length === 0 && (
        <div
          onClick={() => { setDocTypeForUpload('purchase_contract'); fileInputRef.current?.click(); }}
          className="rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 p-6 flex flex-col items-center gap-3 cursor-pointer hover:bg-primary/10 transition-colors"
        >
          {/* Option A: address banner so TC can confirm the right deal */}
          <div className="w-full rounded-lg bg-base-200 px-3 py-2 flex items-center gap-2 text-left mb-1">
            <MapPin size={13} className="text-base-content/40 shrink-0" />
            <span className="text-xs text-base-content/60 truncate">
              {deal.propertyAddress}{deal.city ? `, ${deal.city}` : ''}{deal.state ? ` ${deal.state}` : ''}
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center">
            <Upload size={22} className="text-primary" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-base-content">Upload Purchase Contract</p>
            <p className="text-xs text-base-content/50 mt-1">PDF · AI will extract fields and show changes for review</p>
          </div>
        </div>
      )}

      {/* ── Upload controls ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        {/* Option A: always show deal address near upload controls */}
        <div className="flex items-center gap-1.5 text-xs text-base-content/40">
          <MapPin size={11} className="shrink-0" />
          <span className="truncate max-w-[180px]">
            {deal.propertyAddress}{deal.city ? `, ${deal.city}` : ''}{deal.state ? ` ${deal.state}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="select select-xs select-bordered"
            value={docTypeForUpload}
            onChange={e => setDocTypeForUpload(e.target.value as DealDocument['category'])}
          >
            <option value="purchase_contract">Purchase Contract</option>
            <option value="amendment">Amendment</option>
            <option value="addendum">Addendum</option>
            <option value="other">Other</option>
          </select>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-sm btn-primary gap-1"
            disabled={uploading}
          >
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            {uploading ? uploadProgress : 'Upload File'}
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
        onChange={handleFileSelect}
      />

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          {/* ── Purchase Contracts (pinned at top, bordered card) ─────── */}
          {contractDocs.length > 0 && (
            <section className="rounded-2xl border-2 border-primary/20 bg-primary/[0.02] overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-primary/15 bg-primary/[0.04]">
                <FileText size={14} className="text-primary" />
                <h3 className="text-sm font-semibold text-primary uppercase tracking-wide">Purchase Contract</h3>
                <span className="badge badge-sm bg-primary/10 text-primary border-0">{contractDocs.length}</span>
                <div className="flex-1" />
                <span className="text-xs text-base-content/30">Newest first · Original contract protected</span>
              </div>
              <div className="p-3 space-y-2">
                {contractDocs.map(doc => (
                  <DocRow
                    key={doc.id}
                    doc={doc}
                    isOriginal={doc.id === originalContractId}
                    linkedItemTitles={linkedTitlesByDocId[doc.id] ?? []}
                    onPreview={setPreviewDoc}
                    onExtract={setManualExtractDoc}
                    onDelete={handleDelete}
                    onDownload={handleDownload}
                    onLinkChecklist={setLinkingDoc}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── Amendments & Addenda ──────────────────────────────────── */}
          {amendmentDocs.length > 0 && (
            <section className="rounded-2xl border border-base-300 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-base-300 bg-base-200/50">
                <FileText size={14} className="text-base-content/60" />
                <h3 className="text-sm font-semibold text-base-content/70 uppercase tracking-wide">Amendments &amp; Addenda</h3>
                <span className="badge badge-sm badge-ghost">{amendmentDocs.length}</span>
              </div>
              <div className="p-3 space-y-2">
                {amendmentDocs.map(doc => (
                  <DocRow
                    key={doc.id}
                    doc={doc}
                    isOriginal={false}
                    linkedItemTitles={linkedTitlesByDocId[doc.id] ?? []}
                    onPreview={setPreviewDoc}
                    onExtract={setManualExtractDoc}
                    onDelete={handleDelete}
                    onDownload={handleDownload}
                    onLinkChecklist={setLinkingDoc}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── Other Documents ───────────────────────────────────────── */}
          {otherDocs.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-base-content/70 uppercase tracking-wide flex items-center gap-1.5 mb-3">
                <File size={14} /> Other Documents
              </h3>
              <div className="space-y-2">
                {otherDocs.map(doc => (
                  <DocRow
                    key={doc.id}
                    doc={doc}
                    isOriginal={false}
                    linkedItemTitles={linkedTitlesByDocId[doc.id] ?? []}
                    onPreview={setPreviewDoc}
                    onExtract={setManualExtractDoc}
                    onDelete={handleDelete}
                    onDownload={handleDownload}
                    onLinkChecklist={setLinkingDoc}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {docs.length === 0 && (
            <div className="rounded-xl border border-dashed border-base-300 p-8 text-center text-base-content/40 text-sm">
              No documents yet — upload the purchase contract above.
            </div>
          )}
        </>
      )}

      {/* ── Linked Email Threads ─────────────────────────────────────────── */}
      {linkedEmails.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-base-content/70 uppercase tracking-wide flex items-center gap-1.5 mb-3">
            <Mail size={14} /> Linked Email Threads
            <span className="badge badge-sm badge-neutral">{linkedEmails.length}</span>
          </h3>
          <div className="space-y-2">
            {linkedEmails.map(em => (
              <div key={em.thread_id} className="flex items-center gap-3 p-3 rounded-xl border border-base-300 bg-base-100">
                <div className="w-8 h-8 rounded-lg bg-info/10 flex items-center justify-center flex-none">
                  <Mail size={15} className="text-info" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-base-content truncate">{em.subject}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-base-content/40 truncate">{em.from_address}</span>
                    {em.thread_date && <span className="text-xs text-base-content/30">{em.thread_date.slice(0, 10)}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Document Requests (legacy) ─────────────────────────────────── */}
      <section>
        <button
          onClick={() => setShowDocRequests(p => !p)}
          className="flex items-center gap-1.5 text-sm font-semibold text-base-content/70 uppercase tracking-wide mb-3 hover:text-base-content transition-colors"
        >
          {showDocRequests ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          Document Requests
          {pendingDocRequests.length > 0 && (
            <span className="badge badge-sm badge-warning">{pendingDocRequests.length} pending</span>
          )}
        </button>
        {showDocRequests && <LegacyDocRequests deal={deal} onUpdate={onUpdate} />}
      </section>

      {/* ── Modals ───────────────────────────────────────────────────────── */}

      {/* Standalone PDF preview */}
      {previewDoc && (
        <PdfPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      )}

      {/* Change comparison (auto-triggered on contract/amendment upload) */}
      {comparisonDoc && (
        <ChangeComparisonModal
          doc={comparisonDoc}
          deal={deal}
          onConfirm={handleComparisonConfirm}
          onDismiss={() => setComparisonDoc(null)}
        />
      )}

      {/* Manual extraction modal */}
      {manualExtractDoc && (
        <ExtractionModal
          doc={manualExtractDoc}
          deal={deal}
          onConfirm={handleExtractionConfirm}
          onClose={() => setManualExtractDoc(null)}
        />
      )}

      {/* Checklist link picker */}
      {linkingDoc && (
        <ChecklistLinkPicker
          doc={linkingDoc}
          checklistItems={checklistItems}
          docLinks={docLinks}
          onLink={handleLink}
          onUnlink={handleUnlink}
          onClose={() => setLinkingDoc(null)}
        />
      )}
    </div>
  );
}

// ─── Legacy Document Requests (preserved) ────────────────────────────────────
interface ConfirmModalProps {
  title: string; message: string; onConfirm: () => void; onCancel: () => void;
}
function ConfirmModal({ title, message, onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex bg-black/40">
      <div className="m-auto bg-base-100 rounded-xl p-6 shadow-xl max-w-sm w-full space-y-4">
        <h3 className="font-semibold text-base-content">{title}</h3>
        <p className="text-sm text-base-content/70">{message}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="btn btn-ghost btn-sm">Cancel</button>
          <button onClick={onConfirm} className="btn btn-error btn-sm">Confirm</button>
        </div>
      </div>
    </div>
  );
}

interface RequestModalProps {
  existing?: DocumentRequest;
  onSave: (r: DocumentRequest) => void;
  onClose: () => void;
}
function RequestModal({ existing, onSave, onClose }: RequestModalProps) {
  const { profile } = useAuth();
  const userName = profile?.name || 'TC Staff';
  const [form, setForm] = useState<Partial<DocumentRequest>>(existing ?? {
    type: 'contract' as DocRequestType, label: '', description: '', urgency: 'medium', status: 'pending' as DocRequestStatus,
  });
  const cfg = docTypeConfig;
  const types = Object.keys(cfg) as DocRequestType[];
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));
  const handleSave = () => {
    onSave({ ...form, id: existing?.id ?? generateId(), requestedAt: existing?.requestedAt ?? new Date().toISOString(), requestedBy: existing?.requestedBy ?? userName, status: form.status ?? 'pending' } as DocumentRequest);
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex bg-black/40">
      <div className="m-auto bg-base-100 rounded-2xl p-6 shadow-2xl max-w-md w-full space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-base-content">{existing ? 'Edit Request' : 'New Document Request'}</h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle"><X size={15} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-base-content/50 mb-1 block">Document Type</label>
            <select className="select select-bordered w-full" value={form.type} onChange={f('type')}>
              {types.map(t => <option key={t} value={t}>{cfg[t].label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-base-content/50 mb-1 block">Label (optional)</label>
            <input className="input input-bordered w-full" value={form.label ?? ''} onChange={f('label')} placeholder="Custom label…" />
          </div>
          <div>
            <label className="text-xs text-base-content/50 mb-1 block">Notes</label>
            <textarea className="textarea textarea-bordered w-full text-sm" rows={3} value={form.description ?? ''} onChange={f('description')} />
          </div>
          <div>
            <label className="text-xs text-base-content/50 mb-1 block">Urgency</label>
            <select className="select select-bordered w-full" value={form.urgency ?? 'normal'} onChange={f('urgency')}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>
          <button onClick={handleSave} className="btn btn-primary btn-sm">Save</button>
        </div>
      </div>
    </div>
  );
}

function LegacyDocRequests({ deal, onUpdate }: { deal: Deal; onUpdate: (d: Deal) => void }) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [editingRequest, setEditingRequest] = useState<DocumentRequest | undefined>();

  const requests = deal.documentRequests ?? [];

  const updateRequests = (newReqs: DocumentRequest[]) => {
    onUpdate({ ...deal, documentRequests: newReqs, updatedAt: new Date().toISOString() });
  };

  const handleStatusChange = (id: string, status: DocRequestStatus) => {
    updateRequests(requests.map(r => r.id === id ? { ...r, status } : r));
  };

  const handleDelete = (id: string) => {
    updateRequests(requests.filter(r => r.id !== id));
    setConfirmDelete(null);
  };

  const handleSaveRequest = (r: DocumentRequest) => {
    const existing = requests.find(x => x.id === r.id);
    if (existing) updateRequests(requests.map(x => x.id === r.id ? r : x));
    else updateRequests([...requests, r]);
  };

  const StatusIcon = ({ s }: { s: DocRequestStatus }) => {
    if (s === 'pending') return <Clock size={14} className="text-warning" />;
    if (s === 'in_progress') return <CheckCircle2 size={14} className="text-success" />;
    if (s === 'confirmed') return <CheckCircle2 size={14} className="text-info" />;
    return <AlertTriangle size={14} className="text-error" />;
  };

  return (
    <>
      {requests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-base-300 p-4 text-center text-sm text-base-content/40 space-y-2">
          <p>No document requests</p>
          <button onClick={() => { setEditingRequest(undefined); setShowRequestModal(true); }} className="btn btn-sm btn-ghost gap-1">
            <Plus size={13} /> Add Request
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map(r => {
            const cfg = docTypeConfig[r.type];
            return (
              <div key={r.id} className="flex items-start gap-3 p-3 rounded-xl border border-base-300 bg-base-100 group">
                <div className="mt-0.5"><StatusIcon s={r.status} /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-base-content">{r.label || cfg?.label || r.type}</p>
                    {r.urgency === 'high' && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-error/10 text-error font-medium">Urgent</span>
                    )}
                    <StatusBadge status={r.status} />
                  </div>
                  {r.description && <p className="text-xs text-base-content/50 mt-0.5">{r.description}</p>}
                  <p className="text-xs text-base-content/30 mt-0.5">Requested {formatDateTime(r.requestedAt)} by {r.requestedBy}</p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <select
                    className="select select-xs select-bordered"
                    value={r.status}
                    onChange={e => handleStatusChange(r.id, e.target.value as DocRequestStatus)}
                  >
                    <option value="pending">Pending</option>
                    <option value="received">Received</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <button onClick={() => { setEditingRequest(r); setShowRequestModal(true); }} className="btn btn-ghost btn-xs btn-circle"><Info size={13} /></button>
                  <button onClick={() => setConfirmDelete(r.id)} className="btn btn-ghost btn-xs btn-circle text-error/60 hover:text-error"><X size={13} /></button>
                </div>
              </div>
            );
          })}
          <button onClick={() => { setEditingRequest(undefined); setShowRequestModal(true); }} className="btn btn-ghost btn-sm gap-1 w-full mt-1">
            <Plus size={13} /> Add Document Request
          </button>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Request"
          message="Remove this document request? This cannot be undone."
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
      {showRequestModal && (
        <RequestModal
          existing={editingRequest}
          onSave={handleSaveRequest}
          onClose={() => setShowRequestModal(false)}
        />
      )}
    </>
  );
}
