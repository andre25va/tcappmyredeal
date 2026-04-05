import React, { useState, useEffect, useRef } from 'react';
import {
  X, Save, Plus, Trash2, Mail, Phone, Star, Bell, UserPlus, Loader2, ExternalLink, Briefcase, ChevronDown,
} from 'lucide-react';
import { ContactRecord, ContactRole, AgentTeamMember, Organization } from '../types';
import {
  saveContactRecord,
  upsertContactLicense, deleteContactLicenseRecord,
  upsertContactMls, deleteContactMlsRecord,
  createClientAccountForContact, removeClientAccountForContact,
  syncPhoneChannel,
  getAgentTeamMembers, addAgentTeamMember, updateAgentTeamMember, deleteAgentTeamMember,
  loadOrganizations,
} from '../utils/supabaseDb';
import { formatPhoneLive } from '../utils/helpers';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/Button';

// ── Constants ─────────────────────────────────────────────────────────────────

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

export const CONTACT_ROLE_OPTIONS: { value: ContactRole; label: string }[] = [
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

// ── Internal types ────────────────────────────────────────────────────────────

interface MlsEntry {
  id: string;
  name: string;
  state: string;
}

export interface EditForm {
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
  pin: string;
  isClient: boolean;
  originalIsClient: boolean;
  clientAccountId?: string;
  preferredLanguage: 'en' | 'es';
  teamName: string;
  orgId: string;
  licenses: EditLicense[];
  mlsMemberships: EditMls[];
}

export interface EditLicense {
  id: string;
  isNew: boolean;
  stateCode: string;
  licenseType: string;
  licenseNumber: string;
  status: string;
  expirationDate: string;
}

export interface EditMls {
  id: string;
  isNew: boolean;
  mlsName: string;
  mlsMemberNumber: string;
  stateCode: string;
}

export function blankForm(role: ContactRole = 'agent', prefillPhone = ''): EditForm {
  return {
    id: crypto.randomUUID(),
    firstName: '',
    lastName: '',
    contactType: role,
    email: '',
    phone: prefillPhone,
    company: '',
    timezone: '',
    notes: '',
    defaultInstructions: '',
    pin: '',
    isClient: false,
    originalIsClient: false,
    clientAccountId: undefined,
    preferredLanguage: 'en',
    teamName: '',
    orgId: '',
    licenses: [],
    mlsMemberships: [],
  };
}

export function contactToForm(c: ContactRecord): EditForm {
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
    pin: c.pin ?? '',
    isClient: c.isClient,
    originalIsClient: c.isClient,
    clientAccountId: c.clientAccountId,
    preferredLanguage: c.preferredLanguage || 'en',
    teamName: c.teamName ?? '',
    orgId: c.orgId ?? '',
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

// ── SavedContact — passed back to the caller after save ───────────────────────

export interface SavedContact {
  id: string;
  fullName: string;
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  phone: string;
  contactType: ContactRole;
  isNewClient: boolean;
}

// ── TeamMemberRow (same as in ContactsDirectory) ──────────────────────────────

interface TeamMemberRowProps {
  member: AgentTeamMember;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (updates: Partial<AgentTeamMember>) => void;
  onDelete: () => void;
  saving: boolean;
  allContacts: ContactRecord[];
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
            <Button variant="ghost" size="xs" onClick={onCancelEdit}>Cancel</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ml-4 border-l-2 border-base-300 pl-3">
      <div className="flex items-center gap-2 px-2 py-1.5 bg-base-100 border border-base-300 rounded-lg hover:border-primary/30 transition-colors group">
        <div className="w-5 h-5 rounded-full bg-base-300 flex items-center justify-center text-[9px] font-bold">
          {member.name.split(' ').map((p: string) => p[0]).join('').slice(0, 2).toUpperCase()}
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
          <Button variant="ghost" size="xs" className="btn-circle" onClick={onEdit}><Trash2 size={11} /></Button>
          <Button variant="ghost" size="xs" className="btn-circle text-error" onClick={onDelete}><Trash2 size={11} /></Button>
        </div>
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ContactModalProps {
  isOpen: boolean;
  /** Pass a ContactRecord to open in edit mode. Pass null/undefined for add mode. */
  contact?: ContactRecord | null;
  defaultRole?: ContactRole;
  defaultCompany?: string;
  defaultFirstName?: string;
  defaultLastName?: string;
  /** Pre-check the "Client Agent" toggle when creating a new contact */
  initialIsClient?: boolean;
  /** Pre-fill the phone field (e.g. when adding a contact from an SMS thread) */
  defaultPhone?: string;
  /** All contacts — used for duplicate detection */
  allContacts: ContactRecord[];
  onClose: () => void;
  onSaved: (saved: SavedContact) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ContactModal({
  isOpen,
  contact,
  defaultRole = 'other',
  defaultCompany = '',
  defaultFirstName = '',
  defaultLastName = '',
  initialIsClient = false,
  defaultPhone = '',
  allContacts,
  onClose,
  onSaved,
}: ContactModalProps) {
  const { primaryOrgId: primaryOrgIdFn } = useAuth();
  const primaryOrgId = primaryOrgIdFn();

  // ── Internal state ─────────────────────────────────────────────────────────
  // activeContact drives isEditing: null = add mode, ContactRecord = edit mode
  const [activeContact, setActiveContact] = useState<ContactRecord | null>(null);
  const isEditing = activeContact !== null;

  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [mlsDirectory, setMlsDirectory] = useState<MlsEntry[]>([]);

  const [form, setForm] = useState<EditForm>(blankForm());
  const [deletedLicenseIds, setDeletedLicenseIds] = useState<string[]>([]);
  const [deletedMlsIds, setDeletedMlsIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [dupError, setDupError] = useState<{ contact: ContactRecord; dealRefs: string[] } | null>(null);
  const [dupWarning, setDupWarning] = useState<{ contact: ContactRecord; dealRefs: string[] } | null>(null);
  const [timezoneError, setTimezoneError] = useState(false);
  const [emailDup, setEmailDup] = useState<ContactRecord | null>(null);
  const [phoneDup, setPhoneDup] = useState<ContactRecord | null>(null);

  // Team members
  const [teamMembers, setTeamMembers] = useState<AgentTeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [addingTeamMember, setAddingTeamMember] = useState(false);
  const [editingTeamMemberId, setEditingTeamMemberId] = useState<string | null>(null);
  const [teamForm, setTeamForm] = useState({ name: '', email: '', phone: '', role: 'assistant' as const, notifyEmail: true, notifySms: true });
  const [teamSaving, setTeamSaving] = useState(false);

  const licenseUrlCacheRef = useRef<Record<string, string>>({});
  const [licenseUrls, setLicenseUrls] = useState<Record<string, string>>({});

  // Deal history
  const [dealHistory, setDealHistory] = useState<Array<{
    id: string;
    propertyAddress: string;
    status: string;
    dealRole: string;
    side: string;
    createdAt: string;
  }>>([]);
  const [dealHistoryLoading, setDealHistoryLoading] = useState(false);
  const [dealHistoryCollapsed, setDealHistoryCollapsed] = useState(false);
  const [dealHistoryFilter, setDealHistoryFilter] = useState<'all' | 'active' | 'pending' | 'closed'>('all');

  // ── Reset on open ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    // Load orgs + MLS
    loadOrganizations().then(setOrgs).catch(() => {});
    supabase
      .from('mls_entries')
      .select('id, name, state')
      .order('state', { ascending: true })
      .order('name', { ascending: true })
      .then(({ data }) => { if (data) setMlsDirectory(data as MlsEntry[]); });

    setDeletedLicenseIds([]);
    setDeletedMlsIds([]);
    setTimezoneError(false);
    setDupError(null);
    setDupWarning(null);
    setEmailDup(null);
    setPhoneDup(null);

    if (contact) {
      setActiveContact(contact);
      setForm(contactToForm(contact));
    } else {
      setActiveContact(null);
      const f = blankForm(defaultRole, defaultPhone);
      f.company = defaultCompany;
      f.firstName = defaultFirstName;
      f.lastName = defaultLastName;
      f.orgId = primaryOrgId ?? '';
      if (initialIsClient) {
        f.isClient = true;
        f.contactType = 'agent'; // agent clients are always agent-type contacts
      }
      setForm(f);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load team members when editing an agent
  useEffect(() => {
    if (isOpen && isEditing && form.contactType === 'agent' && form.id) {
      setTeamLoading(true);
      getAgentTeamMembers(supabase, form.id)
        .then(setTeamMembers)
        .catch(() => setTeamMembers([]))
        .finally(() => setTeamLoading(false));
    } else if (!isOpen) {
      setTeamMembers([]);
      setAddingTeamMember(false);
      setEditingTeamMemberId(null);
    }
  }, [isOpen, isEditing, form.id, form.contactType]);

  // Prefetch license lookup URLs when editing
  useEffect(() => {
    form.licenses.forEach(l => { if (l.stateCode) fetchLicenseUrl(l.stateCode); });
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load deal history for existing contacts
  useEffect(() => {
    if (!isOpen || !isEditing || !form.id) return;
    setDealHistoryLoading(true);
    supabase
      .from('deal_participants')
      .select('deal_role, side, deals(id, property_address, status, created_at)')
      .eq('contact_id', form.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) {
          setDealHistory(
            data
              .filter((row: any) => row.deals)
              .map((row: any) => ({
                id: row.deals.id,
                propertyAddress: row.deals.property_address || 'Unknown Address',
                status: row.deals.status || 'unknown',
                dealRole: row.deal_role || '',
                side: row.side || '',
                createdAt: row.deals.created_at,
              }))
          );
        }
        setDealHistoryLoading(false);
      })
      .catch(() => setDealHistoryLoading(false));
  }, [isOpen, isEditing, form.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Duplicate contact detection (email/phone)
  useEffect(() => {
    if (!isOpen) return;
    const emailVal = form.email.trim().toLowerCase();
    const phoneVal = form.phone.trim().replace(/\D/g, '');
    setEmailDup(emailVal
      ? allContacts.find(c => c.id !== form.id && c.email.toLowerCase() === emailVal) ?? null
      : null
    );
    setPhoneDup(phoneVal.length >= 10
      ? allContacts.find(c => c.id !== form.id && c.phone.replace(/\D/g, '').endsWith(phoneVal.slice(-10))) ?? null
      : null
    );
  }, [form.email, form.phone, allContacts, form.id, isOpen]);

  // ── Switch to editing a different contact (dup redirect) ───────────────────
  function switchToContact(c: ContactRecord) {
    setActiveContact(c);
    setForm(contactToForm(c));
    setDupError(null);
    setDupWarning(null);
    setDeletedLicenseIds([]);
    setDeletedMlsIds([]);
    setTimezoneError(false);
  }

  // ── Form helpers ───────────────────────────────────────────────────────────
  const updateField = <K extends keyof EditForm>(key: K, val: EditForm[K]) => {
    setForm(prev => ({ ...prev, [key]: val }));
    if (key === 'timezone') setTimezoneError(false);
    if (key === 'firstName' || key === 'lastName' || key === 'email' || key === 'phone') {
      setDupError(null);
      setDupWarning(null);
    }
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

  const selectMlsEntry = (idx: number, entryId: string) => {
    const entry = mlsDirectory.find(e => e.id === entryId);
    if (!entry) {
      updateMls(idx, { mlsName: '', stateCode: '' });
      return;
    }
    updateMls(idx, { mlsName: entry.name, stateCode: entry.state || '' });
  };

  const removeMls = (idx: number) => {
    const mls = form.mlsMemberships[idx];
    if (!mls.isNew) setDeletedMlsIds(prev => [...prev, mls.id]);
    setForm(prev => ({
      ...prev,
      mlsMemberships: prev.mlsMemberships.filter((_, i) => i !== idx),
    }));
  };

  // ── Team member handlers ───────────────────────────────────────────────────
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

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.firstName.trim()) return;
    if (!form.timezone) {
      setTimezoneError(true);
      return;
    }

    const fetchDealRefs = async (contactId: string): Promise<string[]> => {
      const { data } = await supabase
        .from('deal_participants')
        .select('deals!inner(deal_ref)')
        .eq('contact_id', contactId)
        .limit(5);
      if (!data) return [];
      const refs = (data as any[])
        .map((row) => row.deals?.deal_ref)
        .filter((r: any) => r != null)
        .map((r: string) => 'Deal #' + String(r).replace('MRD-', '')) as string[];
      return [...new Set(refs)];
    };

    // Duplicate detection (new contacts only)
    if (!isEditing) {
      const newFullName = `${form.firstName.trim()} ${form.lastName.trim()}`.trim().toLowerCase();
      const newEmail = form.email.trim().toLowerCase();
      const newPhone = form.phone.trim().replace(/\D/g, '');

      const exactMatch = allContacts.find(c => {
        const sameName = c.fullName.toLowerCase() === newFullName;
        if (!sameName) return false;
        const emailMatch = newEmail && c.email.toLowerCase() === newEmail;
        const phoneMatch = newPhone.length >= 10 && c.phone.replace(/\D/g, '').endsWith(newPhone.slice(-10));
        return emailMatch || phoneMatch;
      });

      if (exactMatch) {
        const refs = await fetchDealRefs(exactMatch.id);
        setDupError({ contact: exactMatch, dealRefs: refs });
        return;
      }

      const nearMatch = allContacts.find(c =>
        c.fullName.toLowerCase() === newFullName && c.id !== form.id
      );
      if (nearMatch) {
        if (dupWarning?.contact.id !== nearMatch.id) {
          const refs = await fetchDealRefs(nearMatch.id);
          setDupWarning({ contact: nearMatch, dealRefs: refs });
          return;
        }
      }
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
        pin: form.pin.trim() || undefined,
        preferredLanguage: form.preferredLanguage,
        teamName: form.teamName.trim() || undefined,
        orgId: form.orgId || undefined,
      });

      if (form.contactType === 'agent') {
        for (const id of deletedLicenseIds) await deleteContactLicenseRecord(id);
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
        for (const id of deletedMlsIds) await deleteContactMlsRecord(id);
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

      const saved: SavedContact = {
        id: savedFormId,
        fullName,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        company: form.company.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        contactType: form.contactType,
        isNewClient,
      };

      onSaved(saved);
      onClose();
    } catch (err) {
      console.error('Save failed:', err);
      alert('Failed to save contact. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal modal-open z-50">
      <div className="modal-box max-w-2xl max-h-[90vh] flex flex-col p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-base-300">
          <h3 className="font-bold text-base">{isEditing ? 'Edit Contact' : 'Add Contact'}</h3>
          <Button variant="ghost" className="btn-circle" onClick={onClose}><X size={16} /></Button>
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
                {CONTACT_ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <label className="label py-0"><span className="label-text text-xs">Email</span></label>
                <input
                  className={`input input-sm input-bordered w-full ${emailDup ? 'input-warning' : ''}`}
                  type="email" autoComplete="off"
                  value={form.email} onChange={e => updateField('email', e.target.value)}
                />
                {emailDup && (
                  <p className="text-xs text-warning font-medium mt-0.5 flex items-center gap-1">
                    <span>⚠</span> Email already used by <span className="font-semibold">{emailDup.firstName} {emailDup.lastName}</span>
                  </p>
                )}
              </div>
              <div>
                <label className="label py-0"><span className="label-text text-xs">Phone</span></label>
                <input
                  className={`input input-sm input-bordered w-full ${phoneDup ? 'input-warning' : ''}`}
                  autoComplete="off"
                  value={form.phone} onChange={e => updateField('phone', formatPhoneLive(e.target.value))}
                />
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
              <label className="label py-0"><span className="label-text text-xs">Team Name</span></label>
              <input className="input input-sm input-bordered w-full" placeholder="e.g. Team Alberto Zuniga" value={form.teamName} onChange={e => updateField('teamName', e.target.value)} />
            </div>
            <div className="mt-2">
              <label className="label py-0"><span className="label-text text-xs">Collaboration with</span></label>
              <select className="select select-sm select-bordered w-full" value={form.orgId} onChange={e => updateField('orgId', e.target.value)}>
                <option value="">myRedeal Staff</option>
                {orgs.map(org => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
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
                  Español
                </button>
              </div>
            </div>
            <div className="mt-2">
              <label className="label py-0"><span className="label-text text-xs">Notes</span></label>
              <textarea className="textarea textarea-bordered textarea-sm w-full" autoComplete="off" rows={2} value={form.notes} onChange={e => updateField('notes', e.target.value)} />
            </div>
            <div className="mt-2">
              <label className="label py-0">
                <span className="label-text text-xs">Client Portal PIN</span>
                <span className="label-text-alt text-xs text-base-content/40">4–6 digits — used for portal access</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                pattern="[0-9]*"
                placeholder="e.g. 1234"
                className="input input-bordered input-sm w-32"
                autoComplete="off"
                value={form.pin}
                onChange={e => updateField('pin', e.target.value.replace(/\D/g, ''))}
              />
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

          {/* Special Instructions (client agents only) */}
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

          {/* Notification Team (agents only) */}
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

              {isEditing && !teamLoading && (
                <div className="space-y-1.5">
                  {/* Agent root node */}
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
                      allContacts={allContacts}
                    />
                  ))}

                  {addingTeamMember && (
                    <div className="ml-4 border-l-2 border-dashed border-primary/30 pl-3">
                      <div className="border border-primary/30 rounded-lg p-3 bg-primary/5 space-y-2">
                        <p className="text-[10px] font-semibold text-primary uppercase tracking-wider">New Team Member</p>
                        <div>
                          <label className="label py-0"><span className="label-text text-[10px]">Link from Directory</span></label>
                          <select
                            className="select select-xs select-bordered w-full"
                            value=""
                            onChange={e => {
                              const c = allContacts.find(ct => ct.id === e.target.value);
                              if (c) setTeamForm(f => ({ ...f, name: c.fullName, email: c.email || f.email, phone: c.phone || f.phone }));
                            }}
                          >
                            <option value="">— Pick a contact to auto-fill —</option>
                            {allContacts.map(c => (
                              <option key={c.id} value={c.id}>{c.fullName}{c.company ? ` (${c.company})` : ''}</option>
                            ))}
                          </select>
                        </div>
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
                    <button className="btn btn-ghost btn-xs btn-circle absolute top-1 right-1 text-error" onClick={() => removeLicense(idx)}>
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
                        <a href={licenseUrls[lic.stateCode]} target="_blank" rel="noopener noreferrer"
                          className="btn btn-xs btn-outline gap-1 text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-400">
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
                      <button className="btn btn-ghost btn-xs btn-circle absolute top-1 right-1 text-error" onClick={() => removeMls(idx)}>
                        <Trash2 size={12} />
                      </button>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="label py-0"><span className="label-text text-[10px]">MLS *</span></label>
                          <select className="select select-xs select-bordered w-full" value={selectedEntryId} onChange={e => selectMlsEntry(idx, e.target.value)}>
                            <option value="">— Select MLS —</option>
                            {mlsDirectory.map(entry => (
                              <option key={entry.id} value={entry.id}>
                                {entry.state ? `[${entry.state}] ` : ''}{entry.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="label py-0"><span className="label-text text-[10px]">Agent MLS ID</span></label>
                          <input className="input input-xs input-bordered w-full" placeholder="e.g. 12345678" value={mls.mlsMemberNumber} onChange={e => updateMls(idx, { mlsMemberNumber: e.target.value })} />
                        </div>
                      </div>
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

          {/* Deal History (read-only, edit mode only) */}
          {isEditing && (() => {
            const STATUS_ORDER: Record<string, number> = { active: 0, pending: 1, closed: 2, cancelled: 3, withdrawn: 4 };
            const STATUS_COLORS: Record<string, string> = {
              active: 'badge-success',
              pending: 'badge-warning',
              closed: 'badge-ghost',
              cancelled: 'badge-error',
              withdrawn: 'badge-error',
            };
            const sorted = [...dealHistory].sort((a, b) => {
              const ao = STATUS_ORDER[a.status?.toLowerCase()] ?? 99;
              const bo = STATUS_ORDER[b.status?.toLowerCase()] ?? 99;
              return ao !== bo ? ao - bo : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });
            const filtered = dealHistoryFilter === 'all'
              ? sorted
              : sorted.filter(d => d.status?.toLowerCase() === dealHistoryFilter);
            const activeCount = dealHistory.filter(d => d.status?.toLowerCase() === 'active').length;
            const pendingCount = dealHistory.filter(d => d.status?.toLowerCase() === 'pending').length;
            const closedCount = dealHistory.filter(d => ['closed', 'cancelled', 'withdrawn'].includes(d.status?.toLowerCase())).length;

            return (
              <div>
                {/* Header — clickable to collapse */}
                <button
                  type="button"
                  onClick={() => setDealHistoryCollapsed(p => !p)}
                  className="flex items-center gap-2 w-full mb-2 group"
                >
                  <Briefcase size={13} className="text-base-content/50" />
                  <span className="text-xs font-semibold text-base-content/60 uppercase tracking-wider">Deal History</span>
                  {dealHistory.length > 0 && (
                    <span className="badge badge-xs badge-primary">{dealHistory.length}</span>
                  )}
                  <ChevronDown
                    size={13}
                    className={`ml-auto text-base-content/40 transition-transform duration-200 ${dealHistoryCollapsed ? '-rotate-90' : ''}`}
                  />
                </button>

                {!dealHistoryCollapsed && (
                  <>
                    {dealHistoryLoading ? (
                      <div className="flex items-center gap-2 py-2 text-xs text-base-content/40">
                        <Loader2 size={12} className="animate-spin" /> Loading deals...
                      </div>
                    ) : dealHistory.length === 0 ? (
                      <p className="text-xs text-base-content/40 italic px-1">Not linked to any deals yet.</p>
                    ) : (
                      <>
                        {/* Filter chips */}
                        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                          {([
                            { key: 'all', label: `All (${dealHistory.length})` },
                            { key: 'active', label: `Active (${activeCount})` },
                            { key: 'pending', label: `Pending (${pendingCount})` },
                            { key: 'closed', label: `Closed (${closedCount})` },
                          ] as const).map(f => (
                            <button
                              key={f.key}
                              type="button"
                              onClick={() => setDealHistoryFilter(f.key)}
                              className={`badge badge-sm cursor-pointer transition-colors ${
                                dealHistoryFilter === f.key
                                  ? 'badge-primary'
                                  : 'badge-ghost hover:badge-outline'
                              }`}
                            >
                              {f.label}
                            </button>
                          ))}
                        </div>

                        {/* Deal rows */}
                        {filtered.length === 0 ? (
                          <p className="text-xs text-base-content/40 italic px-1">No {dealHistoryFilter} deals.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {filtered.map(d => {
                              const badgeClass = STATUS_COLORS[d.status?.toLowerCase()] ?? 'badge-ghost';
                              return (
                                <div key={d.id} className="flex items-center justify-between border border-base-300 rounded-lg px-3 py-2 bg-base-50">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium truncate">{d.propertyAddress}</p>
                                    <p className="text-[10px] text-base-content/50 capitalize">
                                      {d.dealRole}{d.side ? ` · ${d.side} side` : ''}
                                    </p>
                                  </div>
                                  <span className={`badge badge-xs ml-2 capitalize ${badgeClass}`}>{d.status}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })()}

          {/* Organizations (read-only, edit mode only) */}
          {isEditing && (() => {
            const c = allContacts.find(ct => ct.id === form.id);
            if (!c || !c.organizations || c.organizations.length === 0) return null;
            return (
              <div>
                <div className="text-xs font-semibold text-base-content/60 uppercase tracking-wider mb-2">Organizations</div>
                <div className="flex flex-wrap gap-2">
                  {c.organizations.map(org => (
                    <span key={org.membershipId} className="badge badge-outline badge-sm gap-1">
                      {org.organizationName} {org.roleInOrganization ? `(${org.roleInOrganization})` : ''}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Duplicate warnings */}
        {dupError && (
          <div className="mx-5 mb-2 flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
            <span className="mt-0.5 shrink-0">⚠️</span>
            <div>
              <span className="font-semibold">Contact already exists:</span>{' '}
              <button className="underline underline-offset-2 font-medium hover:opacity-80"
                onClick={() => switchToContact(dupError.contact)}>
                {dupError.contact.fullName}
              </button>
              {dupError.contact.email && <span className="text-error/70"> · {dupError.contact.email}</span>}
              {dupError.contact.phone && <span className="text-error/70"> · {dupError.contact.phone}</span>}
              {dupError.dealRefs.length > 0 && (
                <span className="text-error/70"> · {dupError.dealRefs.join(', ')}</span>
              )}
            </div>
          </div>
        )}
        {dupWarning && !dupError && (
          <div className="mx-5 mb-2 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning-content">
            <span className="mt-0.5 shrink-0">🔍</span>
            <div className="flex-1">
              <span className="font-semibold text-warning">May be a duplicate:</span>{' '}
              <button className="underline underline-offset-2 font-medium hover:opacity-80"
                onClick={() => switchToContact(dupWarning.contact)}>
                {dupWarning.contact.fullName}
              </button>
              {dupWarning.contact.email && <span className="opacity-70"> · {dupWarning.contact.email}</span>}
              {dupWarning.contact.phone && <span className="opacity-70"> · {dupWarning.contact.phone}</span>}
              {dupWarning.dealRefs.length > 0 && (
                <span className="opacity-70"> · {dupWarning.dealRefs.join(', ')}</span>
              )}
              <div className="mt-1 text-xs opacity-60">Click Save again to add anyway, or open existing contact to update it.</div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-base-300">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <button
            className="btn btn-primary btn-sm gap-1"
            onClick={handleSave}
            disabled={saving || !form.firstName.trim() || !form.timezone}
          >
            {saving ? <span className="loading loading-spinner loading-xs" /> : <Save size={14} />}
            {isEditing ? 'Save Changes' : dupWarning ? 'Save Anyway' : 'Add Contact'}
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}
