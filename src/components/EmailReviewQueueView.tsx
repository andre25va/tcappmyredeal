import React, { useState } from 'react';
import {
  CheckCircle, XCircle, AlertCircle, Inbox, Link2,
  RefreshCw, Sparkles, Clock, Paperclip, ExternalLink,
  PlusCircle, Home,
} from 'lucide-react';
import { useEmailReviewQueue, ReviewQueueItem } from '../hooks/useEmailReviewQueue';
import { Deal } from '../types';

interface Props {
  deals: Deal[];
  onSelectDeal: (id: string) => void;
}

const NEW_DEAL_VALUE = '__new_deal__';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function relativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

function gmailLink(threadId: string) {
  return `https://mail.google.com/mail/u/0/#inbox/${threadId}`;
}

/** Try to parse an address hint from the AI suggestion text */
function extractAddressHint(aiSuggestion: string | null): string {
  if (!aiSuggestion) return '';
  // Look for patterns like "123 Main St" or city/state combos
  const match = aiSuggestion.match(/\d+\s+[A-Za-z0-9\s]+(?:St|Ave|Rd|Dr|Blvd|Ln|Way|Ct|Pl|Terrace|Trafficway)[^,\n]*/i);
  return match ? match[0].trim() : '';
}

// ─── Review Card ──────────────────────────────────────────────────────────────
const ReviewCard: React.FC<{
  item: ReviewQueueItem;
  deals: Deal[];
  onConfirm: (item: ReviewQueueItem, dealId: string, address: string) => void;
  onDismiss: (item: ReviewQueueItem) => void;
  onCreateNewDeal: (item: ReviewQueueItem, address: string, buyer: string, price?: number) => Promise<void>;
}> = ({ item, deals, onConfirm, onDismiss, onCreateNewDeal }) => {
  const [expanded, setExpanded] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState(item.top_deal_id ?? '');
  const [creating, setCreating] = useState(false);

  // New deal inline form state
  const [newAddress, setNewAddress] = useState(extractAddressHint(item.ai_suggestion));
  const [newBuyer, setNewBuyer] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const selectedDeal = deals.find(d => d.id === selectedDealId);
  const topDeal = deals.find(d => d.id === item.top_deal_id);
  const runnerUp = deals.find(d => d.id === item.runner_up_deal_id);

  const isNewDealSelected = selectedDealId === NEW_DEAL_VALUE;

  const handleConfirmOrCreate = async () => {
    if (isNewDealSelected) {
      if (!newAddress.trim()) return;
      setCreating(true);
      setCreateError(null);
      const price = newPrice ? parseFloat(newPrice.replace(/[^0-9.]/g, '')) : undefined;
      await onCreateNewDeal(item, newAddress.trim(), newBuyer.trim(), price);
      setCreating(false);
    } else {
      const deal = deals.find(d => d.id === selectedDealId);
      if (deal) onConfirm(item, deal.id, deal.propertyAddress);
    }
  };

  return (
    <div className="bg-base-100 border border-base-300 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div
        className="flex items-start gap-3 p-3 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-none mt-0.5">
          <AlertCircle size={16} className="text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-base-content truncate">{item.subject || '(no subject)'}</span>
            {item.has_attachment && <Paperclip size={12} className="text-base-content/40 flex-none" />}
          </div>
          <div className="text-xs text-base-content/50 flex items-center gap-2 mt-0.5">
            <span className="truncate">{item.from_name || item.from_email}</span>
            <span>·</span>
            <Clock size={11} />
            <span>{relativeTime(item.received_at)}</span>
            {item.top_deal_score != null && (
              <>
                <span>·</span>
                <span className="font-mono bg-amber-100 text-amber-700 px-1 rounded text-[10px]">
                  score {item.top_deal_score}
                </span>
              </>
            )}
          </div>
          {item.snippet && (
            <p className="text-xs text-base-content/50 mt-1 line-clamp-1">{item.snippet}</p>
          )}
        </div>
        <a
          href={gmailLink(item.gmail_thread_id)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-xs flex-none"
          onClick={e => e.stopPropagation()}
          title="Open in Gmail"
        >
          <ExternalLink size={12} />
        </a>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-base-200 px-3 pb-3 pt-2 space-y-3">
          {/* AI suggestion */}
          {item.ai_suggestion && (
            <div className="flex gap-2 bg-violet-50 border border-violet-200 rounded-md p-2">
              <Sparkles size={14} className="text-violet-500 flex-none mt-0.5" />
              <p className="text-xs text-violet-700 leading-relaxed">{item.ai_suggestion}</p>
            </div>
          )}

          {/* Deal picker */}
          <div>
            <label className="text-xs font-medium text-base-content/60 mb-1 block">Link to deal</label>
            <select
              className="select select-bordered select-sm w-full text-sm"
              value={selectedDealId}
              onChange={e => {
                setSelectedDealId(e.target.value);
                setCreateError(null);
              }}
            >
              <option value="">— Select a deal —</option>
              {topDeal && (
                <option value={topDeal.id}>
                  ⭐ {topDeal.propertyAddress} (score {item.top_deal_score})
                </option>
              )}
              {runnerUp && runnerUp.id !== topDeal?.id && (
                <option value={runnerUp.id}>
                  {runnerUp.propertyAddress} (score {item.runner_up_deal_score})
                </option>
              )}
              {deals
                .filter(d => d.id !== item.top_deal_id && d.id !== item.runner_up_deal_id)
                .sort((a, b) => a.propertyAddress.localeCompare(b.propertyAddress))
                .map(d => (
                  <option key={d.id} value={d.id}>{d.propertyAddress}</option>
                ))
              }
              {/* ─── Create New Deal option ─── */}
              <option disabled>──────────────</option>
              <option value={NEW_DEAL_VALUE}>➕ Create New Deal</option>
            </select>
          </div>

          {/* New Deal inline form */}
          {isNewDealSelected && (
            <div className="bg-base-200 rounded-lg p-3 space-y-2 border border-base-300">
              <div className="flex items-center gap-1.5 mb-1">
                <Home size={13} className="text-primary" />
                <span className="text-xs font-semibold text-base-content">New Deal Details</span>
              </div>
              <div>
                <label className="text-xs text-base-content/50 mb-0.5 block">Property Address *</label>
                <input
                  type="text"
                  className="input input-bordered input-sm w-full text-sm"
                  placeholder="e.g. 5777 Bristol St, Bel Aire, KS 67220"
                  value={newAddress}
                  onChange={e => setNewAddress(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-base-content/50 mb-0.5 block">Buyer Name</label>
                  <input
                    type="text"
                    className="input input-bordered input-sm w-full text-sm"
                    placeholder="e.g. Justin Boswell"
                    value={newBuyer}
                    onChange={e => setNewBuyer(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-base-content/50 mb-0.5 block">Purchase Price</label>
                  <input
                    type="text"
                    className="input input-bordered input-sm w-full text-sm"
                    placeholder="e.g. 310000"
                    value={newPrice}
                    onChange={e => setNewPrice(e.target.value)}
                  />
                </div>
              </div>
              {createError && (
                <p className="text-xs text-error">{createError}</p>
              )}
            </div>
          )}

          {/* Score breakdown (hide when creating new deal) */}
          {!isNewDealSelected && item.score_breakdown && Object.keys(item.score_breakdown).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {Object.entries(item.score_breakdown).map(([signal, pts]) => (
                <span
                  key={signal}
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full border ${
                    pts > 0 ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
                  }`}
                >
                  {signal} {pts > 0 ? `+${pts}` : pts}
                </span>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {isNewDealSelected ? (
              <button
                className="btn btn-primary btn-xs gap-1 flex-1"
                disabled={!newAddress.trim() || creating}
                onClick={handleConfirmOrCreate}
              >
                {creating
                  ? <span className="loading loading-spinner loading-xs" />
                  : <PlusCircle size={12} />
                }
                Create & Link
              </button>
            ) : (
              <button
                className="btn btn-success btn-xs gap-1 flex-1"
                disabled={!selectedDealId}
                onClick={handleConfirmOrCreate}
              >
                <CheckCircle size={12} />
                Confirm Link
              </button>
            )}
            <button
              className="btn btn-ghost btn-xs text-error gap-1"
              onClick={() => onDismiss(item)}
            >
              <XCircle size={12} />
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Unmatched Card ───────────────────────────────────────────────────────────
const UnmatchedCard: React.FC<{
  item: ReviewQueueItem;
  onCreateNewDeal: (item: ReviewQueueItem, address: string, buyer: string) => Promise<void>;
  onDismiss: (item: ReviewQueueItem) => void;
}> = ({ item, onCreateNewDeal, onDismiss }) => {
  const [showForm, setShowForm] = useState(false);
  const [newAddress, setNewAddress] = useState(extractAddressHint(item.ai_suggestion));
  const [newBuyer, setNewBuyer] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!newAddress.trim()) return;
    setCreating(true);
    await onCreateNewDeal(item, newAddress.trim(), newBuyer.trim());
    setCreating(false);
  };

  return (
    <div className="bg-base-100 border border-base-300 rounded-lg overflow-hidden hover:shadow-sm transition-shadow">
      <div className="p-3 flex items-start gap-3">
        <div className="flex-none mt-0.5">
          <Inbox size={15} className="text-base-content/30" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-base-content truncate">{item.subject || '(no subject)'}</p>
          <p className="text-xs text-base-content/50 truncate mt-0.5">{item.from_name || item.from_email} · {relativeTime(item.received_at)}</p>
          {item.ai_suggestion && (
            <p className="text-xs text-base-content/40 mt-1 line-clamp-2 italic">{item.ai_suggestion}</p>
          )}
        </div>
        <div className="flex flex-col gap-1 flex-none">
          <button
            className="btn btn-primary btn-xs text-xs gap-1"
            onClick={() => setShowForm(s => !s)}
          >
            <PlusCircle size={11} /> New Deal
          </button>
          <button className="btn btn-ghost btn-xs text-error text-xs" onClick={() => onDismiss(item)}>Junk</button>
          <a
            href={gmailLink(item.gmail_thread_id)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-xs"
          >
            <ExternalLink size={11} />
          </a>
        </div>
      </div>

      {showForm && (
        <div className="border-t border-base-200 px-3 pb-3 pt-2 bg-base-200 space-y-2">
          <input
            type="text"
            className="input input-bordered input-sm w-full text-sm"
            placeholder="Property address *"
            value={newAddress}
            onChange={e => setNewAddress(e.target.value)}
          />
          <input
            type="text"
            className="input input-bordered input-sm w-full text-sm"
            placeholder="Buyer name (optional)"
            value={newBuyer}
            onChange={e => setNewBuyer(e.target.value)}
          />
          <button
            className="btn btn-primary btn-sm w-full gap-1"
            disabled={!newAddress.trim() || creating}
            onClick={handleCreate}
          >
            {creating ? <span className="loading loading-spinner loading-xs" /> : <PlusCircle size={13} />}
            Create Deal & Link Email
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Main View ────────────────────────────────────────────────────────────────
type Section = 'review' | 'unmatched' | 'linked';

export const EmailReviewQueueView: React.FC<Props> = ({ deals, onSelectDeal }) => {
  const [section, setSection] = useState<Section>('review');
  const {
    needsReview, unmatched, recentlyLinked, stats,
    loading, error, refetch, confirmLink, dismissItem, createAndLink,
  } = useEmailReviewQueue();

  const handleCreateNewDeal = async (
    item: ReviewQueueItem,
    address: string,
    buyer: string,
    price?: number,
  ) => {
    const { dealId, error } = await createAndLink(item, address, buyer || undefined, price);
    if (dealId) {
      onSelectDeal(dealId); // navigate to new deal workspace
    }
  };

  const tabs: { id: Section; label: string; count: number; color?: string }[] = [
    { id: 'review',    label: 'Needs Review',   count: stats.needsReview,   color: 'text-amber-600' },
    { id: 'unmatched', label: 'Unmatched',       count: stats.unmatched,     color: 'text-base-content/50' },
    { id: 'linked',    label: 'Recently Linked', count: stats.recentlyLinked },
  ];

  return (
    <div className="flex flex-col h-full bg-base-200">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-base-300 bg-base-100 flex-none">
        <Inbox size={18} className="text-primary" />
        <div className="flex-1">
          <h2 className="font-bold text-sm text-base-content">Email Link Queue</h2>
          <p className="text-xs text-base-content/50">
            {stats.total > 0 ? `${stats.total} emails need attention` : 'All caught up 🎉'}
          </p>
        </div>
        <button
          className="btn btn-ghost btn-xs gap-1"
          onClick={refetch}
          title="Refresh"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-base-300 bg-base-100 flex-none px-2">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setSection(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              section === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-base-content/50 hover:text-base-content'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                section === t.id ? 'bg-primary text-primary-content' : 'bg-base-300 text-base-content/60'
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading && (
          <div className="flex items-center justify-center py-16 gap-3">
            <span className="loading loading-spinner loading-sm text-primary" />
            <span className="text-sm text-base-content/50">Loading queue…</span>
          </div>
        )}

        {error && (
          <div className="alert alert-error text-sm">
            <XCircle size={16} />
            {error}
          </div>
        )}

        {!loading && !error && section === 'review' && (
          needsReview.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-base-content/30 gap-2">
              <CheckCircle size={32} />
              <p className="text-sm">No emails need review</p>
            </div>
          ) : (
            needsReview.map(item => (
              <ReviewCard
                key={item.id}
                item={item}
                deals={deals}
                onConfirm={confirmLink}
                onDismiss={dismissItem}
                onCreateNewDeal={handleCreateNewDeal}
              />
            ))
          )
        )}

        {!loading && !error && section === 'unmatched' && (
          unmatched.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-base-content/30 gap-2">
              <Inbox size={32} />
              <p className="text-sm">No unmatched emails</p>
            </div>
          ) : (
            unmatched.map(item => (
              <UnmatchedCard
                key={item.id}
                item={item}
                onCreateNewDeal={handleCreateNewDeal}
                onDismiss={dismissItem}
              />
            ))
          )
        )}

        {!loading && !error && section === 'linked' && (
          recentlyLinked.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-base-content/30 gap-2">
              <Link2 size={32} />
              <p className="text-sm">No recently linked threads</p>
            </div>
          ) : (
            recentlyLinked.map(thread => (
              <div
                key={thread.id}
                className="bg-base-100 border border-base-300 rounded-lg p-3 flex items-start gap-3 hover:shadow-sm transition-shadow cursor-pointer"
                onClick={() => thread.deal_id && onSelectDeal(thread.deal_id)}
              >
                <div className="flex-none mt-0.5">
                  <Link2 size={14} className="text-green-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-base-content truncate">{thread.subject || '(no subject)'}</p>
                  <p className="text-xs text-base-content/50 truncate">{thread.from_name || thread.from_email}</p>
                  {thread.deal_address && (
                    <p className="text-xs text-primary/70 truncate mt-0.5">→ {thread.deal_address}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 flex-none">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                    thread.link_method === 'auto'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-violet-100 text-violet-700'
                  }`}>
                    {thread.link_method === 'auto' ? '⚡ Auto' : '✨ AI'}
                  </span>
                  <span className="text-[10px] text-base-content/40">{relativeTime(thread.created_at)}</span>
                </div>
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
};
