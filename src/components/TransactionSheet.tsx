import React from 'react';
import { X, Printer, MapPin, DollarSign, Calendar, Users, AlertTriangle, CheckSquare, FileText, StickyNote, User } from 'lucide-react';
import { Deal, Contact } from '../types';
import { formatPhone, roleLabel } from '../utils/helpers';
import { MILESTONE_LABELS, MILESTONE_ORDER } from '../utils/taskTemplates';

interface Props {
  deal: Deal;
  onClose: () => void;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const fmtDate = (d: string | undefined) => {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const daysUntil = (d: string | undefined) => {
  if (!d) return null;
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  return diff;
};

const PROP_TYPE_LABELS: Record<string, string> = {
  'single-family': 'Single Family', condo: 'Condo', multi_family: 'Multi-Family',
  'multi-family': 'Multi-Family', townhouse: 'Townhouse', land: 'Land', commercial: 'Commercial', other: 'Other',
};

const Section: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div>
    <div className="flex items-center gap-2 mb-2 pb-1 border-b border-gray-200">
      <span className="text-primary">{icon}</span>
      <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500">{title}</h3>
    </div>
    {children}
  </div>
);

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-start gap-2 text-sm py-0.5">
    <span className="text-gray-500 w-32 flex-none">{label}</span>
    <span className="text-black font-medium flex-1">{value || <span className="text-gray-300 font-normal italic">—</span>}</span>
  </div>
);

const ProgressBar: React.FC<{ pct: number; color: string }> = ({ pct, color }) => (
  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
    <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
  </div>
);

export const TransactionSheet: React.FC<Props> = ({ deal, onClose }) => {
  const milestoneIdx = MILESTONE_ORDER.indexOf(deal.milestone ?? 'contract-received');
  const daysLeft = daysUntil(deal.closingDate);

  const buySide = deal.contacts.filter(c => c.side === 'buy' || c.side === 'both');
  const sellSide = deal.contacts.filter(c => c.side === 'sell' || c.side === 'both');
  const unassigned = deal.contacts.filter(c => !c.side);

  const ddTotal = deal.dueDiligenceChecklist.length;
  const ddDone = deal.dueDiligenceChecklist.filter(i => i.completed).length;
  const compTotal = deal.complianceChecklist.length;
  const compDone = deal.complianceChecklist.filter(i => i.completed).length;

  const pendingDocs = deal.documentRequests.filter(d => d.status === 'pending');

  const priceDiff = deal.contractPrice - deal.listPrice;

  const handlePrint = () => window.print();

  const ContactList: React.FC<{ contacts: Contact[]; emptyMsg: string }> = ({ contacts, emptyMsg }) => {
    if (contacts.length === 0) return <p className="text-xs text-gray-400 italic">{emptyMsg}</p>;
    return (
      <div className="space-y-1">
        {contacts.map(c => (
          <div key={c.id} className="flex items-start gap-2 text-sm py-0.5">
            <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 flex-none mt-0.5">
              {c.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-medium text-black">{c.name}</span>
                <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{roleLabel(c.role)}</span>
                {c.inNotificationList && (
                  <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">🔔 notified</span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-3 text-xs text-gray-500 mt-0.5">
                {c.phone && <span>{formatPhone(c.phone)}</span>}
                {c.email && <span>{c.email}</span>}
                {c.company && <span className="italic">{c.company}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:bg-white print:p-0 print:block">
      <div className="bg-white w-full max-w-3xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden print:max-h-none print:shadow-none print:rounded-none">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gray-900 text-white flex-none print:hidden">
          <div className="flex items-center gap-2">
            <FileText size={18} />
            <span className="font-bold text-base tracking-wide">Transaction Sheet</span>
            <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full ml-1">MyReDeal.com</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            >
              <Printer size={14} />
              Print
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-6 print:p-4 print:space-y-4">

          {/* Property Header */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <MapPin size={16} className="text-primary flex-none" />
                  <h2 className="text-xl font-bold text-black">{deal.address}</h2>
                </div>
                <p className="text-sm text-gray-500 ml-6 mt-0.5">
                  {[deal.city, deal.state, deal.zipCode].filter(Boolean).join(', ')}
                </p>
                {deal.mlsNumber && (
                  <p className="text-xs text-gray-400 ml-6 mt-0.5 font-medium">MLS — {deal.mlsNumber}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs px-2.5 py-1 rounded-full bg-gray-200 text-gray-700 font-medium">
                  {PROP_TYPE_LABELS[deal.propertyType] || deal.propertyType}
                </span>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  deal.transactionSide === 'buyer'
                    ? 'bg-blue-100 text-blue-700'
                    : deal.transactionSide === 'seller'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-purple-100 text-purple-700'
                }`}>
                  {deal.transactionSide === 'buyer' ? 'Buyer Side' : deal.transactionSide === 'seller' ? 'Seller Side' : 'Both Sides'}
                </span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-medium">
                  {MILESTONE_LABELS[deal.milestone ?? 'contract-received']}
                </span>
              </div>
            </div>

            {/* Milestone progress bar */}
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Contract Received</span>
                <span>Step {milestoneIdx + 1} of {MILESTONE_ORDER.length}</span>
                <span>Closed</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-1.5 rounded-full bg-primary transition-all"
                  style={{ width: `${((milestoneIdx + 1) / MILESTONE_ORDER.length) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Two column: Dates + Financials */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <Section icon={<Calendar size={14} />} title="Key Dates">
                <Row label="Contract Date" value={fmtDate(deal.contractDate)} />
                <Row label="Closing Date" value={
                  <span className="flex items-center gap-2">
                    {fmtDate(deal.closingDate)}
                    {daysLeft !== null && (
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                        daysLeft < 0 ? 'bg-red-100 text-red-700'
                        : daysLeft <= 7 ? 'bg-orange-100 text-orange-700'
                        : 'bg-green-100 text-green-700'
                      }`}>
                        {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}
                      </span>
                    )}
                  </span>
                } />
              </Section>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <Section icon={<DollarSign size={14} />} title="Financials">
                <Row label="List Price" value={fmt(deal.listPrice)} />
                <Row label="Contract Price" value={
                  <span className="flex items-center gap-2">
                    {fmt(deal.contractPrice)}
                    {priceDiff !== 0 && (
                      <span className={`text-xs font-bold ${priceDiff < 0 ? 'text-red-500' : 'text-green-600'}`}>
                        {priceDiff > 0 ? '+' : ''}{fmt(priceDiff)}
                      </span>
                    )}
                  </span>
                } />
              </Section>
            </div>
          </div>

          {/* Agents */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <Section icon={<User size={14} />} title="Agents">
              <div className="space-y-2 mt-1">
                {deal.buyerAgent ? (
                  <div className="flex items-start gap-2 text-sm">
                    <div className="relative flex-none">
                      <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">
                        {deal.buyerAgent.name.charAt(0)}
                      </div>
                      {deal.buyerAgent.isOurClient && (
                        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-black">{deal.buyerAgent.name}</span>
                        <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">Buyer Agent</span>
                        {deal.buyerAgent.isOurClient && (
                          <span className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-semibold">our client</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-3 text-xs text-gray-500 mt-0.5">
                        {deal.buyerAgent.phone && <span>{formatPhone(deal.buyerAgent.phone)}</span>}
                        {deal.buyerAgent.email && <span>{deal.buyerAgent.email}</span>}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No buyer agent assigned</p>
                )}

                {deal.sellerAgent ? (
                  <div className="flex items-start gap-2 text-sm">
                    <div className="relative flex-none">
                      <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-xs font-bold text-green-700">
                        {deal.sellerAgent.name.charAt(0)}
                      </div>
                      {deal.sellerAgent.isOurClient && (
                        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-black">{deal.sellerAgent.name}</span>
                        <span className="text-xs bg-green-50 text-green-600 px-1.5 py-0.5 rounded">Seller Agent</span>
                        {deal.sellerAgent.isOurClient && (
                          <span className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-semibold">our client</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-3 text-xs text-gray-500 mt-0.5">
                        {deal.sellerAgent.phone && <span>{formatPhone(deal.sellerAgent.phone)}</span>}
                        {deal.sellerAgent.email && <span>{deal.sellerAgent.email}</span>}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No seller agent assigned</p>
                )}
              </div>
            </Section>
          </div>

          {/* Contacts */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <Section icon={<Users size={14} />} title="Deal Contacts">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-1">
                <div>
                  <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Buy Side
                  </p>
                  <ContactList contacts={buySide} emptyMsg="No buy-side contacts" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Sell Side
                  </p>
                  <ContactList contacts={sellSide} emptyMsg="No sell-side contacts" />
                </div>
              </div>
              {unassigned.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Unassigned</p>
                  <ContactList contacts={unassigned} emptyMsg="" />
                </div>
              )}
              {deal.contacts.length === 0 && (
                <p className="text-xs text-gray-400 italic mt-1">No contacts added yet</p>
              )}
            </Section>
          </div>

          {/* Checklist Progress */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <Section icon={<CheckSquare size={14} />} title="Checklist Progress">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-1">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-black">Due Diligence</span>
                    <span className="text-sm font-bold text-black">{ddDone}/{ddTotal}</span>
                  </div>
                  <ProgressBar pct={ddTotal > 0 ? (ddDone / ddTotal) * 100 : 0} color="bg-blue-500" />
                  <p className="text-xs text-gray-400 mt-1">
                    {ddTotal > 0 ? `${Math.round((ddDone / ddTotal) * 100)}% complete` : 'No items'}
                    {ddTotal - ddDone > 0 && ` · ${ddTotal - ddDone} remaining`}
                  </p>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-black">Compliance</span>
                    <span className="text-sm font-bold text-black">{compDone}/{compTotal}</span>
                  </div>
                  <ProgressBar pct={compTotal > 0 ? (compDone / compTotal) * 100 : 0} color="bg-green-500" />
                  <p className="text-xs text-gray-400 mt-1">
                    {compTotal > 0 ? `${Math.round((compDone / compTotal) * 100)}% complete` : 'No items'}
                    {compTotal - compDone > 0 && ` · ${compTotal - compDone} remaining`}
                  </p>
                </div>
              </div>
            </Section>
          </div>

          {/* Pending Alerts */}
          {pendingDocs.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <Section icon={<AlertTriangle size={14} className="text-orange-500" />} title={`Pending Alerts (${pendingDocs.length})`}>
                <div className="space-y-1 mt-1">
                  {pendingDocs.map(d => (
                    <div key={d.id} className="flex items-center gap-2 text-sm">
                      <span className="w-2 h-2 rounded-full bg-orange-500 flex-none" />
                      <span className="font-medium text-orange-900">{d.label}</span>
                      {d.description && <span className="text-orange-600 text-xs">— {d.description}</span>}
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          )}

          {/* Notes */}
          {deal.notes && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <Section icon={<StickyNote size={14} />} title="Notes">
                <p className="text-sm text-black mt-1 whitespace-pre-wrap leading-relaxed">{deal.notes}</p>
              </Section>
            </div>
          )}

          {/* Footer */}
          <div className="text-center pt-2 pb-1">
            <p className="text-xs text-gray-300 font-medium tracking-wide">Generated by MyReDeal.com</p>
          </div>
        </div>
      </div>
    </div>
  );
};
