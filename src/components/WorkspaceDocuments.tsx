import { useAuth } from '../contexts/AuthContext';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload, FileText, Link2, AlertTriangle, CheckCircle2, Clock,
  Plus, X, Info, Download, Sparkles, ChevronDown, ChevronRight,
  Mail, Eye, Loader2, RefreshCw, Trash2, ExternalLink, File,
  Paperclip, Lock, ArrowRight, ChevronUp, MapPin, Table2,
  Pencil, Shield,
} from 'lucide-react';
import { Deal, DocumentRequest, DocRequestType, DocRequestStatus, ChecklistItem } from '../types';
import { docTypeConfig, generateId, formatDateTime } from '../utils/helpers';
import { supabase } from '../lib/supabase';
import { StatusBadge } from './ui/StatusBadge';
import {
  ExtractionResult,
  DOC_TYPE_LABELS,
  FIELD_DEAL_MAP,
  fmtExtracted,
  normalizeVal,
  buildDealUpdates,
} from '../utils/contractExtraction';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { Button } from './ui/Button';
import { useDealDocuments, useInvalidateDealDocuments } from '../hooks/useDealDocuments';
import { useDocumentLog, useInvalidateDocumentLog } from '../hooks/useDocumentLog';
import { useChecklistDocLinks, useInvalidateChecklistDocLinks } from '../hooks/useChecklistDocLinks';
import { useInvalidateDealTasks } from '../hooks/useDealTasks';
import { useLinkedEmails } from '../hooks/useLinkedEmails';

// ─── Timeline Fields ──────────────────────────────────────────────────────────
const TIMELINE_FIELDS = [
  { key: 'contractPrice',   label: 'Sale Price'     },
  { key: 'closingDate',     label: 'Closing Date'   },
  { key: 'earnestMoney',    label: 'Earnest Money'  },
  { key: 'loanAmount',      label: 'Loan Amount'    },
  { key: 'loanType',        label: 'Loan Type'      },
  { key: 'buyerNames',      label: 'Buyer Name(s)'  },
  { key: 'sellerNames',     label: 'Seller Name(s)' },
  { key: 'buyerAgentName',  label: 'Buyer Agent'    },
  { key: 'sellerAgentName', label: 'Seller Agent'   },
  { key: 'titleCompany',    label: 'Title Co.'      },
  { key: 'loanOfficer',     label: 'Lender'         },
] as const;

const TIMELINE_TYPE_BADGE: Record<string, string> = {
  purchase_contract: 'badge-primary',
  counter_offer:     'badge-warning',
  amendment:         'badge-info',
  addendum:          'badge-secondary',
  as_is:             'badge-ghost',
  other:             'badge-ghost',
};

const TIMELINE_TYPE_LABEL: Record<string, string> = {
  purchase_contract: 'Contract',
  counter_offer:     'Counter',
  amendment:         'Amendment',
  addendum:          'Addendum',
  as_is:             'As-Is',
  other:             'Other',
};

// ─── Suggested Document Names (by category) ──────────────────────────────────
const SUGGESTED_NAMES: Record<string, string[]> = {
  purchase_contract: ['Purchase Contract', 'FAR/BAR AS-IS Contract', 'CRSP Contract', 'Executed Contract', 'Signed Contract'],
  counter_offer: ['Counter Offer', 'Seller Counter Offer', 'Buyer Counter Offer', 'Counter Offer #1', 'Counter Offer #2'],
  amendment: ['Amendment #1', 'Price Amendment', 'Closing Date Amendment', 'Extension Amendment', 'Amendment #2'],
  addendum: ['Addendum', 'HOA Addendum', 'Lead Paint Addendum', 'Short Sale Addendum', 'Seller Disclosure Addendum'],
  as_is: ['AS-IS Rider', 'AS-IS Addendum', 'AS-IS Addendum to Contract'],
  inspection_notice: ['Inspection Notice', 'CINSP Notice', 'Inspection Report', 'BINSR'],
  unacceptable_conditions: ['Unacceptable Conditions Notice', 'Notice of Unacceptable Conditions'],
  other: ['Proof of Funds', 'Pre-Approval Letter', 'HOA Documents', 'Survey', 'Title Commitment', 'Closing Disclosure', 'Settlement Statement', 'Wire Instructions', 'Lender Instructions', 'Insurance Policy', 'Warranty Deed'],
};

// ─── Changes Timeline Modal ───────────────────────────────────────────────────
interface ChangesTimelineProps {
  docs: DealDocument[];
  deal: Deal;
  onClose: () => void;
}

function ChangesTimeline({ docs, deal, onClose }: ChangesTimelineProps) {
  // Sort: SoT pinned to bottom, others newest first
  const sorted = [...docs].sort((a, b) => {
    if (a.is_source_of_truth && !b.is_source_of_truth) return 1;
    if (!a.is_source_of_truth && b.is_source_of_truth) return -1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const sotDoc = sorted.find(d => d.is_source_of_truth);
  const sotData = sotDoc?.extraction_data as Record<string, string> | null | undefined;

  // Fallback: use deal field values as SoT baseline if extraction_data not saved yet
  const da = deal as any;
  const sotFallback: Record<string, string> = {
    contractPrice:   da.purchasePrice   ? String(Number(da.purchasePrice).toLocaleString())   : '',
    closingDate:     da.closingDate     || '',
    earnestMoney:    da.earnestMoney    ? String(Number(da.earnestMoney).toLocaleString())    : '',
    loanAmount:      da.loanAmount      ? String(Number(da.loanAmount).toLocaleString())      : '',
    loanType:        da.loanType        || '',
    buyerNames:      da.buyerName       || '',
    sellerNames:     da.sellerName      || '',
    buyerAgentName:  da.buyerAgentName  || '',
    sellerAgentName: da.sellerAgentName || '',
    titleCompany:    da.titleCompanyName || '',
    loanOfficer:     da.loanOfficerName  || '',
  };

  const getSotValue = (key: string): string =>
    (sotData?.[key] ?? sotFallback[key] ?? '');

  const getDocValue = (doc: DealDocument, key: string): string | null => {
    const data = doc.extraction_data as Record<string, string> | null | undefined;
    if (!data) return null;
    return data[key] ?? '';
  };

  const isCellChanged = (doc: DealDocument, key: string): boolean => {
    if (doc.is_source_of_truth) return false;
    const val = getDocValue(doc, key);
    if (val === null) return false;
    const sot = getSotValue(key);
    if (!val && !sot) return false;
    return (val || '').trim().toLowerCase() !== (sot || '').trim().toLowerCase();
  };

  // Show fields that have at least one change; if none, show all
  const changedFields = TIMELINE_FIELDS.filter(f =>
    sorted.some(doc => !doc.is_source_of_truth && isCellChanged(doc, f.key))
  );
  const fieldsToShow = changedFields.length > 0 ? changedFields : [...TIMELINE_FIELDS];

  return (
    <div className="fixed inset-0 z-50 flex bg-black/60 backdrop-blur-sm">
      <div
        className="m-auto bg-base-100 rounded-2xl shadow-2xl flex flex-col"
        style={{ width: '96vw', maxWidth: '1440px', height: '90vh', overflow: 'hidden' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-base-300 flex-none">
          <div className="flex items-center gap-2">
            <Table2 size={16} className="text-primary" />
            <span className="font-semibold text-base-content">Changes Timeline</span>
            <span className="text-xs text-base-content/40 ml-1">newest first · source of truth pinned at bottom</span>
          </div>
          <button className="btn btn-ghost btn-circle btn-sm" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Scrollable table */}
        <div className="flex-1 min-h-0 overflow-auto">
          <table
            className="text-sm border-collapse"
            style={{ minWidth: `${220 + fieldsToShow.length * 165}px`, width: '100%' }}
          >
            <thead className="sticky top-0 z-20 bg-base-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-base-content/50 uppercase tracking-wide border-b border-r border-base-300 sticky left-0 bg-base-200 w-56 min-w-[220px]">
                  Document
                </th>
                {fieldsToShow.map(f => {
                  const changes = sorted.filter(doc => !doc.is_source_of_truth && isCellChanged(doc, f.key)).length;
                  return (
                    <th key={f.key} className="text-left px-3 py-3 text-xs font-semibold text-base-content/50 uppercase tracking-wide border-b border-base-300 min-w-[155px] whitespace-nowrap">
                      {f.label}
                      {changes > 0 && (
                        <span className="ml-1.5 badge badge-xs badge-warning">{changes}×</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((doc, idx) => {
                const hasData = !!doc.extraction_data;
                const isSot = !!doc.is_source_of_truth;
                const rowBase = isSot
                  ? 'bg-primary/[0.04]'
                  : idx % 2 === 0
                    ? 'bg-base-100'
                    : 'bg-base-50/60';
                const fmtDate = new Date(doc.created_at).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: '2-digit',
                });
                return (
                  <tr key={doc.id} className={`${rowBase} border-b border-base-300/50`}>
                    {/* Doc label — sticky left */}
                    <td className={`px-4 py-3 sticky left-0 ${rowBase} border-r border-base-300/40 w-56 min-w-[220px]`}>
                      <div className="flex items-start gap-2">
                        {isSot && <Lock size={11} className="text-primary mt-0.5 flex-none" />}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {doc.doc_id && (
                              <span className="font-mono text-[10px] text-base-content/40">{doc.doc_id}</span>
                            )}
                            <span className={`badge badge-xs ${TIMELINE_TYPE_BADGE[doc.category ?? 'other'] ?? 'badge-ghost'}`}>
                              {TIMELINE_TYPE_LABEL[doc.category ?? 'other'] ?? doc.category}
                            </span>
                            {isSot && <span className="badge badge-xs badge-primary">SoT</span>}
                          </div>
                          <p
                            className="text-xs text-base-content/60 truncate mt-0.5 max-w-[180px]"
                            title={doc.display_name || doc.file_name}
                          >
                            {doc.display_name || doc.file_name}
                          </p>
                          <p className="text-[10px] text-base-content/30 mt-0.5">{fmtDate}</p>
                        </div>
                      </div>
                    </td>

                    {fieldsToShow.map(f => {
                      if (!hasData) {
                        return (
                          <td key={f.key} className="px-3 py-3 text-center">
                            <span className="text-[10px] text-base-content/20 italic">—</span>
                          </td>
                        );
                      }

                      const val = getDocValue(doc, f.key);
                      const changed = isCellChanged(doc, f.key);
                      const sotVal = getSotValue(f.key);

                      if (isSot) {
                        return (
                          <td key={f.key} className="px-3 py-3">
                            <span className="text-xs text-base-content/60 font-medium">
                              {val || sotVal || '—'}
                            </span>
                          </td>
                        );
                      }

                      if (changed) {
                        return (
                          <td key={f.key} className="px-3 py-3 bg-warning/10">
                            <span className="text-xs font-semibold text-amber-800">{val}</span>
                          </td>
                        );
                      }

                      // Not changed and not SoT
                      return (
                        <td key={f.key} className="px-3 py-3">
                          <span className="text-xs text-base-content/25 italic">same</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer legend */}
        <div className="flex items-center gap-6 px-5 py-2.5 border-t border-base-300 flex-none bg-base-50 text-xs text-base-content/40 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded bg-warning/30 border border-warning/40" />
            Changed from source of truth
          </span>
          <span className="flex items-center gap-1.5">
            <span className="italic text-base-content/25">same</span>
            &nbsp;— field matches source of truth
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-base-content/20">—</span>
            &nbsp;— document not yet extracted
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Document Type Config ─────────────────────────────────────────────────────
const DOC_TYPE_CONFIG: Record<string, { label: string; description: string; icon: string; color: string; autoTask?: string; taskPriority?: 'high' | 'medium' | 'low' }> = {
  purchase_contract: { label: 'Purchase Contract', description: 'Original offer from buyer to seller', icon: '📄', color: 'text-primary' },
  counter_offer:     { label: 'Counter Offer',     description: "Seller's response changing original terms", icon: '🔄', color: 'text-amber-600', autoTask: 'Review counter offer — contract numbers may have changed', taskPriority: 'high' },
  amendment:         { label: 'Amendment',          description: 'Changes existing terms in the contract', icon: '✏️', color: 'text-blue-600' },
  addendum:          { label: 'Addendum',           description: 'Adds new terms not in original contract', icon: '➕', color: 'text-purple-600' },
  as_is:             { label: 'As-Is Addendum',     description: 'Property sold in present condition, no repairs', icon: '🏚️', color: 'text-orange-600' },
  inspection_notice: { label: 'Inspection Notice',  description: "Buyer's response to inspection findings", icon: '🔍', color: 'text-teal-600', autoTask: 'Review inspection findings with client', taskPriority: 'medium' },
  unacceptable_conditions: { label: 'Unacceptable Conditions', description: 'Buyer rejects inspection — may terminate', icon: '⚠️', color: 'text-red-600', autoTask: 'URGENT: Buyer flagged unacceptable conditions — respond before deadline', taskPriority: 'high' },
  other:             { label: 'Other',              description: 'Any other document', icon: '📋', color: 'text-base-content/60' },
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface DealDocument {
  id: string;
  deal_id: string;
  file_name: string;
  storage_path: string;           // path in Supabase bucket e.g. deal_id/uuid.pdf
  file_size_bytes?: number;
  category?: 'purchase_contract' | 'counter_offer' | 'amendment' | 'addendum' | 'as_is' | 'inspection_notice' | 'unacceptable_conditions' | 'other';
  source: 'upload' | 'email';
  gmail_thread_id?: string;
  document_type?: string;         // legacy column kept from original schema
  thread_subject?: string;        // populated from email_thread_links join (not a DB col, runtime only)
  created_at: string;
  extracted_at?: string;
  uploaded_by?: string;
  is_protected?: boolean;
  is_source_of_truth?: boolean;
  doc_id?: string;
  display_name?: string;
  sort_order?: number;
  archived?: boolean;
  archived_at?: string;
  archived_by?: string;
  extraction_data?: Record<string, string> | null;
  address_verified?: boolean;
  address_extracted?: string;
  address_mismatch?: boolean;
  address_mismatch_acknowledged?: boolean;
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
            <Button variant="ghost" className="btn-circle" onClick={onClose}><X size={16} /></Button>
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

      // Save raw extracted fields to DB for timeline view
      const extractionMap: Record<string, string> = {};
      data.fields.forEach(f => { if (f.value != null && f.value !== '') extractionMap[f.key] = f.value; });
      if (Object.keys(extractionMap).length > 0) {
        supabase.from('deal_documents').update({ extraction_data: extractionMap }).eq('id', doc.id).then(() => {});
      }

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
                {doc.category === 'counter_offer' ? 'Counter Offer' : doc.category === 'amendment' ? 'Amendment' : doc.category === 'addendum' ? 'Addendum' : 'Contract'} — Review Proposed Changes
              </span>
            </div>
            <p className="text-xs text-base-content/40 mt-0.5 ml-6">{doc.file_name}</p>
          </div>
          <Button variant="ghost" className="btn-circle" onClick={onDismiss}><X size={16} /></Button>
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
          <Button variant="ghost" className="btn-circle" onClick={onClose}><X size={16} /></Button>
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
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
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
          <Button variant="ghost" size="xs" className="btn-circle" onClick={onClose}><X size={14} /></Button>
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
  onArchive: (doc: DealDocument) => void;
  onSummary: (doc: DealDocument) => void;
  onFinancialChanges: (doc: DealDocument) => void;
  onRename: (doc: DealDocument, newName: string) => void;
  onReviewChanges?: (doc: DealDocument) => void;
}

function DocRow({ doc, isOriginal, linkedItemTitles, onPreview, onExtract, onDelete, onDownload, onLinkChecklist, onArchive, onSummary, onFinancialChanges, onRename, onReviewChanges }: DocRowProps) {
  const isContract = doc.category === 'purchase_contract';
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(doc.display_name || doc.file_name);
  const renameInputRef = useRef<HTMLInputElement>(null);
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
          {isRenaming ? (
            <input
              ref={renameInputRef}
              autoFocus
              className="input input-xs input-bordered text-sm font-medium text-base-content max-w-xs"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onBlur={() => {
                setIsRenaming(false);
                onRename(doc, renameValue);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') { setIsRenaming(false); onRename(doc, renameValue); }
                if (e.key === 'Escape') { setIsRenaming(false); setRenameValue(doc.display_name || doc.file_name); }
              }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <p className="text-sm font-medium text-base-content truncate max-w-xs">{doc.display_name || doc.file_name}</p>
          )}
          {doc.doc_id && (
            <span className="text-xs px-1.5 py-0.5 rounded font-mono bg-base-300/60 text-base-content/40 border border-base-300">
              {doc.doc_id}
            </span>
          )}
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
          {doc.archived && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-base-300 text-base-content/40 italic">
              Archived
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
        {/* Rename */}
        <button
          onClick={() => { setIsRenaming(true); setTimeout(() => renameInputRef.current?.select(), 50); }}
          className="btn btn-ghost btn-xs btn-circle"
          title="Rename document"
        >
          <Pencil size={13} />
        </button>

        {/* Compliance Check — stub for future */}
        <button
          disabled
          className="btn btn-ghost btn-xs btn-circle opacity-40 cursor-not-allowed"
          title="Compliance check — coming soon"
        >
          <Shield size={13} />
        </button>

        {/* Preview — always available for PDFs */}
        {isPdf && (
          <button onClick={() => onPreview(doc)} className="btn btn-ghost btn-xs btn-circle" title="Preview document">
            <Eye size={13} />
          </button>
        )}

        {/* Review Changes — for counter offers */}
        {onReviewChanges && doc.category === 'counter_offer' && (
          <button
            onClick={() => onReviewChanges(doc)}
            className="btn btn-xs btn-outline btn-warning gap-1"
            title="Review proposed changes"
          >
            <Sparkles size={11} /> Review
          </button>
        )}

        {/* ⋯ Menu */}
        <div className="relative group/menu">
          <button className="btn btn-ghost btn-xs btn-circle" title="More options">
            <span className="text-base-content/50 font-bold text-lg leading-none">⋯</span>
          </button>
          <div className="absolute right-0 top-full mt-1 bg-base-100 border border-base-300 rounded-xl shadow-lg z-20 min-w-[160px] overflow-hidden hidden group-hover/menu:block">
            {isPdf && (
              <button
                onClick={() => onSummary(doc)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-base-200 flex items-center gap-2"
              >
                <Sparkles size={12} className="text-primary" /> Summary
              </button>
            )}
            {isPdf && (
              <button
                onClick={() => onFinancialChanges(doc)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-base-200 flex items-center gap-2"
              >
                <ArrowRight size={12} className="text-blue-500" /> Financial Changes
              </button>
            )}
            <button
              onClick={() => onLinkChecklist(doc)}
              className="w-full text-left px-3 py-2 text-xs hover:bg-base-200 flex items-center gap-2"
            >
              <Paperclip size={12} /> Link to Checklist
            </button>
            <button
              onClick={() => { setIsRenaming(true); setTimeout(() => renameInputRef.current?.select(), 50); }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-base-200 flex items-center gap-2"
            >
              <Pencil size={12} /> Rename
            </button>
            <button
              onClick={() => onDownload(doc)}
              className="w-full text-left px-3 py-2 text-xs hover:bg-base-200 flex items-center gap-2"
            >
              <Download size={12} /> Download
            </button>
            <div className="border-t border-base-300" />
            {isOriginal ? (
              <button disabled className="w-full text-left px-3 py-2 text-xs text-base-content/30 flex items-center gap-2 cursor-not-allowed">
                <Lock size={12} /> Protected
              </button>
            ) : (
              <button
                onClick={() => onArchive(doc)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-base-200 text-warning flex items-center gap-2"
              >
                <Trash2 size={12} /> Archive
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function WorkspaceDocuments({ deal, onUpdate }: Props) {
  const { profile } = useAuth();
  const userName = profile?.name || 'TC Staff';

  // ── TanStack Query hooks ──
  const { data: docs = [], isLoading: loading } = useDealDocuments(deal.id);
  const invalidateDocs = useInvalidateDealDocuments();

  const { data: rawDocLinks = [] } = useChecklistDocLinks(deal.id);
  const docLinks = rawDocLinks as DocLink[];
  const invalidateDocLinks = useInvalidateChecklistDocLinks();

  const { threads: linkedEmailThreads } = useLinkedEmails(deal.id);
  const linkedEmails: LinkedEmailDoc[] = linkedEmailThreads.map((t: any) => ({
    thread_id: t.gmail_thread_id,
    subject: t.thread_subject ?? '(No subject)',
    from_address: t.thread_from ?? '',
    thread_date: t.thread_date ?? '',
    score: t.score ?? 0,
    link_method: t.link_method ?? '',
  }));
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [docTypeForUpload, setDocTypeForUpload] = useState<NonNullable<DealDocument['category']>>('purchase_contract');
  const [uploadDisplayName, setUploadDisplayName] = useState<string>(SUGGESTED_NAMES['purchase_contract'][0]);

  // Auto-suggest name when type changes
  useEffect(() => {
    setUploadDisplayName(SUGGESTED_NAMES[docTypeForUpload]?.[0] ?? '');
  }, [docTypeForUpload]);

  // Option C: Source-of-Truth replacement lock
  const [sotPending, setSotPending] = useState<{ file: File; docType: DealDocument['category'] } | null>(null);
  const [showDocRequests, setShowDocRequests] = useState(true);

  // Activity log state
  const [showActivityLog, setShowActivityLog] = useState(false);
  const { data: activityLog = [], isLoading: loadingLog } = useDocumentLog(deal.id, showActivityLog);
  const invalidateLog = useInvalidateDocumentLog();
  const invalidateDealTasks = useInvalidateDealTasks();
  const [showArchived, setShowArchived] = useState(false);

  // Address mismatch / classify state
  const [classifying, setClassifying] = useState(false);
  const [addressMismatchPending, setAddressMismatchPending] = useState<{
    file: File;
    docType: DealDocument['category'];
    extracted: string;
    match: 'match' | 'partial' | 'mismatch';
    classifyResult: any;
  } | null>(null);

  // Modal states
  const [previewDoc, setPreviewDoc] = useState<DealDocument | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [comparisonDoc, setComparisonDoc] = useState<DealDocument | null>(null);
  const [manualExtractDoc, setManualExtractDoc] = useState<DealDocument | null>(null);
  const [linkingDoc, setLinkingDoc] = useState<DealDocument | null>(null);

  // Summary modal
  const [summaryDoc, setSummaryDoc] = useState<DealDocument | null>(null);
  const [summaryText, setSummaryText] = useState<string>('');
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Financial Changes modal
  const [financialDoc, setFinancialDoc] = useState<DealDocument | null>(null);
  const [financialChanges, setFinancialChanges] = useState<Array<{ field: string; current: string; proposed: string; delta: string }>>([]);
  const [financialLoading, setFinancialLoading] = useState(false);

  // Download Packet
  const [packetLoading, setPacketLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Drag-and-Drop ───────────────────────────────────────────────────────────
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (dragCounter.current === 1) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleDroppedFile(file);
  };

  // ─── Document Log ────────────────────────────────────────────────────────────
  const logDocumentAction = async (
    docId: string | undefined,
    documentId: string | undefined,
    action: string,
    changedFields?: Record<string, any>,
    note?: string
  ) => {
    await supabase.from('document_log').insert({
      deal_id: deal.id,
      doc_id: docId,
      document_id: documentId,
      action,
      changed_fields: changedFields ?? null,
      actor_name: userName,
      note: note ?? null,
    });
  };



  const formatLogDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  // ─── Upload ─────────────────────────────────────────────────────────────────

  // ─── AI Pre-upload Classification ───────────────────────────────────────────
  const classifyDocument = async (file: File, userSelectedType: DealDocument['category']): Promise<any | null> => {
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]); // strip data:...;base64,
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const dealAddress = [deal.propertyAddress, deal.city, deal.state, deal.zipCode].filter(Boolean).join(', ');

      const res = await fetch('/api/ai?action=classify-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64: base64,
          fileName: file.name,
          dealAddress,
          userSelectedType,
        }),
      });

      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null; // classify failure should never block upload
    }
  };

  const handleDroppedFile = async (file: File) => {
    // Same flow as clicking upload — runs through SoT guard, AI classify, address mismatch check
    const existingSot = docs.find(d => d.category === 'purchase_contract' && d.is_source_of_truth);
    if (docTypeForUpload === 'purchase_contract' && existingSot) {
      setSotPending({ file, docType: docTypeForUpload });
      return;
    }

    setClassifying(true);
    setUploadProgress('Analyzing document…');
    const classified = await classifyDocument(file, docTypeForUpload);
    setClassifying(false);
    setUploadProgress('');

    if (classified) {
      if (classified.addressMatch === 'mismatch' || classified.addressMatch === 'partial') {
        setAddressMismatchPending({
          file,
          docType: docTypeForUpload,
          extracted: classified.addressExtracted,
          match: classified.addressMatch,
          classifyResult: classified,
        });
        return;
      }
    }

    await uploadFile(file, docTypeForUpload, classified);
  };

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

    // Pre-upload AI classification
    setClassifying(true);
    setUploadProgress('Analyzing document…');
    const classified = await classifyDocument(file, docTypeForUpload);
    setClassifying(false);
    setUploadProgress('');

    if (classified) {
      // Address mismatch — force acknowledgment before upload
      if (classified.addressMatch === 'mismatch' || classified.addressMatch === 'partial') {
        setAddressMismatchPending({
          file,
          docType: docTypeForUpload,
          extracted: classified.addressExtracted,
          match: classified.addressMatch,
          classifyResult: classified,
        });
        return;
      }
    }

    await uploadFile(file, docTypeForUpload, classified);
  };

  const uploadFile = async (file: File, docType: DealDocument['category'], classifyResult?: any) => {
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
        await directUpload(file, docType, classifyResult);
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
        display_name: uploadDisplayName.trim() || null,
        storage_path: path,
        file_size_bytes: file_size,
        category: docType,
        source: 'upload' as const,
        created_at: new Date().toISOString(),
        uploaded_by: userName,
        is_protected: docType === 'purchase_contract' && docs.filter(d => d.category === 'purchase_contract').length === 0,
        is_source_of_truth: docType === 'purchase_contract',
        // AI classification results
        address_verified: classifyResult ? classifyResult.addressMatch === 'match' : null,
        address_extracted: classifyResult?.addressExtracted ?? null,
        address_mismatch: classifyResult ? classifyResult.addressMatch !== 'match' : false,
        address_mismatch_acknowledged: classifyResult?.addressMatch === 'mismatch' || classifyResult?.addressMatch === 'partial' ? true : false,
      };

      const { data: inserted, error: dbErr } = await supabase
        .from('deal_documents')
        .insert(rec)
        .select()
        .single();

      if (dbErr) throw dbErr;

      const newDoc = inserted as DealDocument;
      invalidateDocs(deal.id);

      // Log the upload
      await logDocumentAction(
        newDoc.doc_id,
        newDoc.id,
        'uploaded',
        undefined,
        `${userName} uploaded ${DOC_TYPE_CONFIG[docType ?? 'other']?.label ?? docType}`
      );
      invalidateLog(deal.id);

      // Auto-create task for certain document types
      const typeConfig = DOC_TYPE_CONFIG[docType ?? 'other'];
      if (typeConfig?.autoTask) {
        await supabase.from('tasks').insert({
          deal_id: deal.id,
          title: typeConfig.autoTask,
          description: `Auto-created on ${DOC_TYPE_CONFIG[docType ?? 'other']?.label ?? docType} upload (${newDoc.doc_id ?? ''})`,
          priority: typeConfig.taskPriority ?? 'normal',
          status: 'pending',
          category: 'document',
        });
        invalidateDealTasks(deal.id);
      }

      // Auto-trigger comparison for contracts, amendments, addendums, and counter offers
      if (docType === 'purchase_contract' || docType === 'amendment' || docType === 'addendum' || docType === 'counter_offer') {
        setTimeout(() => setComparisonDoc(newDoc), 400);
      }
    } catch (e: any) {
      alert('Upload failed: ' + (e.message ?? e));
    } finally {
      setUploading(false);
      setUploadProgress('');
      setUploadDisplayName(SUGGESTED_NAMES[docTypeForUpload]?.[0] ?? '');
    }
  };

  // Fallback direct upload if API route isn't available
  const directUpload = async (file: File, docType: DealDocument['category'], classifyResult?: any) => {
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
      display_name: uploadDisplayName.trim() || null,
      storage_path: path,
      file_size_bytes: file.size,
      category: docType,
      source: 'upload' as const,
      created_at: new Date().toISOString(),
      uploaded_by: userName,
      is_protected: docType === 'purchase_contract' && docs.filter(d => d.category === 'purchase_contract').length === 0,
      is_source_of_truth: docType === 'purchase_contract',
      // AI classification results
      address_verified: classifyResult ? classifyResult.addressMatch === 'match' : null,
      address_extracted: classifyResult?.addressExtracted ?? null,
      address_mismatch: classifyResult ? classifyResult.addressMatch !== 'match' : false,
      address_mismatch_acknowledged: classifyResult?.addressMatch === 'mismatch' || classifyResult?.addressMatch === 'partial' ? true : false,
    };

    const { data: inserted, error: dbErr } = await supabase
      .from('deal_documents')
      .insert(rec)
      .select()
      .single();
    if (dbErr) throw dbErr;

    const newDoc = inserted as DealDocument;
    invalidateDocs(deal.id);

    // Log the upload
    await logDocumentAction(
      newDoc.doc_id,
      newDoc.id,
      'uploaded',
      undefined,
      `${userName} uploaded ${DOC_TYPE_CONFIG[docType ?? 'other']?.label ?? docType}`
    );
    invalidateLog(deal.id);

    // Auto-create task for certain document types
    const typeConfig = DOC_TYPE_CONFIG[docType ?? 'other'];
    if (typeConfig?.autoTask) {
      await supabase.from('tasks').insert({
        deal_id: deal.id,
        title: typeConfig.autoTask,
        description: `Auto-created on ${DOC_TYPE_CONFIG[docType ?? 'other']?.label ?? docType} upload (${newDoc.doc_id ?? ''})`,
        priority: typeConfig.taskPriority ?? 'normal',
        status: 'pending',
        category: 'document',
      });
      invalidateDealTasks(deal.id);
    }

    if (docType === 'purchase_contract' || docType === 'amendment' || docType === 'addendum' || docType === 'counter_offer') {
      setTimeout(() => setComparisonDoc(newDoc), 400);
    }
  };

  const handleDownload = async (doc: DealDocument) => {
    const { data, error } = await supabase.storage.from('deal-documents').createSignedUrl(doc.storage_path, 300);
    if (error) { alert('Could not generate download link'); return; }
    window.open(data.signedUrl, '_blank');
  };

  const handleSummary = async (doc: DealDocument) => {
    setSummaryDoc(doc);
    setSummaryLoading(true);
    setSummaryText('');
    try {
      const resp = await fetch('/api/ai?action=summarize-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: doc.id }),
      });
      const result = await resp.json();
      setSummaryText(result.summary || 'Could not generate summary.');
    } catch {
      setSummaryText('Failed to generate summary. Please try again.');
    }
    setSummaryLoading(false);
  };

  const handleFinancialChanges = async (doc: DealDocument) => {
    setFinancialDoc(doc);
    setFinancialLoading(true);
    setFinancialChanges([]);
    try {
      const d = deal as any;
      const currentDealData = {
        salesPrice: d.contractPrice ?? d.salesPrice ?? '',
        closingDate: deal.closingDate || '',
        optionFee: d.optionFee ?? '',
        optionPeriodEndDate: d.optionPeriodEndDate ?? '',
        earnestMoney: deal.earnestMoney ?? '',
        financeAmount: d.loanAmount ?? d.financeAmount ?? '',
        downPayment: deal.downPayment ?? '',
        interestRate: d.interestRate ?? '',
        loanType: deal.loanType || '',
        buyerName: deal.buyerName || '',
        sellerName: deal.sellerName || '',
        buyerAgentName: deal.buyerAgentName || '',
        sellerAgentName: deal.sellerAgentName || '',
        titleCompanyName: deal.titleCompanyName || '',
        loanOfficerName: deal.loanOfficerName || '',
      };
      const resp = await fetch('/api/ai?action=financial-changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: doc.id, currentDealData }),
      });
      const result = await resp.json();
      setFinancialChanges(result.changes || []);
    } catch {
      setFinancialChanges([]);
    }
    setFinancialLoading(false);
  };

  const handleDownloadPacket = async () => {
    setPacketLoading(true);
    try {
      const resp = await fetch('/api/ai?action=generate-packet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId: deal.id }),
      });
      const result = await resp.json();
      if (result.pdfBase64) {
        const byteChars = atob(result.pdfBase64);
        const byteArr = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
        const blob = new Blob([byteArr], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename || 'document-packet.pdf';
        a.click();
        URL.revokeObjectURL(url);
      } else {
        alert('Could not generate packet. Please try again.');
      }
    } catch {
      alert('Failed to generate packet. Please try again.');
    }
    setPacketLoading(false);
  };

  const handleDelete = async (doc: DealDocument) => {
    if (!confirm(`Delete "${doc.file_name}"? This cannot be undone.`)) return;
    await supabase.storage.from('deal-documents').remove([doc.storage_path]);
    await supabase.from('deal_documents').delete().eq('id', doc.id);
    invalidateDocs(deal.id);
  };

  const handleArchive = async (doc: DealDocument) => {
    if (!confirm(`Archive "${doc.display_name || doc.file_name}"? It will be hidden but not deleted.`)) return;
    await supabase
      .from('deal_documents')
      .update({ archived: true, archived_at: new Date().toISOString(), archived_by: profile?.id })
      .eq('id', doc.id);
    invalidateDocs(deal.id);
    await logDocumentAction(doc.doc_id, doc.id, 'archived', undefined, `Archived by ${userName}`);
    invalidateLog(deal.id);
  };

  const handleRename = async (doc: DealDocument, newName: string) => {
    if (!newName.trim() || newName.trim() === (doc.display_name || doc.file_name)) return;
    await supabase
      .from('deal_documents')
      .update({ display_name: newName.trim() })
      .eq('id', doc.id);
    invalidateDocs(deal.id);
    await logDocumentAction(
      doc.doc_id,
      doc.id,
      'renamed',
      { display_name: { from: doc.display_name || doc.file_name, to: newName.trim() } },
    );
    invalidateLog(deal.id);
  };

  // ─── Extraction handlers ─────────────────────────────────────────────────
  const handleComparisonConfirm = async (updates: Partial<Deal>) => {
    const updated: Deal = { ...deal, ...updates, updatedAt: new Date().toISOString() };
    onUpdate(updated);
    if (comparisonDoc) {
      await supabase.from('deal_documents').update({ extracted_at: new Date().toISOString() }).eq('id', comparisonDoc.id);
      invalidateDocs(deal.id);
    }
    setComparisonDoc(null);
  };

  const handleExtractionConfirm = async (updates: Partial<Deal>) => {
    const updated: Deal = { ...deal, ...updates, updatedAt: new Date().toISOString() };
    onUpdate(updated);
    if (manualExtractDoc) {
      await supabase.from('deal_documents').update({ extracted_at: new Date().toISOString() }).eq('id', manualExtractDoc.id);
      invalidateDocs(deal.id);
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
      invalidateDocLinks(deal.id);
    }
  };

  const handleUnlink = async (linkId: string) => {
    await supabase.from('checklist_document_links').delete().eq('id', linkId);
    invalidateDocLinks(deal.id);
  };

  // ─── Derived data ────────────────────────────────────────────────────────
  const visibleDocs = docs.filter(d => showArchived || !d.archived);
  const contractDocs = visibleDocs
    .filter(d => d.category === 'purchase_contract')
    .sort((a, b) => {
      if (a.is_source_of_truth && !b.is_source_of_truth) return -1;
      if (!a.is_source_of_truth && b.is_source_of_truth) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  const counterOfferDocs = visibleDocs.filter(d => d.category === 'counter_offer').sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const unreviewedCounterOffers = counterOfferDocs.filter(d => !d.extracted_at);
  const amendmentDocs = visibleDocs.filter(d => d.category === 'amendment' || d.category === 'addendum' || d.category === 'as_is');
  const inspectionDocs = visibleDocs.filter(d => d.category === 'inspection_notice' || d.category === 'unacceptable_conditions');
  const otherDocs = visibleDocs.filter(d => d.category === 'other' || !d.category);

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
    <div
      className="p-4 space-y-6 pb-10 relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >

      {/* ── Drag-and-Drop Overlay ─────────────────────────────────────────── */}
      {isDragging && (
        <div className="absolute inset-0 z-40 rounded-2xl flex flex-col items-center justify-center gap-3 pointer-events-none"
          style={{ background: 'rgba(99,102,241,0.10)', border: '2.5px dashed #6366f1' }}>
          <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center">
            <Upload size={28} className="text-indigo-600" />
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-indigo-700">Drop to upload</p>
            <p className="text-xs text-indigo-500 mt-0.5">
              {deal.propertyAddress}{deal.city ? `, ${deal.city}` : ''}{deal.state ? ` ${deal.state}` : ''}
            </p>
          </div>
          <p className="text-xs text-indigo-400">Will upload as: <span className="font-semibold capitalize">{(docTypeForUpload ?? '').replace(/_/g, ' ')}</span></p>
        </div>
      )}

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

      {/* ── Address Mismatch Modal ──────────────────────────────────────── */}
      {addressMismatchPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-base-100 rounded-2xl shadow-xl p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-3">
              {addressMismatchPending.match === 'mismatch' ? (
                <span className="text-2xl">🔴</span>
              ) : (
                <span className="text-2xl">⚠️</span>
              )}
              <h3 className="font-bold text-lg">
                {addressMismatchPending.match === 'mismatch' ? 'Address Mismatch' : 'Address Partial Match'}
              </h3>
            </div>
            <p className="text-sm text-base-content/70 mb-2">
              The address in this document doesn't fully match this deal.
            </p>
            <div className="rounded-lg bg-base-200 p-3 text-sm mb-4 space-y-1">
              <div><span className="text-base-content/50">Deal address: </span><span className="font-medium">{[deal.propertyAddress, deal.city, deal.state].filter(Boolean).join(', ')}</span></div>
              <div><span className="text-base-content/50">Document address: </span><span className="font-medium text-warning">{addressMismatchPending.extracted || 'Not found'}</span></div>
            </div>
            <p className="text-xs text-base-content/50 mb-4">
              This will be logged. You can still upload — just confirm you've reviewed this.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setAddressMismatchPending(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-sm btn-warning"
                onClick={async () => {
                  const { file, docType, classifyResult } = addressMismatchPending;
                  setAddressMismatchPending(null);
                  await uploadFile(file, docType, classifyResult);
                }}
              >
                Acknowledge & Upload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Pending Changes banner ──────────────────────────────────────── */}
      {unreviewedCounterOffers.length > 0 && (
        <div
          onClick={() => setComparisonDoc(unreviewedCounterOffers[0])}
          className="rounded-xl border border-amber-400/40 bg-amber-50 dark:bg-amber-900/10 px-4 py-3 flex items-start gap-3 mb-2 cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/20 transition-colors"
        >
          <span className="text-lg mt-0.5">🔄</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              Pending Changes — {unreviewedCounterOffers.length} Unreviewed Counter Offer{unreviewedCounterOffers.length > 1 ? 's' : ''}
            </p>
            <p className="text-xs text-amber-600/80 dark:text-amber-400/60 mt-0.5">
              Click to review counter offer terms and confirm or reject changes.
            </p>
          </div>
          <span className="text-xs text-amber-600 dark:text-amber-400 mt-1 shrink-0">Review →</span>
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
          <button
            onClick={() => { setShowActivityLog(true); }}
            className="btn btn-sm btn-ghost gap-1"
          >
            <Clock size={13} /> Document Activity
          </button>
          <button
            onClick={handleDownloadPacket}
            disabled={packetLoading}
            className="btn btn-sm btn-ghost gap-1"
          >
            {packetLoading
              ? <><span className="loading loading-spinner loading-xs" /> Generating…</>
              : <><Download size={13} /> Download Packet</>
            }
          </button>
          <label className="flex items-center gap-1.5 text-xs text-base-content/50 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox checkbox-xs"
              checked={showArchived}
              onChange={e => setShowArchived(e.target.checked)}
            />
            Show Archived
          </label>
          <select
            className="select select-xs select-bordered"
            value={docTypeForUpload}
            onChange={e => setDocTypeForUpload(e.target.value as NonNullable<DealDocument['category']>)}
          >
            <option value="purchase_contract">📄 Purchase Contract</option>
            <option value="counter_offer">🔄 Counter Offer</option>
            <option value="amendment">✏️ Amendment</option>
            <option value="addendum">➕ Addendum</option>
            <option value="as_is">🏚️ As-Is Addendum</option>
            <option value="inspection_notice">🔍 Inspection Notice</option>
            <option value="unacceptable_conditions">⚠️ Unacceptable Conditions</option>
            <option value="other">📋 Other</option>
          </select>
          {/* Document name: datalist for suggestions, fully editable */}
          <datalist id="doc-name-suggestions">
            {(SUGGESTED_NAMES[docTypeForUpload] ?? []).map((name: string) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <input
            type="text"
            list="doc-name-suggestions"
            className="input input-xs input-bordered w-44"
            placeholder="Document name…"
            value={uploadDisplayName}
            onChange={e => setUploadDisplayName(e.target.value)}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-sm btn-primary gap-1"
            disabled={uploading || classifying}
          >
            {(uploading || classifying) ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            {uploading ? uploadProgress : classifying ? 'Analyzing…' : 'Upload File'}
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
            <section className="rounded-2xl border-2 border-primary/20 bg-primary/[0.02]">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-primary/15 bg-primary/[0.04] rounded-t-2xl">
                <FileText size={14} className="text-primary" />
                <h3 className="text-sm font-semibold text-primary uppercase tracking-wide">Purchase Contract</h3>
                <span className="badge badge-sm bg-primary/10 text-primary border-0">{contractDocs.length}</span>
                <div className="flex-1" />
                <span className="text-xs text-base-content/30">Source of truth pinned · Original contract protected</span>
                <button
                  onClick={() => setShowTimeline(true)}
                  className="btn btn-xs btn-ghost gap-1 text-primary/50 hover:text-primary normal-case font-normal"
                >
                  <Table2 size={11} /> Changes Timeline
                </button>
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
                    onArchive={handleArchive}
                    onSummary={handleSummary}
                    onFinancialChanges={handleFinancialChanges}
                    onRename={handleRename}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── Counter Offers ──────────────────────────────────────────────── */}
          {counterOfferDocs.length > 0 && (
            <section className="rounded-2xl border-2 border-amber-200 bg-amber-50/30">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-200 bg-amber-50/50 rounded-t-2xl">
                <span className="text-amber-600">🔄</span>
                <h3 className="text-sm font-semibold text-amber-700 uppercase tracking-wide">Counter Offers</h3>
                <span className="badge badge-sm bg-amber-100 text-amber-700 border-0">{counterOfferDocs.length}</span>
              </div>
              <div className="p-3 space-y-2">
                {counterOfferDocs.map((doc, idx) => (
                  <DocRow
                    key={doc.id}
                    doc={{ ...doc, display_name: doc.display_name || `Counter Offer #${idx + 1}` }}
                    isOriginal={false}
                    linkedItemTitles={linkedTitlesByDocId[doc.id] ?? []}
                    onPreview={setPreviewDoc}
                    onExtract={setManualExtractDoc}
                    onDelete={handleDelete}
                    onDownload={handleDownload}
                    onLinkChecklist={setLinkingDoc}
                    onArchive={handleArchive}
                    onSummary={handleSummary}
                    onFinancialChanges={handleFinancialChanges}
                    onRename={handleRename}
                    onReviewChanges={setComparisonDoc}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── Amendments & Addenda ──────────────────────────────────── */}
          {amendmentDocs.length > 0 && (
            <section className="rounded-2xl border border-base-300">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-base-300 bg-base-200/50 rounded-t-2xl">
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
                    onArchive={handleArchive}
                    onSummary={handleSummary}
                    onFinancialChanges={handleFinancialChanges}
                    onRename={handleRename}
                    onReviewChanges={(doc.category === 'amendment' || doc.category === 'addendum') ? setComparisonDoc : undefined}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── Inspection Documents ────────────────────────────────────────── */}
          {inspectionDocs.length > 0 && (
            <section className="rounded-2xl border border-teal-200 bg-teal-50/20">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-teal-200 bg-teal-50/30 rounded-t-2xl">
                <span>🔍</span>
                <h3 className="text-sm font-semibold text-teal-700 uppercase tracking-wide">Inspection Documents</h3>
                <span className="badge badge-sm bg-teal-100 text-teal-700 border-0">{inspectionDocs.length}</span>
              </div>
              <div className="p-3 space-y-2">
                {inspectionDocs.map(doc => (
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
                    onArchive={handleArchive}
                    onSummary={handleSummary}
                    onFinancialChanges={handleFinancialChanges}
                    onRename={handleRename}
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
                    onArchive={handleArchive}
                    onSummary={handleSummary}
                    onFinancialChanges={handleFinancialChanges}
                    onRename={handleRename}
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
      {showTimeline && (
        <ChangesTimeline
          docs={[...contractDocs, ...counterOfferDocs, ...amendmentDocs]}
          deal={deal}
          onClose={() => setShowTimeline(false)}
        />
      )}

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

      {/* ── Document Activity Log ───────────────────────────────────────── */}
      {showActivityLog && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" onClick={() => setShowActivityLog(false)}>
          <div
            className="h-full w-full max-w-lg bg-base-100 shadow-2xl flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-base-300 flex-none">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-primary" />
                <span className="font-semibold text-base-content">Document Activity</span>
              </div>
              <button onClick={() => setShowActivityLog(false)} className="btn btn-ghost btn-circle btn-sm">
                <X size={16} />
              </button>
            </div>

            {/* Log entries */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {loadingLog && <LoadingSpinner label="Loading activity..." />}
              {!loadingLog && activityLog.length === 0 && (
                <p className="text-sm text-base-content/40 text-center py-8">No activity recorded yet.</p>
              )}
              {!loadingLog && activityLog.map((entry, idx) => {
                const changes: Array<{ label: string; from?: string; to?: string; delta?: string }> =
                  entry.changed_fields
                    ? (Array.isArray(entry.changed_fields)
                        ? entry.changed_fields
                        : Object.entries(entry.changed_fields).map(([k, v]: any) => ({
                            label: k,
                            ...(typeof v === 'object' && v !== null ? v : { to: String(v) }),
                          })))
                    : [];
                const dt = new Date(entry.created_at);
                const dateStr = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                return (
                  <div key={entry.id || idx} className="py-3 border-b border-base-200 last:border-0">
                    <div className="flex gap-3">
                      <span className="text-xs text-base-content/40 whitespace-nowrap font-mono min-w-[110px]">
                        {dateStr} · {timeStr}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-semibold text-base-content">{entry.actor_name}</span>
                        <span className="text-xs text-base-content/70">{' '}{entry.note || entry.action}</span>
                        {entry.doc_id && (
                          <span className="ml-1 text-xs font-mono text-primary opacity-70">· {entry.doc_id}</span>
                        )}
                        {changes.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {changes.map((change, ci) => {
                              const isLast = ci === changes.length - 1;
                              const treeChar = isLast ? '└' : '├';
                              return (
                                <div key={ci} className="flex gap-1.5 items-baseline">
                                  <span className="text-base-content/30 font-mono text-xs select-none">{treeChar}</span>
                                  <span className="text-xs text-base-content/60">{change.label}</span>
                                  {change.from !== undefined && (
                                    <>
                                      <span className="text-xs text-base-content/40 font-mono">{change.from}</span>
                                      <span className="text-xs text-base-content/30">→</span>
                                      <span className="text-xs font-medium text-base-content">{change.to}</span>
                                    </>
                                  )}
                                  {change.from === undefined && change.to !== undefined && (
                                    <span className="text-xs text-base-content/70">{change.to}</span>
                                  )}
                                  {change.delta && (
                                    <span className={`text-xs font-mono font-semibold ml-1 ${
                                      String(change.delta).startsWith('+') ? 'text-success' :
                                      String(change.delta).startsWith('-') ? 'text-error' : 'text-base-content/50'
                                    }`}>({change.delta})</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── Summary Modal ───────────────────────────────────────────────────── */}
      {summaryDoc && (
        <div className="modal modal-open">
          <div className="modal-box max-w-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-lg">Document Summary</h3>
                <p className="text-sm text-base-content/60">{summaryDoc.display_name || summaryDoc.file_name}</p>
              </div>
              <button className="btn btn-sm btn-ghost btn-circle" onClick={() => { setSummaryDoc(null); setSummaryText(''); }}>✕</button>
            </div>
            {summaryLoading ? (
              <div className="flex items-center gap-3 py-8 justify-center text-base-content/50">
                <span className="loading loading-spinner loading-md" />
                <span>Analyzing document…</span>
              </div>
            ) : (
              <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed">
                {summaryText}
              </div>
            )}
            <div className="modal-action">
              <button className="btn btn-sm" onClick={() => { setSummaryDoc(null); setSummaryText(''); }}>Close</button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => { setSummaryDoc(null); setSummaryText(''); }} />
        </div>
      )}

      {/* ─── Financial Changes Modal ─────────────────────────────────────────── */}
      {financialDoc && (
        <div className="modal modal-open">
          <div className="modal-box max-w-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-lg">Financial Changes</h3>
                <p className="text-sm text-base-content/60">{financialDoc.display_name || financialDoc.file_name}</p>
              </div>
              <button className="btn btn-sm btn-ghost btn-circle" onClick={() => { setFinancialDoc(null); setFinancialChanges([]); }}>✕</button>
            </div>
            {financialLoading ? (
              <div className="flex items-center gap-3 py-8 justify-center text-base-content/50">
                <span className="loading loading-spinner loading-md" />
                <span>Comparing financial terms…</span>
              </div>
            ) : financialChanges.length === 0 ? (
              <div className="text-center py-8 text-base-content/50">
                <p className="text-sm">No financial changes detected vs. current deal data.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-sm w-full">
                  <thead>
                    <tr>
                      <th className="text-xs">Field</th>
                      <th className="text-xs">Current</th>
                      <th className="text-xs">Proposed</th>
                      <th className="text-xs">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {financialChanges.map((change, i) => (
                      <tr key={i}>
                        <td className="font-medium text-xs">{change.field}</td>
                        <td className="text-xs text-base-content/60">{change.current}</td>
                        <td className="text-xs font-medium">{change.proposed}</td>
                        <td className="text-xs">
                          <span className={`font-mono font-semibold ${
                            change.delta.startsWith('+') ? 'text-success' :
                            change.delta.startsWith('-') ? 'text-error' : 'text-warning'
                          }`}>
                            {change.delta}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="modal-action">
              <button className="btn btn-sm" onClick={() => { setFinancialDoc(null); setFinancialChanges([]); }}>Close</button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => { setFinancialDoc(null); setFinancialChanges([]); }} />
        </div>
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
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="error" onClick={onConfirm}>Confirm</Button>
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
          <Button variant="ghost" className="btn-circle" onClick={onClose}><X size={15} /></Button>
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
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSave}>Save</Button>
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
                  <Button variant="ghost" size="xs" className="btn-circle" onClick={() => { setEditingRequest(r); setShowRequestModal(true); }}><Info size={13} /></Button>
                  <Button variant="ghost" size="xs" className="btn-circle text-error/60 hover:text-error" onClick={() => setConfirmDelete(r.id)}><X size={13} /></Button>
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
