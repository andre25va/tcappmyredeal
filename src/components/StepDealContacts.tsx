import React, { useState, useEffect, useRef, useCallback } from 'react';
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

// ── Search Result type ─────────────────────────────────────────────────────

interface SearchResult {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
}

// ── ContactCard — stable top-level component ───────────────────────────────

interface ContactCardProps {
  p: WizardParticipant;
  isEditing: boolean;
  isOurSide: boolean;
  onEdit: (tempId: string) => void;
  onDone: () => void;
  onRemove: (tempId: string) => void;
  onUpdate: (tempId: string, patch: Partial<WizardParticipant>) => void;
}

function ContactCard({ p, isEditing, isOurSide, onEdit, onDone, onRemove, onUpdate }: ContactCardProps) {
  const roles       = roleOptions(p.side);
  const displayName = [p.firstName, p.lastName].filter(Boolean).join(' ');

  if (isEditing) return (
    <div className="border border-primary/40 rounded-xl p-3 bg-base-100 space-y-2 shadow-sm">
      <div className="grid grid-cols-2 gap-2">
        <input className="input input-bordered input-sm" placeholder="First name"
          value={p.firstName} onChange={e => onUpdate(p.tempId, { firstName: e.target.value })} />
        <input className="input input-bordered input-sm" placeholder="Last name"
          value={p.lastName}  onChange={e => onUpdate(p.tempId, { lastName:  e.target.value })} />
      </div>
      <input className="input input-bordered input-sm w-full" placeholder="Email" type="email"
        value={p.email} onChange={e => onUpdate(p.tempId, { email: e.target.value })} />
      <input className="input input-bordered input-sm w-full" placeholder="Phone" type="tel"
        value={p.phone} onChange={e => onUpdate(p.tempId, { phone: e.target.value })} />
      <div className="flex gap-2">
        <select className="select select-bordered select-sm flex-1" value={p.role}
          onChange={e => onUpdate(p.tempId, { role: e.target.value as DealParticipantRole })}>
          {roles.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
        <select className="select select-bordered select-sm w-28" value={p.side}
          onChange={e => onUpdate(p.tempId, { side: e.target.value as 'buyer' | 'seller' | 'both' })}>
          <option value="buyer">Buy Side</option>
          <option value="seller">Sell Side</option>
          <option value="both">Both Sides</option>
        </select>
      </div>
      <div className="flex justify-end">
        <button className="btn btn-ghost btn-xs" onClick={onDone}>Done</button>
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
          <button className="btn btn-ghost btn-xs btn-square" onClick={() => onEdit(p.tempId)}>
            <Pencil size={11} />
          </button>
          <button className="btn btn-ghost btn-xs btn-square text-error" onClick={() => onRemove(p.tempId)}>
            <X size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AddPanel — stable top-level component ─────────────────────────────────

interface AddPanelProps {
  side: 'buyer' | 'seller' | 'both';
  visible: boolean;
  query: string;
  results: SearchResult[];
  searching: boolean;
  newContact: { firstName: string; lastName: string; email: string; phone: string; role: DealParticipantRole };
  onQueryChange: (q: string) => void;
  onNewContactChange: (patch: Partial<AddPanelProps['newContact']>) => void;
  onAddFromSearch: (r: SearchResult) => void;
  onAddNew: () => void;
  onClose: () => void;
}

function AddPanel({
  side, visible, query, results, searching,
  newContact, onQueryChange, onNewContactChange,
  onAddFromSearch, onAddNew, onClose,
}: AddPanelProps) {
  if (!visible) return null;
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
          onChange={e => onQueryChange(e.target.value)}
        />
      </div>

      {searching && <p className="text-xs text-center text-base-content/40">Searching…</p>}

      {results.length > 0 && (
        <div className="space-y-0.5 max-h-36 overflow-y-auto">
          {results.map(r => (
            <button key={r.id} onClick={() => onAddFromSearch(r)}
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
            value={newContact.firstName} onChange={e => onNewContactChange({ firstName: e.target.value })} />
          <input className="input input-bordered input-sm" placeholder="Last name"
            value={newContact.lastName}  onChange={e => onNewContactChange({ lastName:  e.target.value })} />
        </div>
        <input className="input input-bordered input-sm w-full" placeholder="Email" type="email"
          value={newContact.email} onChange={e => onNewContactChange({ email: e.target.value })} />
        <input className="input input-bordered input-sm w-full" placeholder="Phone" type="tel"
          value={newContact.phone} onChange={e => onNewContactChange({ phone: e.target.value })} />
        <select className="select select-bordered select-sm w-full" value={newContact.role}
          onChange={e => onNewContactChange({ role: e.target.value as DealParticipantRole })}>
          {roles.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={onAddNew} disabled={!newContact.firstName.trim()}>
          Add Contact
        </button>
      </div>
    </div>
  );
}

// ── SideColumn — stable top-level component ───────────────────────────────

interface SideColumnProps {
  side: 'buyer' | 'seller';
  label: string;
  list: WizardParticipant[];
  editingId: string | null;
  transactionType: 'buyer' | 'seller';
  addingSide: string | null;
  query: string;
  results: SearchResult[];
  searching: boolean;
  newContact: { firstName: string; lastName: string; email: string; phone: string; role: DealParticipantRole };
  onEdit: (id: string) => void;
  onDone: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<WizardParticipant>) => void;
  onSetAdding: (side: 'buyer' | 'seller' | 'both') => void;
  onQueryChange: (q: string) => void;
  onNewContactChange: (patch: Partial<SideColumnProps['newContact']>) => void;
  onAddFromSearch: (r: SearchResult) => void;
  onAddNew: () => void;
  onCloseAdd: () => void;
}

function SideColumn({
  side, label, list, editingId, transactionType,
  addingSide, query, results, searching, newContact,
  onEdit, onDone, onRemove, onUpdate,
  onSetAdding, onQueryChange, onNewContactChange, onAddFromSearch, onAddNew, onCloseAdd,
}: SideColumnProps) {
  return (
    <div className="flex-1 min-w-0 space-y-2">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold text-base-content/60 uppercase tracking-wider">{label}</h4>
        <span className="badge badge-xs badge-ghost">{list.length}</span>
      </div>
      {list.map(p => (
        <ContactCard
          key={p.tempId}
          p={p}
          isEditing={editingId === p.tempId}
          isOurSide={transactionType === side}
          onEdit={onEdit}
          onDone={onDone}
          onRemove={onRemove}
          onUpdate={onUpdate}
        />
      ))}
      <AddPanel
        side={side}
        visible={addingSide === side}
        query={query}
        results={results}
        searching={searching}
        newContact={newContact}
        onQueryChange={onQueryChange}
        onNewContactChange={onNewContactChange}
        onAddFromSearch={onAddFromSearch}
        onAddNew={onAddNew}
        onClose={onCloseAdd}
      />
      {addingSide !== side && (
        <button
          className="btn btn-ghost btn-sm btn-block border border-dashed border-base-300 hover:border-primary/50 gap-1"
          onClick={() => onSetAdding(side)}>
          <Plus size={13} /> Add to {label}
        </button>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

interface Props {
  participants: WizardParticipant[];
  onChange: (p: WizardParticipant[]) => void;
  transactionType: 'buyer' | 'seller';
  orgId?: string;
}

type AddingSide = 'buyer' | 'seller' | 'both' | null;

export default function StepDealContacts({ participants, onChange, transactionType, orgId }: Props) {
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [addingSide, setAddingSide] = useState<AddingSide>(null);
  const [query,      setQuery]      = useState('');
  const [results,    setResults]    = useState<SearchResult[]>([]);
  const [searching,  setSearching]  = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const emptyNew = (side: 'buyer' | 'seller' | 'both') => ({
    firstName: '', lastName: '', email: '', phone: '',
    role: defaultRole(side),
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

  // ── Stable callbacks ───────────────────────────────────────────────────

  const handleUpdate = useCallback((tempId: string, patch: Partial<WizardParticipant>) => {
    onChange(participants.map(p => p.tempId === tempId ? { ...p, ...patch } : p));
  }, [participants, onChange]);

  const handleRemove = useCallback((tempId: string) => {
    onChange(participants.filter(p => p.tempId !== tempId));
  }, [participants, onChange]);

  const handleAddFromSearch = useCallback((r: SearchResult) => {
    if (!addingSide) return;
    onChange([...participants, {
      tempId:      generateId(),
      contactId:   r.id,
      firstName:   r.firstName,
      lastName:    r.lastName,
      email:       r.email,
      phone:       r.phone,
      role:        defaultRole(addingSide),
      side:        addingSide,
      isExtracted: false,
    }]);
    closeAddPanel();
  }, [participants, onChange, addingSide]);

  const handleAddNew = useCallback(() => {
    if (!newContact.firstName.trim() || !addingSide) return;
    onChange([...participants, { ...newContact, side: addingSide, tempId: generateId(), isExtracted: false }]);
    closeAddPanel();
  }, [participants, onChange, newContact, addingSide]);

  const closeAddPanel = useCallback(() => {
    setAddingSide(null);
    setQuery('');
    setResults([]);
    setNewContact(emptyNew('buyer'));
  }, []);

  const handleNewContactChange = useCallback((patch: Partial<typeof newContact>) => {
    setNewContact(prev => ({ ...prev, ...patch }));
  }, []);

  const handleDone = useCallback(() => setEditingId(null), []);

  // ── Derived lists ──────────────────────────────────────────────────────

  const buyerSide  = participants.filter(p => p.side === 'buyer');
  const sellerSide = participants.filter(p => p.side === 'seller');
  const bothSide   = participants.filter(p => p.side === 'both');

  // ── Render ────────────────────────────────────────────────────────────

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
        <SideColumn
          side="buyer"
          label="Buy Side"
          list={buyerSide}
          editingId={editingId}
          transactionType={transactionType}
          addingSide={addingSide}
          query={query}
          results={results}
          searching={searching}
          newContact={newContact}
          onEdit={setEditingId}
          onDone={handleDone}
          onRemove={handleRemove}
          onUpdate={handleUpdate}
          onSetAdding={setAddingSide}
          onQueryChange={setQuery}
          onNewContactChange={handleNewContactChange}
          onAddFromSearch={handleAddFromSearch}
          onAddNew={handleAddNew}
          onCloseAdd={closeAddPanel}
        />
        <div className="w-px bg-base-300 shrink-0" />
        <SideColumn
          side="seller"
          label="Sell Side"
          list={sellerSide}
          editingId={editingId}
          transactionType={transactionType}
          addingSide={addingSide}
          query={query}
          results={results}
          searching={searching}
          newContact={newContact}
          onEdit={setEditingId}
          onDone={handleDone}
          onRemove={handleRemove}
          onUpdate={handleUpdate}
          onSetAdding={setAddingSide}
          onQueryChange={setQuery}
          onNewContactChange={handleNewContactChange}
          onAddFromSearch={handleAddFromSearch}
          onAddNew={handleAddNew}
          onCloseAdd={closeAddPanel}
        />
      </div>

      {/* Both Sides section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-base-content/60 uppercase tracking-wider">Both Sides</h4>
          <span className="badge badge-xs badge-ghost">{bothSide.length}</span>
        </div>
        {bothSide.map(p => (
          <ContactCard
            key={p.tempId}
            p={p}
            isEditing={editingId === p.tempId}
            isOurSide={false}
            onEdit={setEditingId}
            onDone={handleDone}
            onRemove={handleRemove}
            onUpdate={handleUpdate}
          />
        ))}
        <AddPanel
          side="both"
          visible={addingSide === 'both'}
          query={query}
          results={results}
          searching={searching}
          newContact={newContact}
          onQueryChange={setQuery}
          onNewContactChange={handleNewContactChange}
          onAddFromSearch={handleAddFromSearch}
          onAddNew={handleAddNew}
          onClose={closeAddPanel}
        />
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
