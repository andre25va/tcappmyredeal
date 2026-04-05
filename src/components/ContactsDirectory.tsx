import React, { useState, useMemo, useEffect } from 'react';
import {
  Users, Plus, Search, Pencil, Trash2, Phone, Mail,
  X, Star,
  Home, DollarSign, Scale, ClipboardCheck,
  ArrowLeft, Shield, FileText, SendHorizontal, Loader2, Sparkles,
} from 'lucide-react';
import { ContactRecord, ContactRole } from '../types';
import {
  loadContactsFull, deleteContactRecord,
} from '../utils/supabaseDb';
import { ContactModal, SavedContact } from './ContactModal';
import { formatPhoneLive, roleLabel } from '../utils/helpers';
import { ConfirmModal } from './ConfirmModal';
import { ClientOnboardingWizard } from './ClientOnboardingWizard';
import { CallButton } from './CallButton';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Button } from "./ui/Button";
import { useOrgContacts, useInvalidateOrgContacts } from '../hooks/useOrgContacts';

// ── Constants ────────────────────────────────────────────────────────────────

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
];

const TIMEZONES = [
  { value: '', label: 'Select timezone...' },
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Anchorage', label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HT)' },
];

type CategoryKey = 'agent' | 'lender' | 'title' | 'attorney' | 'inspector' | 'buyer_seller' | 'tc' | 'other';

interface CategoryDef {
  key: CategoryKey;
  label: string;
  roles: ContactRole[];
  icon: React.ReactNode;
  bg: string;
  border: string;
  text: string;
}

const CATEGORIES: CategoryDef[] = [
  { key: 'agent', label: 'Agents', roles: ['agent'], icon: <Users size={22} />, bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-600' },
  { key: 'lender', label: 'Lenders', roles: ['lender'], icon: <DollarSign size={22} />, bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-600' },
  { key: 'title', label: 'Title', roles: ['title'], icon: <FileText size={22} />, bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-600' },
  { key: 'attorney', label: 'Attorneys', roles: ['attorney'], icon: <Scale size={22} />, bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-600' },
  { key: 'inspector', label: 'Inspectors', roles: ['inspector'], icon: <ClipboardCheck size={22} />, bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-600' },
  { key: 'buyer_seller', label: 'Clients', roles: ['client', 'buyer', 'seller'], icon: <Home size={22} />, bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-600' },
  { key: 'tc', label: 'TCs', roles: ['tc'], icon: <Shield size={22} />, bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-600' },
  { key: 'other', label: 'Other', roles: ['appraiser', 'other'], icon: <Users size={22} />, bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-600' },
];

const ROLE_OPTIONS: { value: ContactRole; label: string }[] = [
  { value: 'agent', label: 'Agent' },
  { value: 'client', label: 'Client' },
  { value: 'lender', label: 'Lender' },
  { value: 'title', label: 'Title' },
  { value: 'attorney', label: 'Attorney' },
  { value: 'inspector', label: 'Inspector' },
  { value: 'appraiser', label: 'Appraiser' },
  { value: 'tc', label: 'TC' },
  { value: 'other', label: 'Other' },
];

function roleColor(r: ContactRole): string {
  const map: Record<string, string> = {
    agent: 'bg-blue-100 text-blue-700',
    lender: 'bg-green-100 text-green-700',
    title: 'bg-orange-100 text-orange-700',
    attorney: 'bg-red-100 text-red-700',
    inspector: 'bg-gray-100 text-gray-700',
    client: 'bg-teal-100 text-teal-700',
    buyer: 'bg-teal-100 text-teal-700',
    seller: 'bg-teal-100 text-teal-700',
    tc: 'bg-indigo-100 text-indigo-700',
    appraiser: 'bg-slate-100 text-slate-700',
    other: 'bg-slate-100 text-slate-700',
  };
  return map[r] ?? 'bg-slate-100 text-slate-700';
}

function avatarBg(r: ContactRole): string {
  const map: Record<string, string> = {
    agent: 'bg-blue-200 text-blue-800',
    lender: 'bg-green-200 text-green-800',
    title: 'bg-orange-200 text-orange-800',
    attorney: 'bg-red-200 text-red-800',
    inspector: 'bg-gray-200 text-gray-800',
    client: 'bg-teal-200 text-teal-800',
    buyer: 'bg-teal-200 text-teal-800',
    seller: 'bg-teal-200 text-teal-800',
    tc: 'bg-indigo-200 text-indigo-800',
    appraiser: 'bg-slate-200 text-slate-800',
    other: 'bg-slate-200 text-slate-800',
  };
  return map[r] ?? 'bg-slate-200 text-slate-800';
}

function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

// ── Component ─ (types moved to ContactModal.tsx) ─────────────────────────────

// ── Component ────────────────────────────────────────────────────────────────

interface CallStartedData {
  contactName: string;
  contactPhone: string;
  contactId?: string;
  dealId?: string;
  callSid?: string;
  startedAt: string;
}

interface Props {
  triggerAdd?: 'agent' | 'contact' | null;
  onTriggerHandled?: () => void;
  onDirectoryChanged?: () => void;
  onCallStarted?: (callData: CallStartedData) => void;
  onContactUpdated?: (contactId: string, fullName: string, phone: string, email: string) => void;
}


export function ContactsDirectory({ triggerAdd, onTriggerHandled, onDirectoryChanged, onCallStarted, onContactUpdated }: Props) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<CategoryKey | null>(null);

  // ── Contact modal state ─────────────────────────────────────────────────────
  const [contactModal, setContactModal] = useState<
    null | { mode: 'add'; role: ContactRole } | { mode: 'edit'; contact: ContactRecord }
  >(null);

  const { isMasterAdmin: isMasterAdminFn, primaryOrgId: primaryOrgIdFn } = useAuth();
  const isMasterAdmin = isMasterAdminFn();
  const primaryOrgId = primaryOrgIdFn();

  // ── TanStack Query: contacts ─────────────────────────────────────────────────
  const { data: contacts = [], isLoading: loading } = useOrgContacts(primaryOrgId);
  const invalidateOrgContacts = useInvalidateOrgContacts();

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<ContactRecord | null>(null);

  // Onboarding wizard
  const [onboardingContact, setOnboardingContact] = useState<ContactRecord | null>(null);

  // Quick Send Onboarding modal
  const [sendOnboardingTarget, setSendOnboardingTarget] = useState<ContactRecord | null>(null);
  const [onboardChannel, setOnboardChannel] = useState<'sms' | 'whatsapp' | 'email'>('sms');
  const [onboardMsg, setOnboardMsg] = useState('');
  const [onboardSending, setOnboardSending] = useState(false);
  const [onboardToast, setOnboardToast] = useState('');


  function openSendOnboarding(c: ContactRecord) {
    const msg = `Hi ${c.firstName}! I'm Andre, your Transaction Coordinator at MyReDeal. I'll be managing your deals from contract to close — I'll send updates here. Reply anytime with questions! 🏠`;
    setOnboardMsg(msg);
    setOnboardChannel(c.phone ? 'sms' : 'email');
    setSendOnboardingTarget(c);
  }

  async function sendOnboarding() {
    if (!sendOnboardingTarget) return;
    setOnboardSending(true);
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    try {
      const c = sendOnboardingTarget;
      if (onboardChannel === 'sms' || onboardChannel === 'whatsapp') {
        const phone = c.phone.replace(/\D/g, '');
        const e164 = phone.length === 10 ? `+1${phone}` : `+${phone}`;
        const res = await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseAnonKey}` },
          body: JSON.stringify({ to: e164, body: onboardMsg }),
        });
        if (!res.ok) throw new Error('Send failed');
      } else {
        const bodyHtml = onboardMsg.replace(/\n/g, '<br/>');
        const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseAnonKey}` },
          body: JSON.stringify({
            to: [c.email],
            subject: 'Welcome — Your Transaction Coordinator is Here',
            bodyHtml,
          }),
        });
        if (!res.ok) throw new Error('Send failed');
      }
      setOnboardToast('✓ Onboarding message sent!');
      setTimeout(() => { setOnboardToast(''); setSendOnboardingTarget(null); }, 2000);
    } catch {
      setOnboardToast('✗ Failed to send. Check phone/email.');
    } finally {
      setOnboardSending(false);
    }
  }


  // ── Handle triggerAdd ────────────────────────────────────────────────────────
  useEffect(() => {
    if (triggerAdd) {
      const role: ContactRole = triggerAdd === 'agent' ? 'agent' : 'other';
      setContactModal({ mode: 'add', role });
      onTriggerHandled?.();
    }
  }, [triggerAdd, onTriggerHandled]);

  // ── Counts per category ──────────────────────────────────────────────────────
  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryKey, number> = {
      agent: 0, lender: 0, title: 0, attorney: 0,
      inspector: 0, buyer_seller: 0, tc: 0, other: 0,
    };
    for (const c of contacts) {
      if (c.contactType === 'staff') continue; // Staff managed in Settings
      const cat = CATEGORIES.find(cat => cat.roles.includes(c.contactType));
      if (cat) counts[cat.key]++;
      else counts.other++;
    }
    return counts;
  }, [contacts]);

  // ── Filtered contacts (search + category) ──────────────────────────────────
  const filtered = useMemo(() => {
    let list = contacts.filter(c => c.contactType !== 'staff'); // Staff managed in Settings
    // Org scoping
    if (!isMasterAdmin) {
      if (primaryOrgId) {
        list = list.filter(c => c.orgId === primaryOrgId);
      } else {
        list = list.filter(c => !c.orgId);
      }
    }
    if (activeCategory) {
      const cat = CATEGORIES.find(c => c.key === activeCategory);
      if (cat) list = list.filter(c => cat.roles.includes(c.contactType));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.fullName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.company.toLowerCase().includes(q)
      );
    }
    return list;
  }, [contacts, activeCategory, search, isMasterAdmin, primaryOrgId]);

  // ── Open/close contact modal ─────────────────────────────────────────────
  const openAdd = (role: ContactRole = 'other') => setContactModal({ mode: 'add', role });
  const openEdit = (c: ContactRecord) => setContactModal({ mode: 'edit', contact: c });


  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteContactRecord(deleteTarget.id, 'TC');
      invalidateOrgContacts(primaryOrgId);
      onDirectoryChanged?.();
    } catch (err) {
      console.error('Delete failed:', err);
    }
    setDeleteTarget(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          {activeCategory && (
            <button className="btn btn-ghost btn-sm" onClick={() => setActiveCategory(null)}>
              <ArrowLeft size={16} />
            </button>
          )}
          <h1 className="text-xl font-bold text-base-content flex items-center gap-2">
            <Users size={22} className="text-primary" />
            {activeCategory
              ? CATEGORIES.find(c => c.key === activeCategory)?.label ?? 'Contacts'
              : 'Contacts Directory'}
          </h1>
          <span className="badge badge-ghost badge-sm">{filtered.length}</span>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40" />
            <input
              type="text"
              placeholder="Search contacts..."
              className="input input-sm input-bordered pl-8 w-full sm:w-56"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button className="btn btn-primary btn-sm gap-1" onClick={() => openAdd()}>
            <Plus size={14} /> Add Contact
          </button>
        </div>
      </div>

      {/* Category Cards */}
      {!activeCategory && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`border rounded-lg p-4 flex flex-col items-center gap-2 hover:shadow-md transition-shadow cursor-pointer ${cat.bg} ${cat.border}`}
            >
              <span className={cat.text}>{cat.icon}</span>
              <span className={`text-sm font-semibold ${cat.text}`}>{cat.label}</span>
              <span className={`text-lg font-bold ${cat.text}`}>{categoryCounts[cat.key]}</span>
            </button>
          ))}
        </div>
      )}

      {/* Table View */}
      {(activeCategory || search.trim()) && (
        <div className="overflow-x-auto">
          <table className="table table-sm w-full">
            <thead>
              <tr className="text-xs text-base-content/50 uppercase">
                <th>Name</th>
                <th className="hidden sm:table-cell">Email</th>
                <th className="hidden sm:table-cell">Phone</th>
                <th className="hidden md:table-cell">Company</th>
                <th className="hidden lg:table-cell">States</th>
                <th className="w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center text-base-content/40 py-8">No contacts found</td></tr>
              )}
              {filtered.map(c => (
                <tr
                  key={c.id}
                  className="hover:bg-base-200 cursor-pointer"
                  onClick={() => openEdit(c)}
                >
                  <td>
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${avatarBg(c.contactType)}`}>
                        {getInitials(c.fullName)}
                      </div>
                      <div>
                        <div className="font-medium text-sm flex items-center gap-1">
                          {c.fullName}
                          {c.isClient && <Star size={12} className="text-amber-500 fill-amber-500" />}
                        </div>
                        <div className="text-xs text-base-content/50">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${roleColor(c.contactType)}`}>
                            {roleLabel(c.contactType)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="hidden sm:table-cell text-xs text-base-content/70">{c.email || '—'}</td>
                  <td className="hidden sm:table-cell text-xs text-base-content/70">{c.phone || '—'}</td>
                  <td className="hidden md:table-cell text-xs text-base-content/70">{c.company || '—'}</td>
                  <td className="hidden lg:table-cell">
                    <div className="flex gap-1 flex-wrap">
                      {c.licenses.map(l => (
                        <span key={l.id} className="badge badge-xs badge-outline">{l.stateCode}</span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      {c.phone && (
                        <CallButton
                          phoneNumber={c.phone}
                          contactName={c.fullName}
                          contactId={c.id}
                          deals={[]}
                          size="sm"
                          variant="icon"
                          onCallStarted={(callId) => onCallStarted?.({
                            contactName: c.fullName,
                            contactPhone: c.phone,
                            contactId: c.id,
                            callSid: callId,
                            startedAt: new Date().toISOString(),
                          })}
                        />
                      )}
                      <button className="btn btn-ghost btn-xs" onClick={() => openEdit(c)} title="Edit">
                        <Pencil size={13} />
                      </button>
                      <button className="btn btn-ghost btn-xs text-success" onClick={() => openSendOnboarding(c)} title="Send Onboarding">
                        <SendHorizontal size={13} />
                      </button>
                      <button className="btn btn-ghost btn-xs text-purple-500" onClick={() => setOnboardingContact(c)} title="Open Onboarding Wizard">
                        <Sparkles size={13} />
                      </button>
                      <button className="btn btn-ghost btn-xs text-error" onClick={() => setDeleteTarget(c)} title="Delete">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!activeCategory && !search.trim() && contacts.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-base-content/40 mb-2">Click a category above to view contacts, or use search.</p>
        </div>
      )}

      {/* Contact modal — shared with contacts page */}
      {contactModal !== null && (
        <ContactModal
          isOpen={true}
          contact={contactModal.mode === 'edit' ? contactModal.contact : null}
          defaultRole={contactModal.mode === 'add' ? contactModal.role : undefined}
          allContacts={contacts}
          onClose={() => setContactModal(null)}
          onSaved={async (saved: SavedContact) => {
            invalidateOrgContacts(primaryOrgId);
            if (saved.isNewClient) {
              // Fetch fresh data to find the newly created contact for onboarding flow
              const all = await loadContactsFull();
              const c = all.find((x) => x.id === saved.id);
              if (c) setOnboardingContact(c);
            } else {
              onDirectoryChanged?.();
            }
            onContactUpdated?.(saved.id, saved.fullName, saved.phone, saved.email);
          }}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete Contact"
        message={deleteTarget ? `Are you sure you want to delete "${deleteTarget.fullName}"? This will also remove their licenses and MLS memberships.` : ''}
        confirmLabel="Delete"
        confirmClass="btn-error"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Quick Send Onboarding Modal */}
      {sendOnboardingTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-base-100 rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-base-300">
              <div className="flex items-center gap-2">
                <SendHorizontal size={18} className="text-primary" />
                <div>
                  <h3 className="font-semibold text-sm">Send Onboarding</h3>
                  <p className="text-xs text-base-content/50">{sendOnboardingTarget.fullName}</p>
                </div>
              </div>
              <button className="btn btn-ghost btn-sm btn-circle" onClick={() => setSendOnboardingTarget(null)}>
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-base-content/60 uppercase tracking-wide mb-2 block">Send via</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setOnboardChannel('sms')}
                    className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-all ${onboardChannel === 'sms' ? 'bg-primary text-primary-content border-primary' : 'border-base-300 hover:border-primary/50'}`}
                  >
                    📱 SMS
                  </button>
                  <button
                    onClick={() => setOnboardChannel('whatsapp')}
                    className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-all ${onboardChannel === 'whatsapp' ? 'bg-success text-success-content border-success' : 'border-base-300 hover:border-success/50'}`}
                  >
                    💬 WhatsApp
                  </button>
                  <button
                    onClick={() => setOnboardChannel('email')}
                    className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-all ${onboardChannel === 'email' ? 'bg-secondary text-secondary-content border-secondary' : 'border-base-300 hover:border-secondary/50'}`}
                  >
                    ✉️ Email
                  </button>
                </div>
                <p className="text-xs text-base-content/40 mt-1 ml-1">
                  {onboardChannel === 'email'
                    ? `→ ${sendOnboardingTarget.email || 'No email on file'}`
                    : `→ ${sendOnboardingTarget.phone || 'No phone on file'}`}
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-base-content/60 uppercase tracking-wide mb-2 block">Message</label>
                <textarea
                  className="textarea textarea-bordered w-full text-sm"
                  rows={4}
                  value={onboardMsg}
                  onChange={e => setOnboardMsg(e.target.value)}
                />
              </div>

              {onboardToast && (
                <div className={`text-sm font-medium px-3 py-2 rounded-lg ${onboardToast.startsWith('✓') ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}>
                  {onboardToast}
                </div>
              )}
            </div>

            <div className="flex gap-2 p-4 border-t border-base-300">
              <button className="btn btn-ghost btn-sm flex-1" onClick={() => setSendOnboardingTarget(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary btn-sm flex-1 gap-2"
                onClick={sendOnboarding}
                disabled={onboardSending || !onboardMsg.trim() || (onboardChannel !== 'email' && !sendOnboardingTarget.phone) || (onboardChannel === 'email' && !sendOnboardingTarget.email)}
              >
                {onboardSending ? <Loader2 size={14} className="animate-spin" /> : <SendHorizontal size={14} />}
                {onboardSending ? 'Sending...' : 'Send Onboarding'}
              </button>
            </div>
          </div>
        </div>
      )}

      {onboardingContact && (
        <ClientOnboardingWizard
          contact={onboardingContact}
          onComplete={() => {
            setOnboardingContact(null);
            onDirectoryChanged?.();
          }}
          onSkip={() => setOnboardingContact(null)}
        />
      )}
    </div>
  );
}
