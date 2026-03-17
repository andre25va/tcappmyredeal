import React, { useState } from 'react';
import { X, Copy, Check, MapPin, Hash, Users, ShoppingCart, Tag, Phone, Mail, Building2 } from 'lucide-react';
import { Deal, Contact } from '../types';

interface Props {
  deal: Deal;
  onClose: () => void;
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    });
  };
  return { copied, copy };
}

const CopyBtn: React.FC<{ text: string; copyKey: string; copied: string | null; onCopy: (t: string, k: string) => void }> = ({
  text, copyKey, copied, onCopy,
}) => (
  <button
    onClick={() => onCopy(text, copyKey)}
    className="ml-1.5 p-1 rounded hover:bg-base-300 text-base-content/40 hover:text-base-content transition-colors flex-none"
    title="Copy"
  >
    {copied === copyKey
      ? <Check size={12} className="text-green-500" />
      : <Copy size={12} />}
  </button>
);

const RoleBadge: React.FC<{ role: string }> = ({ role }) => {
  const styles: Record<string, string> = {
    agent:    'bg-blue-100 text-blue-700 border-blue-300',
    lender:   'bg-purple-100 text-purple-700 border-purple-300',
    title:    'bg-amber-100 text-amber-700 border-amber-300',
    attorney: 'bg-rose-100 text-rose-700 border-rose-300',
    inspector:'bg-teal-100 text-teal-700 border-teal-300',
    tc:       'bg-gray-100 text-gray-600 border-gray-300',
    buyer:    'bg-sky-100 text-sky-700 border-sky-300',
    seller:   'bg-green-100 text-green-700 border-green-300',
    other:    'bg-gray-100 text-gray-500 border-gray-200',
  };
  const label: Record<string, string> = {
    agent: 'Agent', lender: 'Lender', title: 'Title', attorney: 'Attorney',
    inspector: 'Inspector', tc: 'TC', buyer: 'Buyer', seller: 'Seller', other: 'Other',
  };
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${styles[role] ?? styles.other}`}>
      {label[role] ?? role}
    </span>
  );
};

const ContactCard: React.FC<{ contact: Contact; copied: string | null; onCopy: (t: string, k: string) => void }> = ({
  contact, copied, onCopy,
}) => (
  <div className="flex flex-col gap-0.5 py-2 border-b border-base-200 last:border-0">
    <div className="flex items-center gap-2">
      <span className="font-semibold text-sm text-base-content">{contact.name}</span>
      <RoleBadge role={contact.role} />
    </div>
    {contact.company && (
      <div className="flex items-center gap-1 text-xs text-base-content/50">
        <Building2 size={10} /> {contact.company}
      </div>
    )}
    {contact.phone && (
      <div className="flex items-center gap-1 text-xs text-base-content/60">
        <Phone size={10} />
        <span>{contact.phone}</span>
        <CopyBtn text={contact.phone} copyKey={`phone-${contact.id}`} copied={copied} onCopy={onCopy} />
      </div>
    )}
    {contact.email && (
      <div className="flex items-center gap-1 text-xs text-base-content/60">
        <Mail size={10} />
        <span className="truncate">{contact.email}</span>
        <CopyBtn text={contact.email} copyKey={`email-${contact.id}`} copied={copied} onCopy={onCopy} />
      </div>
    )}
  </div>
);

export const FocusViewModal: React.FC<Props> = ({ deal, onClose }) => {
  const { copied, copy } = useCopy();
  const side = deal.transactionType ?? 'buyer';

  const fullAddress = `${deal.propertyAddress}, ${deal.city}, ${deal.state} ${deal.zipCode}`;
  const mlsRaw = deal.mlsNumber ?? '';

  const ourSideLetter = side === 'buyer' ? 'buy' : 'sell';
  const otherSideLetter = side === 'buyer' ? 'sell' : 'buy';

  const ourContacts = deal.contacts?.filter(c => c.side === ourSideLetter) ?? [];
  const otherContacts = deal.contacts?.filter(c => c.side === otherSideLetter) ?? [];
  const bothContacts = deal.contacts?.filter(c => c.side === 'both') ?? [];

  const sideLabel = side === 'buyer' ? 'Buyer Side' : 'Seller Side';
  const otherLabel = side === 'buyer' ? 'Seller Side' : 'Buyer Side';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-base-100 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-base-300 bg-base-200 flex-none">
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
              side === 'buyer' ? 'bg-blue-100' : 'bg-green-100'
            }`}>
              {side === 'buyer'
                ? <ShoppingCart size={14} className="text-blue-600" />
                : <Tag size={14} className="text-green-600" />}
            </div>
            <span className="font-bold text-sm text-base-content">Focus View</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
              side === 'buyer'
                ? 'bg-blue-100 text-blue-700 border-blue-300'
                : 'bg-green-100 text-green-700 border-green-300'
            }`}>
              {side === 'buyer' ? 'Buyer' : 'Seller'}
            </span>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-xs btn-circle">
            <X size={14} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-4 space-y-4">

          {/* Address */}
          <div className="bg-base-200 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-2 text-base-content/50">
              <MapPin size={12} />
              <span className="text-[11px] font-semibold uppercase tracking-wide">Address</span>
            </div>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-base text-base-content leading-tight">{deal.propertyAddress}</p>
                <p className="text-xs text-base-content/60 mt-0.5">{deal.city}, {deal.state} {deal.zipCode}</p>
              </div>
              <CopyBtn text={fullAddress} copyKey="address" copied={copied} onCopy={copy} />
            </div>
          </div>

          {/* MLS */}
          <div className="bg-base-200 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-2 text-base-content/50">
              <Hash size={12} />
              <span className="text-[11px] font-semibold uppercase tracking-wide">MLS#</span>
            </div>
            {mlsRaw ? (
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-bold text-lg text-base-content tracking-wide">{mlsRaw}</span>
                <CopyBtn text={mlsRaw} copyKey="mls" copied={copied} onCopy={copy} />
              </div>
            ) : (
              <span className="text-xs text-base-content/30 italic">Not set</span>
            )}
          </div>

          {/* Contacts */}
          <div className="bg-base-200 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-3 text-base-content/50">
              <Users size={12} />
              <span className="text-[11px] font-semibold uppercase tracking-wide">Transaction Contacts</span>
            </div>

            {ourContacts.length > 0 && (
              <div className="mb-3">
                <div className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full mb-2 ${
                  side === 'buyer' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                }`}>
                  {side === 'buyer' ? <ShoppingCart size={9} /> : <Tag size={9} />}
                  {sideLabel}
                </div>
                {ourContacts.map(c => (
                  <ContactCard key={c.id} contact={c} copied={copied} onCopy={copy} />
                ))}
              </div>
            )}

            {otherContacts.length > 0 && (
              <div className="mb-3">
                <div className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full mb-2 ${
                  side === 'buyer' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {side === 'buyer' ? <Tag size={9} /> : <ShoppingCart size={9} />}
                  {otherLabel}
                </div>
                {otherContacts.map(c => (
                  <ContactCard key={c.id} contact={c} copied={copied} onCopy={copy} />
                ))}
              </div>
            )}

            {bothContacts.length > 0 && (
              <div>
                <div className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 mb-2">
                  Both Sides
                </div>
                {bothContacts.map(c => (
                  <ContactCard key={c.id} contact={c} copied={copied} onCopy={copy} />
                ))}
              </div>
            )}

            {(!ourContacts.length && !otherContacts.length && !bothContacts.length) && (
              <p className="text-xs text-base-content/30 italic">No contacts added yet</p>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-base-300 bg-base-200 flex-none">
          <button onClick={onClose} className="btn btn-sm btn-ghost w-full">Close</button>
        </div>
      </div>
    </div>
  );
};
