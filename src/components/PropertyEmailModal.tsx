import React, { useState, useEffect, useRef } from 'react';
import {
  X, Mail, Paperclip, ChevronDown, ChevronRight,
  Download, FileText, Image, Film, File, Loader2,
  AlertCircle, Inbox, Search, Cpu, Shield, MessageSquare,
  SlidersHorizontal, ChevronUp,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Attachment {
  filename: string;
  contentType: string;
  size: number;
  downloadUrl: string;
}

type EmailCategory =
  | 'contract' | 'inspection' | 'appraisal' | 'title'
  | 'lender'   | 'closing'   | 'compliance' | 'general' | 'unrelated';

interface Classification {
  shouldAttach: boolean;
  confidence: number;
  category: EmailCategory;
  reason: string;
  extractedSignals: string[];
  source: 'deterministic' | 'ai';
}

interface PropertyEmail {
  id: string;
  threadGroupId?: string;
  messageId?: string;
  inReplyTo?: string;
  subject: string;
  from: string;
  to: string;
  cc?: string;
  date: string;
  internalDate: string;
  snippet: string;
  bodyHtml: string;
  body: string;
  attachments: Attachment[];
  attachmentNames?: string[];
  classification?: Classification;
}

interface DealContextProp {
  dealId?: string;
  mlsNumber?: string;
  clientNames?: string[];
  participantEmails?: string[];
  linkedThreadIds?: string[];
}

interface Stats {
  hardAccepted: number;
  grayZone: number;
  aiAccepted: number;
  hardRejected: number;
  totalScanned: number;
}

interface PropertyEmailModalProps {
  addresses: string[];
  label: string;
  onClose: () => void;
  dealContext?: DealContextProp;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatFileSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return iso; }
}

function getFileIcon(contentType: string) {
  if (contentType.startsWith('image/'))  return <Image  size={18} className="text-blue-400" />;
  if (contentType.startsWith('video/'))  return <Film   size={18} className="text-purple-400" />;
  if (contentType.includes('pdf'))       return <FileText size={18} className="text-red-400" />;
  if (contentType.includes('word') || contentType.includes('document')) return <FileText size={18} className="text-blue-500" />;
  if (contentType.includes('sheet') || contentType.includes('excel'))   return <FileText size={18} className="text-green-500" />;
  return <File size={18} className="text-base-content/50" />;
}

const CATEGORY_META: Record<EmailCategory, { label: string; color: string }> = {
  contract:   { label: 'Contract',   color: 'bg-blue-100 text-blue-700 border-blue-200' },
  inspection: { label: 'Inspection', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  appraisal:  { label: 'Appraisal',  color: 'bg-purple-100 text-purple-700 border-purple-200' },
  title:      { label: 'Title',      color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  lender:     { label: 'Lender',     color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  closing:    { label: 'Closing',    color: 'bg-red-100 text-red-700 border-red-200' },
  compliance: { label: 'Compliance', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  general:    { label: 'General',    color: 'bg-gray-100 text-gray-600 border-gray-200' },
  unrelated:  { label: 'Unrelated',  color: 'bg-gray-100 text-gray-400 border-gray-100' },
};

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 90
    ? 'bg-green-100 text-green-700 border-green-200'
    : pct >= 70
      ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
      : 'bg-orange-100 text-orange-700 border-orange-200';
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border text-[10px] font-bold leading-none ${color}`}>
      {pct}%
    </span>
  );
}

function CategoryBadge({ category }: { category: EmailCategory }) {
  const meta = CATEGORY_META[category] || CATEGORY_META.general;
  if (category === 'unrelated') return null;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md border text-[10px] font-semibold leading-none ${meta.color}`}>
      {meta.label}
    </span>
  );
}

function SourceBadge({ source }: { source: 'deterministic' | 'ai' }) {
  return source === 'ai'
    ? <span title="Classified by AI" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-violet-100 border border-violet-200 text-violet-600 text-[10px] font-semibold leading-none"><Cpu size={9} />AI</span>
    : <span title="Matched by rules" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-sky-100 border border-sky-200 text-sky-600 text-[10px] font-semibold leading-none"><Shield size={9} />Rule</span>;
}

// ─── Email Row ────────────────────────────────────────────────────────────────
function EmailRow({ email, showClassification }: { email: PropertyEmail; showClassification: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [showSignals, setShowSignals] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(300);

  useEffect(() => {
    if (expanded && iframeRef.current && email.bodyHtml) {
      const iframe = iframeRef.current;
      const onLoad = () => {
        try {
          const h = iframe.contentDocument?.body?.scrollHeight;
          if (h) setIframeHeight(Math.min(h + 20, 600));
        } catch {}
      };
      iframe.addEventListener('load', onLoad);
      return () => iframe.removeEventListener('load', onLoad);
    }
  }, [expanded, email.bodyHtml]);

  const fromName = email.from.replace(/<.*>/, '').trim() || email.from;
  const cls = email.classification;

  return (
    <div className="border border-base-300 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-start gap-3 p-3 hover:bg-base-200 transition-colors text-left"
      >
        <div className="flex-none mt-0.5">
          {expanded
            ? <ChevronDown size={15} className="text-primary" />
            : <ChevronRight size={15} className="text-base-content/40" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-base-content truncate max-w-[160px]">{fromName}</span>
            {showClassification && cls && (
              <>
                <ConfidenceBadge confidence={cls.confidence} />
                <CategoryBadge category={cls.category} />
                <SourceBadge source={cls.source} />
              </>
            )}
            <span className="text-xs text-base-content/40 ml-auto flex-none">{formatDateShort(email.date)}</span>
          </div>
          <div className="text-sm font-medium text-base-content mt-0.5 truncate">{email.subject}</div>
          {!expanded && (
            <div className="text-xs text-base-content/50 mt-0.5 truncate">{email.snippet}</div>
          )}
          {email.attachments.length > 0 && (
            <div className="flex items-center gap-1 mt-1">
              <Paperclip size={11} className="text-base-content/40" />
              <span className="text-xs text-base-content/40">{email.attachments.length} attachment{email.attachments.length > 1 ? 's' : ''}</span>
            </div>
          )}
          {/* Signals tooltip */}
          {showClassification && cls && cls.extractedSignals.length > 0 && !expanded && (
            <button
              onClick={e => { e.stopPropagation(); setShowSignals(s => !s); }}
              className="text-[10px] text-base-content/30 hover:text-base-content/60 mt-0.5 transition-colors"
            >
              {showSignals ? '▲ hide signals' : `▼ ${cls.extractedSignals.length} signal${cls.extractedSignals.length > 1 ? 's' : ''}`}
            </button>
          )}
          {showSignals && cls && (
            <div className="flex flex-wrap gap-1 mt-1" onClick={e => e.stopPropagation()}>
              {cls.extractedSignals.map((s, i) => (
                <span key={i} className="px-1.5 py-0.5 bg-base-300 rounded text-[10px] text-base-content/60">{s}</span>
              ))}
              {cls.reason && (
                <span className="text-[10px] text-base-content/40 w-full mt-0.5 italic">"{cls.reason}"</span>
              )}
            </div>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-base-300 bg-white">
          {/* Meta row */}
          <div className="px-4 py-2 bg-base-50 border-b border-base-200 text-xs text-base-content/60 space-y-0.5">
            <div><span className="font-medium">From:</span> {email.from}</div>
            {email.to && <div><span className="font-medium">To:</span> {email.to}</div>}
            {email.cc && <div><span className="font-medium">Cc:</span> {email.cc}</div>}
            {showClassification && cls && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-base-200 mt-1">
                <ConfidenceBadge confidence={cls.confidence} />
                <CategoryBadge category={cls.category} />
                <SourceBadge source={cls.source} />
                {cls.extractedSignals.map((s, i) => (
                  <span key={i} className="px-1.5 py-0.5 bg-base-200 rounded text-[10px] text-base-content/60">{s}</span>
                ))}
                {cls.reason && <span className="text-[10px] text-base-content/40 italic ml-1">"{cls.reason}"</span>}
              </div>
            )}
          </div>
          <div className="p-2">
            {email.bodyHtml ? (
              <iframe
                ref={iframeRef}
                srcDoc={`<!DOCTYPE html><html><head><base target="_blank"><style>body{font-family:Arial,sans-serif;font-size:13px;color:#333;padding:8px;margin:0;line-height:1.5}img{max-width:100%}</style></head><body>${email.bodyHtml}</body></html>`}
                sandbox="allow-same-origin allow-popups"
                style={{ width: '100%', height: `${iframeHeight}px`, border: 'none' }}
                title={email.subject}
              />
            ) : (
              <pre className="text-xs text-base-content/80 whitespace-pre-wrap font-sans p-2">{email.body}</pre>
            )}
          </div>
          {email.attachments.length > 0 && (
            <div className="px-4 pb-3 flex flex-wrap gap-2 border-t border-base-200 pt-2">
              {email.attachments.map((att, i) => (
                <a
                  key={i}
                  href={att.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-base-200 hover:bg-base-300 rounded-lg text-xs transition-colors max-w-[220px]"
                >
                  {getFileIcon(att.contentType)}
                  <span className="truncate">{att.filename}</span>
                  <span className="text-base-content/40 flex-none">{formatFileSize(att.size)}</span>
                  <Download size={11} className="flex-none text-base-content/40" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Thread Group ─────────────────────────────────────────────────────────────
function ThreadGroup({ emails, showClassification }: { emails: PropertyEmail[]; showClassification: boolean }) {
  const [expanded, setExpanded] = useState(true);
  if (emails.length === 1) return <EmailRow email={emails[0]} showClassification={showClassification} />;

  const latest = emails[0];
  const fromName = latest.from.replace(/<.*>/, '').trim() || latest.from;

  return (
    <div className="border border-primary/20 rounded-xl overflow-hidden bg-primary/5">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-primary/10 transition-colors text-left"
      >
        {expanded ? <ChevronDown size={14} className="text-primary" /> : <ChevronRight size={14} className="text-primary" />}
        <MessageSquare size={13} className="text-primary flex-none" />
        <span className="text-xs font-semibold text-primary truncate flex-1">
          Thread: {latest.subject.replace(/^(re|fwd|fw):\s*/i, '')}
        </span>
        <span className="text-xs text-primary/60 flex-none">{emails.length} messages</span>
        <span className="text-xs text-base-content/40 flex-none ml-2">{formatDateShort(latest.date)}</span>
      </button>
      {expanded && (
        <div className="border-t border-primary/10 divide-y divide-base-200">
          {emails.map(e => (
            <div key={e.id} className="bg-base-100">
              <EmailRow email={e} showClassification={showClassification} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────
export const PropertyEmailModal: React.FC<PropertyEmailModalProps> = ({
  addresses, label, onClose, dealContext,
}) => {
  const [activeTab, setActiveTab]           = useState<'emails' | 'attachments'>('emails');
  const [emails, setEmails]                 = useState<PropertyEmail[]>([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState<string | null>(null);
  const [search, setSearch]                 = useState('');
  const [highConfOnly, setHighConfOnly]     = useState(false);
  const [showClassification, setShowCls]   = useState(true);
  const [stats, setStats]                   = useState<Stats | null>(null);
  const [groupByThread, setGroupByThread]   = useState(true);

  const useClassifier = !!(dealContext);

  useEffect(() => {
    const fetchEmails = async () => {
      setLoading(true);
      setError(null);
      try {
        if (useClassifier && dealContext) {
          // Use smart classifier endpoint
          const params = new URLSearchParams({
            addresses: JSON.stringify(addresses),
            ...(dealContext.dealId          && { dealId:          dealContext.dealId }),
            ...(dealContext.mlsNumber       && { mlsNumber:       dealContext.mlsNumber }),
            ...(dealContext.clientNames     && { clientNames:     JSON.stringify(dealContext.clientNames) }),
            ...(dealContext.participantEmails && { participantEmails: JSON.stringify(dealContext.participantEmails) }),
            ...(dealContext.linkedThreadIds && { linkedThreadIds: JSON.stringify(dealContext.linkedThreadIds) }),
          });
          const res = await fetch(`/api/email/search-classify?${params}`);
          if (!res.ok) throw new Error(`Server error: ${res.status}`);
          const data = await res.json();
          setEmails(data.emails || []);
          setStats(data.stats || null);
        } else {
          // Fallback: simple search
          const param = encodeURIComponent(JSON.stringify(addresses));
          const res = await fetch(`/api/email/search?addresses=${param}`);
          if (!res.ok) throw new Error(`Server error: ${res.status}`);
          const data = await res.json();
          setEmails(data.emails || []);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load emails');
      } finally {
        setLoading(false);
      }
    };
    fetchEmails();
  }, [addresses.join(',')]);

  // Filter emails
  const filtered = emails.filter(e => {
    const matchesSearch = !search || (
      e.subject.toLowerCase().includes(search.toLowerCase()) ||
      e.from.toLowerCase().includes(search.toLowerCase()) ||
      e.snippet.toLowerCase().includes(search.toLowerCase())
    );
    const matchesConf = !highConfOnly || !e.classification || e.classification.confidence >= 0.80;
    return matchesSearch && matchesConf;
  });

  // Group by thread
  const threadGroups: PropertyEmail[][] = (() => {
    if (!groupByThread) return filtered.map(e => [e]);
    const map = new Map<string, PropertyEmail[]>();
    for (const e of filtered) {
      const key = e.threadGroupId || e.id;
      const grp = map.get(key) || [];
      grp.push(e);
      map.set(key, grp);
    }
    return Array.from(map.values()).sort((a, b) =>
      Number(b[0].internalDate) - Number(a[0].internalDate)
    );
  })();

  // All attachments
  const allAttachments = emails.flatMap(e =>
    e.attachments.map(a => ({ ...a, emailSubject: e.subject, emailFrom: e.from, emailDate: e.date }))
  );
  const filteredAttachments = search
    ? allAttachments.filter(a =>
        a.filename.toLowerCase().includes(search.toLowerCase()) ||
        a.emailSubject.toLowerCase().includes(search.toLowerCase())
      )
    : allAttachments;

  const hasClassifications = emails.some(e => e.classification);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden border border-base-300">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-primary to-primary/80 text-primary-content flex-none">
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center flex-none">
            <Mail size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-base leading-tight">Property Email History</div>
            <div className="text-xs opacity-80 truncate">{label}</div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm btn-square text-primary-content hover:bg-white/20">
            <X size={18} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex-none border-b border-base-300 bg-base-200/50 px-4 pt-3 pb-0">
          {/* Search */}
          <div className="relative mb-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" />
            <input
              type="text"
              placeholder="Search emails or attachments…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input input-sm input-bordered w-full pl-8 text-sm rounded-xl"
            />
          </div>

          {/* Filter controls */}
          {hasClassifications && !loading && (
            <div className="flex items-center gap-3 mb-2 text-xs flex-wrap">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <div
                  onClick={() => setHighConfOnly(v => !v)}
                  className={`relative w-8 h-4 rounded-full transition-colors ${highConfOnly ? 'bg-primary' : 'bg-base-300'}`}
                  style={{ borderRadius: 3 }}
                >
                  <div className={`absolute top-0.5 w-3 h-3 bg-white rounded transition-all ${highConfOnly ? 'left-4.5' : 'left-0.5'}`}
                    style={{ borderRadius: 2, left: highConfOnly ? 18 : 2 }} />
                </div>
                <span className={highConfOnly ? 'text-primary font-medium' : 'text-base-content/50'}>High confidence only (≥80%)</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <div
                  onClick={() => setGroupByThread(v => !v)}
                  className={`relative w-8 h-4 rounded-full transition-colors ${groupByThread ? 'bg-primary' : 'bg-base-300'}`}
                  style={{ borderRadius: 3 }}
                >
                  <div className={`absolute top-0.5 w-3 h-3 bg-white rounded transition-all`}
                    style={{ borderRadius: 2, left: groupByThread ? 18 : 2 }} />
                </div>
                <span className={groupByThread ? 'text-primary font-medium' : 'text-base-content/50'}>Group threads</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <div
                  onClick={() => setShowCls(v => !v)}
                  className={`relative w-8 h-4 rounded-full transition-colors ${showClassification ? 'bg-primary' : 'bg-base-300'}`}
                  style={{ borderRadius: 3 }}
                >
                  <div className={`absolute top-0.5 w-3 h-3 bg-white rounded transition-all`}
                    style={{ borderRadius: 2, left: showClassification ? 18 : 2 }} />
                </div>
                <span className={showClassification ? 'text-primary font-medium' : 'text-base-content/50'}>Show badges</span>
              </label>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('emails')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 ${
                activeTab === 'emails'
                  ? 'border-primary text-primary bg-base-100'
                  : 'border-transparent text-base-content/50 hover:text-base-content'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Mail size={13} />
                Emails
                {!loading && (
                  <span className={`badge badge-xs ${activeTab === 'emails' ? 'badge-primary' : 'badge-ghost'}`}>
                    {filtered.length}
                  </span>
                )}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('attachments')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 ${
                activeTab === 'attachments'
                  ? 'border-primary text-primary bg-base-100'
                  : 'border-transparent text-base-content/50 hover:text-base-content'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Paperclip size={13} />
                Attachments
                {!loading && allAttachments.length > 0 && (
                  <span className={`badge badge-xs ${activeTab === 'attachments' ? 'badge-primary' : 'badge-ghost'}`}>
                    {filteredAttachments.length}
                  </span>
                )}
              </span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
              <Loader2 size={28} className="animate-spin text-primary" />
              <div className="text-sm text-base-content/60">
                {useClassifier
                  ? <>Searching Gmail + running AI classifier for <strong>"{label}"</strong>…</>
                  : <>Searching Gmail for <strong>"{label}"</strong>…</>}
              </div>
              {useClassifier && (
                <div className="text-xs text-base-content/40 flex items-center gap-1">
                  <Cpu size={11} /> 3-layer filter: rules → scoring → AI gray zone
                </div>
              )}
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
              <AlertCircle size={28} className="text-error" />
              <div className="text-sm text-error">{error}</div>
              <button className="btn btn-sm btn-outline btn-error" onClick={() => window.location.reload()}>
                Retry
              </button>
            </div>
          )}

          {!loading && !error && activeTab === 'emails' && (
            filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 py-16 text-center">
                <Inbox size={32} className="text-base-content/20" />
                <div>
                  <div className="font-medium text-base-content/60">No emails found</div>
                  <div className="text-xs text-base-content/40 mt-1">
                    {highConfOnly
                      ? 'Try turning off "High confidence only" to see more results'
                      : `No Gmail messages matched: ${addresses.join(', ')}`}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {threadGroups.map((group, i) => (
                  <ThreadGroup key={i} emails={group} showClassification={showClassification} />
                ))}
              </div>
            )
          )}

          {!loading && !error && activeTab === 'attachments' && (
            filteredAttachments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 py-16 text-center">
                <Paperclip size={32} className="text-base-content/20" />
                <div>
                  <div className="font-medium text-base-content/60">No attachments found</div>
                  <div className="text-xs text-base-content/40 mt-1">
                    None of the matching emails have file attachments
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredAttachments.map((att, i) => (
                  <a
                    key={i}
                    href={att.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 border border-base-300 rounded-xl hover:bg-base-200 hover:border-primary/30 transition-all group"
                  >
                    <div className="w-10 h-10 bg-base-200 group-hover:bg-base-300 rounded-lg flex items-center justify-center flex-none transition-colors">
                      {getFileIcon(att.contentType)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{att.filename}</div>
                      <div className="text-xs text-base-content/40 truncate mt-0.5">{att.emailSubject}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-base-content/40">{formatFileSize(att.size)}</span>
                        <span className="text-xs text-base-content/30">•</span>
                        <span className="text-xs text-base-content/40">{formatDate(att.emailDate)}</span>
                      </div>
                    </div>
                    <Download size={14} className="text-base-content/30 group-hover:text-primary flex-none transition-colors" />
                  </a>
                ))}
              </div>
            )
          )}
        </div>

        {/* Footer */}
        {!loading && !error && (
          <div className="flex-none border-t border-base-300 px-4 py-2 bg-base-200/30 flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs text-base-content/40">
              {filtered.length} email{filtered.length !== 1 ? 's' : ''} · {allAttachments.length} attachment{allAttachments.length !== 1 ? 's' : ''}
            </span>
            {stats && (
              <div className="flex items-center gap-2 text-[10px] text-base-content/40">
                <span className="flex items-center gap-0.5"><Shield size={9} className="text-sky-500" /> {stats.hardAccepted} rule</span>
                <span className="flex items-center gap-0.5"><Cpu size={9} className="text-violet-500" /> {stats.aiAccepted} AI</span>
                <span>/ {stats.totalScanned} scanned</span>
              </div>
            )}
            <span className="text-xs text-base-content/30 truncate max-w-[200px]">{addresses.join(', ')}</span>
          </div>
        )}
      </div>
    </div>
  );
};
