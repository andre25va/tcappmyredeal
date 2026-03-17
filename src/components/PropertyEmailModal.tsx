import React, { useState, useEffect, useRef } from 'react';
import {
  X, Mail, Paperclip, ChevronDown, ChevronRight,
  Download, FileText, Image, Film, File, Loader2,
  AlertCircle, Inbox, Search,
} from 'lucide-react';

interface Attachment {
  filename: string;
  contentType: string;
  size: number;
  downloadUrl: string;
}

interface PropertyEmail {
  id: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  internalDate: string;
  snippet: string;
  bodyHtml: string;
  body: string;
  attachments: Attachment[];
}

interface PropertyEmailModalProps {
  addresses: string[];
  label: string;
  onClose: () => void;
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function getFileIcon(contentType: string) {
  if (contentType.startsWith('image/')) return <Image size={18} className="text-blue-400" />;
  if (contentType.startsWith('video/')) return <Film size={18} className="text-purple-400" />;
  if (contentType.includes('pdf')) return <FileText size={18} className="text-red-400" />;
  if (contentType.includes('word') || contentType.includes('document')) return <FileText size={18} className="text-blue-500" />;
  if (contentType.includes('sheet') || contentType.includes('excel')) return <FileText size={18} className="text-green-500" />;
  return <File size={18} className="text-base-content/50" />;
}

function EmailRow({ email }: { email: PropertyEmail }) {
  const [expanded, setExpanded] = useState(false);
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

  return (
    <div className="border border-base-300 rounded-xl overflow-hidden">
      {/* Email header row - always visible */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-start gap-3 p-3 hover:bg-base-200 transition-colors text-left"
      >
        <div className="flex-none mt-0.5">
          {expanded
            ? <ChevronDown size={15} className="text-primary" />
            : <ChevronRight size={15} className="text-base-content/40" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-base-content truncate max-w-[200px]">{fromName}</span>
            <span className="text-xs text-base-content/40 ml-auto flex-none">{formatDate(email.date)}</span>
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
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-base-300 bg-white">
          {/* To/From info */}
          <div className="px-4 py-2 bg-base-50 border-b border-base-200 text-xs text-base-content/60 space-y-0.5">
            <div><span className="font-medium">From:</span> {email.from}</div>
            {email.to && <div><span className="font-medium">To:</span> {email.to}</div>}
          </div>

          {/* Body */}
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

          {/* Inline attachments */}
          {email.attachments.length > 0 && (
            <div className="px-4 pb-3 flex flex-wrap gap-2 border-t border-base-200 pt-2">
              {email.attachments.map((att, i) => (
                <a
                  key={i}
                  href={att.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-base-200 hover:bg-base-300 rounded-lg text-xs transition-colors max-w-[200px]"
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

export const PropertyEmailModal: React.FC<PropertyEmailModalProps> = ({ addresses, label, onClose }) => {
  const [activeTab, setActiveTab] = useState<'emails' | 'attachments'>('emails');
  const [emails, setEmails] = useState<PropertyEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchEmails = async () => {
      setLoading(true);
      setError(null);
      try {
        const param = encodeURIComponent(JSON.stringify(addresses));
        const res = await fetch(`/api/email/search?addresses=${param}`);
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        const data = await res.json();
        setEmails(data.emails || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load emails');
      } finally {
        setLoading(false);
      }
    };
    fetchEmails();
  }, [addresses.join(',')]);

  // Collect all attachments across all emails
  const allAttachments = emails.flatMap(e =>
    e.attachments.map(a => ({ ...a, emailSubject: e.subject, emailFrom: e.from, emailDate: e.date }))
  );

  const filteredEmails = search
    ? emails.filter(e =>
        e.subject.toLowerCase().includes(search.toLowerCase()) ||
        e.from.toLowerCase().includes(search.toLowerCase()) ||
        e.snippet.toLowerCase().includes(search.toLowerCase())
      )
    : emails;

  const filteredAttachments = search
    ? allAttachments.filter(a =>
        a.filename.toLowerCase().includes(search.toLowerCase()) ||
        a.emailSubject.toLowerCase().includes(search.toLowerCase())
      )
    : allAttachments;

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

        {/* Search + Tabs */}
        <div className="flex-none border-b border-base-300 bg-base-200/50 px-4 pt-3 pb-0">
          {/* Search bar */}
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" />
            <input
              type="text"
              placeholder="Search emails or attachments..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input input-sm input-bordered w-full pl-8 text-sm rounded-xl"
            />
          </div>
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
                    {filteredEmails.length}
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
              <div className="text-sm text-base-content/60">Searching Gmail for "{label}"…</div>
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
            filteredEmails.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 py-16 text-center">
                <Inbox size={32} className="text-base-content/20" />
                <div>
                  <div className="font-medium text-base-content/60">No emails found</div>
                  <div className="text-xs text-base-content/40 mt-1">
                    No Gmail messages matched: {addresses.join(', ')}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredEmails.map(email => (
                  <EmailRow key={email.id} email={email} />
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
          <div className="flex-none border-t border-base-300 px-4 py-2.5 bg-base-200/30 flex items-center justify-between">
            <span className="text-xs text-base-content/40">
              {emails.length} email{emails.length !== 1 ? 's' : ''} · {allAttachments.length} attachment{allAttachments.length !== 1 ? 's' : ''} found
            </span>
            <span className="text-xs text-base-content/30">Searched: {addresses.join(', ')}</span>
          </div>
        )}
      </div>
    </div>
  );
};
