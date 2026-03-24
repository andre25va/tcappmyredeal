import React from 'react';
import { Deal } from '../types';

interface StatsBarProps {
  deals: Deal[];
  lastSynced: Date | null;
  loading: boolean;
  onRefresh: () => void;
}

export const StatsBar: React.FC<StatsBarProps> = ({ deals, lastSynced, loading, onRefresh }) => {
  const active = deals.filter(d => d.status === 'active').length;
  const closed = deals.filter(d => d.status === 'closed').length;
  const totalVolume = deals.reduce((sum, d) => sum + (d.purchase_price ?? 0), 0);

  const fmtCurrency = (n: number) =>
    n >= 1_000_000
      ? `$${(n / 1_000_000).toFixed(1)}M`
      : n >= 1_000
      ? `$${(n / 1_000).toFixed(0)}K`
      : `$${n.toFixed(0)}`;

  const fmtTime = (d: Date) =>
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-base-200 border-b border-base-300">
      <div className="flex gap-3 flex-1 flex-wrap">
        <div className="stat bg-base-300 rounded-lg px-3 py-2 min-w-0">
          <div className="stat-title text-xs text-base-content/60">Total Deals</div>
          <div className="stat-value text-lg">{deals.length}</div>
        </div>
        <div className="stat bg-base-300 rounded-lg px-3 py-2 min-w-0">
          <div className="stat-title text-xs text-base-content/60">Active</div>
          <div className="stat-value text-lg text-success">{active}</div>
        </div>
        <div className="stat bg-base-300 rounded-lg px-3 py-2 min-w-0">
          <div className="stat-title text-xs text-base-content/60">Closed</div>
          <div className="stat-value text-lg text-base-content/60">{closed}</div>
        </div>
        {totalVolume > 0 && (
          <div className="stat bg-base-300 rounded-lg px-3 py-2 min-w-0">
            <div className="stat-title text-xs text-base-content/60">Total Volume</div>
            <div className="stat-value text-lg text-primary">{fmtCurrency(totalVolume)}</div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-base-content/50">
        {lastSynced && <span>Synced {fmtTime(lastSynced)}</span>}
        <button
          className={`btn btn-ghost btn-xs ${loading ? 'loading loading-spinner' : ''}`}
          onClick={onRefresh}
          disabled={loading}
        >
          {!loading && '↻ Refresh'}
        </button>
      </div>
    </div>
  );
};
