import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Users, Plus, Search, Pencil, Trash2, Phone, Mail, MapPin,
  X, Save, ChevronDown, Globe, Link, PlusCircle, Fingerprint, MoreVertical,
  UserCheck, Star, Home, DollarSign, Award, Scale, ClipboardCheck, Clipboard,
  MoreHorizontal, ArrowLeft, Building2,
} from 'lucide-react';
import { DirectoryContact, ContactRole, MlsEntry, AgentClientStateInfo } from '../types';
import { generateId, formatPhoneLive, formatPhone, roleLabel } from '../utils/helpers';
import { ConfirmModal } from './ConfirmModal';

const emptyStateInfo = (state: string): AgentClientStateInfo => ({
  state,
  closingType: '',
  commissionType: '',
  brokerEmail: '',
  brokerPhone: '',
  complianceEmail: '',
  compliancePhone: '',
  eSignatureApp: '',
  links: [],
});

const generateClientId = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  const last4 = digits.length >= 4 ? digits.slice(-4) : digits.padStart(4, '0');
  return `AC-${last4}`;
};

interface Props {
  directory: DirectoryContact[];
  onUpdate: (updated: DirectoryContact[]) => void;
  mlsEntries: MlsEntry[];
  triggerAdd?: 'agent-client' | 'contact' | null;
  onTriggerHandled?: () => void;
}

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
];

const ROLES: { id: ContactRole | 'all'; label: string; color: string }[] = [
  { id: 'all',          label: 'All',          color: 'badge-ghost' },
  { id: 'agent',        label: 'Agent in Transaction', color: 'badge-primary' },
  { id: 'agent-client', label: 'Agent Client', color: 'badge-purple' },
  { id: 'buyer',        label: 'End Client',   color: 'badge-info' },
  { id: 'lender',       label: 'Lender',       color: 'badge-accent' },
  { id: 'title',        label: 'Title',        color: 'badge-secondary' },
  { id: 'attorney',     label: 'Attorney',     color: 'badge-error' },
  { id: 'inspector',    label: 'Inspector',    color: 'badge-neutral' },
  { id: 'tc',           label: 'TC',           color: 'badge-neutral' },
  { id: 'other',        label: 'Other',        color: 'badge-ghost' },
];

const ROLE_CARDS: {
  id: ContactRole | 'all';
  label: string;
  icon: React.ElementType;
  bg: string;
  border: string;
  iconColor: string;
  countBg: string;
}[] = [
  { id: 'agent',        label: 'Agent in Transaction', icon: UserCheck,      bg: 'bg-blue-50',   border: 'border-blue-200',   iconColor: 'text-blue-600',   countBg: 'bg-blue-100 text-blue-700' },
  { id: 'agent-client', label: 'Agent Client',         icon: Star,           bg: 'bg-purple-50', border: 'border-purple-200', iconColor: 'text-purple-600', countBg: 'bg-purple-100 text-purple-700' },
  { id: 'buyer',        label: 'End Client',           icon: Home,           bg: 'bg-teal-50',   border: 'border-teal-200',   iconColor: 'text-teal-600',   countBg: 'bg-teal-100 text-teal-700' },
  { id: 'lender',       label: 'Lender',               icon: DollarSign,     bg: 'bg-green-50',  border: 'border-green-200',  iconColor: 'text-green-600',  countBg: 'bg-green-100 text-green-700' },
  { id: 'title',        label: 'Title',                icon: Award,          bg: 'bg-orange-50', border: 'border-orange-200', iconColor: 'text-orange-600', countBg: 'bg-orange-100 text-orange-700' },
  { id: 'attorney',     label: 'Attorney',             icon: Scale,          bg: 'bg-red-50',    border: 'border-red-200',    iconColor: 'text-red-600',    countBg: 'bg-red-100 text-red-700' },
  { id: 'inspector',    label: 'Inspector',            icon: ClipboardCheck, bg: 'bg-gray-50',   border: 'border-gray-200',   iconColor: 'text-gray-600',   countBg: 'bg-gray-100 text-gray-700' },
  { id: 'tc',           label: 'TC',                   icon: Clipboard,      bg: 'bg-indigo-50', border: 'border-indigo-200', iconColor: 'text-indigo-600', countBg: 'bg-indigo-100 text-indigo-700' },
  { id: 'other',        label: 'Other',                icon: MoreHorizontal, bg: 'bg-slate-50',  border: 'border-slate-200',  iconColor: 'text-slate-600',  countBg: 'bg-slate-100 text-slate-700' },
];

const ROLE_COLOR: Record<ContactRole, string> = {
  agent: 'badge-primary', 'agent-client': 'badge-outline badge-purple',
  buyer: 'badge-info', seller: 'badge-warning',
  lender: 'badge-accent', title: 'badge-secondary', attorney: 'badge-error',
  inspector: 'badge-neutral', tc: 'badge-neutral', other: 'badge-ghost',
};

const ROLE_BG: Record<ContactRole, string> = {
  agent: 'bg-primary/10 border-primary/20',
  'agent-client': 'bg-gray-100 border-gray-300',
  buyer: 'bg-info/10 border-info/20',
  seller: 'bg-warning/10 border-warning/20',
  lender: 'bg-accent/10 border-accent/20',
  title: 'bg-secondary/10 border-secondary/20',
  attorney: 'bg-error/10 border-error/20',
  inspector: 'bg-base-300/50 border-base-300',
  tc: 'bg-base-300/50 border-base-300',
  other: 'bg-base-300/50 border-base-300',
};

const TEAM_ROLE_OPTIONS = [
  { value: 'tc',            label: 'Transaction Coordinator (TC)' },
  { value: 'showing_agent', label: 'Showing Agent' },
  { value: 'co_agent',      label: 'Co-Agent' },
  { value: 'admin',         label: 'Admin / Office Manager' },
  { value: 'buyers_agent',  label: "Buyer's Agent" },
  { value: 'listing_agent', label: 'Listing Agent' },
  { value: 'assistant',     label: 'Assistant' },
];

const emptyForm = (): Omit<DirectoryContact, 'id' | 'createdAt' | 'stateInfo' | 'clientId'> => ({
  name: '', email: '', phone: '', role: 'agent', company: '', states: [], mlsIds: [],
  isTeam: false, teamRoles: [], notes: '',
});

/* ── Multi-select dropdown component ───────────────────────────── */
function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  placeholder,
  disabled,
}: {
  label?: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
    else setSearch('');
  }, [open]);

  const toggle = (val: string) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };

  const filtered = search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg border text-sm bg-base-100 border-base-300 min-h-[2rem] ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:border-primary/50 cursor-pointer'}`}
      >
        <span className="flex flex-wrap gap-1 flex-1 min-w-0">
          {selected.length === 0 ? (
            <span className="text-base-content/40 text-xs">{placeholder ?? 'Select…'}</span>
          ) : (
            selected.map(v => {
              const opt = options.find(o => o.value === v);
              return (
                <span key={v} className="inline-flex items-center gap-1 bg-primary/15 text-primary text-xs font-medium px-1.5 py-0.5 rounded">
                  {opt?.label ?? v}
                  <span
                    className="cursor-pointer hover:text-error"
                    onMouseDown={e => { e.stopPropagation(); toggle(v); }}
                  >×</span>
                </span>
              );
            })
          )}
        </span>
        <ChevronDown size={12} className={`flex-none ml-1 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-base-100 border border-base-300 rounded-xl shadow-xl">
          {/* Search bar */}
          <div className="p-2 border-b border-base-300">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40" />
              <input
                ref={searchRef}
                type="text"
                className="input input-xs w-full pl-7 bg-base-200 border-0 rounded-lg"
                placeholder="Search states…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Escape' && setOpen(false)}
              />
            </div>
          </div>
          {/* Options list */}
          <div className="max-h-44 overflow-y-auto">
            {filtered.map(opt => (
              <label
                key={opt.value}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-base-200 cursor-pointer text-xs"
              >
                <input
                  type="checkbox"
                  className="checkbox checkbox-xs checkbox-primary"
                  checked={selected.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                />
                {opt.label}
              </label>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-3 text-xs text-base-content/40 text-center">No states match "{search}"</div>
            )}
          </div>
          {/* Footer with count */}
          {selected.length > 0 && (
            <div className="px-3 py-1.5 border-t border-base-300 flex items-center justify-between">
              <span className="text-xs text-base-content/50">{selected.length} selected</span>
              <button
                type="button"
                className="text-xs text-error hover:underline"
                onMouseDown={e => { e.stopPropagation(); onChange([]); }}
              >Clear all</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────── */
export const ContactsDirectory: React.FC<Props> = ({ directory, onUpdate, mlsEntries, triggerAdd, onTriggerHandled }) => {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<ContactRole | 'all'>('all');
  const [contactView, setContactView] = useState<'cards' | 'table'>('cards');
  const [tableRole, setTableRole] = useState<ContactRole | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<DirectoryContact | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [stateInfoMap, setStateInfoMap] = useState<AgentClientStateInfo[]>([]);
  const [expandedStates, setExpandedStates] = useState<Set<string>>(new Set());
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Handle external trigger from topbar quick-add
  useEffect(() => {
    if (triggerAdd === 'agent-client') {
      openAdd('agent-client');
      onTriggerHandled?.();
    } else if (triggerAdd === 'contact') {
      openAdd();
      onTriggerHandled?.();
    }
  }, [triggerAdd]); // eslint-disable-line react-hooks/exhaustive-deps

  // MLS options filtered by currently selected states in the form
  const availableMls = useMemo(() => {
    if (!form.states || form.states.length === 0) return mlsEntries;
    return mlsEntries.filter(m => form.states!.includes(m.state));
  }, [mlsEntries, form.states]);

  const filtered = useMemo(() => {
    const activeRole = contactView === 'table' ? tableRole : roleFilter;
    return directory.filter(c => {
      // 'buyer' filter matches buyer, seller, and end_client (all display as "End Client")
      const matchRole = activeRole === 'all'
        || c.role === activeRole
        || (activeRole === 'buyer' && (c.role === 'seller' || c.role === ('end_client' as string)));
      const q = search.toLowerCase();
      const matchSearch = !q ||
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.company ?? '').toLowerCase().includes(q) ||
        (c.states ?? []).some(s => s.toLowerCase().includes(q)) ||
        (c.clientId ?? '').toLowerCase().includes(q);
      return matchRole && matchSearch;
    });
  }, [directory, search, roleFilter, tableRole, contactView]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = { all: directory.length };
    for (const c of directory) counts[c.role] = (counts[c.role] ?? 0) + 1;
    return counts;
  }, [directory]);

  const openAdd = (presetRole?: string) => {
    setEditing(null);
    setForm({ ...emptyForm(), role: presetRole || 'buyer' as ContactRole });
    setStateInfoMap([]);
    setExpandedStates(new Set());
    setShowModal(true);
  };

  const openEdit = (c: DirectoryContact) => {
    setEditing(c);
    setForm({
      name: c.name, email: c.email, phone: c.phone, role: c.role,
      company: c.company ?? '', states: c.states ?? [], mlsIds: c.mlsIds ?? [],
      isTeam: c.isTeam ?? false, teamRoles: c.teamRoles ?? [], notes: c.notes ?? '',
    });
    setStateInfoMap(c.stateInfo ?? []);
    setExpandedStates(new Set());
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditing(null); setStateInfoMap([]); setExpandedStates(new Set()); };

  const handleSave = () => {
    if (!form.name.trim()) return;
    const isAgentClient = form.role === 'agent-client';
    const clientId = isAgentClient ? generateClientId(form.phone) : undefined;
    const stateInfo = isAgentClient ? stateInfoMap : undefined;
    if (editing) {
      onUpdate(directory.map(c => c.id === editing.id ? { ...editing, ...form, stateInfo, clientId } : c));
    } else {
      const newC: DirectoryContact = { id: generateId(), ...form, stateInfo, clientId, createdAt: new Date().toISOString() };
      onUpdate([newC, ...directory]);
    }
    closeModal();
  };

  const handleDelete = (id: string) => {
    onUpdate(directory.filter(c => c.id !== id));
    setDeleteId(null);
  };

  const setField = (key: keyof typeof form, val: any) => setForm(p => ({ ...p, [key]: val }));

  // When states change, remove mlsIds that no longer match, sync stateInfoMap
  const handleStatesChange = (states: string[]) => {
    const validMls = mlsEntries.filter(m => states.includes(m.state)).map(m => m.id);
    const filteredMlsIds = (form.mlsIds ?? []).filter(id => validMls.includes(id));
    setForm(p => ({ ...p, states, mlsIds: filteredMlsIds }));
    // Keep existing state info, add entries for new states, remove entries for removed states
    setStateInfoMap(prev => {
      const existing = new Map(prev.map(si => [si.state, si]));
      return states.map(s => existing.get(s) ?? emptyStateInfo(s));
    });
  };

  // Update a single field in a state's profile
  const updateStateInfo = (state: string, field: keyof Omit<AgentClientStateInfo, 'state' | 'links'>, value: string) => {
    setStateInfoMap(prev => prev.map(si => si.state === state ? { ...si, [field]: value } : si));
  };

  const updateStateLink = (state: string, index: number, value: string) => {
    setStateInfoMap(prev => prev.map(si => {
      if (si.state !== state) return si;
      const links = [...si.links];
      links[index] = value;
      return { ...si, links };
    }));
  };

  const addStateLink = (state: string) => {
    setStateInfoMap(prev => prev.map(si => si.state === state ? { ...si, links: [...si.links, ''] } : si));
  };

  const removeStateLink = (state: string, index: number) => {
    setStateInfoMap(prev => prev.map(si => {
      if (si.state !== state) return si;
      return { ...si, links: si.links.filter((_, i) => i !== index) };
    }));
  };

  const toggleStateExpanded = (state: string) => {
    setExpandedStates(prev => {
      const next = new Set(prev);
      next.has(state) ? next.delete(state) : next.add(state);
      return next;
    });
  };

  const stateOptions = US_STATES.map(s => ({ value: s, label: s }));
  const mlsOptions = availableMls.map(m => ({ value: m.id, label: `${m.name} (${m.state})` }));

  return (
    <div className="flex flex-col h-full bg-base-100 overflow-hidden">
      {/* Header */}
      <div className="flex-none border-b border-base-300 bg-base-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {contactView === 'table' && (
              <button
                onClick={() => { setContactView('cards'); setSearch(''); }}
                className="btn btn-ghost btn-sm btn-square"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <div className="w-9 h-9 bg-primary/15 rounded-xl flex items-center justify-center">
              <Users size={18} className="text-primary" />
            </div>
            <div>
              <h1 className="font-bold text-base text-black">
                {contactView === 'cards'
                  ? 'Contact Directory'
                  : ROLE_CARDS.find(r => r.id === tableRole)?.label ?? 'All Contacts'}
              </h1>
              <p className="text-xs text-black/50">
                {contactView === 'cards'
                  ? `${directory.length} contacts · select a category`
                  : `${filtered.length} contact${filtered.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => openAdd('agent-client')} className="btn btn-sm btn-outline gap-2">
              <Plus size={14} /> New Agent Client
            </button>
            <button onClick={() => openAdd()} className="btn btn-primary btn-sm gap-2">
              <Plus size={14} /> Add Contact
            </button>
          </div>
        </div>

        {/* Search bar — only in table view */}
        {contactView === 'table' && (
          <div className="mt-3 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" />
            <input
              className="input input-sm input-bordered w-full pl-8 bg-base-100"
              placeholder="Search name, email, company, state…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Content: Role Cards OR Table */}
      <div className="flex-1 overflow-y-auto">
        {contactView === 'cards' ? (
          /* ── Role Category Cards ── */
          <div className="p-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {ROLE_CARDS.map(card => {
                const count = card.id === 'buyer'
                  ? (roleCounts['buyer'] ?? 0) + (roleCounts['seller'] ?? 0) + (roleCounts['end_client'] ?? 0)
                  : (roleCounts[card.id] ?? 0);
                const Icon = card.icon;
                return (
                  <button
                    key={card.id}
                    onClick={() => {
                      setTableRole(card.id as ContactRole);
                      setRoleFilter(card.id as ContactRole | 'all');
                      setSearch('');
                      setContactView('table');
                    }}
                    className={`flex flex-col items-start gap-3 p-4 rounded-xl border-2 ${card.bg} ${card.border} hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 text-left`}
                  >
                    <div className={`w-10 h-10 rounded-lg bg-white/70 flex items-center justify-center shadow-sm`}>
                      <Icon size={20} className={card.iconColor} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-black leading-tight">{card.label}</p>
                      <span className={`inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded-full ${card.countBg}`}>
                        {count} {count === 1 ? 'contact' : 'contacts'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* ── Contacts Table ── */
          <div className="p-6">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-base-content/30 gap-3">
                <Users size={40} strokeWidth={1} />
                <p className="text-sm">No contacts found</p>
              </div>
            ) : (
              <div className="rounded-xl border border-base-300 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-100 border-b border-base-300">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-black uppercase tracking-wide">Name</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-black uppercase tracking-wide hidden sm:table-cell">Phone</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-black uppercase tracking-wide hidden md:table-cell">Email</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-black uppercase tracking-wide hidden lg:table-cell">Company / States</th>
                      <th className="px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c, idx) => {
                      const initials = c.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                      const card = ROLE_CARDS.find(r => r.id === c.role || (r.id === 'buyer' && (c.role === 'seller' || c.role === 'end_client' as string)));
                      return (
                        <tr
                          key={c.id}
                          className={`border-b border-base-200 hover:bg-base-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                        >
                          {/* Name + avatar */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-none ${card?.bg ?? 'bg-gray-100'} ${card?.iconColor ?? 'text-gray-600'}`}>
                                {initials}
                              </div>
                              <div>
                                <p className="font-semibold text-black text-sm leading-tight flex items-center gap-1.5">
                                  {c.name}
                                  {c.role === 'agent-client' && (
                                    <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">our client</span>
                                  )}
                                </p>
                                {c.clientId && (
                                  <p className="text-xs text-black/40 mt-0.5">{c.clientId}</p>
                                )}
                                {/* Show phone/email inline on mobile */}
                                <div className="sm:hidden text-xs text-black/50 mt-0.5 space-y-0.5">
                                  {c.phone && <p>{c.phone}</p>}
                                  {c.email && <p>{c.email}</p>}
                                </div>
                              </div>
                            </div>
                          </td>
                          {/* Phone */}
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <span className="text-black/70 text-xs">{c.phone || '—'}</span>
                          </td>
                          {/* Email */}
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className="text-black/70 text-xs">{c.email || '—'}</span>
                          </td>
                          {/* Company / States */}
                          <td className="px-4 py-3 hidden lg:table-cell">
                            {c.company ? (
                              <div className="flex items-center gap-1 text-xs text-black/70">
                                <Building2 size={12} className="flex-none" />
                                <span>{c.company}</span>
                              </div>
                            ) : c.states && c.states.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {c.states.slice(0, 3).map(s => (
                                  <span key={s} className="text-xs bg-gray-100 text-black px-1.5 py-0.5 rounded">{s}</span>
                                ))}
                                {c.states.length > 3 && <span className="text-xs text-black/40">+{c.states.length - 3}</span>}
                              </div>
                            ) : (
                              <span className="text-black/30 text-xs">—</span>
                            )}
                          </td>
                          {/* Actions */}
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => openEdit(c)} className="btn btn-ghost btn-xs btn-square" title="Edit">
                                <Pencil size={13} />
                              </button>
                              <button onClick={() => setDeleteId(c.id)} className="btn btn-ghost btn-xs btn-square text-error" title="Delete">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-md border border-base-300 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-base-300 flex-none">
              <h2 className="font-bold text-base">{editing ? 'Edit Contact' : 'Add New Contact'}</h2>
              <button onClick={closeModal} className="btn btn-ghost btn-xs btn-square"><X size={14} /></button>
            </div>

            {/* Modal Body */}
            <div className="px-5 py-4 flex flex-col gap-3 overflow-y-auto">
              {/* Name + Role always visible */}
              <div className="form-control">
                <label className="label py-1"><span className="label-text text-xs font-medium">Full Name *</span></label>
                <input className="input input-sm input-bordered" placeholder="e.g. John Smith" value={form.name} onChange={e => setField('name', e.target.value)} />
              </div>

              <div className="form-control">
                <label className="label py-1"><span className="label-text text-xs font-medium">Role *</span></label>
                <select className="select select-sm select-bordered" value={form.role} onChange={e => setField('role', e.target.value as ContactRole)}>
                  {ROLES.filter(r => r.id !== 'all').map(r => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="form-control">
                  <label className="label py-1"><span className="label-text text-xs font-medium">Email</span></label>
                  <input className="input input-sm input-bordered" type="email" placeholder="email@example.com" value={form.email} onChange={e => setField('email', e.target.value)} />
                </div>
                <div className="form-control">
                  <label className="label py-1"><span className="label-text text-xs font-medium">Phone</span></label>
                  <input className="input input-sm input-bordered" type="tel" placeholder="+1-555-000-0000" value={form.phone} onChange={e => setField('phone', formatPhoneLive(e.target.value))} />
                </div>
              </div>

              {/* Agent Client extended fields */}
              {form.role === 'agent-client' && (<>
              <div className="form-control">
                <label className="label py-1"><span className="label-text text-xs font-medium">Company</span></label>
                <input className="input input-sm input-bordered" placeholder="Company name" value={form.company as string} onChange={e => setField('company', e.target.value)} />
              </div>

              {/* Team Section */}
              <div className="border border-gray-300 rounded-lg overflow-hidden">
                {/* Header row - Are you a team? */}
                <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50">
                  <div>
                    <span className="text-xs font-semibold text-black">Team Members &amp; Admin</span>
                    <p className="text-xs text-gray-500 mt-0.5">Does this agent client have a team?</p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <span className={`text-xs font-medium ${form.isTeam ? 'text-gray-400' : 'text-black'}`}>No</span>
                    <div
                      onClick={() => { setField('isTeam', !form.isTeam); if (form.isTeam) setField('teamRoles', []); }}
                      className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${form.isTeam ? 'bg-blue-500' : 'bg-gray-300'}`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.isTeam ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </div>
                    <span className={`text-xs font-medium ${form.isTeam ? 'text-black' : 'text-gray-400'}`}>Yes</span>
                  </label>
                </div>

                {/* Role checkboxes - shown when isTeam is true */}
                {form.isTeam && (
                  <div className="px-3 py-3 bg-white border-t border-gray-200">
                    <p className="text-xs text-gray-500 mb-2">Select all roles that apply to this team:</p>
                    <div className="grid grid-cols-2 gap-2">
                      {TEAM_ROLE_OPTIONS.map(opt => {
                        const checked = (form.teamRoles ?? []).includes(opt.value);
                        return (
                          <label key={opt.value} className="flex items-center gap-2 cursor-pointer group">
                            <div
                              onClick={() => {
                                const current = form.teamRoles ?? [];
                                setField('teamRoles', checked ? current.filter(r => r !== opt.value) : [...current, opt.value]);
                              }}
                              className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors cursor-pointer ${checked ? 'bg-blue-500 border-blue-500' : 'border-gray-300 group-hover:border-blue-400'}`}
                            >
                              {checked && (
                                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                  <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </div>
                            <span className={`text-xs ${checked ? 'text-black font-medium' : 'text-gray-600'}`}>{opt.label}</span>
                          </label>
                        );
                      })}
                    </div>
                    {(form.teamRoles ?? []).length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap gap-1">
                        {(form.teamRoles ?? []).map(r => (
                          <span key={r} className="badge badge-sm bg-blue-100 text-blue-700 border-blue-200 font-normal">
                            {TEAM_ROLE_OPTIONS.find(o => o.value === r)?.label ?? r}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* States multi-select */}
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-medium">States Licensed / Operating In</span>
                  {(form.states ?? []).length > 0 && (
                    <span className="label-text-alt text-xs text-base-content/40">{(form.states ?? []).length} selected</span>
                  )}
                </label>
                <MultiSelectDropdown
                  options={stateOptions}
                  selected={form.states ?? []}
                  onChange={handleStatesChange}
                  placeholder="Select states…"
                />
              </div>

              {/* MLS multi-select — filtered by selected states */}
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-medium">Associated MLS</span>
                  {(form.states ?? []).length === 0 && mlsEntries.length > 0 && (
                    <span className="label-text-alt text-xs text-amber-500">Select a state to filter MLS</span>
                  )}
                  {(form.states ?? []).length > 0 && availableMls.length === 0 && (
                    <span className="label-text-alt text-xs text-base-content/40">No MLS for selected states</span>
                  )}
                </label>
                <MultiSelectDropdown
                  options={mlsOptions}
                  selected={form.mlsIds ?? []}
                  onChange={v => setField('mlsIds', v)}
                  placeholder={mlsEntries.length === 0 ? 'No MLS entries yet — add them in MLS tab' : 'Select MLS boards…'}
                  disabled={mlsEntries.length === 0}
                />
              </div>
              </>)}

              {/* Per-State Profile + Notes (Agent Client only) */}
              {form.role === 'agent-client' && (form.states ?? []).length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="label-text text-xs font-semibold text-black">State Profiles</span>
                    <span className="badge badge-xs badge-outline">{(form.states ?? []).length}</span>
                  </div>
                  {(form.states ?? []).map(state => {
                    const si = stateInfoMap.find(x => x.state === state) ?? emptyStateInfo(state);
                    const expanded = expandedStates.has(state);
                    return (
                      <div key={state} className="border border-gray-300 rounded-lg overflow-hidden">
                        {/* State header */}
                        <button
                          type="button"
                          onClick={() => toggleStateExpanded(state)}
                          className="w-full flex items-center justify-between px-3 py-2 bg-gray-100 hover:bg-gray-200 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <MapPin size={12} className="text-gray-500" />
                            <span className="text-xs font-semibold text-black">{state}</span>
                            {(si.closingType || si.commissionType) && (
                              <span className="text-xs text-gray-500">
                                {si.closingType && `• ${si.closingType}`}
                                {si.commissionType && ` • ${si.commissionType === 'cda' ? 'CDA' : 'Comm. Letter'}`}
                              </span>
                            )}
                          </div>
                          <ChevronDown size={13} className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                        </button>

                        {/* Expanded content */}
                        {expanded && (
                          <div className="px-3 py-3 flex flex-col gap-3 bg-base-100">
                            {/* 1) Closing type */}
                            <div className="grid grid-cols-2 gap-2">
                              <div className="form-control">
                                <label className="label py-0.5"><span className="label-text text-xs">Closing Type</span></label>
                                <select
                                  className="select select-xs select-bordered"
                                  value={si.closingType}
                                  onChange={e => updateStateInfo(state, 'closingType', e.target.value as any)}
                                >
                                  <option value="">— Select —</option>
                                  <option value="escrow">Escrow State</option>
                                  <option value="attorney">Attorney State</option>
                                </select>
                              </div>
                              {/* 2) Commission type */}
                              <div className="form-control">
                                <label className="label py-0.5"><span className="label-text text-xs">Commission</span></label>
                                <select
                                  className="select select-xs select-bordered"
                                  value={si.commissionType}
                                  onChange={e => updateStateInfo(state, 'commissionType', e.target.value as any)}
                                >
                                  <option value="">— Select —</option>
                                  <option value="commission-letter">Commission Letter</option>
                                  <option value="cda">Request CDA</option>
                                </select>
                              </div>
                            </div>

                            {/* 3) Broker Info */}
                            <div>
                              <p className="text-xs font-medium text-base-content/60 mb-1.5">Broker Info</p>
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  className="input input-xs input-bordered"
                                  type="email"
                                  placeholder="Broker email"
                                  value={si.brokerEmail}
                                  onChange={e => updateStateInfo(state, 'brokerEmail', e.target.value)}
                                />
                                <input
                                  className="input input-xs input-bordered"
                                  type="tel"
                                  placeholder="Broker phone"
                                  value={si.brokerPhone}
                                  onChange={e => updateStateInfo(state, 'brokerPhone', formatPhoneLive(e.target.value))}
                                />
                              </div>
                            </div>

                            {/* 4) Compliance Manager */}
                            <div>
                              <p className="text-xs font-medium text-base-content/60 mb-1.5">Compliance Manager</p>
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  className="input input-xs input-bordered"
                                  type="email"
                                  placeholder="Compliance email"
                                  value={si.complianceEmail}
                                  onChange={e => updateStateInfo(state, 'complianceEmail', e.target.value)}
                                />
                                <input
                                  className="input input-xs input-bordered"
                                  type="tel"
                                  placeholder="Compliance phone"
                                  value={si.compliancePhone}
                                  onChange={e => updateStateInfo(state, 'compliancePhone', formatPhoneLive(e.target.value))}
                                />
                              </div>
                            </div>

                            {/* 5) eSignature App */}
                            <div className="form-control">
                              <label className="label py-0.5"><span className="label-text text-xs">eSignature Application</span></label>
                              <input
                                className="input input-xs input-bordered"
                                placeholder="e.g. DocuSign, DotLoop, Authentisign…"
                                value={si.eSignatureApp}
                                onChange={e => updateStateInfo(state, 'eSignatureApp', e.target.value)}
                              />
                            </div>

                            {/* 6) Links */}
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <p className="text-xs font-medium text-base-content/60">Resource Links</p>
                                <button
                                  type="button"
                                  onClick={() => addStateLink(state)}
                                  className="btn btn-ghost btn-xs gap-1 text-gray-600 hover:text-black h-5 min-h-0 px-1"
                                >
                                  <PlusCircle size={11} /> Add Link
                                </button>
                              </div>
                              {si.links.length === 0 && (
                                <p className="text-xs text-base-content/30 italic">No links added yet</p>
                              )}
                              {si.links.map((link, li) => (
                                <div key={li} className="flex gap-1 mb-1">
                                  <span className="flex items-center"><Link size={10} className="text-base-content/30" /></span>
                                  <input
                                    className="input input-xs input-bordered flex-1"
                                    placeholder="https://…"
                                    value={link}
                                    onChange={e => updateStateLink(state, li, e.target.value)}
                                  />
                                  <button type="button" onClick={() => removeStateLink(state, li)} className="btn btn-ghost btn-xs btn-square h-6 min-h-0">
                                    <X size={10} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {form.role === 'agent-client' && (
                <div className="form-control">
                  <label className="label py-1"><span className="label-text text-xs font-medium">Notes</span></label>
                  <textarea className="textarea textarea-bordered textarea-sm resize-none" rows={2} placeholder="Any notes…" value={form.notes as string} onChange={e => setField('notes', e.target.value)} />
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-base-300 flex-none">
              <button onClick={closeModal} className="btn btn-ghost btn-sm">Cancel</button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim()}
                className="btn btn-primary btn-sm gap-2"
              >
                <Save size={13} />
                {editing ? 'Save Changes' : 'Add Contact'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      <ConfirmModal
        isOpen={deleteId !== null}
        title="Delete Contact?"
        message="This will remove the contact from the directory. It won't affect deals they're already assigned to."
        confirmLabel="Delete"
        onConfirm={() => { if (deleteId) { handleDelete(deleteId); } }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
};

const ContactCard: React.FC<{
  contact: DirectoryContact;
  mlsEntries: MlsEntry[];
  onEdit: () => void;
  onDelete: () => void;
}> = ({ contact: c, mlsEntries, onEdit, onDelete }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const assignedMls = mlsEntries.filter(m => (c.mlsIds ?? []).includes(m.id));

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 bg-base-200 hover:bg-base-200/80 transition-colors group ${ROLE_BG[c.role]}`}>
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-base-content truncate">{c.name}</div>
          {c.company && <div className="text-xs text-base-content/55 truncate">{c.company}</div>}
          {c.role === 'agent-client' && c.clientId && (
            <div className="flex items-center gap-1 mt-0.5">
              <Fingerprint size={10} className="text-gray-400" />
              <span className="text-xs font-mono text-black font-semibold">{c.clientId}</span>
            </div>
          )}
          {c.role === 'agent-client' && c.isTeam && (c.teamRoles ?? []).length > 0 && (
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              <span className="text-xs text-gray-400">Team:</span>
              {(c.teamRoles ?? []).slice(0, 3).map(r => (
                <span key={r} className="badge badge-xs bg-blue-50 text-blue-600 border-blue-100 font-normal">
                  {TEAM_ROLE_OPTIONS.find(o => o.value === r)?.label?.split(' ')[0] ?? r}
                </span>
              ))}
              {(c.teamRoles ?? []).length > 3 && (
                <span className="text-xs text-gray-400">+{(c.teamRoles ?? []).length - 3}</span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-none">
          <span className={`badge badge-xs font-medium ${ROLE_COLOR[c.role]}`}>
            {roleLabel(c.role)}
          </span>
        </div>
      </div>

      {/* Contact details */}
      <div className="flex flex-col gap-1.5">
        {c.email && (
          <div className="flex items-center gap-2 text-xs text-base-content/60">
            <Mail size={11} className="flex-none text-base-content/40" />
            <span className="truncate">{c.email}</span>
          </div>
        )}
        {c.phone && (
          <div className="flex items-center gap-2 text-xs text-base-content/60">
            <Phone size={11} className="flex-none text-base-content/40" />
            <span>{formatPhone(c.phone)}</span>
          </div>
        )}
        {c.states && c.states.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-base-content/60">
            <MapPin size={11} className="flex-none text-base-content/40" />
            <span>{c.states.join(', ')}</span>
          </div>
        )}
        {assignedMls.length > 0 && (
          <div className="flex items-start gap-2 text-xs text-base-content/60">
            <Globe size={11} className="flex-none text-base-content/40 mt-0.5" />
            <span className="flex flex-wrap gap-1">
              {assignedMls.map(m => (
                <span key={m.id} className="bg-base-300 px-1.5 py-0.5 rounded text-xs">{m.name}</span>
              ))}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end pt-1 border-t border-base-300/50">
        <div className="relative">
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="btn btn-ghost btn-xs btn-square"
          >
            <MoreVertical size={13} />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 bottom-full mb-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl min-w-[160px] py-1"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <button
                className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                onClick={() => { setMenuOpen(false); onEdit(); }}
              >
                <Pencil size={12} /> Edit Contact
              </button>
              <button
                className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                onClick={() => { setMenuOpen(false); onDelete(); }}
              >
                <Trash2 size={12} /> Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
