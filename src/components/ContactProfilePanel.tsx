import React, { useMemo } from 'react';
import { X, Pencil, Phone, Mail, Building2, MapPin, Calendar, DollarSign, TrendingUp, Home, Loader2, AlertCircle } from 'lucide-react';
import { ContactRecord } from '../types';
import { formatPhoneLive, roleLabel } from '../utils/helpers';
import { useContactDeals, ContactDeal } from '../hooks/useContactDeals';

interface Props {
  contact: ContactRecord;
  onClose: () => void;
  onEdit: (contact: ContactRecord) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(n: number | null) {
  if (!n) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function initials(contact: ContactRecord) {
  const fn = contact.firstName?.trim() || '';
  const ln = contact.lastName?.trim() || '';
  if (fn && ln) return `${fn[0]}${ln[0]}`.toUpperCase();
  if (fn) return fn[0].toUpperCase();
  if (contact.company) return contact.company[0].toUpperCase();
  return '?';
}

function sidePill(side: string) {
  if (side === 'buyer') return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-900 text-blue-200">Buy Side</span>;
  if (side === 'seller') return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-900 text-amber-200">Sell Side</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-700 text-gray-300">{side || 'Unknown'}</span>;
}

function statusDot(status: string) {
  const colors: Record<string, string> = {
    active: 'bg-green-400',
    pending: 'bg-yellow-400',
    closed: 'bg-gray-400',
    cancelled: 'bg-red-400',
  };
  return <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${colors[status?.toLowerCase()] || 'bg-gray-400'}`} />;
}

function roleLabel2(role: string) {
  const map: Record<string, string> = {
    lead_agent: 'Lead Agent', co_agent: 'Co-Agent', buyer: 'Buyer', seller: 'Seller',
    lender: 'Lender', title: 'Title Officer', attorney: 'Attorney', inspector: 'Inspector',
    tc: 'TC', other: 'Other',
  };
  return map[role] || role;
}

// ── Deal Card ──────────────────────────────────────────────────────────────

function DealCard({ deal }: { deal: ContactDeal }) {
  const address = [deal.propertyAddress, deal.city, deal.state].filter(Boolean).join(', ');
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Home size={13} className="text-gray-400 shrink-0 mt-0.5" />
          <span className="text-sm font-medium text-white truncate">{address}</span>
        </div>
        {sidePill(deal.side)}
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          {statusDot(deal.status)}
          <span className="capitalize">{deal.pipelineStage || deal.status || '—'}</span>
        </span>
        <span className="text-gray-600">·</span>
        <span>{roleLabel2(deal.dealRole)}</span>
        {deal.isPrimary && <span className="text-orange-400 font-semibold">Primary</span>}
        {deal.isClientSide && <span className="text-purple-400 font-semibold">Client</span>}
      </div>

      <div className="flex gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <DollarSign size={11} />
          {formatCurrency(deal.purchasePrice)}
        </span>
        <span className="flex items-center gap-1">
          <Calendar size={11} />
          Close: {formatDate(deal.closingDate)}
        </span>
      </div>
    </div>
  );
}

// ── Main Panel ─────────────────────────────────────────────────────────────

export function ContactProfilePanel({ contact, onClose, onEdit }: Props) {
  const { data: deals = [], isLoading, isError } = useContactDeals(contact.id);

  const stats = useMemo(() => {
    const active = deals.filter(d => d.status?.toLowerCase() !== 'closed' && d.status?.toLowerCase() !== 'cancelled');
    const buySide = deals.filter(d => d.side === 'buyer');
    const sellSide = deals.filter(d => d.side === 'seller');
    return { total: deals.length, active: active.length, buySide: buySide.length, sellSide: sellSide.length };
  }, [deals]);

  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.company || 'Unknown';

  return (
    <div className="fixed inset-y-0 right-0 w-[400px] bg-gray-900 border-l border-gray-700 flex flex-col z-50 shadow-2xl">

      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center text-white font-bold text-lg shrink-0">
            {initials(contact)}
          </div>
          <div className="min-w-0">
            <h2 className="text-white font-semibold text-base leading-tight truncate">{fullName}</h2>
            {contact.company && (
              <p className="text-gray-400 text-xs truncate">{contact.company}</p>
            )}
            <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs bg-gray-700 text-gray-300 capitalize">
              {roleLabel(contact.contactType) || contact.contactType}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button
            onClick={() => onEdit(contact)}
            className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
            title="Edit contact"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Contact info */}
      <div className="px-4 py-3 border-b border-gray-700 space-y-1.5">
        {contact.phone && (
          <div className="flex items-center gap-2 text-sm text-gray-300">
            <Phone size={13} className="text-gray-500 shrink-0" />
            <span>{formatPhoneLive(contact.phone)}</span>
          </div>
        )}
        {contact.email && (
          <div className="flex items-center gap-2 text-sm text-gray-300">
            <Mail size={13} className="text-gray-500 shrink-0" />
            <span className="truncate">{contact.email}</span>
          </div>
        )}
        {contact.company && (
          <div className="flex items-center gap-2 text-sm text-gray-300">
            <Building2 size={13} className="text-gray-500 shrink-0" />
            <span className="truncate">{contact.company}</span>
          </div>
        )}
      </div>

      {/* Deal stats */}
      <div className="grid grid-cols-3 divide-x divide-gray-700 border-b border-gray-700">
        {[
          { label: 'Total Deals', value: stats.total, color: 'text-white' },
          { label: 'Buy Side', value: stats.buySide, color: 'text-blue-400' },
          { label: 'Sell Side', value: stats.sellSide, color: 'text-amber-400' },
        ].map(s => (
          <div key={s.label} className="py-3 px-2 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Deals list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Deals</h3>
          {stats.active > 0 && (
            <span className="text-xs text-green-400">{stats.active} active</span>
          )}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-10 text-gray-500">
            <Loader2 size={20} className="animate-spin mr-2" />
            <span className="text-sm">Loading deals…</span>
          </div>
        )}

        {isError && (
          <div className="flex items-center gap-2 text-red-400 text-sm py-4">
            <AlertCircle size={16} />
            Failed to load deals
          </div>
        )}

        {!isLoading && !isError && deals.length === 0 && (
          <div className="text-center py-10 text-gray-600">
            <TrendingUp size={28} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">No deals yet</p>
          </div>
        )}

        {!isLoading && deals.map(deal => (
          <DealCard key={deal.participantId} deal={deal} />
        ))}
      </div>
    </div>
  );
}
