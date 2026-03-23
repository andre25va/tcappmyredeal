import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  Users, Plus, Search, Pencil, Trash2, Phone, Mail,
  X, Save, Building2, Star,
  Home, DollarSign, Scale, ClipboardCheck,
  ArrowLeft, Shield, FileText, SendHorizontal, Loader2, Sparkles, ExternalLink, Bell, UserPlus,
} from 'lucide-react';
import { ContactRecord, ContactRole, ContactLicense, ContactMlsMembership, AgentTeamMember } from '../types';
import {
  loadContactsFull, saveContactRecord, deleteContactRecord,
  upsertContactLicense, deleteContactLicenseRecord,
  upsertContactMls, deleteContactMlsRecord,
  createClientAccountForContact, removeClientAccountForContact,
  syncPhoneChannel,
  getAgentTeamMembers, addAgentTeamMember, updateAgentTeamMember, deleteAgentTeamMember,
} from '../utils/supabaseDb';
import { formatPhoneLive, roleLabel } from '../utils/helpers';
import { ConfirmModal } from './ConfirmModal';
import { ClientOnboardingWizard } from './ClientOnboardingWizard';
import { CallButton } from './CallButton';
import { supabase } from '../lib/supabase';

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
  { key: 'buyer_seller', label: 'Buyers / Sellers', roles: ['buyer', 'seller'], icon: <Home size={22} />, bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-600' },
  { key: 'tc', label: 'TCs', roles: ['tc'], icon: <Shield size={22} />, bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-600' },
  { key: 'other', label: 'Other', roles: ['appraiser', 'other'], icon: <Users size={22} />, bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-600' },
];

const ROLE_OPTIONS: { value: ContactRole; label: string }[] = [
  { value: 'agent', label: 'Agent' },
  { value: 'buyer', label: 'Buyer' },
  { value: 'seller', label: 'Seller' },
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

// ── MLS Entry type (from mls_entries table) ──────────────────────────────────
interface MlsEntry {
  id: string;
  name: string;
  state: string;
}

// ── Blank forms ──────────────────────────────────────────────────────────────

interface EditForm {
  id: string;
  firstName: string;
  lastName: string;
  contactType: ContactRole;
  email: string;
  phone: string;
  company: string;
  timezone: string;
  notes: string;
  defaultInstructions: string;
  isClient: boolean;
  originalIsClient: boolean;
  clientAccountId?: string;
  preferredLanguage: 'en' | 'es';
  pin: string;
  licenses: EditLicense[];
  mlsMemberships: EditMls[];
}

interface EditLicense {
  id: string;
  isNew: boolean;
  stateCode: string;
  licenseType: string;
  licenseNumber: string;
  status: string;
  expirationDate: string;
}

// Simplified: only MLS selection + agent MLS ID
interface EditMls {
  id: string;
  isNew: boolean;
  mlsName: string;
  mlsMemberNumber: string; // Agent's MLS ID
  stateCode: string;       // auto-filled from mls_entries
}

function blankForm(role: ContactRole = 'agent'): EditForm {
  return {
    id: crypto.randomUUID(),
    firstName: '',
    lastName: '',
    contactType: role,
    email: '',
    phone: '',
    company: '',
    timezone: '',
    notes: '',
    defaultInstructions: '',
    isClient: false,
    originalIsClient: false,
    clientAccountId: undefined,
    preferredLanguage: 'en',
    pin: '',
    licenses: [],
    mlsMemberships: [],
  };
}

function contactToForm(c: ContactRecord): EditForm {
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    contactType: c.contactType,
    email: c.email,
    phone: c.phone,
    company: c.company,
    timezone: c.timezone,
    notes: c.notes,
    defaultInstructions: c.defaultInstructions ?? '',
    isClient: c.isClient,
    originalIsClient: c.isClient,
    clientAccountId: c.clientAccountId,
    preferredLanguage: c.preferredLanguage || 'en',
    pin: c.pin || '',
    licenses: c.licenses.map(l => ({
      id: l.id,
      isNew: false,
      stateCode: l.stateCode,
      licenseType: l.licenseType,
      licenseNumber: l.licenseNumber,
      status: l.status,
      expirationDate: l.expirationDate ?? '',
    })),
    mlsMemberships: c.mlsMemberships.map(m => ({
      id: m.id,
      isNew: false,
      mlsName: m.mlsName,
      mlsMemberNumber: m.mlsMemberNumber,
      stateCode: m.stateCode ?? '',
    })),
  };
}

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


// ── TeamMemberRow sub-component ──────────────────────────────────────────────
interface TeamMemberRowProps {
  member: AgentTeamMember;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (updates: Partial<AgentTeamMember>) => void;
  onDelete: () => void;
  saving: boolean;
  isLast: boolean;
}

function TeamMemberRow({ member, isEditing, onEdit, onCancelEdit, onSave, onDelete, saving }: TeamMemberRowProps) {
  const [local, setLocal] = React.useState({ name: member.name, email: member.email || '', phone: member.phone || '', role: member.role, notifyEmail: member.notifyEmail, notifySms: member.notifySms });

  React.useEffect(() => {
    setLocal({ name: member.name, email: member.email || '', phone: member.phone || '', role: member.role, notifyEmail: member.notifyEmail, notifySms: member.notifySms });
  }, [member]);

  const roleColors: Record<string, string> = {
    admin: 'bg-red-100 text-red-700',
    assistant: 'bg-blue-100 text-blue-700',
    coordinator: 'bg-purple-100 text-purple-700',
    other: 'bg-gray-100 text-gray-700',
  };

  if (isEditing) {
    return (
      <div className="ml-4 border-l-2 border-dashed border-base-300 pl-3">
        <div className="border border-base-300 rounded-lg p-3 bg-base-100 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label py-0"><span className="label-text text-[10px]">Name *</span></label>
              <input className="input input-xs input-bordered w-full" value={local.name} onChange={e => setLocal(l => ({ ...l, name: e.target.value }))} />
            </div>
            <div>
              <label className="label py-0"><span className="label-text text-[10px]">Role</span></label>
              <select className="select select-xs select-bordered w-full" value={local.role} onChange={e => setLocal(l => ({ ...l, role: e.target.value as any }))}>
                <option value="assistant">Assistant</option>
                <option value="admin">Admin</option>
                <option value="coordinator">Coordinator</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label py-0"><span className="label-text text-[10px]">Email</span></label>
              <input className="input input-xs input-bordered w-full" value={local.email} onChange={e => setLocal(l => ({ ...l, email: e.target.value }))} />
            </div>
            <div>
              <label className="label py-0"><span className="label-text text-[10px]">Phone</span></label>
              <input className="input input-xs input-bordered w-full" value={local.phone} onChange={e => setLocal(l => ({ ...l, phone: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-4 pt-1">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" className="checkbox checkbox-xs checkbox-primary" checked={local.notifyEmail} onChange={e => setLocal(l => ({ ...l, notifyEmail: e.target.checked }))} />
              <Mail size={11} /><span className="text-[10px]">Email CC</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" className="checkbox checkbox-xs checkbox-primary" checked={local.notifySms} onChange={e => setLocal(l => ({ ...l, notifySms: e.target.checked }))} />
              <Phone size={11} /><span className="text-[10px]">SMS CC</span>
            </label>
          </div>
          <div className="flex gap-2 pt-1">
            <button className="btn btn-primary btn-xs gap-1" onClick={() => onSave(local)} disabled={saving || !local.name.trim()}>
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Save
            </button>
            <button className="btn btn-ghost btn-xs" onClick={onCancelEdit}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ml-4 border-l-2 border-base-300 pl-3">
      <div className="flex items-center gap-2 px-2 py-1.5 bg-base-100 border border-base-300 rounded-lg hover:border-primary/30 transition-colors group">
        <div className="w-5 h-5 rounded-full bg-base-300 flex items-center justify-center text-[9px] font-bold">
          {member.name.split(' ').map((p: string) => p[0]).join('').slice(0,2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium truncate">{member.name}</span>
            <span className={`text-[9px] px-1 py-0.5 rounded font-medium ${roleColors[member.role] || roleColors.other}`}>{member.role}</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-base-content/50">
            {member.email && <span className="flex items-center gap-0.5"><Mail size={9} /> {member.email}</span>}
            {member.phone && <span className="flex items-center gap-0.5"><Phone size={9} /> {member.phone}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex gap-1">
            {member.notifyEmail && <span title="CC on emails" className="text-primary"><Mail size={10} /></span>}
            {member.notifySms && <span title="CC on SMS" className="text-primary"><Phone size={10} /></span>}
          </div>
          <button className="btn btn-ghost btn-xs btn-circle" onClick={onEdit}><Pencil size={11} /></button>
          <button className="btn btn-ghost btn-xs btn-circle text-error" onClick={onDelete}><Trash2 size={11} /></button>
        </div>
      </div>
    </div>
  );
}

export function ContactsDirectory({ triggerAdd, onTriggerHandled, onDirectoryChanged, onCallStarted, onContactUpdated }: Props) {
  const { profile } = useAuth();
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<CategoryKey | null>(null);

  // MLS directory entries (from mls_entries table)
  const [mlsDirectory, setMlsDirectory] = useState<MlsEntry[]>([]);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<EditForm>(blankForm());
  const [deletedLicenseIds, setDeletedLicenseIds] = useState<string[]>([]);
  const [deletedMlsIds, setDeletedMlsIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [timezoneError, setTimezoneError] = useState(false);
  const [emailDup, setEmailDup] = useState<ContactRecord | null>(null);
  const [phoneDup, setPhoneDup] = useState<ContactRecord | null>(null);
  const [pinEditing, setPinEditing] = useState(false);
  const [pinDraft, setPinDraft] = useState('');

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<ContactRecord | null>(null);
  const [deleteNameConfirm, setDeleteNameConfirm] = useState('');

  // Onboarding wizard
  const [onboardingContact, setOnboardingContact] = useState<ContactRecord | null>(null);

  // Quick Send Onboarding modal
  const [sendOnboardingTarget, setSendOnboardingTarget] = useState<ContactRecord | null>(null);
  const [onboardChannel, setOnboardChannel] = useState<'sms' | 'whatsapp' | 'email'>('sms');
  const [onboardMsg, setOnboardMsg] = useState('');
  const [onboardSending, setOnboardSending] = useState(false);
  const [onboardToast, setOnboardToast] = useState('');

  // License lookup URL cache (stateCode → url)
  const licenseUrlCacheRef = useRef<Record<string, string>>({});
  const [licenseUrls, setLicenseUrls] = useState<Record<string, string>>({});

  // Agent notification team state
  const [teamMembers, setTeamMembers] = useState<AgentTeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [addingTeamMember, setAddingTeamMember] = useState(false);
  const [editingTeamMemberId, setEditingTeamMemberId] = useState<string | null>(null);
  const [teamForm, setTeamForm] = useState({ name: '', email: '', phone: '', role: 'assistant' as const, notifyEmail: true, notifySms: true });
  const [teamSaving, setTeamSaving] = useState(false);

  // Load team members when editing an agent contact
  useEffect(() => {
    if (modalOpen && isEditing && form.contactType === 'agent' && form.id) {
      setTeamLoading(true);
      getAgentTeamMembers(supabase, form.id)
        .then(members => setTeamMembers(members))
        .catch(() => setTeamMembers([]))
        .finally(() => setTeamLoading(false));
    } else if (!modalOpen) {
      setTeamMembers([]);
      setAddingTeamMember(false);
      setEditingTeamMemberId(null);
    }
  }, [modalOpen, isEditing, form.id, form.contactType]);

  async function saveNewTeamMember() {
    if (!teamForm.name.trim()) return;
    setTeamSaving(true);
    try {
      await addAgentTeamMember(supabase, {
        agentContactId: form.id,
        name: teamForm.name.trim(),
        email: teamForm.email.trim() || undefined,
        phone: teamForm.phone.trim() || undefined,
        role: teamForm.role,
        notifyEmail: teamForm.notifyEmail,
        notifySms: teamForm.notifySms,
      });
      const updated = await getAgentTeamMembers(supabase, form.id);
      setTeamMembers(updated);
      setAddingTeamMember(false);
      setTeamForm({ name: '', email: '', phone: '', role: 'assistant', notifyEmail: true, notifySms: true });
    } catch (e) { console.error(e); }
    finally { setTeamSaving(false); }
  }

  async function saveEditTeamMember(id: string, updates: Partial<AgentTeamMember>) {
    setTeamSaving(true);
    try {
      await updateAgentTeamMember(supabase, id, {
        name: updates.name,
        email: updates.email,
        phone: updates.phone,
        role: updates.role,
        notifyEmail: updates.notifyEmail,
        notifySms: updates.notifySms,
      });
      const updated = await getAgentTeamMembers(supabase, form.id);
      setTeamMembers(updated);
      setEditingTeamMemberId(null);
    } catch (e) { console.error(e); }
    finally { setTeamSaving(false); }
  }

  async function removeTeamMember(id: string) {
    try {
      await deleteAgentTeamMember(supabase, id);
      setTeamMembers(prev => prev.filter(m => m.id !== id));
    } catch (e) { console.error(e); }
  }

  function openSendOnboarding(c: ContactRecord) {
    const msg = `Hi ${c.firstName}! I'm Andre, your Transaction Coordinator at MyReDeal. I'll be managing your deals from contract to close — I'll send updates here. Reply anytime with questions! 🏠`;
    setOnboardMsg(msg);
    setOnboardChannel(c.phone ? 'sms' : 'email');
    setSendOnboardingTarget(c);
  }

  async function sendOnboarding() {
    if (!sendOnboardingTarget) return;
    setOnboardSending(true);
    try {
      const c = sendOnboardingTarget;
      if (onboardChannel === 'sms' || onboardChannel === 'whatsapp') {
        const phone = c.phone.replace(/\D/g, '');
        const e164 = phone.length === 10 ? `+1${phone}` : `+${phone}`;
        const res = await fetch('/api/sms/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: e164, body: onboardMsg, channel: onboardChannel }),
        });
        if (!res.ok) throw new Error('Send failed');
      } else {
        const res = await fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: c.email,
            subject: 'Welcome — Your Transaction Coordinator is Here',
            body: onboardMsg,
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

  // ── Load MLS directory ───────────────────────────────────────────────────────
  useEffect(() => {
    supabase
      .from('mls_entries')
      .select('id, name, state')
      .order('state', { ascending: true })
      .order('name', { ascending: true })
      .then(({ data }) => {
        if (data) setMlsDirectory(data as MlsEntry[]);
      });
  }, []);

  // ── Load data ────────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    try {
      const data = await loadContactsFull();
      setContacts(data);
    } catch (err) {
      console.error('Failed to load contacts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Handle triggerAdd ────────────────────────────────────────────────────────
  useEffect(() => {
    if (triggerAdd) {
      const role: ContactRole = triggerAdd === 'agent' ? 'agent' : 'other';
      setForm(blankForm(role));
      setIsEditing(false);
      setDeletedLicenseIds([]);
      setDeletedMlsIds([]);
      setTimezoneError(false);
      setModalOpen(true);
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
      const cat = CATEGORIES.find(cat => cat.roles.includes(c.contactType));
      if (cat) counts[cat.key]++;
      else counts.other++;
    }
    return counts;
  }, [contacts]);

  // ── Filtered contacts (search + category) ──────────────────────────────────
  const filtered = useMemo(() => {
    let list = contacts;
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
  }, [contacts, activeCategory, search]);

  // ── Open modal ─────────────────────────────────────────────────────────────
  const openAdd = () => {
    setForm(blankForm());
    setIsEditing(false);
    setDeletedLicenseIds([]);
    setDeletedMlsIds([]);
    setTimezoneError(false);
    setModalOpen(true);
  };

  const openEdit = (c: ContactRecord) => {
    setForm(contactToForm(c));
    setIsEditing(true);
    setDeletedLicenseIds([]);
    setDeletedMlsIds([]);
    setTimezoneError(false);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSaving(false);
    setTimezoneError(false);
  };

  // ── Duplicate phone/email detection ────────────────────────────────────────
  useEffect(() => {
    const raw = form.phone.replace(/\D/g, '');
    if (raw.length < 10) { setPhoneDup(null); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('contacts')
        .select('id, first_name, last_name')
        .ilike('phone', `%${raw.slice(-10)}%`)
        .neq('id', form.id || '00000000-0000-0000-0000-000000000000')
        .limit(1);
      if (data && data.length > 0) {
        setPhoneDup({ ...data[0], firstName: data[0].first_name, lastName: data[0].last_name } as unknown as ContactRecord);
      } else {
        setPhoneDup(null);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [form.phone, form.id]);

  useEffect(() => {
    const email = form.email.trim().toLowerCase();
    if (!email || !email.includes('@')) { setEmailDup(null); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('contacts')
        .select('id, first_name, last_name')
        .ilike('email', email)
        .neq('id', form.id || '00000000-0000-0000-0000-000000000000')
        .limit(1);
      if (data && data.length > 0) {
        setEmailDup({ ...data[0], firstName: data[0].first_name, lastName: data[0].last_name } as unknown as ContactRecord);
      } else {
        setEmailDup(null);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [form.email, form.id]);

  // ── Form helpers ───────────────────────────────────────────────────────────
  const updateField = <K extends keyof EditForm>(key: K, val: EditForm[K]) => {
    setForm(prev => ({ ...prev, [key]: val }));
    if (key === 'timezone') setTimezoneError(false);
  };

  const addLicense = () => {
    setForm(prev => ({
      ...prev,
      licenses: [...prev.licenses, {
        id: crypto.randomUUID(),
        isNew: true,
        stateCode: '',
        licenseType: 'salesperson',
        licenseNumber: '',
        status: 'active',
        expirationDate: '',
      }],
    }));
  };

  const updateLicense = (idx: number, patch: Partial<EditLicense>) => {
    setForm(prev => ({
      ...prev,
      licenses: prev.licenses.map((l, i) => i === idx ? { ...l, ...patch } : l),
    }));
  };

  const removeLicense = (idx: number) => {
    const lic = form.licenses[idx];
    if (!lic.isNew) setDeletedLicenseIds(prev => [...prev, lic.id]);
    setForm(prev => ({
      ...prev,
      licenses: prev.licenses.filter((_, i) => i !== idx),
    }));
  };

  const fetchLicenseUrl = (stateCode: string) => {
    if (!stateCode || stateCode in licenseUrlCacheRef.current) return;
    licenseUrlCacheRef.current[stateCode] = '';
    supabase
      .from('state_license_links')
      .select('lookup_url')
      .eq('state_code', stateCode)
      .single()
      .then(({ data }) => {
        const url = data?.lookup_url || '';
        licenseUrlCacheRef.current[stateCode] = url;
        setLicenseUrls(prev => ({ ...prev, [stateCode]: url }));
      });
  };

  // Prefetch URLs for existing licenses when editing
  useEffect(() => {
    form.licenses.forEach(l => { if (l.stateCode) fetchLicenseUrl(l.stateCode); });
  }, [modalOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const addMls = () => {
    setForm(prev => ({
      ...prev,
      mlsMemberships: [...prev.mlsMemberships, {
        id: crypto.randomUUID(),
        isNew: true,
        mlsName: '',
        mlsMemberNumber: '',
        stateCode: '',
      }],
    }));
  };

  const updateMls = (idx: number, patch: Partial<EditMls>) => {
    setForm(prev => ({
      ...prev,
      mlsMemberships: prev.mlsMemberships.map((m, i) => i === idx ? { ...m, ...patch } : m),
    }));
  };

  // When an MLS entry is selected, auto-fill name + state
  const selectMlsEntry = (idx: number, entryId: string) => {
    const entry = mlsDirectory.find(e => e.id === entryId);
    if (!entry) {
      updateMls(idx, { mlsName: '', stateCode: '' });
      return;
    }
    updateMls(idx, {
      mlsName: entry.name,
      stateCode: entry.state || '',
    });
  };

  const removeMls = (idx: number) => {
    const mls = form.mlsMemberships[idx];
    if (!mls.isNew) setDeletedMlsIds(prev => [...prev, mls.id]);
    setForm(prev => ({
      ...prev,
      mlsMemberships: prev.mlsMemberships.filter((_, i) => i !== idx),
    }));
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.firstName.trim()) return;
    if (!form.timezone) {
      setTimezoneError(true);
      return;
    }
    setSaving(true);
    const isNewClient = form.contactType === 'agent' && form.isClient && !form.originalIsClient;
    const savedFormId = form.id;
    try {
      const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`.trim();

      await saveContactRecord({
        id: form.id,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        contactType: form.contactType,
        company: form.company.trim(),
        timezone: form.timezone || undefined,
        notes: form.notes.trim() || undefined,
        defaultInstructions: form.isClient ? (form.defaultInstructions.trim() || undefined) : undefined,
        preferredLanguage: form.preferredLanguage,
        pin: form.pin.trim() || undefined,
      });

      if (form.contactType === 'agent') {
        for (const id of deletedLicenseIds) {
          await deleteContactLicenseRecord(id);
        }
        for (const lic of form.licenses) {
          await upsertContactLicense({
            id: lic.isNew ? undefined : lic.id,
            contactId: form.id,
            stateCode: lic.stateCode,
            licenseType: lic.licenseType,
            licenseNumber: lic.licenseNumber,
            status: lic.status,
            expirationDate: lic.expirationDate || undefined,
          });
        }

        for (const id of deletedMlsIds) {
          await deleteContactMlsRecord(id);
        }
        for (const mls of form.mlsMemberships) {
          await upsertContactMls({
            id: mls.isNew ? undefined : mls.id,
            contactId: form.id,
            mlsName: mls.mlsName,
            mlsMemberNumber: mls.mlsMemberNumber,
            stateCode: mls.stateCode || undefined,
            status: 'active',
          });
        }
      }

      let effectiveClientAccountId = form.clientAccountId;
      if (form.contactType === 'agent') {
        if (form.isClient && !form.originalIsClient) {
          effectiveClientAccountId = await createClientAccountForContact(form.id, fullName);
        } else if (!form.isClient && form.originalIsClient && form.clientAccountId) {
          effectiveClientAccountId = undefined;
          await removeClientAccountForContact(form.id, form.clientAccountId);
        }
      }

      const rawPhone = form.phone.trim();
      if (rawPhone && effectiveClientAccountId) {
        const digits = rawPhone.replace(/\D/g, '');
        const e164 = digits.length === 10 ? `+1${digits}` : `+${digits}`;
        await syncPhoneChannel(form.id, effectiveClientAccountId, e164);
      }

      await refresh();

      if (isNewClient) {
        const allContacts = await loadContactsFull();
        const savedContact = allContacts.find(c => c.id === savedFormId);
        if (savedContact) {
          setOnboardingContact(savedContact);
        }
      } else {
        onDirectoryChanged?.();
      }

      onContactUpdated?.(savedFormId, fullName, form.phone.trim(), form.email.trim());
      closeModal();
    } catch (err) {
      console.error('Save failed:', err);
      alert('Failed to save contact. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (deleteNameConfirm !== profile?.name) return;
    try {
      await deleteContactRecord(deleteTarget.id, profile?.name ?? 'Unknown', {
        name: deleteTarget.name,
        email: deleteTarget.email,
        phone: deleteTarget.phone,
        role: deleteTarget.role,
        company: deleteTarget.company,
      });
      await refresh();
      onDirectoryChanged?.();
    } catch (err) {
      console.error('Delete failed:', err);
    }
    setDeleteTarget(null);
    setDeleteNameConfirm('');
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
          <button className="btn btn-primary btn-sm gap-1" onClick={openAdd}>
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
                      <button className="btn btn-ghost btn-xs text-error" onClick={() => { setDeleteTarget(c); setDeleteNameConfirm(''); }} title="Delete">
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

      {/* ── Add/Edit Modal ──────────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="modal modal-open">
          <div className="modal-box max-w-2xl max-h-[90vh] flex flex-col p-0">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-base-300">
              <h3 className="font-bold text-base">{isEditing ? 'Edit Contact' : 'Add Contact'}</h3>
              <button className="btn btn-ghost btn-sm btn-circle" onClick={closeModal}><X size={16} /></button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
              {/* Basic Info */}
              <div>
                <div className="text-xs font-semibold text-base-content/60 uppercase tracking-wider mb-2">Basic Info</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label py-0"><span className="label-text text-xs">First Name *</span></label>
                    <input className="input input-sm input-bordered w-full" value={form.firstName} onChange={e => updateField('firstName', e.target.value)} />
                  </div>
                  <div>
                    <label className="label py-0"><span className="label-text text-xs">Last Name</span></label>
                    <input className="input input-sm input-bordered w-full" value={form.lastName} onChange={e => updateField('lastName', e.target.value)} />
                  </div>
                </div>
                <div className="mt-2">
                  <label className="label py-0"><span className="label-text text-xs">Contact Type *</span></label>
                  <select className="select select-sm select-bordered w-full" value={form.contactType} onChange={e => updateField('contactType', e.target.value as ContactRole)}>
                    {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <label className="label py-0"><span className="label-text text-xs">Email</span></label>
                    <input className={`input input-sm input-bordered w-full ${emailDup ? 'input-warning' : ''}`} type="email" autoComplete="off" value={form.email} onChange={e => updateField('email', e.target.value)} />
                    {emailDup && (
                      <p className="text-xs text-warning font-medium mt-0.5 flex items-center gap-1">
                        <span>⚠</span> Email already used by <span className="font-semibold">{emailDup.firstName} {emailDup.lastName}</span>
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="label py-0"><span className="label-text text-xs">Phone</span></label>
                    <input className={`input input-sm input-bordered w-full ${phoneDup ? 'input-warning' : ''}`} autoComplete="off" value={form.phone} onChange={e => updateField('phone', formatPhoneLive(e.target.value))} />
                    {phoneDup && (
                      <p className="text-xs text-warning font-medium mt-0.5 flex items-center gap-1">
                        <span>⚠</span> Phone already used by <span className="font-semibold">{phoneDup.firstName} {phoneDup.lastName}</span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-2">
                  <label className="label py-0"><span className="label-text text-xs">Company</span></label>
                  <input className="input input-sm input-bordered w-full" value={form.company} onChange={e => updateField('company', e.target.value)} />
                </div>
                <div className="mt-2">
                  <label className="label py-0">
                    <span className="label-text text-xs">Timezone *</span>
                  </label>
                  <select
                    className={`select select-sm select-bordered w-full ${timezoneError ? 'select-error' : ''}`}
                    value={form.timezone}
                    onChange={e => updateField('timezone', e.target.value)}
                  >
                    {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                  </select>
                  {timezoneError && (
                    <p className="text-error text-xs mt-1">Please select a timezone.</p>
                  )}
                </div>
                <div className="mt-2">
                  <label className="label py-0"><span className="label-text text-xs">Preferred Language</span></label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={`flex-1 py-1.5 px-3 rounded-lg border text-sm font-medium transition-all ${form.preferredLanguage === 'en' ? 'bg-primary text-primary-content border-primary' : 'border-base-300 hover:border-primary/50'}`}
                      onClick={() => updateField('preferredLanguage', 'en')}
                    >
                      English
                    </button>
                    <button
                      type="button"
                      className={`flex-1 py-1.5 px-3 rounded-lg border text-sm font-medium transition-all ${form.preferredLanguage === 'es' ? 'bg-primary text-primary-content border-primary' : 'border-base-300 hover:border-primary/50'}`}
                      onClick={() => updateField('preferredLanguage', 'es')}
                    >
                      Espa&#241;ol
                    </button>
                  </div>
                </div>
                <div className="mt-2">
                  <label className="label py-0"><span className="label-text text-xs">Client Portal PIN <span className="text-base-content/40">(4 digits)</span></span></label>
                  {pinEditing ? (
                    <div className="flex items-center gap-2 mt-0.5">
                      <input
                        className="input input-sm input-bordered w-24 font-mono tracking-widest text-center"
                        autoComplete="off"
                        maxLength={4}
                        placeholder="0000"
                        autoFocus
                        value={pinDraft}
                        onChange={e => setPinDraft(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      />
                      <button
                        type="button"
                        className="btn btn-xs btn-primary"
                        disabled={pinDraft.length !== 4}
                        onClick={() => { updateField('pin', pinDraft); setPinEditing(false); }}
                      >Confirm</button>
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost"
                        onClick={() => { setPinDraft(form.pin || ''); setPinEditing(false); }}
                      >Cancel</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-mono text-sm tracking-widest text-base-content/60">
                        {form.pin ? '●●●●' : <span className="text-base-content/30 font-sans text-xs">Not set</span>}
                      </span>
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost"
                        onClick={() => { setPinDraft(form.pin || ''); setPinEditing(true); }}
                      >Change</button>
                    </div>
                  )}
                  <p className="text-xs text-base-content/50 mt-1">Share with client to access the Client Portal</p>
                </div>
                <div className="mt-2">
                  <label className="label py-0"><span className="label-text text-xs">Notes</span></label>
                  <textarea className="textarea textarea-bordered textarea-sm w-full" autoComplete="off" rows={2} value={form.notes} onChange={e => updateField('notes', e.target.value)} />
                </div>
              </div>

              {/* Client Account Toggle (agents only) */}
              {form.contactType === 'agent' && (
                <div className={`rounded-lg border p-3 ${form.isClient ? 'bg-amber-50 border-amber-200' : 'bg-base-100 border-base-300'}`}>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm checkbox-warning"
                      checked={form.isClient}
                      onChange={e => updateField('isClient', e.target.checked)}
                    />
                    <div className="flex items-center gap-2">
                      <Star size={16} className={form.isClient ? 'text-amber-500 fill-amber-500' : 'text-base-content/30'} />
                      <div>
                        <span className="text-sm font-semibold">{form.isClient ? 'Client Agent' : 'Not a Client'}</span>
                        <p className="text-xs text-base-content/50">
                          {form.isClient
                            ? 'This agent is your client — you coordinate their deals.'
                            : 'Toggle on if this agent is one of your TC clients.'}
                        </p>
                      </div>
                    </div>
                  </label>
                </div>
              )}

              {/* Special Instructions (clients only) */}
              {form.contactType === 'agent' && form.isClient && (
                <div>
                  <label className="label py-0">
                    <span className="label-text text-xs font-semibold">Special Instructions</span>
                    <span className="label-text-alt text-xs text-base-content/40">Optional — auto-fills deal notes for this client</span>
                  </label>
                  <textarea
                    className={`textarea textarea-bordered textarea-sm w-full transition-all ${
                      form.defaultInstructions.trim()
                        ? 'border-red-400 shadow-[0_0_12px_2px_rgba(239,68,68,0.4)]'
                        : ''
                    }`}
                    rows={3}
                    placeholder="e.g. Always CC buyer's attorney. EMD via wire only. Call before sending docs."
                    value={form.defaultInstructions}
                    onChange={e => updateField('defaultInstructions', e.target.value)}
                  />
                </div>
              )}


              {/* Notification Team (agent clients only) */}
              {form.contactType === 'agent' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Bell size={13} className="text-base-content/50" />
                      <span className="text-xs font-semibold text-base-content/60 uppercase tracking-wider">Notification Team</span>
                      {teamMembers.length > 0 && <span className="badge badge-xs badge-primary">{teamMembers.length}</span>}
                    </div>
                    {isEditing && (
                      <button className="btn btn-ghost btn-xs gap-1 text-primary" onClick={() => { setAddingTeamMember(true); setEditingTeamMemberId(null); }}>
                        <UserPlus size={12} /> Add Member
                      </button>
                    )}
                  </div>

                  {!isEditing && (
                    <p className="text-xs text-base-content/40 italic px-1">Save this contact first to add team members.</p>
                  )}

                  {isEditing && teamLoading && (
                    <div className="flex items-center gap-2 py-2 text-xs text-base-content/40">
                      <Loader2 size={12} className="animate-spin" /> Loading team...
                    </div>
                  )}

                  {/* Team relationship tree */}
                  {isEditing && !teamLoading && (
                    <div className="space-y-1.5">
                      {/* Agent (root node) */}
                      <div className="flex items-center gap-2 px-2 py-1.5 bg-primary/5 border border-primary/20 rounded-lg">
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                          {form.firstName?.[0]}{form.lastName?.[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-semibold truncate">{form.firstName} {form.lastName}</span>
                          <span className="text-[10px] text-base-content/40 ml-1">(Agent)</span>
                        </div>
                        <div className="flex gap-1">
                          {form.email && <Mail size={11} className="text-primary/60" />}
                          {form.phone && <Phone size={11} className="text-primary/60" />}
                        </div>
                      </div>

                      {/* Team member nodes */}
                      {teamMembers.map((member, idx) => (
                        <TeamMemberRow
                          key={member.id}
                          member={member}
                          isEditing={editingTeamMemberId === member.id}
                          onEdit={() => setEditingTeamMemberId(member.id)}
                          onCancelEdit={() => setEditingTeamMemberId(null)}
                          onSave={(updates) => saveEditTeamMember(member.id, updates)}
                          onDelete={() => removeTeamMember(member.id)}
                          saving={teamSaving}
                          isLast={idx === teamMembers.length - 1 && !addingTeamMember}
                        />
                      ))}

                      {/* Add new member form */}
                      {addingTeamMember && (
                        <div className="ml-4 border-l-2 border-dashed border-primary/30 pl-3">
                          <div className="border border-primary/30 rounded-lg p-3 bg-primary/5 space-y-2">
                            <p className="text-[10px] font-semibold text-primary uppercase tracking-wider">New Team Member</p>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="label py-0"><span className="label-text text-[10px]">Name *</span></label>
                                <input className="input input-xs input-bordered w-full" placeholder="Full name" value={teamForm.name} onChange={e => setTeamForm(f => ({ ...f, name: e.target.value }))} />
                              </div>
                              <div>
                                <label className="label py-0"><span className="label-text text-[10px]">Role</span></label>
                                <select className="select select-xs select-bordered w-full" value={teamForm.role} onChange={e => setTeamForm(f => ({ ...f, role: e.target.value as any }))}>
                                  <option value="assistant">Assistant</option>
                                  <option value="admin">Admin</option>
                                  <option value="coordinator">Coordinator</option>
                                  <option value="other">Other</option>
                                </select>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="label py-0"><span className="label-text text-[10px]">Email</span></label>
                                <input className="input input-xs input-bordered w-full" placeholder="email@example.com" value={teamForm.email} onChange={e => setTeamForm(f => ({ ...f, email: e.target.value }))} />
                              </div>
                              <div>
                                <label className="label py-0"><span className="label-text text-[10px]">Phone</span></label>
                                <input className="input input-xs input-bordered w-full" placeholder="+1 (555) 000-0000" value={teamForm.phone} onChange={e => setTeamForm(f => ({ ...f, phone: e.target.value }))} />
                              </div>
                            </div>
                            <div className="flex gap-4 pt-1">
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input type="checkbox" className="checkbox checkbox-xs checkbox-primary" checked={teamForm.notifyEmail} onChange={e => setTeamForm(f => ({ ...f, notifyEmail: e.target.checked }))} />
                                <Mail size={11} /><span className="text-[10px]">Email CC</span>
                              </label>
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input type="checkbox" className="checkbox checkbox-xs checkbox-primary" checked={teamForm.notifySms} onChange={e => setTeamForm(f => ({ ...f, notifySms: e.target.checked }))} />
                                <Phone size={11} /><span className="text-[10px]">SMS CC</span>
                              </label>
                            </div>
                            <div className="flex gap-2 pt-1">
                              <button className="btn btn-primary btn-xs gap-1" onClick={saveNewTeamMember} disabled={teamSaving || !teamForm.name.trim()}>
                                {teamSaving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Save
                              </button>
                              <button className="btn btn-ghost btn-xs" onClick={() => { setAddingTeamMember(false); setTeamForm({ name: '', email: '', phone: '', role: 'assistant', notifyEmail: true, notifySms: true }); }}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {!addingTeamMember && teamMembers.length === 0 && (
                        <p className="text-xs text-base-content/40 italic px-1 py-1">No team members yet — add admins or assistants who should receive all communications.</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Licenses (agents only) */}
              {form.contactType === 'agent' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-base-content/60 uppercase tracking-wider">Licenses</span>
                      <span className="badge badge-xs badge-ghost">{form.licenses.length}</span>
                    </div>
                    <button className="btn btn-ghost btn-xs gap-1 text-primary" onClick={addLicense}>
                      <Plus size={12} /> Add License
                    </button>
                  </div>
                  <div className="space-y-2">
                    {form.licenses.map((lic, idx) => (
                      <div key={lic.id} className="border border-base-300 rounded-lg p-3 relative">
                        <button
                          className="btn btn-ghost btn-xs btn-circle absolute top-1 right-1 text-error"
                          onClick={() => removeLicense(idx)}
                        >
                          <Trash2 size={12} />
                        </button>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="label py-0"><span className="label-text text-[10px]">State</span></label>
                            <select className="select select-xs select-bordered w-full" value={lic.stateCode} onChange={e => { updateLicense(idx, { stateCode: e.target.value }); fetchLicenseUrl(e.target.value); }}>
                              <option value="">—</option>
                              {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="label py-0"><span className="label-text text-[10px]">Type</span></label>
                            <select className="select select-xs select-bordered w-full" value={lic.licenseType} onChange={e => updateLicense(idx, { licenseType: e.target.value })}>
                              <option value="salesperson">Salesperson</option>
                              <option value="broker">Broker</option>
                              <option value="associate_broker">Associate Broker</option>
                            </select>
                          </div>
                          <div>
                            <label className="label py-0"><span className="label-text text-[10px]">Status</span></label>
                            <select className="select select-xs select-bordered w-full" value={lic.status} onChange={e => updateLicense(idx, { status: e.target.value })}>
                              <option value="active">Active</option>
                              <option value="inactive">Inactive</option>
                              <option value="expired">Expired</option>
                              <option value="pending">Pending</option>
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <div>
                            <label className="label py-0"><span className="label-text text-[10px]">License #</span></label>
                            <input className="input input-xs input-bordered w-full" value={lic.licenseNumber} onChange={e => updateLicense(idx, { licenseNumber: e.target.value })} />
                          </div>
                          <div>
                            <label className="label py-0"><span className="label-text text-[10px]">Expiration</span></label>
                            <input className="input input-xs input-bordered w-full" type="date" value={lic.expirationDate} onChange={e => updateLicense(idx, { expirationDate: e.target.value })} />
                          </div>
                        </div>
                        {lic.stateCode && licenseUrls[lic.stateCode] && (
                          <div className="mt-2">
                            <a
                              href={licenseUrls[lic.stateCode]}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-xs btn-outline gap-1 text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-400"
                            >
                              <ExternalLink size={10} /> Look Up License · {lic.stateCode}
                            </a>
                          </div>
                        )}
                      </div>
                    ))}
                    {form.licenses.length === 0 && (
                      <p className="text-xs text-base-content/40 text-center py-3">No licenses added yet</p>
                    )}
                  </div>
                </div>
              )}

              {/* MLS Memberships (agents only) */}
              {form.contactType === 'agent' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-base-content/60 uppercase tracking-wider">MLS Memberships</span>
                      <span className="badge badge-xs badge-ghost">{form.mlsMemberships.length}</span>
                    </div>
                    <button className="btn btn-ghost btn-xs gap-1 text-primary" onClick={addMls}>
                      <Plus size={12} /> Add MLS
                    </button>
                  </div>
                  {mlsDirectory.length === 0 && (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-2">
                      No MLS entries found. Add MLS organizations in Settings → MLS Directory first.
                    </p>
                  )}
                  <div className="space-y-2">
                    {form.mlsMemberships.map((mls, idx) => {
                      const matchedEntry = mlsDirectory.find(e => e.name === mls.mlsName);
                      const selectedEntryId = matchedEntry?.id ?? '';
                      return (
                        <div key={mls.id} className="border border-base-300 rounded-lg p-3 relative">
                          <button
                            className="btn btn-ghost btn-xs btn-circle absolute top-1 right-1 text-error"
                            onClick={() => removeMls(idx)}
                          >
                            <Trash2 size={12} />
                          </button>

                          <div className="grid grid-cols-2 gap-3">
                            {/* MLS dropdown */}
                            <div>
                              <label className="label py-0"><span className="label-text text-[10px]">MLS *</span></label>
                              <select
                                className="select select-xs select-bordered w-full"
                                value={selectedEntryId}
                                onChange={e => selectMlsEntry(idx, e.target.value)}
                              >
                                <option value="">— Select MLS —</option>
                                {mlsDirectory.map(entry => (
                                  <option key={entry.id} value={entry.id}>
                                    {entry.state ? `[${entry.state}] ` : ''}{entry.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Agent MLS ID */}
                            <div>
                              <label className="label py-0"><span className="label-text text-[10px]">Agent MLS ID</span></label>
                              <input
                                className="input input-xs input-bordered w-full"
                                placeholder="e.g. 12345678"
                                value={mls.mlsMemberNumber}
                                onChange={e => updateMls(idx, { mlsMemberNumber: e.target.value })}
                              />
                            </div>
                          </div>

                          {/* State badge (auto-filled, read-only) */}
                          {mls.stateCode && (
                            <div className="mt-1.5">
                              <span className="text-[10px] text-base-content/40">State: </span>
                              <span className="badge badge-xs badge-outline">{mls.stateCode}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {form.mlsMemberships.length === 0 && (
                      <p className="text-xs text-base-content/40 text-center py-3">No MLS memberships added yet</p>
                    )}
                  </div>
                </div>
              )}

              {/* Organizations (read-only badges) */}
              {isEditing && (() => {
                const c = contacts.find(ct => ct.id === form.id);
                if (!c || c.organizations.length === 0) return null;
                return (
                  <div>
                    <div className="text-xs font-semibold text-base-content/60 uppercase tracking-wider mb-2">Organizations</div>
                    <div className="flex flex-wrap gap-2">
                      {c.organizations.map(org => (
                        <span key={org.membershipId} className="badge badge-outline badge-sm gap-1">
                          <Building2 size={10} />
                          {org.organizationName} {org.roleInOrganization ? `(${org.roleInOrganization})` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-base-300">
              <button className="btn btn-ghost btn-sm" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary btn-sm gap-1" onClick={handleSave} disabled={saving || !form.firstName.trim() || !!phoneDup || !!emailDup}>
                {saving ? <span className="loading loading-spinner loading-xs" /> : <Save size={14} />}
                {isEditing ? 'Save Changes' : 'Add Contact'}
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={closeModal} />
        </div>
      )}

      {/* Delete confirmation — requires staff name retype */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-base-100 rounded-xl shadow-2xl w-full max-w-md">
            {/* Header */}
            <div className="flex items-center gap-3 p-5 border-b border-base-300">
              <div className="w-10 h-10 rounded-full bg-error/10 flex items-center justify-center shrink-0">
                <Trash2 size={18} className="text-error" />
              </div>
              <div>
                <h3 className="font-semibold text-base">Delete Contact</h3>
                <p className="text-xs text-base-content/50">This action cannot be undone</p>
              </div>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              <p className="text-sm text-base-content/80">
                You are about to permanently delete{' '}
                <span className="font-semibold text-base-content">"{deleteTarget.fullName}"</span>.
                This will also remove their licenses and MLS memberships.
              </p>

              {/* Staff name display (greyed out) */}
              <div>
                <label className="text-xs font-semibold text-base-content/50 uppercase tracking-wide block mb-1">
                  Authorized by
                </label>
                <div className="input input-bordered w-full flex items-center bg-base-200 text-base-content/40 text-sm cursor-not-allowed select-none rounded-lg px-3 py-2">
                  {profile?.name ?? 'Staff Member'}
                </div>
              </div>

              {/* Staff must retype their name */}
              <div>
                <label className="text-xs font-semibold text-base-content/60 uppercase tracking-wide block mb-1">
                  Type your name to confirm
                </label>
                <input
                  type="text"
                  className="input input-bordered w-full text-sm"
                  placeholder={profile?.name ?? 'Your name'}
                  value={deleteNameConfirm}
                  onChange={e => setDeleteNameConfirm(e.target.value)}
                  autoFocus
                />
                {deleteNameConfirm.length > 0 && deleteNameConfirm !== profile?.name && (
                  <p className="text-xs text-error mt-1">Name doesn't match — type exactly: {profile?.name}</p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 px-5 pb-5">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { setDeleteTarget(null); setDeleteNameConfirm(''); }}
              >
                Cancel
              </button>
              <button
                className="btn btn-error btn-sm"
                disabled={deleteNameConfirm !== profile?.name}
                onClick={handleDelete}
              >
                <Trash2 size={14} />
                Delete Contact
              </button>
            </div>
          </div>
        </div>
      )}

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
