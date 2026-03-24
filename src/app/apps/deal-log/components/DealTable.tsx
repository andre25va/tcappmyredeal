import React from 'react';
import { Deal } from '../types';

interface DealTableProps {
  deals: Deal[];
  search: string;
}

const STATUS_BADGE: Record<string, string> = {
  active: 'badge-success',
  closed: 'badge-neutral',
  pending: 'badge-warning',
  cancelled: 'badge-error',
};

const STAGE_LABELS: Record<string, string> = {
  contract_received: 'Contract Rcvd',
  under_contract: 'Under Contract',
  inspection: 'Inspection',
  appraisal: 'Appraisal',
  finance: 'Finance',
  closing: 'Closing',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtPrice(n: number | null): string {
  if (!n) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export const DealTable: React.FC<DealTableProps> = ({ deals, search }) => {
  const q = search.toLowerCase();
  const filtered = q
    ? deals.filter(
        d =>
          d.property_address.toLowerCase().includes(q) ||
          (d.city ?? '').toLowerCase().includes(q) ||
          (d.buyer_name ?? '').toLowerCase().includes(q) ||
          (d.seller_name ?? '').toLowerCase().includes(q) ||
          (d.mls_number ?? '').toLowerCase().includes(q) ||
          d.id.toLowerCase().includes(q),
      )
    : deals;

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3 text-base-content/40 py-16">
        <span className="text-4xl">🏠</span>
        <p className="text-sm">{search ? 'No deals match your search' : 'No deals saved yet'}</p>
        {!search && (
          <p className="text-xs text-center max-w-xs">
            Deals you add in TC Command will appear here automatically.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto flex-1">
      <table className="table table-zebra table-sm w-full">
        <thead className="sticky top-0 bg-base-200 z-10">
          <tr>
            <th className="text-xs font-semibold text-base-content/60">#</th>
            <th className="text-xs font-semibold text-base-content/60">Address</th>
            <th className="text-xs font-semibold text-base-content/60">Type</th>
            <th className="text-xs font-semibold text-base-content/60">Status</th>
            <th className="text-xs font-semibold text-base-content/60">Stage</th>
            <th className="text-xs font-semibold text-base-content/60">Purchase Price</th>
            <th className="text-xs font-semibold text-base-content/60">Closing Date</th>
            <th className="text-xs font-semibold text-base-content/60">Buyer</th>
            <th className="text-xs font-semibold text-base-content/60">MLS #</th>
            <th className="text-xs font-semibold text-base-content/60">Added</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((deal, i) => (
            <tr key={deal.id} className="hover">
              <td className="text-xs text-base-content/40">{i + 1}</td>
              <td>
                <div className="font-medium text-sm leading-tight">{deal.property_address}</div>
                {(deal.city || deal.state) && (
                  <div className="text-xs text-base-content/50">
                    {[deal.city, deal.state, deal.zip].filter(Boolean).join(', ')}
                  </div>
                )}
              </td>
              <td className="text-xs capitalize">{deal.deal_type || '—'}</td>
              <td>
                <span
                  className={`badge badge-sm ${STATUS_BADGE[deal.status] ?? 'badge-ghost'}`}
                >
                  {deal.status}
                </span>
              </td>
              <td className="text-xs text-base-content/70">
                {STAGE_LABELS[deal.pipeline_stage ?? ''] ?? deal.pipeline_stage ?? '—'}
              </td>
              <td className="text-sm font-mono">{fmtPrice(deal.purchase_price)}</td>
              <td className="text-xs">{fmtDate(deal.closing_date)}</td>
              <td className="text-xs text-base-content/70">{deal.buyer_name || '—'}</td>
              <td className="text-xs font-mono text-base-content/60">{deal.mls_number || '—'}</td>
              <td className="text-xs text-base-content/50">{fmtDate(deal.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
