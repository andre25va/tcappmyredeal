import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Search, Shield, Tag, X, Copy, Check, Mail } from 'lucide-react';
import { Deal } from './types';
import { fetchDeals } from './utils/supabase';
import { StatsBar } from './components/StatsBar';
import { DealTable } from './components/DealTable';
import { SentHistoryModal } from './components/SentHistoryModal';

const REFRESH_INTERVAL_MS = 60_000;

// ─── Merge Tag Reference Data ────────────────────────────────────────────────
const MERGE_TAG_GROUPS = [
  {
    label: '🏠 Property',
    color: 'badge-primary',
    tags: [
      { tag: '{{address}}', desc: 'Property street address', example: '123 Main St' },
      { tag: '{{city}}', desc: 'City', example: 'Kansas City' },
      { tag: '{{state}}', desc: 'State', example: 'KS' },
      { tag: '{{zipCode}}', desc: 'Zip code', example: '66112' },
      { tag: '{{mlsNumber}}', desc: 'MLS number', example: 'MLS-2024-8841' },
    ],
  },
  {
    label: '💰 Contract & Pricing',
    color: 'badge-success',
    tags: [
      { tag: '{{contractPrice}}', desc: 'Contract price (formatted)', example: '$425,000' },
      { tag: '{{listPrice}}', desc: 'List price (formatted)', example: '$435,000' },
      { tag: '{{contractDate}}', desc: 'Contract date', example: 'March 15, 2026' },
      { tag: '{{closingDate}}', desc: 'Closing date', example: 'April 15, 2026' },
    ],
  },
  {
    label: '📅 Key Dates & Deadlines',
    color: 'badge-warning',
    tags: [
      { tag: '{{inspectionDeadline}}', desc: 'Inspection deadline (contract date + period days)', example: 'March 22, 2026' },
      { tag: '{{inspectionPeriodDays}}', desc: 'Number of inspection period business days', example: '7' },
      { tag: '{{inspectionDate}}', desc: 'Scheduled inspection date', example: 'March 20, 2026' },
      { tag: '{{emDate}}', desc: 'Earnest money deadline date', example: 'March 18, 2026' },
      { tag: '{{loanDate}}', desc: 'Loan commitment date', example: 'April 1, 2026' },
      { tag: '{{titleDate}}', desc: 'Title commitment date', example: 'April 5, 2026' },
      { tag: '{{possessionDate}}', desc: 'Possession / move-in date', example: 'April 15, 2026' },
    ],
  },
  {
    label: '👤 Agent & Client',
    color: 'badge-info',
    tags: [
      { tag: '{{agentName}}', desc: 'Representing agent full name', example: 'Jose Aguilar' },
      { tag: '{{agentPhone}}', desc: 'Representing agent phone number', example: '(816) 555-0100' },
      { tag: '{{agentEmail}}', desc: 'Representing agent email address', example: 'jose@aguilargroup.com' },
      { tag: '{{clientName}}', desc: 'Client name (buyer or seller we represent)', example: 'John & Jane Smith' },
      { tag: '{{milestone}}', desc: 'Current milestone / transaction status', example: 'Under Contract' },
      { tag: '{{tcTeamSignature}}', desc: 'TC closing signature block', example: 'TC Team for Jose Aguilar' },
    ],
  },
  {
    label: '📋 Auto-Populated Blocks',
    color: 'badge-secondary',
    tags: [
      { tag: '{{buyersSide}}', desc: 'Full buyers side block (buyers, agent, attorney, title)', example: '• Buyers — John & Jane Smith\n• Buyers Agent — Maggie Sanchez, KW' },
      { tag: '{{sellersSide}}', desc: 'Full sellers side block (sellers, agent, attorney, title)', example: '• Sellers — Robert Brown\n• Sellers Agent — John Smith, RE/MAX' },
      { tag: '{{agents}}', desc: 'Auto-populated agent info block', example: 'See agent contact details' },
      { tag: '{{contacts}}', desc: 'Full contact list for the transaction', example: 'All participants listed' },
      { tag: '{{pendingDocs}}', desc: 'Pending document requests', example: 'List of outstanding docs' },
      { tag: '{{reminders}}', desc: 'Upcoming reminders and key dates', example: 'Inspection due March 22' },
    ],
  },
];

// ─── Merge Tags Modal ─────────────────────────────────────────────────────────
const MergeTagsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  const handleCopy = (tag: string) => {
    navigator.clipboard.writeText(tag).catch(() => {});
    setCopied(tag);
    setTimeout(() => setCopied(null), 1500);
  };

  const filtered = MERGE_TAG_GROUPS.map(group => ({
    ...group,
    tags: group.tags.filter(
      t =>
        !search ||
        t.tag.toLowerCase().includes(search.toLowerCase()) ||
        t.desc.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter(g => g.tags.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-base-300 bg-base-200 shrink-0">
          <Tag size={18} className="text-primary" />
          <div className="flex-1">
            <h2 className="text-sm font-bold text-base-content">Merge Tag Reference</h2>
            <p className="text-xs text-base-content/50">Click any tag to copy it to your clipboard</p>
          </div>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-base-300 shrink-0">
          <label className="input input-bordered input-sm flex items-center gap-2 w-full">
            <Search className="h-[1em] opacity-40" />
            <input
              type="search"
              className="grow text-sm"
              placeholder="Search tags or descriptions…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
          </label>
        </div>

        {/* Group tabs (hidden when searching) */}
        {!search && (
          <div className="flex gap-1 px-5 py-2 overflow-x-auto shrink-0 border-b border-base-300">
            <button
              className={`btn btn-xs rounded-full ${activeGroup === null ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveGroup(null)}
            >
              All
            </button>
            {MERGE_TAG_GROUPS.map(g => (
              <button
                key={g.label}
                className={`btn btn-xs rounded-full whitespace-nowrap ${activeGroup === g.label ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setActiveGroup(prev => prev === g.label ? null : g.label)}
              >
                {g.label}
              </button>
            ))}
          </div>
        )}

        {/* Tags list */}
        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-5">
          {filtered
            .filter(g => !activeGroup || g.label === activeGroup)
            .map(group => (
              <div key={group.label}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-base-content/70">{group.label}</span>
                  <div className="flex-1 border-t border-base-300" />
                </div>
                <div className="space-y-1">
                  {group.tags.map(({ tag, desc, example }) => (
                    <button
                      key={tag}
                      onClick={() => handleCopy(tag)}
                      className="w-full flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-base-200 transition-colors group text-left"
                    >
                      <code className="font-mono text-xs bg-primary/10 text-primary px-2 py-0.5 rounded shrink-0 mt-0.5 border border-primary/20">
                        {tag}
                      </code>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-base-content font-medium leading-tight">{desc}</p>
                        <p className="text-xs text-base-content/40 mt-0.5 truncate">e.g. {example}</p>
                      </div>
                      <div className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {copied === tag ? (
                          <Check size={13} className="text-success" />
                        ) : (
                          <Copy size={13} className="text-base-content/40" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}

          {filtered.length === 0 && (
            <div className="text-center py-8 text-base-content/40 text-sm">
              No tags match "{search}"
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-base-300 bg-base-200 shrink-0 flex items-center justify-between">
          <span className="text-xs text-base-content/40">
            {MERGE_TAG_GROUPS.reduce((sum, g) => sum + g.tags.length, 0)} tags available
          </span>
          <span className="text-xs text-base-content/30">Used in email templates · Settings → Email Templates</span>
        </div>
      </div>
    </div>
  );
};

// ─── Main App ─────────────────────────────────────────────────────────────────
const App: React.FC = () => {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [search, setSearch] = useState('');
  const [showMergeTags, setShowMergeTags] = useState(false);
  const [showSentHistory, setShowSentHistory] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDeals();
      setDeals(data);
      setLastSynced(new Date());
    } catch (err) {
      console.error('Failed to load deals:', err);
      setError('Could not connect to database. Check your Supabase connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div className="flex flex-col h-screen bg-base-100 overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-base-100 border-b border-base-300">
        <Shield size={16} className="text-primary opacity-60" />
        <span className="text-xs text-base-content/50 font-medium tracking-wide uppercase">
          Safety Log · Live from Database
        </span>
        <div className="flex-1" />
        {/* Sent History button */}
        <button
          className="btn btn-ghost btn-sm gap-1.5 text-xs text-base-content/60 hover:text-primary"
          onClick={() => setShowSentHistory(true)}
        >
          <Mail size={13} />
          Sent History
        </button>
        {/* Merge Tags button */}
        <button
          className="btn btn-ghost btn-sm gap-1.5 text-xs text-base-content/60 hover:text-primary"
          onClick={() => setShowMergeTags(true)}
        >
          <Tag size={13} />
          Merge Tags
        </button>
        <label className="input input-bordered input-sm flex items-center gap-2 w-56">
          <Search className="h-[1em] opacity-40" />
          <input
            type="search"
            className="grow text-sm"
            placeholder="Search address, buyer, MLS…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </label>
      </div>

      {/* Stats */}
      <StatsBar
        deals={deals}
        lastSynced={lastSynced}
        loading={loading}
        onRefresh={load}
      />

      {/* Content */}
      {error ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 p-8">
          <div className="alert alert-error max-w-md">
            <span className="text-sm">{error}</span>
          </div>
          <button className="btn btn-sm btn-primary" onClick={load}>
            Try Again
          </button>
        </div>
      ) : loading && deals.length === 0 ? (
        <div className="flex items-center justify-center flex-1 gap-3">
          <span className="loading loading-spinner loading-md text-primary" />
          <span className="text-sm text-base-content/50">Loading deals…</span>
        </div>
      ) : (
        <DealTable deals={deals} search={search} />
      )}

      {/* Footer */}
      <div className="px-4 py-2 bg-base-200 border-t border-base-300 flex items-center justify-between">
        <span className="text-xs text-base-content/40">
          {deals.length} deal{deals.length !== 1 ? 's' : ''} · Auto-refreshes every 60s
        </span>
        <span className="text-xs text-base-content/30">TC Command · myredeal.com</span>
      </div>

      {/* Merge Tags Modal */}
      {showMergeTags && <MergeTagsModal onClose={() => setShowMergeTags(false)} />}

      {/* Sent History Modal */}
      {showSentHistory && <SentHistoryModal onClose={() => setShowSentHistory(false)} />}
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<App />);
