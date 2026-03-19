import React from 'react';
import { X, Check, Trash2, ExternalLink, AlertCircle, Search, Pencil } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface StateLicenseLink {
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

// ── LicenseLinksTab ───────────────────────────────────────────────────────────

export function LicenseLinksTab() {
  const [states, setStates] = React.useState<StateLicenseLink[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [activeState, setActiveState] = React.useState<StateLicenseLink | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const token = localStorage.getItem('tc_session') || '';

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
      setActiveState(prev => prev?.state_code === stateCode
        ? { ...prev, lookup_url: url, updated_at: new Date().toISOString() }
        : prev
      );
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

      {/* States table */}
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
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-bold text-xs text-black">{s.state_code}</span>
                      <span className="text-[11px] text-black/40">{s.state_name}</span>
                    </div>
                  </td>
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
