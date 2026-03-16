import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Search, RefreshCw, Shield, User, FileText, MessageSquare, Briefcase, Settings, Clock } from 'lucide-react';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

interface AuditEntry {
  id: string;
  user_name: string;
  user_phone: string;
  action: string;
  entity_type: string;
  entity_id: string;
  entity_name: string;
  old_data: any;
  new_data: any;
  metadata: any;
  ip_address: string;
  created_at: string;
}

const ACTION_COLORS: Record<string, string> = {
  create: 'badge-success',
  update: 'badge-info',
  delete: 'badge-error',
  view: 'badge-ghost',
  send: 'badge-primary',
  login: 'badge-warning',
  logout: 'badge-warning',
  navigate: 'badge-ghost',
  upload: 'badge-success',
  download: 'badge-info',
  approve: 'badge-success',
  reject: 'badge-error',
  complete: 'badge-success',
};

const ENTITY_ICONS: Record<string, React.ReactNode> = {
  deal: <Briefcase size={13} />,
  contact: <User size={13} />,
  document: <FileText size={13} />,
  email: <MessageSquare size={13} />,
  sms: <MessageSquare size={13} />,
  whatsapp: <MessageSquare size={13} />,
  comm_task: <Clock size={13} />,
  user: <User size={13} />,
  settings: <Settings size={13} />,
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function AuditLogView() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PER_PAGE = 50;

  const load = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .range(page * PER_PAGE, (page + 1) * PER_PAGE - 1);

      if (actionFilter !== 'all') q = q.eq('action', actionFilter);
      if (entityFilter !== 'all') q = q.eq('entity_type', entityFilter);

      const { data } = await q;
      setEntries(data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [actionFilter, entityFilter, page]);

  const filtered = entries.filter(e => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (e.user_name || '').toLowerCase().includes(s) ||
      (e.action || '').toLowerCase().includes(s) ||
      (e.entity_type || '').toLowerCase().includes(s) ||
      (e.entity_name || '').toLowerCase().includes(s) ||
      (e.ip_address || '').includes(s)
    );
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-base-300 bg-base-100 flex-none">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-primary" />
          <h2 className="font-semibold text-base-content">Audit Log</h2>
          <span className="badge badge-ghost badge-sm">{filtered.length} entries</span>
        </div>
        <button onClick={load} className="btn btn-ghost btn-xs gap-1">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 px-4 py-3 border-b border-base-300 bg-base-50 flex-none">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40" />
          <input
            type="text"
            placeholder="Search user, action, entity..."
            className="input input-bordered input-sm w-full pl-8"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="select select-bordered select-sm"
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
        >
          <option value="all">All actions</option>
          {['create','update','delete','send','login','logout','navigate','upload','download','view','complete'].map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select
          className="select select-bordered select-sm"
          value={entityFilter}
          onChange={e => setEntityFilter(e.target.value)}
        >
          <option value="all">All types</option>
          {['deal','contact','task','document','email','sms','whatsapp','comm_task','template','compliance','user','settings'].map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Log entries */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex justify-center py-12">
            <span className="loading loading-spinner loading-md text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-base-content/30 gap-2">
            <Shield size={40} />
            <p className="text-sm">No audit entries found</p>
          </div>
        ) : (
          <table className="table table-sm w-full">
            <thead className="sticky top-0 bg-base-100 z-10">
              <tr className="text-xs text-base-content/50">
                <th className="w-32">Time</th>
                <th className="w-28">User</th>
                <th className="w-24">Action</th>
                <th className="w-24">Type</th>
                <th>Entity</th>
                <th className="w-28">IP</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(entry => (
                <React.Fragment key={entry.id}>
                  <tr
                    className="hover cursor-pointer text-sm"
                    onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                  >
                    <td className="text-xs text-base-content/50 whitespace-nowrap">
                      {timeAgo(entry.created_at)}
                    </td>
                    <td>
                      <span className="font-medium truncate max-w-[100px] block">
                        {entry.user_name || entry.user_phone || '—'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-sm ${ACTION_COLORS[entry.action] || 'badge-ghost'}`}>
                        {entry.action}
                      </span>
                    </td>
                    <td>
                      <span className="flex items-center gap-1 text-xs text-base-content/60">
                        {ENTITY_ICONS[entry.entity_type]}
                        {entry.entity_type || '—'}
                      </span>
                    </td>
                    <td className="text-xs text-base-content/70 truncate max-w-[180px]">
                      {entry.entity_name || entry.entity_id || '—'}
                    </td>
                    <td className="text-xs text-base-content/40 font-mono">{entry.ip_address || '—'}</td>
                    <td className="text-xs text-base-content/30">
                      {(entry.old_data || entry.new_data) ? '▸' : ''}
                    </td>
                  </tr>
                  {expanded === entry.id && (
                    <tr className="bg-base-200">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                          {entry.old_data && (
                            <div>
                              <div className="font-sans font-semibold text-base-content/60 mb-1">Before</div>
                              <pre className="bg-base-300 rounded p-2 overflow-auto max-h-32 text-base-content/70">
                                {JSON.stringify(entry.old_data, null, 2)}
                              </pre>
                            </div>
                          )}
                          {entry.new_data && (
                            <div>
                              <div className="font-sans font-semibold text-base-content/60 mb-1">After</div>
                              <pre className="bg-base-300 rounded p-2 overflow-auto max-h-32 text-base-content/70">
                                {JSON.stringify(entry.new_data, null, 2)}
                              </pre>
                            </div>
                          )}
                          {entry.metadata && (
                            <div className="md:col-span-2">
                              <div className="font-sans font-semibold text-base-content/60 mb-1">Metadata</div>
                              <pre className="bg-base-300 rounded p-2 overflow-auto max-h-24 text-base-content/70">
                                {JSON.stringify(entry.metadata, null, 2)}
                              </pre>
                            </div>
                          )}
                          <div className="md:col-span-2 font-sans text-base-content/40">
                            ID: {entry.id} · {new Date(entry.created_at).toLocaleString()}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-base-300 flex-none bg-base-100">
        <button
          className="btn btn-xs btn-ghost"
          disabled={page === 0}
          onClick={() => setPage(p => p - 1)}
        >← Prev</button>
        <span className="text-xs text-base-content/40">Page {page + 1}</span>
        <button
          className="btn btn-xs btn-ghost"
          disabled={filtered.length < PER_PAGE}
          onClick={() => setPage(p => p + 1)}
        >Next →</button>
      </div>
    </div>
  );
}
