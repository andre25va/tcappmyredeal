import React, { useState, useEffect, useCallback } from 'react';
import { X, Eye, Mail, Search, RefreshCw, ArrowLeft } from 'lucide-react';
import { fetchEmailLog } from '../utils/supabase';
import { EmailLogEntry } from '../types';

interface Props {
  onClose: () => void;
}

export const SentHistoryModal: React.FC<Props> = ({ onClose }) => {
  const [emails, setEmails] = useState<EmailLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'deal' | 'system'>('all');
  const [preview, setPreview] = useState<EmailLogEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchEmailLog();
      setEmails(data);
    } catch (err) {
      console.error('Failed to load email history:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = emails.filter(e => {
    if (filter === 'deal' && !e.address) return false;
    if (filter === 'system' && e.sent_by !== 'system') return false;
    if (search) {
      const q = search.toLowerCase();
      const toStr = Array.isArray(e.to_addresses) ? e.to_addresses.join(' ') : '';
      return (
        (e.subject?.toLowerCase().includes(q)) ||
        (e.template_name?.toLowerCase().includes(q)) ||
        (e.address?.toLowerCase().includes(q)) ||
        toStr.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const formatDate = (d: string) => {
    const dt = new Date(d);
    return (
      dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' · ' +
      dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    );
  };

  const getToLabel = (entry: EmailLogEntry) => {
    const addrs = Array.isArray(entry.to_addresses) ? entry.to_addresses : [];
    if (addrs.length === 0) return '—';
    if (addrs.length === 1) return addrs[0];
    return `${addrs[0]} +${addrs.length - 1} more`;
  };

  const getSentByBadge = (entry: EmailLogEntry) => {
    if (entry.sent_by === 'system') return <span className="badge badge-ghost badge-xs">System</span>;
    if (entry.sent_by === 'system-test') return <span className="badge badge-warning badge-xs">Test</span>;
    return null;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-base-300 bg-base-200 shrink-0">
          <Mail size={18} className="text-primary" />
          <div className="flex-1">
            <h2 className="text-sm font-bold text-base-content">Sent History</h2>
            <p className="text-xs text-base-content/50">
              {loading ? 'Loading…' : `${emails.length} emails sent · all accounts`}
            </p>
          </div>
          {!preview && (
            <button
              className="btn btn-ghost btn-sm btn-circle opacity-60 hover:opacity-100"
              onClick={load}
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          )}
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Preview mode */}
        {preview ? (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-base-300 bg-base-100 shrink-0">
              <button
                className="btn btn-ghost btn-sm gap-1.5"
                onClick={() => setPreview(null)}
              >
                <ArrowLeft size={14} />
                Back
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate text-base-content">{preview.subject}</p>
                <p className="text-xs text-base-content/50">
                  {formatDate(preview.sent_at)} &nbsp;·&nbsp; To: {getToLabel(preview)}
                  {preview.address && <> &nbsp;·&nbsp; <span className="text-primary/70">{preview.address}</span></>}
                </p>
              </div>
            </div>
            <div className="flex-1 overflow-hidden bg-white">
              {preview.body_html ? (
                <iframe
                  srcDoc={preview.body_html}
                  className="w-full h-full border-0"
                  sandbox="allow-same-origin"
                  title="Email Preview"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-base-content/40 text-sm">
                  No HTML body stored for this email.
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Search + Filter bar */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-base-300 shrink-0 flex-wrap">
              <label className="input input-bordered input-sm flex items-center gap-2 flex-1 min-w-[200px]">
                <Search className="h-[1em] opacity-40" />
                <input
                  type="search"
                  className="grow text-sm"
                  placeholder="Search subject, address, recipient…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </label>
              <div className="flex gap-1">
                {(['all', 'deal', 'system'] as const).map(f => (
                  <button
                    key={f}
                    className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setFilter(f)}
                  >
                    {f === 'all' ? 'All' : f === 'deal' ? 'Deal Emails' : 'System'}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-40 gap-3">
                  <span className="loading loading-spinner loading-sm text-primary" />
                  <span className="text-sm text-base-content/50">Loading email history…</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2 text-base-content/40">
                  <Mail size={28} className="opacity-30" />
                  <span className="text-sm">No emails found</span>
                </div>
              ) : (
                <table className="table table-sm w-full">
                  <thead className="sticky top-0 bg-base-200 z-10 text-xs">
                    <tr>
                      <th className="text-xs font-semibold">Date</th>
                      <th className="text-xs font-semibold">Subject</th>
                      <th className="text-xs font-semibold">Template</th>
                      <th className="text-xs font-semibold">To</th>
                      <th className="text-xs font-semibold">Deal</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(email => (
                      <tr
                        key={email.id}
                        className="hover cursor-pointer"
                        onClick={() => setPreview(email)}
                      >
                        <td className="text-xs text-base-content/60 whitespace-nowrap">
                          {formatDate(email.sent_at)}
                          <div className="mt-0.5">{getSentByBadge(email)}</div>
                        </td>
                        <td className="text-xs max-w-[200px]">
                          <span className="line-clamp-2">{email.subject}</span>
                        </td>
                        <td className="text-xs text-base-content/60 max-w-[140px] truncate">
                          {email.template_name ?? <span className="text-base-content/25">—</span>}
                        </td>
                        <td className="text-xs text-base-content/60 max-w-[150px] truncate">
                          {getToLabel(email)}
                        </td>
                        <td className="text-xs text-base-content/60 max-w-[100px] truncate">
                          {email.address ?? <span className="text-base-content/25">—</span>}
                        </td>
                        <td>
                          <button
                            className="btn btn-ghost btn-xs btn-circle opacity-50 hover:opacity-100"
                            onClick={ev => { ev.stopPropagation(); setPreview(email); }}
                            title="Preview email"
                          >
                            <Eye size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-2 border-t border-base-300 bg-base-200 shrink-0">
              <span className="text-xs text-base-content/40">
                Showing {filtered.length} of {emails.length} emails · most recent first
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
