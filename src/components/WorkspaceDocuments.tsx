import { useAuth } from '../lib/auth';
import React, { useState, useEffect, useRef } from 'react';
import {
  Upload, FileText, Link2, AlertTriangle, CheckCircle2, Clock,
  Plus, X, Info, Download, Sparkles, ChevronDown, ChevronRight,
  Mail, Eye, Loader2, RefreshCw, Trash2, ExternalLink, File,
} from 'lucide-react';
import { Deal, DocumentRequest, DocRequestType, DocRequestStatus } from '../types';
import { docTypeConfig, generateId, formatDateTime } from '../utils/helpers';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
interface DealDocument {
  id: string;
  deal_id: string;
  file_name: string;
  file_path: string;
  file_size?: number;
  mime_type?: string;
  doc_type?: 'purchase_contract' | 'amendment' | 'addendum' | 'other';
  source: 'upload' | 'email';
  gmail_thread_id?: string;
  thread_subject?: string;
  thread_from?: string;
  uploaded_at: string;
  extracted_at?: string;
}

interface LinkedEmailDoc {
  thread_id: string;
  subject: string;
  from_address: string;
  thread_date: string;
  score: number;
  link_method: string;
}

interface ExtractedField {
  key: string;
  label: string;
  value: string;
  confidence?: 'high' | 'medium' | 'low';
  original?: string;
}

interface ExtractionResult {
  fields: ExtractedField[];
  raw_text_preview?: string;
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

const DOC_TYPE_LABELS: Record<string, string> = {
  purchase_contract: 'Purchase Contract',
  amendment: 'Amendment',
  addendum: 'Addendum',
  other: 'Other',
};

const EXTRACTABLE_FIELDS: { key: keyof Deal; label: string }[] = [
  { key: 'contractPrice', label: 'Contract Price' },
  { key: 'listPrice', label: 'List Price' },
  { key: 'contractDate', label: 'Contract Date' },
  { key: 'closingDate', label: 'Closing Date' },
  { key: 'earnestMoney', label: 'Earnest Money' },
  { key: 'earnestMoneyDueDate', label: 'Earnest Money Due' },
  { key: 'loanType', label: 'Loan Type' },
  { key: 'loanAmount', label: 'Loan Amount' },
  { key: 'downPaymentAmount', label: 'Down Payment' },
  { key: 'sellerConcessions', label: 'Seller Concessions' },
  { key: 'inspectionDeadline', label: 'Inspection Deadline' },
  { key: 'loanCommitmentDate', label: 'Loan Commitment Date' },
  { key: 'possessionDate', label: 'Possession Date' },
  { key: 'buyerNames', label: 'Buyer Name(s)' },
  { key: 'sellerNames', label: 'Seller Name(s)' },
  { key: 'titleCompany', label: 'Title Company' },
  { key: 'loanOfficer', label: 'Lender / Loan Officer' },
  { key: 'asIsSale', label: 'As-Is Sale' },
  { key: 'inspectionWaived', label: 'Inspection Waived' },
  { key: 'homeWarranty', label: 'Home Warranty' },
];

// ─── Extraction Verification Modal ───────────────────────────────────────────
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

  useEffect(() => {
    runExtraction();
  }, []);

  const runExtraction = async () => {
    setLoading(true);
    setError('');
    try {
      // Get a signed URL for the file so Railway can download it
      const { data: signedUrl, error: urlErr } = await supabase.storage
        .from('deal-documents')
        .createSignedUrl(doc.file_path, 300); // 5 min expiry

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

      // Pre-populate editable fields
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
    const updates: Partial<Deal> = {};
    Object.entries(editedFields).forEach(([key, val]) => {
      if (val === '' || val === undefined) return;
      const k = key as keyof Deal;
      // Coerce booleans
      if (k === 'asIsSale' || k === 'inspectionWaived' || k === 'homeWarranty') {
        (updates as any)[k] = val === 'true' || val === 'yes' || val === '1';
      } else if (['contractPrice','listPrice','earnestMoney','loanAmount','downPaymentAmount','sellerConcessions','downPaymentPercent'].includes(key)) {
        (updates as any)[k] = parseFloat(val.replace(/[$,%,]/g, '')) || undefined;
      } else {
        (updates as any)[k] = val;
      }
    });
    onConfirm(updates);
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-black/50 backdrop-blur-sm">
      <div className="m-auto bg-base-100 rounded-2xl shadow-2xl flex flex-col"
        style={{ width: '90vw', maxWidth: '1200px', height: '85vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-base-300 flex-none">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-primary" />
            <span className="font-semibold text-base-content">Extract Contract Data</span>
            <span className="text-xs text-base-content/40 ml-1">— {doc.file_name}</span>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle"><X size={16} /></button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Left: PDF Viewer */}
          <div className="w-1/2 border-r border-base-300 flex flex-col">
            <div className="p-3 border-b border-base-300 flex-none">
              <p className="text-xs font-semibold text-base-content/50 uppercase">Document Preview</p>
            </div>
            <div className="flex-1 overflow-hidden">
              <PdfPreview filePath={doc.file_path} />
            </div>
          </div>

          {/* Right: Extracted Fields */}
          <div className="w-1/2 flex flex-col">
            <div className="p-3 border-b border-base-300 flex-none">
              <p className="text-xs font-semibold text-base-content/50 uppercase">Extracted Fields</p>
              {result && (
                <p className="text-xs text-base-content/40 mt-0.5">Review and edit values before confirming</p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {loading && (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-base-content/40">
                  <Loader2 size={28} className="animate-spin text-primary" />
                  <p className="text-sm">Extracting contract data with AI…</p>
                  <p className="text-xs">This takes about 10–15 seconds</p>
                </div>
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
                  {EXTRACTABLE_FIELDS.map(({ key, label }) => {
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
                            }`}>
                              {conf}
                            </span>
                          )}
                        </div>
                        <input
                          className={`input input-sm input-bordered w-full text-sm ${
                            conf === 'low' ? 'border-warning/50' : ''
                          }`}
                          value={val}
                          onChange={e => setEditedFields(p => ({ ...p, [key]: e.target.value }))}
                          placeholder={`Enter ${label.toLowerCase()}…`}
                        />
                        {extracted?.original && extracted.original !== val && (
                          <p className="text-xs text-base-content/30">
                            Original: <span className="italic">{extracted.original}</span>
                          </p>
                        )}
                      </div>
                    );
                  })}

                  {result.fields.length === 0 && (
                    <div className="text-center py-8 text-base-content/40 text-sm">
                      <AlertTriangle size={22} className="mx-auto mb-2 opacity-40" />
                      <p>No fields could be extracted.</p>
                      <p className="text-xs mt-1">The document may not be a purchase contract.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        {result && !loading && !error && (
          <div className="flex items-center justify-between p-4 border-t border-base-300 flex-none">
            <button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>
            <div className="flex items-center gap-3">
              <p className="text-xs text-base-content/40">
                {result.fields.length} field{result.fields.length !== 1 ? 's' : ''} extracted
              </p>
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

// ─── PDF Preview (signed URL) ─────────────────────────────────────────────────
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
  if (!url) return <div className="flex items-center justify-center h-full"><Loader2 size={20} className="animate-spin text-primary/50" /></div>;

  return (
    <iframe
      src={url}
      className="w-full h-full"
      title="PDF Preview"
    />
  );
}

// ─── Document Row ─────────────────────────────────────────────────────────────
interface DocRowProps {
  doc: DealDocument;
  onExtract: (doc: DealDocument) => void;
  onDelete: (doc: DealDocument) => void;
  onDownload: (doc: DealDocument) => void;
}

function DocRow({ doc, onExtract, onDelete, onDownload }: DocRowProps) {
  const isContract = doc.doc_type === 'purchase_contract';
  const isEmail = doc.source === 'email';

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-base-300 bg-base-100 hover:bg-base-200/50 transition-colors group">
      {/* Icon */}
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-none ${
        isContract ? 'bg-primary/10' : 'bg-base-300/50'
      }`}>
        {doc.mime_type?.includes('pdf') ? (
          <FileText size={18} className={isContract ? 'text-primary' : 'text-base-content/50'} />
        ) : (
          <File size={18} className="text-base-content/40" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-base-content truncate max-w-xs">{doc.file_name}</p>
          {isContract && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">Purchase Contract</span>
          )}
          {doc.doc_type && doc.doc_type !== 'purchase_contract' && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-base-300 text-base-content/60">
              {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
            </span>
          )}
          {isEmail && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-info/10 text-info flex items-center gap-1">
              <Mail size={10} /> From Email
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-xs text-base-content/40">{formatDateTime(doc.uploaded_at)}</span>
          {doc.file_size && <span className="text-xs text-base-content/30">{formatFileSize(doc.file_size)}</span>}
          {isEmail && doc.thread_subject && (
            <span className="text-xs text-base-content/40 truncate max-w-xs">✉️ {doc.thread_subject}</span>
          )}
          {doc.extracted_at && (
            <span className="text-xs text-success flex items-center gap-1">
              <CheckCircle2 size={11} /> Extracted {formatDateTime(doc.extracted_at)}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => onDownload(doc)} className="btn btn-ghost btn-xs btn-circle" title="Download">
          <Download size={13} />
        </button>
        {isContract && (
          <button
            onClick={() => onExtract(doc)}
            className="btn btn-primary btn-xs gap-1"
            title="Extract contract data with AI"
          >
            <Sparkles size={11} /> Extract
          </button>
        )}
        {!isContract && doc.mime_type?.includes('pdf') && (
          <button
            onClick={() => onExtract(doc)}
            className="btn btn-ghost btn-xs gap-1"
            title="Extract data from this document"
          >
            <Sparkles size={11} /> Extract
          </button>
        )}
        <button onClick={() => onDelete(doc)} className="btn btn-ghost btn-xs btn-circle text-error/60 hover:text-error" title="Delete">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function WorkspaceDocuments({ deal, onUpdate }: Props) {
  const { profile } = useAuth();
  const userName = profile?.full_name || profile?.name || 'TC Staff';
  const [docs, setDocs] = useState<DealDocument[]>([]);
  const [linkedEmails, setLinkedEmails] = useState<LinkedEmailDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [extractingDoc, setExtractingDoc] = useState<DealDocument | null>(null);
  const [docTypeForUpload, setDocTypeForUpload] = useState<DealDocument['doc_type']>('purchase_contract');
  const [showDocRequests, setShowDocRequests] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDocuments();
    loadLinkedEmails();
  }, [deal.id]);

  const loadDocuments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('deal_documents')
      .select('*')
      .eq('deal_id', deal.id)
      .order('uploaded_at', { ascending: false });

    if (!error && data) setDocs(data as DealDocument[]);
    setLoading(false);
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

  // ─── Upload ────────────────────────────────────────────────────────────────
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    await uploadFile(file, docTypeForUpload);
  };

  const uploadFile = async (file: File, docType: DealDocument['doc_type']) => {
    setUploading(true);
    setUploadProgress(`Uploading ${file.name}…`);
    try {
      const ext = file.name.split('.').pop() ?? 'bin';
      const path = `${deal.id}/${generateId()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from('deal-documents')
        .upload(path, file, { contentType: file.type, upsert: false });

      if (upErr) throw upErr;

      setUploadProgress('Saving record…');

      const rec: Omit<DealDocument, 'id'> = {
        deal_id: deal.id,
        file_name: file.name,
        file_path: path,
        file_size: file.size,
        mime_type: file.type,
        doc_type: docType,
        source: 'upload',
        uploaded_at: new Date().toISOString(),
      };

      const { data: inserted, error: dbErr } = await supabase
        .from('deal_documents')
        .insert(rec)
        .select()
        .single();

      if (dbErr) throw dbErr;
      setDocs(prev => [inserted as DealDocument, ...prev]);

      // If purchase contract, prompt extraction
      if (docType === 'purchase_contract') {
        setTimeout(() => setExtractingDoc(inserted as DealDocument), 500);
      }
    } catch (e: any) {
      alert('Upload failed: ' + (e.message ?? e));
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  };

  const handleDownload = async (doc: DealDocument) => {
    const { data, error } = await supabase.storage
      .from('deal-documents')
      .createSignedUrl(doc.file_path, 300);
    if (error) { alert('Could not generate download link'); return; }
    window.open(data.signedUrl, '_blank');
  };

  const handleDelete = async (doc: DealDocument) => {
    if (!confirm(`Delete "${doc.file_name}"? This cannot be undone.`)) return;
    await supabase.storage.from('deal-documents').remove([doc.file_path]);
    await supabase.from('deal_documents').delete().eq('id', doc.id);
    setDocs(prev => prev.filter(d => d.id !== doc.id));
  };

  const handleExtractionConfirm = async (updates: Partial<Deal>) => {
    const updated: Deal = { ...deal, ...updates, updatedAt: new Date().toISOString() };
    onUpdate(updated);

    // Mark document as extracted
    if (extractingDoc) {
      await supabase.from('deal_documents').update({ extracted_at: new Date().toISOString() }).eq('id', extractingDoc.id);
      setDocs(prev => prev.map(d => d.id === extractingDoc.id ? { ...d, extracted_at: new Date().toISOString() } : d));
    }
    setExtractingDoc(null);
  };

  // ─── Document Requests (legacy section) ───────────────────────────────────
  const pendingDocRequests = (deal.documentRequests ?? []).filter(r => r.status === 'pending');

  // ─── Separate contract docs vs other docs ────────────────────────────────
  const contractDocs = docs.filter(d => d.doc_type === 'purchase_contract');
  const otherDocs = docs.filter(d => d.doc_type !== 'purchase_contract');

  return (
    <div className="p-4 space-y-6 pb-10">

      {/* ── Upload Purchase Contract (hero CTA) ─────────────────────────── */}
      {contractDocs.length === 0 && (
        <div
          onClick={() => { setDocTypeForUpload('purchase_contract'); fileInputRef.current?.click(); }}
          className="rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 p-6 flex flex-col items-center gap-3 cursor-pointer hover:bg-primary/10 transition-colors"
        >
          <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center">
            <Upload size={22} className="text-primary" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-base-content">Upload Purchase Contract</p>
            <p className="text-xs text-base-content/50 mt-1">PDF, Word, or image · AI will offer to extract fields</p>
          </div>
        </div>
      )}

      {/* ── Contract Documents ───────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-base-content/70 uppercase tracking-wide flex items-center gap-1.5">
            <FileText size={14} /> Contract Documents
          </h3>
          <div className="flex items-center gap-2">
            <select
              className="select select-xs select-bordered"
              value={docTypeForUpload}
              onChange={e => setDocTypeForUpload(e.target.value as DealDocument['doc_type'])}
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
          <div className="flex items-center justify-center py-8 text-base-content/30">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : contractDocs.length === 0 ? (
          <div className="rounded-xl border border-base-300 bg-base-50 p-4 text-center text-sm text-base-content/40">
            No contract documents yet — upload the signed purchase agreement above.
          </div>
        ) : (
          <div className="space-y-2">
            {contractDocs.map(doc => (
              <DocRow
                key={doc.id}
                doc={doc}
                onExtract={setExtractingDoc}
                onDelete={handleDelete}
                onDownload={handleDownload}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Amendments & Addendums ─────────────────────────────────────── */}
      {otherDocs.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-base-content/70 uppercase tracking-wide flex items-center gap-1.5 mb-3">
            <FileText size={14} /> Amendments &amp; Other Documents
          </h3>
          <div className="space-y-2">
            {otherDocs.map(doc => (
              <DocRow
                key={doc.id}
                doc={doc}
                onExtract={setExtractingDoc}
                onDelete={handleDelete}
                onDownload={handleDownload}
              />
            ))}
          </div>
        </section>
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
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-base-300 text-base-content/50">
                      Score: {em.score}
                    </span>
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

      {/* ── Extraction Modal ─────────────────────────────────────────────── */}
      {extractingDoc && (
        <ExtractionModal
          doc={extractingDoc}
          deal={deal}
          onConfirm={handleExtractionConfirm}
          onClose={() => setExtractingDoc(null)}
        />
      )}
    </div>
  );
}

// ─── Legacy Document Requests (preserved from original) ──────────────────────
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
  const [form, setForm] = useState<Partial<DocumentRequest>>(existing ?? {
    type: 'contract' as DocRequestType, label: '', description: '', urgency: 'normal', status: 'pending' as DocRequestStatus,
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
              <option value="normal">Normal</option>
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

  const statusColor: Record<DocRequestStatus, string> = {
    pending: 'text-warning',
    received: 'text-success',
    approved: 'text-info',
    rejected: 'text-error',
  };
  const StatusIcon = ({ s }: { s: DocRequestStatus }) => {
    if (s === 'pending') return <Clock size={14} className="text-warning" />;
    if (s === 'received') return <CheckCircle2 size={14} className="text-success" />;
    if (s === 'approved') return <CheckCircle2 size={14} className="text-info" />;
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
                    <span className={`text-xs capitalize font-medium ${statusColor[r.status]}`}>{r.status}</span>
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
