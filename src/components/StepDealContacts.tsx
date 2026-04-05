import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { DealParticipantRole, ContactRole, ContactRecord } from '../types';
import { generateId } from '../utils/helpers';
import { Plus, Search, X, Pencil, AlertCircle, UserPlus, AlertTriangle } from 'lucide-react';
import { ContactModal, SavedContact } from './ContactModal';
import ContactMatchPopup from './ContactMatchPopup';

// ── Types ──────────────────────────────────────────────────────────────────

export interface WizardParticipant {
  tempId: string;
  contactId?: string;        // set if linked to an existing contacts row
  company?: string;          // company / organization name (e.g. "Alliance Title")
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

/** Map a contact's professional type to their role in this deal */
function contactTypeToRole(ct: ContactRole, side: 'buyer' | 'seller' | 'both'): DealParticipantRole {
  switch (ct) {
    case 'agent':     return 'lead_agent';
    case 'lender':    return 'lender';
    case 'title':     return 'title_officer';
    case 'inspector': return 'inspector';
    case 'appraiser': return 'appraiser';
    case 'tc':        return 'tc';
    case 'buyer':     return 'buyer';
    case 'seller':    return 'seller';
    default:          return defaultRole(side);
  }
}

/** Default contact type to suggest when adding to a given side */
function defaultContactType(side: 'buyer' | 'seller' | 'both'): ContactRole {
  return side === 'both' ? 'title' : 'agent';
}

// ── Match scoring ─────────────────────────────────────────────────────────

function normStr(s: string | undefined | null): string {
  return (s ?? '').trim().toLowerCase();
}

function scoreMatch(p: WizardParticipant, c: ContactRecord): number {
  let score = 0;
  if (normStr(p.email) && normStr(p.email) === normStr(c.email)) score += 5;
  const pPhone = (p.phone ?? '').replace(/\D/g, '');
  const cPhone = (c.phone ?? '').replace(/\D/g, '');
  if (pPhone && pPhone === cPhone) score += 4;
  if (normStr(p.lastName) && normStr(p.lastName) === normStr(c.lastName)) score += 2;
  if (normStr(p.firstName) && normStr(p.firstName) === normStr(c.firstName)) score += 2;
  if (normStr(p.company) && normStr(c.company)) {
    const pc = normStr(p.company);
    const cc = normStr(c.company);
    if (cc.includes(pc) || pc.includes(cc)) score += 1;
  }
  return score;
}

function findBestMatch(p: WizardParticipant, allContacts: ContactRecord[]): ContactRecord | null {
  // Skip already-linked participants
  if (p.contactId) return null;
  // Skip if no identifying info
  if (!p.firstName && !p.lastName && !p.email && !p.phone) return null;

  let best: ContactRecord | null = null;
  let bestScore = 0;
  for (const c of allContacts) {
    const score = scoreMatch(p, c);
    if (score >= 3 && score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

// ── Search Result type ─────────────────────────────────────────────────────

interface SearchResult {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  company: string;
  firstName: string;
  lastName: string;
  contactType: ContactRole;
}

// ── ContactCard — stable top-level component ───────────────────────────────

interface ContactCardProps {
  p: WizardParticipant;
  isOurSide: boolean;
  match?: ContactRecord | null;
  onOpenContact: (p: WizardParticipant) => void;
  onRemove: (tempId: string) => void;
  onUpdate: (tempId: string, patch: Partial<WizardParticipant>) => void;
  onMatchClick?: (p: WizardParticipant) => void;
}

function ContactCard({ p, isOurSide, match, onOpenContact, onRemove, onUpdate, onMatchClick }: ContactCardProps) {
  const roles = roleOptions(p.side);
  const displayName = [p.firstName, p.lastName].filter(Boolean).join(' ');
  const showMatchBadge = !!match && !p.contactId;

  return (
    <div className={`border rounded-xl p-3 bg-base-100 hover:border-base-400 transition-colors ${showMatchBadge ? 'border-warning/60' : 'border-base-300'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Pills row */}
          {(p.isExtracted || isOurSide || p.contactId) && (
            <div className="flex items-center gap-1 flex-wrap mb-2">
              {p.isExtracted && (
                <span className="badge badge-sm" style={{ backgroundColor: '#374151', color: '#f59e0b', borderColor: '#374151' }}>Auto</span>
              )}
              {isOurSide && (
                <span className="badge badge-sm" style={{ backgroundColor: '#374151', color: '#f59e0b', borderColor: '#374151' }}>Our Side</span>
              )}
              {p.contactId && <span className="badge badge-sm badge-success">✓ Linked</span>}
            </div>
          )}

          {/* Company field */}
          <input
            className="input input-bordered input-xs w-full mb-1.5"
            placeholder="Company"
            value={(p as any).company ?? ''}
            onChange={e => onUpdate(p.tempId, { company: e.target.value } as any)}
          />

          {/* First Name + Last Name */}
          <div className="flex gap-1.5 mb-1">
            <input
              className={`input input-bordered input-xs flex-1 ${!p.firstName ? 'border-warning/50 placeholder-warning/60' : ''}`}
              placeholder="FN needed"
              value={p.firstName ?? ''}
              onChange={e => onUpdate(p.tempId, { firstName: e.target.value } as any)}
            />
            <input
              className={`input input-bordered input-xs flex-1 ${!p.lastName ? 'border-warning/50 placeholder-warning/60' : ''}`}
              placeholder="LN needed"
              value={p.lastName ?? ''}
              onChange={e => onUpdate(p.tempId, { lastName: e.target.value } as any)}
            />
          </div>

          {/* Email / Phone */}
          {p.email && <p className="text-xs text-base-content/60 mt-0.5 truncate">{p.email}</p>}
          {p.phone && <p className="text-xs text-base-content/60 truncate">{p.phone}</p>}
          {!p.email && !p.phone && (
            <p className="text-xs text-warning/70 mt-0.5 flex items-center gap-1">
              <AlertCircle size={11} /> No contact info yet
            </p>
          )}

          {/* Possible match notice */}
          {showMatchBadge && (
            <button
              className="mt-1.5 flex items-center gap-1 text-xs text-warning font-medium hover:underline"
              onClick={() => onMatchClick?.(p)}
            >
              <AlertTriangle size={11} /> Possible match in contacts — review
            </button>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            className="btn btn-ghost btn-xs btn-square"
            title="Edit contact details"
            onClick={() => onOpenContact(p)}
          >
            <Pencil size={11} />
          </button>
          <button className="btn btn-ghost btn-xs btn-square text-error" onClick={() => onRemove(p.tempId)}>
            <X size={11} />
          </button>
        </div>
      </div>

      {/* Role + side — always visible inline dropdowns */}
      <div className="flex gap-2 mt-2">
        <select
          className="select select-bordered select-xs flex-1"
          value={p.role}
          onChange={e => onUpdate(p.tempId, { role: e.target.value as DealParticipantRole })}
        >
          {roles.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
        <select
          className="select select-bordered select-xs w-28"
          value={p.side}
          onChange={e => onUpdate(p.tempId, { side: e.target.value as 'buyer' | 'seller' | 'both' })}
        >
          <option value="buyer">Buy Side</option>
          <option value="seller">Sell Side</option>
          <option value="both">Both Sides</option>
        </select>
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
  onQueryChange: (q: string) => void;
  onAddFromSearch: (r: SearchResult) => void;
  onCreateNew: () => void;
  onClose: () => void;
}

function AddPanel({
  side, visible, query, results, searching,
  onQueryChange, onAddFromSearch, onCreateNew, onClose,
}: AddPanelProps) {
  if (!visible) return null;

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
              {r.company && <p className="text-xs text-base-content/50">{r.company}</p>}
              {r.email && <p className="text-xs text-base-content/40">{r.email}</p>}
            </button>
          ))}
        </div>
      )}

      {query.length >= 2 && !searching && results.length === 0 && (
        <p className="text-xs text-center text-base-content/40">No match — create a new contact below</p>
      )}

      {/* Create new contact → opens full ContactModal */}
      <div className="border-t border-base-200 pt-3">
        <button
          className="btn btn-outline btn-sm btn-block gap-1"
          onClick={onCreateNew}
        >
          <UserPlus size={13} /> Create New Contact
        </button>
      </div>

      <div className="flex justify-end">
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

// ── SideColumn — stable top-level component ───────────────────────────────

interface SideColumnProps {
  side: 'buyer' | 'seller';
  label: string;
  list: WizardParticipant[];
  transactionType: 'buyer' | 'seller';
  addingSide: string | null;
  query: string;
  results: SearchResult[];
  searching: boolean;
  matchMap: Record<string, ContactRecord | null>;
  onOpenContact: (p: WizardParticipant) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<WizardParticipant>) => void;
  onSetAdding: (side: 'buyer' | 'seller' | 'both') => void;
  onQueryChange: (q: string) => void;
  onAddFromSearch: (r: SearchResult) => void;
  onCreateNew: () => void;
  onCloseAdd: () => void;
  onMatchClick: (p: WizardParticipant) => void;
}

function SideColumn({
  side, label, list, transactionType,
  addingSide, query, results, searching,
  matchMap,
  onOpenContact, onRemove, onUpdate,
  onSetAdding, onQueryChange, onAddFromSearch, onCreateNew, onCloseAdd,
  onMatchClick,
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
          isOurSide={transactionType === side}
          match={matchMap[p.tempId]}
          onOpenContact={onOpenContact}
          onRemove={onRemove}
          onUpdate={onUpdate}
          onMatchClick={onMatchClick}
        />
      ))}
      <AddPanel
        side={side}
        visible={addingSide === side}
        query={query}
        results={results}
        searching={searching}
        onQueryChange={onQueryChange}
        onAddFromSearch={onAddFromSearch}
        onCreateNew={onCreateNew}
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
  allContacts: ContactRecord[];
}

type AddingSide = 'buyer' | 'seller' | 'both' | null;

// Contact modal state: null = closed; edit mode = participant; add mode = side string
type ContactModalState =
  | null
  | { mode: 'edit'; participant: WizardParticipant }
  | { mode: 'add'; side: AddingSide };

export default function StepDealContacts({ participants, onChange, transactionType, orgId, allContacts }: Props) {
  const [addingSide, setAddingSide] = useState<AddingSide>(null);
  const [query,      setQuery]      = useState('');
  const [results,    setResults]    = useState<SearchResult[]>([]);
  const [searching,  setSearching]  = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const [contactModalState, setContactModalState] = useState<ContactModalState>(null);

  // ── Match detection ───────────────────────────────────────────────────────

  // Track dismissed matches (tempIds the TC said "keep as new" for)
  const [dismissedMatches, setDismissedMatches] = useState<Set<string>>(new Set());

  // Compute best match for every participant (re-runs when participants or allContacts change)
  const matchMap = useMemo(() => {
    const map: Record<string, ContactRecord | null> = {};
    for (const p of participants) {
      map[p.tempId] = dismissedMatches.has(p.tempId) ? null : findBestMatch(p, allContacts);
    }
    return map;
  }, [participants, allContacts, dismissedMatches]);

  // Match popup state
  const [matchPopup, setMatchPopup] = useState<{ participant: WizardParticipant; match: ContactRecord } | null>(null);

  const handleMatchClick = useCallback((p: WizardParticipant) => {
    const match = matchMap[p.tempId];
    if (match) setMatchPopup({ participant: p, match });
  }, [matchMap]);

  /** TC chose "Use System Contact" — link contactId, no DB change */
  const handleMatchUseAsIs = useCallback((p: WizardParticipant, match: ContactRecord) => {
    onChange(participants.map(part =>
      part.tempId === p.tempId
        ? { ...part, contactId: match.id, firstName: match.firstName, lastName: match.lastName,
            company: match.company, email: match.email, phone: match.phone }
        : part
    ));
    setMatchPopup(null);
  }, [participants, onChange]);

  /** TC chose "Use System Contact + Update" — DB already saved in popup, just link */
  const handleMatchUseAndUpdate = useCallback((p: WizardParticipant, match: ContactRecord) => {
    onChange(participants.map(part =>
      part.tempId === p.tempId
        ? { ...part, contactId: match.id,
            firstName: p.firstName || match.firstName,
            lastName:  p.lastName  || match.lastName,
            company:   p.company   ?? match.company,
            email:     p.email     || match.email,
            phone:     p.phone     || match.phone }
        : part
    ));
    setMatchPopup(null);
  }, [participants, onChange]);

  /** TC chose "Keep as New" — dismiss badge permanently for this participant */
  const handleMatchKeepNew = useCallback((p: WizardParticipant) => {
    setDismissedMatches(prev => new Set([...prev, p.tempId]));
    setMatchPopup(null);
  }, []);

  // debounced contact search
  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await supabase
          .from('contacts')
          .select('id, first_name, last_name, full_name, email, phone, company, contact_type')
          .or(`full_name.ilike.%${query}%,first_name.ilike.%${query}%,email.ilike.%${query}%,company.ilike.%${query}%`)
          .eq('is_active', true)
          .limit(6);
        setResults((data ?? []).map(r => ({
          id:          r.id,
          fullName:    r.full_name || `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(),
          email:       r.email     ?? '',
          phone:       r.phone     ?? '',
          company:     r.company   ?? '',
          firstName:   r.first_name ?? '',
          lastName:    r.last_name  ?? '',
          contactType: (r.contact_type ?? 'other') as ContactRole,
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
      company:     r.company,
      firstName:   r.firstName,
      lastName:    r.lastName,
      email:       r.email,
      phone:       r.phone,
      role:        contactTypeToRole(r.contactType, addingSide),
      side:        addingSide,
      isExtracted: false,
    }]);
    closeAddPanel();
  }, [participants, onChange, addingSide]);

  const closeAddPanel = useCallback(() => {
    setAddingSide(null);
    setQuery('');
    setResults([]);
  }, []);

  // ── ContactModal callbacks ─────────────────────────────────────────────

  /** Open ContactModal to edit an existing participant's contact details */
  const openEditContact = useCallback((p: WizardParticipant) => {
    setContactModalState({ mode: 'edit', participant: p });
  }, []);

  /** Open ContactModal in add mode for a given side */
  const openCreateContact = useCallback(() => {
    setContactModalState({ mode: 'add', side: addingSide });
  }, [addingSide]);

  /** Called when ContactModal saves — update or add the WizardParticipant */
  const handleContactSaved = useCallback((saved: SavedContact) => {
    if (!contactModalState) return;

    if (contactModalState.mode === 'edit') {
      // Update existing participant with the saved contact data
      onChange(participants.map(p =>
        p.tempId === contactModalState.participant.tempId
          ? {
              ...p,
              contactId: saved.id,
              firstName: saved.firstName,
              lastName:  saved.lastName,
              company:   saved.company,
              email:     saved.email,
              phone:     saved.phone,
            }
          : p
      ));
    } else {
      // Add new participant
      const side = contactModalState.side ?? 'both';
      onChange([...participants, {
        tempId:      generateId(),
        contactId:   saved.id,
        company:     saved.company,
        firstName:   saved.firstName,
        lastName:    saved.lastName,
        email:       saved.email,
        phone:       saved.phone,
        role:        contactTypeToRole(saved.contactType, side),
        side,
        isExtracted: false,
      }]);
      closeAddPanel();
    }

    setContactModalState(null);
  }, [contactModalState, participants, onChange, closeAddPanel]);

  // ── Derived data ───────────────────────────────────────────────────────

  /** Get the ContactRecord for a participant (for ContactModal edit mode) */
  function getContactRecord(p: WizardParticipant): ContactRecord | null {
    if (!p.contactId) return null;
    return allContacts.find(c => c.id === p.contactId) ?? null;
  }

  const buyerSide  = participants.filter(p => p.side === 'buyer');
  const sellerSide = participants.filter(p => p.side === 'seller');
  const bothSide   = participants.filter(p => p.side === 'both');

  // ── ContactModal props ─────────────────────────────────────────────────

  const contactModalIsOpen = contactModalState !== null;
  const contactModalContact: ContactRecord | null =
    contactModalState?.mode === 'edit'
      ? getContactRecord(contactModalState.participant)
      : null;
  const contactModalDefaultRole: ContactRole =
    contactModalState?.mode === 'add'
      ? defaultContactType(contactModalState.side ?? 'both')
      : 'other';
  // Pre-fill from participant when no linked contact record yet
  const contactModalDefaultCompany =
    contactModalState?.mode === 'edit' && !contactModalContact
      ? contactModalState.participant.company
      : '';
  const contactModalDefaultFirstName =
    contactModalState?.mode === 'edit' && !contactModalContact
      ? contactModalState.participant.firstName
      : '';
  const contactModalDefaultLastName =
    contactModalState?.mode === 'edit' && !contactModalContact
      ? contactModalState.participant.lastName
      : '';

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-bold text-base-content">Deal Contacts</h3>
        <p className="text-sm text-base-content/50 mt-0.5">
          Review all parties. Click ✎ on any card to edit full contact details. Add anyone missing.
        </p>
      </div>

      {/* Buy Side | Sell Side columns */}
      <div className="flex gap-4">
        <SideColumn
          side="buyer"
          label="Buy Side"
          list={buyerSide}
          transactionType={transactionType}
          addingSide={addingSide}
          query={query}
          results={results}
          searching={searching}
          matchMap={matchMap}
          onOpenContact={openEditContact}
          onRemove={handleRemove}
          onUpdate={handleUpdate}
          onSetAdding={setAddingSide}
          onQueryChange={setQuery}
          onAddFromSearch={handleAddFromSearch}
          onCreateNew={openCreateContact}
          onCloseAdd={closeAddPanel}
          onMatchClick={handleMatchClick}
        />
        <div className="w-px bg-base-300 shrink-0" />
        <SideColumn
          side="seller"
          label="Sell Side"
          list={sellerSide}
          transactionType={transactionType}
          addingSide={addingSide}
          query={query}
          results={results}
          searching={searching}
          matchMap={matchMap}
          onOpenContact={openEditContact}
          onRemove={handleRemove}
          onUpdate={handleUpdate}
          onSetAdding={setAddingSide}
          onQueryChange={setQuery}
          onAddFromSearch={handleAddFromSearch}
          onCreateNew={openCreateContact}
          onCloseAdd={closeAddPanel}
          onMatchClick={handleMatchClick}
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
            isOurSide={false}
            match={matchMap[p.tempId]}
            onOpenContact={openEditContact}
            onRemove={handleRemove}
            onUpdate={handleUpdate}
            onMatchClick={handleMatchClick}
          />
        ))}
        <AddPanel
          side="both"
          visible={addingSide === 'both'}
          query={query}
          results={results}
          searching={searching}
          onQueryChange={setQuery}
          onAddFromSearch={handleAddFromSearch}
          onCreateNew={openCreateContact}
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

      {/* Full contact modal — same UI as Contacts page */}
      <ContactModal
        isOpen={contactModalIsOpen}
        contact={contactModalContact}
        defaultRole={contactModalDefaultRole}
        defaultCompany={contactModalDefaultCompany}
        defaultFirstName={contactModalDefaultFirstName}
        defaultLastName={contactModalDefaultLastName}
        allContacts={allContacts}
        onClose={() => setContactModalState(null)}
        onSaved={handleContactSaved}
      />

      {/* Contact match popup */}
      <ContactMatchPopup
        isOpen={matchPopup !== null}
        participant={matchPopup?.participant ?? null}
        match={matchPopup?.match ?? null}
        onClose={() => setMatchPopup(null)}
        onUseAsIs={handleMatchUseAsIs}
        onUseAndUpdate={handleMatchUseAndUpdate}
        onKeepNew={handleMatchKeepNew}
      />
    </div>
  );
}
