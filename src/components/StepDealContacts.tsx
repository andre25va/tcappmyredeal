import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { DealParticipantRole } from '../types';
import { generateId } from '../utils/helpers';
import { Plus, Search, X, Pencil, AlertCircle } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

export interface WizardParticipant {
  tempId: string;
  contactId?: string;        // set if linked to an existing contacts row
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: DealParticipantRole;
  side: 'buyer' | 'seller' | 'both';
  isExtracted: boolean;      // true = auto-filled from extraction
}

// ── Constants ─────────────────────────────────────────────────────────────

export const ROLE_LABELS: Record<DealParticipantRole, string> = {
  lead_agent:    'Agent',
  co_agent:      'Co-Agent',
  admin:         'Admin',
  tc:            'TC',
  lender:        'Lender',
  title_officer: 'Title Officer',
  buyer:         'Buyer',
  seller:        'Seller',
  inspector:     'Inspector',
  appraiser:     'Appraiser',
  other:         'Other',
};

const BUY_ROLES:  DealParticipantRole[] = ['buyer',  'lead_agent', 'co_agent', 'lender', 'title_officer', 'inspector', 'appraiser', 'other'];
const SELL_ROLES: DealParticipantRole[] = ['seller', 'lead_agent', 'co_agent', 'title_officer', 'other'];
const BOTH_ROLES: DealParticipantRole[] = ['title_officer', 'lender', 'inspector', 'appraiser', 'other'];

// ── Helper ─────────────────────────────────────────────────────────────────

function roleOptions(side: 'buyer' | 'seller' | 'both') {
  if (side === 'buyer') return BUY_ROLES;
  if (side === 'seller') return SELL_ROLES;
  return BOTH_ROLES;
}

function defaultRole(side: 'buyer' | 'seller' | 'both'): DealParticipantRole {
  if (side === 'buyer') return 'buyer';
  if (side === 'seller') return 'seller';
  return 'title_officer';
}

// ── Interfaces ─────────────────────────────────────────────────────────────

interface SearchResult {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
}

interface Props {
  participants: WizardParticipant[];
  onChange: (p: WizardParticipant[]) => void;
  transactionType: 'buyer' | 'seller';   // which side is "our client"
  orgId?: string;
}

type AddingSide = 'buyer' | 'seller' | 'both' | null;

// ── Component ──────────────────────────────────────────────────────────────

export default function StepDealContacts({ participants, onChange, transactionType, orgId }: Props) {
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [addingSide, setAddingSide] = useState<AddingSide>(null);
  const [query,      setQuery]      = useState('');
  const [results,    setResults]    = useState<SearchResult[]>([]);
  const [searching,  setSearching]  = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // blank new-contact form
  const emptyNew = (side: 'buyer' | 'seller' | 'both') => ({
    firstName: '', lastName: '', email: '', phone: '',
    role: defaultRole(side), side,
  });
  const [newContact, setNewContact] = useState(emptyNew('buyer'));

  // reset new-contact role when side panel switches
  useEffect(() => {
    if (addingSide) setNewContact(emptyNew(addingSide));
  }, [addingSide]);

  // debounced contact search
  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await supabase
          .from('contacts')
          .select('id, first_name, last_name, full_name, email, phone')
          .or(`full_name.ilike.%${query}%,first_name.ilike.%${query}%,email.ilike.%${query}%`)
          .eq('is_active', true)
          .limit(6);
        setResults((data ?? []).map(r => ({
          id:        r.id,
          fullName:  r.full_name || `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(),
          email:     r.email  ?? '',
          phone:     r.phone  ?? '',
          firstName: r.first_name ?? '',
          lastName:  r.last_name  ?? '',
        })));
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [query]);

  // ── Mutations ────────────────────────────────────────────────────────────

  const update = (tempId: string, patch: Partial<WizardParticipant>) =>
    onChange(participants.map(p => p.tempId === tempId ? { ...p, ...patch } : p));

  const remove = (tempId: string) =>
    onChange(participants.filter(p => p.tempId !== tempId));

  const addFromSearch = (r: SearchResult, side: 'buyer' | 'seller' | 'both') => {
    onChange([...participants, {
      tempId:      generateId(),
      contactId:   r.id,
      firstName:   r.firstName,
      lastName:    r.lastName,
      email:       r.email,
      phone:       r.phone,
      role:        defaultRole(side),
      side,
      isExtracted: false,
    }]);
    closeAddPanel();
  };

  const addNew = () => {
    if (!newContact.firstName.trim()) return;
    onChange([...participants, { ...newContact, tempId: generateId(), isExtracted: false }]);
    closeAddPanel();
  };

  const closeAddPanel = () => {
    setAddingSide(null);
    setQuery('');
    setResults([]);
    setNewContact(emptyNew('buyer'));
  };

  // ── Derived lists ────────────────────────────────────────────────────────

  const buyerSide  = participants.filter(p => p.side === 'buyer');
  const sellerSide = participants.filter(p => p.side === 'seller');
  const bothSide   = participants.filter(p => p.side === 'both');

  // ── Sub-components ───────────────────────────────────────────────────────

  const ContactCard = ({ p }: { p: WizardParticipant }) => {
    const isEditing  = editingId === p.tempId;
    const isOurSide  = (transactionType === 'buyer' && p.side === 'buyer') ||
                       (transactionType === 'seller' && p.side === 'seller');
    const roles      = roleOptions(p.side);
    const displayName = [p.firstName, p.lastName].filter(Boolean).join(' ');

    if (isEditing) return (
      <div className="border border-primary/40 rounded-xl p-3 bg-base-100 space-y-2 shadow-sm">
        <div className="grid grid-cols-2 gap-2">
          <input className="input input-bordered input-sm" placeholder="First name"
            value={p.firstName} onChange={e => update(p.tempId, { firstName: e.target.value })} />
          <input className="input input-bordered input-sm" placeholder="Last name"
            value={p.lastName}  onChange={e => update(p.tempId, { lastName:  e.target.value })} />
        </div>
        <input className="input input-bordered input-sm w-full" placeholder="Email" type="email"
          value={p.email} onChange={e => update(p.tempId, { email: e.target.value })} />
        <input className="input input-bordered input-sm w-full" placeholder="Phone" type="tel"
          value={p.phone} onChange={e => update(p.tempId, { phone: e.target.value })} />
        <div className="flex gap-2">
          <select className="select select-bordered select-sm flex-1" value={p.role}
            onChange={e => update(p.tempId, { role: e.target.value as DealParticipantRole })}>
            {roles.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          <select className="select select-bordered select-sm w-28" value={p.side}
            onChange={e => update(p.tempId, { side: e.target.value as 'buyer' | 'seller' | 'both' })}>
            <option value="buyer">Buy Side</option>
            <option value="seller">Sell Side</option>
            <option value="both">Both Sides</option>
          </select>
        </div>
        <div className="flex justify-end">
          <button className="btn btn-ghost btn-xs" onClick={() => setEditingId(null)}>Done</button>
        </div>
      </div>
    );

    return (
      <div className="border border-base-300 rounded-xl p-3 bg-base-100 hover:border-base-400 transition-colors group">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-sm text-base-content">
                {displayName || <span className="italic text-base-content/40">No name</span>}
              </span>
              <span className="badge badge-sm badge-ghost">{ROLE_LABELS[p.role]}</span>
              {p.isExtracted && <span className="badge badge-sm badge-info badge-outline">Auto</span>}
              {isOurSide && <span className="badge badge-sm badge-success badge-outline">Our Side</span>}
            </div>
            {p.email && <p className="text-xs text-base-content/60 mt-0.5 truncate">{p.email}</p>}
            {p.phone && <p className="text-xs text-base-content/60 truncate">{p.phone}</p>}
            {!p.email && !p.phone &&
              <p className="text-xs text-warning/70 mt-0.5 flex items-center gap-1">
                <AlertCircle size={11} /> No contact info yet
              </p>
            }
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button className="btn btn-ghost btn-xs btn-square" onClick={() => setEditingId(p.tempId)}>
              <Pencil size={11} />
            </button>
            <button className="btn btn-ghost btn-xs btn-square text-error" onClick={() => remove(p.tempId)}>
              <X size={11} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const AddPanel = ({ side }: { side: 'buyer' | 'seller' | 'both' }) => {
    if (addingSide !== side) return null;
    const roles = roleOptions(side);

    return (
      <div className="border border-dashed border-primary/40 rounded-xl p-3 bg-base-50 space-y-3">
        {/* Search existing contacts */}
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" />
          <input
            autoFocus
            className="input input-bordered input-sm w-full pl-8"
            placeholder="Search existing contacts…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        {searching && <p className="text-xs text-center text-base-content/40">Searching…</p>}

        {results.length > 0 && (
          <div className="space-y-0.5 max-h-36 overflow-y-auto">
            {results.map(r => (
              <button key={r.id} onClick={() => addFromSearch(r, side)}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-base-200 transition-colors">
                <p className="text-sm font-medium leading-tight">{r.fullName}</p>
                {r.email && <p className="text-xs text-base-content/50">{r.email}</p>}
              </button>
            ))}
          </div>
        )}

        {query.length >= 2 && !searching && results.length === 0 && (
          <p className="text-xs text-center text-base-content/40">No match — create below</p>
        )}

        {/* New contact inline form */}
        <div className="border-t border-base-200 pt-3 space-y-2">
          <p className="text-xs font-medium text-base-content/50">New contact</p>
          <div className="grid grid-cols-2 gap-2">
            <input className="input input-bordered input-sm" placeholder="First name *"
              value={newContact.firstName} onChange={e => setNewContact(p => ({ ...p, firstName: e.target.value }))} />
            <input className="input input-bordered input-sm" placeholder="Last name"
              value={newContact.lastName}  onChange={e => setNewContact(p => ({ ...p, lastName:  e.target.value }))} />
          </div>
          <input className="input input-bordered input-sm w-full" placeholder="Email" type="email"
            value={newContact.email} onChange={e => setNewContact(p => ({ ...p, email: e.target.value }))} />
          <input className="input input-bordered input-sm w-full" placeholder="Phone" type="tel"
            value={newContact.phone} onChange={e => setNewContact(p => ({ ...p, phone: e.target.value }))} />
          <select className="select select-bordered select-sm w-full" value={newContact.role}
            onChange={e => setNewContact(p => ({ ...p, role: e.target.value as DealParticipantRole }))}>
            {roles.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <button className="btn btn-ghost btn-sm" onClick={closeAddPanel}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={addNew} disabled={!newContact.firstName.trim()}>
            Add Contact
          </button>
        </div>
      </div>
    );
  };

  const SideColumn = ({
    side, label, list,
  }: { side: 'buyer' | 'seller'; label: string; list: WizardParticipant[] }) => (
    <div className="flex-1 min-w-0 space-y-2">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold text-base-content/60 uppercase tracking-wider">{label}</h4>
        <span className="badge badge-xs badge-ghost">{list.length}</span>
      </div>
      {list.map(p => <ContactCard key={p.tempId} p={p} />)}
      <AddPanel side={side} />
      {addingSide !== side && (
        <button
          className="btn btn-ghost btn-sm btn-block border border-dashed border-base-300 hover:border-primary/50 gap-1"
          onClick={() => setAddingSide(side)}>
          <Plus size={13} /> Add to {label}
        </button>
      )}
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-bold text-base-content">Deal Contacts</h3>
        <p className="text-sm text-base-content/50 mt-0.5">
          Review all parties. Auto-filled contacts can be edited or removed. Add anyone missing.
        </p>
      </div>

      {/* Buy Side | Sell Side columns */}
      <div className="flex gap-4">
        <SideColumn side="buyer"  label="Buy Side"  list={buyerSide}  />
        <div className="w-px bg-base-300 shrink-0" />
        <SideColumn side="seller" label="Sell Side" list={sellerSide} />
      </div>

      {/* Both Sides section (title officers, shared vendors, etc.) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-base-content/60 uppercase tracking-wider">Both Sides</h4>
          <span className="badge badge-xs badge-ghost">{bothSide.length}</span>
        </div>
        {bothSide.map(p => <ContactCard key={p.tempId} p={p} />)}
        <AddPanel side="both" />
        {addingSide !== 'both' && (
          <button
            className="btn btn-ghost btn-sm btn-block border border-dashed border-base-300 hover:border-primary/50 gap-1"
            onClick={() => setAddingSide('both')}>
            <Plus size={13} /> Add to Both Sides
          </button>
        )}
      </div>

      {/* Empty state warning */}
      {participants.length === 0 && (
        <div className="flex items-center gap-2 p-3 bg-warning/10 border border-warning/30 rounded-lg">
          <AlertCircle size={14} className="text-warning shrink-0" />
          <p className="text-xs text-warning/90">
            No contacts added yet. You can skip for now or add parties above.
          </p>
        </div>
      )}
    </div>
  );
}
