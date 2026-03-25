import React, { useState, useRef, useEffect } from 'react';
import { Plus, Mail, Phone, Bell, BellOff, Trash2, Users, ChevronDown, ChevronRight, Search, X, Building2, User, UserCheck, UserPlus, Edit2, Save, Loader2, ExternalLink, FileText, Send, PhoneCall, PhoneOff } from 'lucide-react';
import { Deal, Contact, ContactRole, ContactRecord, AdditionalPerson, DealParticipantRole } from '../types';
import { saveDealParticipant, deleteDealParticipant } from '../utils/supabaseDb';
import { formatPhone, roleLabel, roleBadge, roleAvatarBg, getInitials, generateId } from '../utils/helpers';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ConfirmModal } from './ConfirmModal';
import { CallButton } from './CallButton';

interface CallStartedData {
  contactName: string;
  contactPhone: string;
  contactId?: string;
  dealId?: string;
  callSid?: string;
  startedAt: string;
}

interface Props { deal: Deal; onUpdate: (d: Deal) => void; contactRecords?: ContactRecord[]; onCallStarted?: (callData: CallStartedData) => void; }

// Which side a role defaults to
const defaultSide = (role: ContactRole): 'buy' | 'sell' | 'both' => {
  if (['buyer'].includes(role)) return 'buy';
  if (['seller'].includes(role)) return 'sell';
  if (['client'].includes(role)) return 'both';
  if (['lender'].includes(role)) return 'buy';
  if (['title', 'attorney'].includes(role)) return 'both';
  return 'both';
};


// ── Deal Sheet Email Compose Modal ───────────────────────────────────────────
const DealSheetEmailModal: React.FC<{
  deal: Deal;
  contact: Contact;
  onClose: () => void;
}> = ({ deal, contact, onClose }) => {
  const address = (deal as any).address || 'Property';
  const firstName = contact.name.split(' ')[0];
  const defaultSubject = `Transaction Deal Sheet – ${address}`;
  const lines = [
    `Hi ${firstName},`,
    '',
    'Please find your transaction deal sheet summary below:',
    '',
    `📍 Property:   ${(deal as any).address || 'N/A'}`,
    `🔑 MLS #:      ${(deal as any).mlsNumber || 'N/A'}`,
    `💰 Sale Price: ${(deal as any).price ? '$' + Number((deal as any).price).toLocaleString() : 'N/A'}`,
    `📋 Stage:      ${deal.state || 'N/A'}`,
    (deal as any).closeDate
      ? `📅 Close Date: ${new Date((deal as any).closeDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
      : '',
    '',
    "Please don't hesitate to reach out if you have any questions.",
    '',
    'Best regards,',
    'Transaction Coordinator',
  ].filter(Boolean);
  const defaultBody = lines.join('\n');

  const { profile, primaryOrgId } = useAuth();
  const userName = profile?.name || 'TC Staff';

  const [to, setTo] = React.useState(contact.email || '');
  const [subject, setSubject] = React.useState(defaultSubject);
  const [body, setBody] = React.useState(defaultBody);

  const handleSend = () => {
    const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoUrl, '_blank');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center flex-none">
            <FileText size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-sm leading-tight">Send Deal Sheet</p>
            <p className="text-xs text-white/70 truncate">{address}</p>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-xs btn-square text-white hover:bg-white/20"><X size={14} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">To</label>
            <input className="input input-bordered input-sm w-full" value={to} onChange={e => setTo(e.target.value)} placeholder="recipient@email.com" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Subject</label>
            <input className="input input-bordered input-sm w-full" value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Message</label>
            <textarea className="textarea textarea-bordered w-full text-sm resize-none font-mono" rows={9} value={body} onChange={e => setBody(e.target.value)} />
          </div>
        </div>
        <div className="px-5 pb-4 flex gap-2">
          <button onClick={onClose} className="btn btn-ghost btn-sm flex-1">Cancel</button>
          <button onClick={handleSend} disabled={!to.trim()} className="btn btn-primary btn-sm flex-1 gap-1.5">
            <Send size={13} /> Send Deal Sheet
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Live Call Popup ──────────────────────────────────────────────────────────
// ── Full contact info popup ──────────────────────────────────────────────────
const ContactPopup: React.FC<{
  contact: Contact;
  cr?: ContactRecord;
  onClose: () => void;
  onToggleNotif: () => void;
  onRemove: () => void;
  dealId: string;
  dealState?: string;
  deal?: Deal;
  onCallStarted?: (callData: CallStartedData) => void;
  onEdit: (updates: { name: string; phone: string; email: string; company: string; notes: string }) => Promise<void>;
}> = ({ contact, cr, onClose, onToggleNotif, onRemove, dealId, dealState, deal, onCallStarted, onEdit }) => {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: contact.name,
    phone: contact.phone || '',
    email: contact.email || '',
    company: contact.company || cr?.company || '',
    notes: cr?.notes || '',
  });
  const [licenseUrl, setLicenseUrl] = useState<string | null>(null);
  const [emailMenuOpen, setEmailMenuOpen] = useState(false);
  const [sendSheetOpen, setSendSheetOpen] = useState(false);
  const emailMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (emailMenuRef.current && !emailMenuRef.current.contains(e.target as Node)) setEmailMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fetch license lookup URL for the deal's state
  useEffect(() => {
    if (!dealState) return;
    supabase
      .from('state_license_links')
      .select('lookup_url')
      .eq('state_code', dealState)
      .single()
      .then(({ data }) => {
        if (data?.lookup_url) setLicenseUrl(data.lookup_url);
      });
  }, [dealState]);

  // MLS memberships matching the deal's state
  const stateMls = dealState && cr?.mlsMemberships?.length
    ? cr.mlsMemberships.filter(m => m.stateCode === dealState)
    : [];

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await onEdit(form);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditing(false)}>
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="bg-gray-50 border-b border-gray-200 px-5 py-4 flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-base font-bold flex-none ${roleAvatarBg(contact.role)}`}>
              {getInitials(form.name || contact.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-black text-base leading-tight">Edit Contact</p>
              <span className={`badge badge-xs mt-0.5 ${roleBadge(contact.role)}`}>{roleLabel(contact.role)}</span>
            </div>
            <button onClick={() => setEditing(false)} className="btn btn-ghost btn-xs btn-square"><X size={14} /></button>
          </div>
          {/* Edit form */}
          <div className="px-5 py-4 space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Full Name</label>
              <input
                className="input input-bordered input-sm w-full"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Phone</label>
                <input
                  className="input input-bordered input-sm w-full"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="Phone"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Email</label>
                <input
                  className="input input-bordered input-sm w-full"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="Email"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Company</label>
              <input
                className="input input-bordered input-sm w-full"
                value={form.company}
                onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                placeholder="Company"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Notes</label>
              <textarea
                className="textarea textarea-bordered w-full text-sm resize-none"
                rows={2}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Notes..."
              />
            </div>
          </div>
          {/* Footer */}
          <div className="px-5 pb-4 flex gap-2">
            <button onClick={() => setEditing(false)} className="btn btn-ghost btn-sm flex-1">Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
              className="btn btn-primary btn-sm flex-1 gap-1.5"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Save Changes
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gray-50 border-b border-gray-200 px-5 py-4 flex items-center gap-3">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-base font-bold flex-none ${roleAvatarBg(contact.role)}`}>
            {getInitials(contact.name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-black text-base leading-tight">{contact.name}</p>
            <span className={`badge badge-xs mt-0.5 ${roleBadge(contact.role)}`}>{roleLabel(contact.role)}</span>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-xs btn-square"><X size={14} /></button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {contact.email && (
            <div className="flex items-center gap-3">
              <Mail size={14} className="text-gray-400 flex-none" />
              <div className="relative flex-1 min-w-0" ref={emailMenuRef}>
                <button
                  onClick={() => setEmailMenuOpen(o => !o)}
                  className="flex items-center gap-1 text-sm text-primary hover:underline max-w-full"
                >
                  <span className="truncate">{contact.email}</span>
                  <ChevronDown size={12} className="flex-none opacity-60" />
                </button>
                {emailMenuOpen && (
                  <div className="absolute left-0 top-full mt-1 z-[70] bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden w-52">
                    <a
                      href={`mailto:${contact.email}`}
                      className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 text-sm text-black transition-colors"
                      onClick={() => setEmailMenuOpen(false)}
                    >
                      <Mail size={13} className="text-gray-400 flex-none" />
                      <span>Send Email</span>
                    </a>
                    {deal && (
                      <button
                        onClick={() => { setEmailMenuOpen(false); setSendSheetOpen(true); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-blue-50 text-sm text-black text-left transition-colors border-t border-gray-100"
                      >
                        <FileText size={13} className="text-blue-500 flex-none" />
                        <span>Send Deal Sheet</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          {sendSheetOpen && deal && contact.email && (
            <DealSheetEmailModal deal={deal} contact={contact} onClose={() => setSendSheetOpen(false)} />
          )}
          {contact.phone && (
            <div className="flex items-center gap-3">
              <Phone size={14} className="text-gray-400 flex-none" />
              <a href={`tel:${contact.phone}`} onClick={() => onCallStarted?.({ contactName: contact.name, contactPhone: contact.phone!, contactId: contact.id, dealId, startedAt: new Date().toISOString() })} className="text-sm text-black hover:text-primary">{formatPhone(contact.phone)}</a>
              <div onClick={() => onCallStarted?.({ contactName: contact.name, contactPhone: contact.phone!, contactId: contact.id, dealId, startedAt: new Date().toISOString() })}>
                <CallButton
                  phoneNumber={contact.phone}
                  contactName={contact.name}
                  contactId={contact.id}
                  dealId={dealId}
                  size="sm"
                  variant="icon"
                  onCallStarted={(callId) => onCallStarted?.({
                    contactName: contact.name,
                    contactPhone: contact.phone!,
                    contactId: contact.id,
                    dealId,
                    callSid: callId,
                    startedAt: new Date().toISOString(),
                  })}
                />
              </div>
            </div>
          )}
          {(contact.company || cr?.company) && (
            <div className="flex items-center gap-3">
              <Building2 size={14} className="text-gray-400 flex-none" />
              <span className="text-sm text-black">{contact.company || cr?.company}</span>
            </div>
          )}
          {cr?.notes && (
            <div className="pt-1 border-t border-gray-100">
              <p className="text-xs text-gray-400 mb-0.5">Notes</p>
              <p className="text-sm text-black">{cr.notes}</p>
            </div>
          )}

          {/* ── State-matched MLS memberships ── */}
          {stateMls.length > 0 && (
            <div className="pt-1 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-400 mb-1.5 flex items-center gap-1.5">
                <Building2 size={11} />
                MLS Membership · {dealState}
              </p>
              <div className="space-y-1.5">
                {stateMls.map((mls) => (
                  <div key={mls.id} className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                    <p className="text-sm font-semibold text-blue-900">{mls.mlsName}</p>
                    {mls.mlsMemberNumber && (
                      <p className="text-xs text-blue-600 mt-0.5">Member # {mls.mlsMemberNumber}</p>
                    )}
                    {mls.mlsCode && (
                      <p className="text-xs text-blue-500">Code: {mls.mlsCode}</p>
                    )}
                    {mls.boardName && (
                      <p className="text-xs text-gray-500 mt-0.5">{mls.boardName}</p>
                    )}
                    <span className={`badge badge-xs mt-1 ${
                      mls.status === 'active' ? 'badge-success' : 'badge-warning'
                    }`}>{mls.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
            {contact.inNotificationList
              ? <><Bell size={13} className="text-primary" /><span className="text-xs text-gray-500">On notification list</span></>
              : <><BellOff size={13} className="text-gray-300" /><span className="text-xs text-gray-400">Not on notification list</span></>
            }
          </div>

          {/* Both Sides toggle for provider contacts */}
          {(['title', 'escrow', 'attorney', 'inspector', 'appraiser', 'tc', 'other'] as string[]).includes(contact.role) && !contact.id.startsWith('__agent_') && (
            <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="checkbox checkbox-xs checkbox-primary"
                  checked={contact.side === 'both'}
                  onChange={async (e) => {
                    if (e.target.checked) {
                      // Remember current side before switching to both
                      await onEdit({ side: 'both', originalSide: contact.side || defaultSide(contact.role) || 'sell' } as any);
                    } else {
                      // Revert to the side they were on before
                      await onEdit({ side: ((contact as any).originalSide || defaultSide(contact.role) || 'sell') } as any);
                    }
                  }}
                />
                <span className="text-xs text-gray-500">Show on both sides</span>
              </label>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 pb-4 space-y-2">
          {/* Look Up License button — only if state has a portal URL */}
          {licenseUrl && (
            <a
              href={licenseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm btn-outline w-full gap-1.5 text-blue-700 border-blue-200 hover:bg-blue-50 hover:border-blue-400"
            >
              <ExternalLink size={12} /> Look Up License · {dealState}
            </a>
          )}
          <div className="flex gap-2">
            <button onClick={() => setEditing(true)} className="btn btn-sm btn-outline gap-1.5">
              <Edit2 size={12} /> Edit
            </button>
            <button onClick={() => { onToggleNotif(); onClose(); }} className="btn btn-sm btn-outline flex-1 gap-1.5">
              {contact.inNotificationList ? <><BellOff size={12} />Remove Notif</> : <><Bell size={12} />Add Notif</>}
            </button>
            <button onClick={() => { onRemove(); onClose(); }} className="btn btn-sm btn-error btn-outline gap-1.5">
              <Trash2 size={12} /> Remove
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};

// ── Searchable contact picker ────────────────────────────────────────────────
const ContactPicker: React.FC<{
  contactRecords: ContactRecord[];
  existingIds: string[];
  defaultSide: 'buy' | 'sell' | 'both';
  pickerType: 'client' | 'team' | 'contact';
  onAdd: (cr: ContactRecord, side: 'buy' | 'sell' | 'both') => void;
  onClose: () => void;
}> = ({ contactRecords, existingIds, defaultSide: presetSide, pickerType, onAdd, onClose }) => {
  const { profile, primaryOrgId } = useAuth();
  const [search, setSearch] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newRole, setNewRole] = useState('agent');
  const side = presetSide;
  const ref = useRef<HTMLDivElement>(null);

  const handleCreateContact = async () => {
    if (!newName.trim()) return;
    try {
      const { supabase } = await import('../lib/supabase');
      const userId = profile?.id ?? null;
      const orgId = primaryOrgId() ?? null;
      const nameParts = newName.trim().split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || '';
      const { data: newContact, error } = await supabase.from('contacts').insert({
        first_name: firstName,
        last_name: lastName,
        email: newEmail || null,
        phone: newPhone || null,
        company: newCompany || null,
        contact_type: newRole,
        org_id: orgId,
      }).select().single();
      if (error) throw error;
      const cr: ContactRecord = {
        id: newContact.id,
        fullName: newName.trim(),
        firstName,
        lastName,
        email: newEmail || '',
        phone: newPhone || '',
        company: newCompany || '',
        contactType: newRole as any,
        isClient: false,
        timezone: '',
        notes: '',
        isActive: true,
        createdAt: new Date().toISOString(),
        licenses: [],
        mlsMemberships: [],
        organizations: [],
      };
      onAdd(cr, side);
      onClose();
    } catch (err) {
      console.error('Failed to create contact:', err);
    }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const byType = (cr: ContactRecord) => {
    if (pickerType === 'client') return cr.contactType === 'agent' && cr.isClient;
    if (pickerType === 'team') return ['agent', 'tc', 'other', 'inspector'].includes(cr.contactType);
    return true;
  };

  const filtered = contactRecords.filter(cr =>
    !existingIds.includes(cr.id) &&
    byType(cr) &&
    (cr.fullName.toLowerCase().includes(search.toLowerCase()) ||
     cr.email?.toLowerCase().includes(search.toLowerCase()) ||
     roleLabel(cr.contactType).toLowerCase().includes(search.toLowerCase()) ||
     cr.company?.toLowerCase().includes(search.toLowerCase()))
  );

  const pickerLabel = pickerType === 'client' ? 'Select Agent Client'
    : pickerType === 'team' ? 'Select Team Member'
    : 'Select Contact';

  return (
    <div ref={ref} className="absolute right-0 z-40 bg-white border border-gray-200 rounded-2xl shadow-2xl w-72 overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full flex-none ${side === 'buy' ? 'bg-blue-500' : side === 'sell' ? 'bg-green-500' : 'bg-gray-400'}`} />
        <span className="text-xs font-semibold text-gray-600">
          {pickerLabel} — {side === 'buy' ? 'Buy Side' : side === 'sell' ? 'Sell Side' : 'Both Sides'}
        </span>
      </div>
      <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
        <Search size={13} className="text-gray-400 flex-none" />
        <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 text-sm outline-none bg-transparent placeholder-gray-400"
          placeholder="Search contacts..." />
        {search && <button onClick={() => setSearch('')}><X size={12} className="text-gray-300" /></button>}
      </div>
      <div className="max-h-56 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">No contacts found</p>
        )}
        {filtered.map(cr => (
          <button key={cr.id} onClick={() => { onAdd(cr, side); onClose(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-none ${roleAvatarBg(cr.contactType)}`}>
              {getInitials(cr.fullName)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-black truncate">{cr.fullName}</p>
              <p className="text-xs text-gray-400 truncate">{roleLabel(cr.contactType)}{cr.company ? ` · ${cr.company}` : ''}</p>
            </div>
          </button>
        ))}
      </div>
      {/* Create new contact inline */}
      {showCreateForm ? (
        <div className="border-t border-gray-100 p-3 space-y-2 bg-gray-50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">New Contact</p>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Full name *"
            className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary" />
          <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="Phone"
            className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary" />
          <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="Email"
            className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary" />
          <input value={newCompany} onChange={e => setNewCompany(e.target.value)} placeholder="Company"
            className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary" />
          <select value={newRole} onChange={e => setNewRole(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary bg-white">
            <option value="agent">Agent</option>
            <option value="lender">Lender</option>
            <option value="title">Title Officer</option>
            <option value="inspector">Inspector</option>
            <option value="tc">TC</option>
            <option value="client">Client</option>
            <option value="other">Other</option>
          </select>
          <div className="flex gap-2 pt-1">
            <button onClick={handleCreateContact} disabled={!newName.trim()}
              className="flex-1 btn btn-primary btn-xs text-white rounded-lg disabled:opacity-40">
              Create &amp; Add
            </button>
            <button onClick={() => setShowCreateForm(false)} className="btn btn-ghost btn-xs rounded-lg">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowCreateForm(true)}
          className="w-full flex items-center gap-2 px-3 py-2.5 border-t border-gray-100 hover:bg-gray-50 transition-colors text-left">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-none">
            <UserPlus size={13} className="text-primary" />
          </div>
          <span className="text-sm font-medium text-primary">Create new contact</span>
        </button>
      )}
    </div>
  );
};

// ── Additional People (spouses/co-buyers) inside agent client card ───────────
const MARITAL_OPTIONS = ['Single', 'Married', 'Divorced', 'Widowed', 'Separated', 'Other'];
const RELATIONSHIP_OPTIONS = ['Spouse', 'Co-Buyer', 'Co-Seller', 'Partner', 'Family Member', 'Other'];

const AdditionalPeopleSection: React.FC<{
  contact: Contact;
  onUpdateContact: (updated: Contact) => void;
}> = ({ contact, onUpdateContact }) => {
  const [expanded, setExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<AdditionalPerson, 'id'>>({
    name: '', relationship: '', maritalStatus: '', phone: '', email: ''
  });

  const people = contact.additionalPeople || [];

  const resetForm = () => { setForm({ name: '', relationship: '', maritalStatus: '', phone: '', email: '' }); setEditId(null); setShowForm(false); };

  const saveForm = () => {
    if (!form.name.trim()) return;
    let updated: AdditionalPerson[];
    if (editId) {
      updated = people.map(p => p.id === editId ? { ...form, id: editId } : p);
    } else {
      updated = [...people, { ...form, id: generateId() }];
    }
    onUpdateContact({ ...contact, additionalPeople: updated });
    resetForm();
  };

  const removePerson = (id: string) => {
    onUpdateContact({ ...contact, additionalPeople: people.filter(p => p.id !== id) });
  };

  const startEdit = (p: AdditionalPerson) => {
    setForm({ name: p.name, relationship: p.relationship, maritalStatus: p.maritalStatus, phone: p.phone, email: p.email });
    setEditId(p.id);
    setShowForm(true);
    setExpanded(true);
  };

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(o => !o)}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-primary transition-colors px-1 py-0.5 rounded-md hover:bg-white/50"
      >
        <Users size={11} />
        <span className="font-medium">Spouse / Co-Buyer</span>
        {people.length > 0 && (
          <span className="bg-primary/10 text-primary rounded-full px-1.5 py-0 text-[10px] font-bold">{people.length}</span>
        )}
        {expanded ? <ChevronDown size={11} className="ml-auto" /> : <ChevronRight size={11} className="ml-auto" />}
      </button>

      {expanded && (
        <div className="mt-1.5 ml-2 border-l-2 border-gray-200 pl-3 space-y-1.5">
          {people.map(p => (
            <div key={p.id} className="bg-white border border-gray-100 rounded-lg p-2 text-xs">
              <div className="flex items-start justify-between gap-1">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-black truncate">{p.name}</p>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {p.relationship && <span className="bg-blue-50 text-blue-600 rounded-full px-1.5 py-0 text-[10px] font-medium">{p.relationship}</span>}
                    {p.maritalStatus && <span className="bg-purple-50 text-purple-600 rounded-full px-1.5 py-0 text-[10px] font-medium">{p.maritalStatus}</span>}
                  </div>
                  {p.phone && <p className="text-gray-400 mt-0.5">{p.phone}</p>}
                  {p.email && <p className="text-gray-400 truncate">{p.email}</p>}
                </div>
                <div className="flex gap-1 flex-none">
                  <button onClick={() => startEdit(p)} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-primary"><Edit2 size={10} /></button>
                  <button onClick={() => removePerson(p.id)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 size={10} /></button>
                </div>
              </div>
            </div>
          ))}

          {showForm ? (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 space-y-1.5">
              <p className="text-[11px] font-semibold text-blue-700 mb-1">{editId ? 'Edit Person' : 'Add Person'}</p>
              <input className="input input-bordered input-xs w-full text-xs" placeholder="Full Name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <div className="grid grid-cols-2 gap-1.5">
                <select className="select select-bordered select-xs w-full text-xs" value={form.relationship} onChange={e => setForm(f => ({ ...f, relationship: e.target.value }))}>
                  <option value="">Relationship</option>
                  {RELATIONSHIP_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <select className="select select-bordered select-xs w-full text-xs" value={form.maritalStatus} onChange={e => setForm(f => ({ ...f, maritalStatus: e.target.value }))}>
                  <option value="">Marital Status</option>
                  {MARITAL_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <input className="input input-bordered input-xs w-full text-xs" placeholder="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              <input className="input input-bordered input-xs w-full text-xs" placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              <div className="flex gap-1.5 pt-0.5">
                <button onClick={saveForm} className="btn btn-primary btn-xs flex-1 gap-1"><Save size={10} /> Save</button>
                <button onClick={resetForm} className="btn btn-ghost btn-xs flex-1">Cancel</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setShowForm(true); setEditId(null); setForm({ name: '', relationship: '', maritalStatus: '', phone: '', email: '' }); }}
              className="flex items-center gap-1.5 text-xs text-primary hover:underline px-1 py-1"
            >
              <UserPlus size={11} /> Add Person
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ── Agent Client Card (highlighted, prominent) ───────────────────────────────
const AgentClientCard: React.FC<{
  contact: Contact;
  onClick: () => void;
  onUpdateContact: (updated: Contact) => void;
}> = ({ contact, onClick, onUpdateContact }) => (
  <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
    <button onClick={onClick} className="w-full flex items-center gap-3 text-left group">
      <div className="relative flex-none">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${roleAvatarBg(contact.role)}`}>
          {getInitials(contact.name)}
        </div>
        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-red-500 border-2 border-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-black truncate">{contact.name}</span>
          <span className="text-[10px] bg-red-100 text-red-600 rounded-full px-2 py-0.5 font-semibold whitespace-nowrap leading-none">our client</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-gray-500">{roleLabel(contact.role)}</span>
          {contact.company && <span className="text-xs text-gray-400">· {contact.company}</span>}
        </div>
      </div>
      <ChevronRight size={14} className="text-gray-300 group-hover:text-primary transition-colors flex-none" />
    </button>
    <AdditionalPeopleSection contact={contact} onUpdateContact={onUpdateContact} />
  </div>
);

// ── Regular Contact Card ─────────────────────────────────────────────────────
const ContactCard: React.FC<{ contact: Contact; cr?: ContactRecord; onClick: () => void }> = ({ contact, cr, onClick }) => (
  <button onClick={onClick}
    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all text-left group">
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-none ${roleAvatarBg(contact.role)}`}>
      {getInitials(contact.name)}
    </div>
    <div className="flex-1 min-w-0">
      <span className="text-sm font-semibold text-black truncate block">{contact.name}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500">{roleLabel(contact.role)}</span>
        {(contact.company || cr?.company) && <span className="text-xs text-gray-400">· {contact.company || cr?.company}</span>}
      </div>
    </div>
    <div className="flex items-center gap-1.5 flex-none">
      {contact.inNotificationList && <Bell size={11} className="text-primary/50" />}
      <ChevronRight size={12} className="text-gray-300 group-hover:text-primary transition-colors" />
    </div>
  </button>
);

// ── Side Section (one column) ────────────────────────────────────────────────
interface SideSectionProps {
  title: string;
  dotColor: string;
  contacts: Contact[];
  side: 'buy' | 'sell';
  showAddMenu: 'buy' | 'sell' | null;
  setShowAddMenu: (v: 'buy' | 'sell' | null) => void;
  pickerConfig: { side: 'buy' | 'sell'; type: 'client' | 'team' | 'contact' } | null;
  setPickerConfig: (v: { side: 'buy' | 'sell'; type: 'client' | 'team' | 'contact' } | null) => void;
  existingDirIds: string[];
  contactRecords: ContactRecord[];
  addFromDirectory: (cr: ContactRecord, side: 'buy' | 'sell' | 'both') => void;
  deal: Deal;
  onUpdate: (d: Deal) => void;
  setPopupContactId: (id: string | null) => void;
}

const SideSection: React.FC<SideSectionProps> = ({
  title, dotColor, contacts, side,
  showAddMenu, setShowAddMenu,
  pickerConfig, setPickerConfig,
  existingDirIds, contactRecords,
  addFromDirectory, deal, onUpdate,
  setPopupContactId,
}) => {
  const agentClient = contacts.find(c => deal.participants?.some(p => p.contactId === (c.directoryId || c.id) && p.isClientSide));
  const otherContacts = contacts.filter(c => c.id !== agentClient?.id);
  const hasAgentClient = !!agentClient;

  const menuWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target as Node)) {
        if (showAddMenu === side) setShowAddMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [side, showAddMenu, setShowAddMenu]);

  const openMenu = () => { setShowAddMenu(showAddMenu === side ? null : side); setPickerConfig(null); };
  const openPicker = (type: 'client' | 'team' | 'contact') => { setPickerConfig({ side, type }); setShowAddMenu(null); };

  return (
    <div className="flex flex-col h-full">
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
          <h3 className="font-bold text-base text-black">{title}</h3>
          <span className="text-xs text-gray-400 font-medium">({contacts.length})</span>
        </div>
        <div className="relative" ref={menuWrapRef}>
          <button onClick={openMenu}
            className="btn btn-xs btn-outline gap-1 border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-400">
            <Plus size={11} /> Add <ChevronDown size={10} />
          </button>

          {showAddMenu === side && (
            <div className="absolute right-0 top-full mt-1 z-40 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden w-52">
              <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
                <p className="text-xs text-gray-500 font-semibold">Add to {title}</p>
              </div>
              <button onClick={() => openPicker('client')}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-red-50 transition-colors text-left">
                <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center flex-none">
                  <UserCheck size={13} className="text-red-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-black">Agent Client</p>
                  <p className="text-xs text-gray-400">Our client (red dot)</p>
                </div>
              </button>
              {hasAgentClient && (
                <button onClick={() => openPicker('team')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 transition-colors text-left">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center flex-none">
                    <Users size={13} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-black">Team Member</p>
                    <p className="text-xs text-gray-400">TC, showing agent…</p>
                  </div>
                </button>
              )}
              <button onClick={() => openPicker('contact')}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-green-50 transition-colors text-left">
                <div className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center flex-none">
                  <User size={13} className="text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-black">Contact</p>
                  <p className="text-xs text-gray-400">Lender, Title, End Client…</p>
                </div>
              </button>
            </div>
          )}

          {pickerConfig?.side === side && (
            <ContactPicker
              contactRecords={contactRecords}
              existingIds={existingDirIds}
              defaultSide={side}
              pickerType={pickerConfig.type}
              onAdd={addFromDirectory}
              onClose={() => setPickerConfig(null)}
            />
          )}
        </div>
      </div>

      {/* Contact cards */}
      {contacts.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-8 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
          <Users size={20} className="text-gray-300 mb-2" />
          <p className="text-sm text-gray-400 font-medium">No contacts yet</p>
          <button onClick={() => setShowAddMenu(side)} className="text-xs text-primary mt-1 hover:underline font-medium">+ Add first contact</button>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Agent client card (if present) */}
          {agentClient && (
            <AgentClientCard
              contact={agentClient}
              onClick={() => setPopupContactId(agentClient.id)}
              onUpdateContact={(updated) => {
                onUpdate({
                  ...deal,
                  contacts: deal.contacts.map(c => c.id === updated.id ? updated : c),
                  updatedAt: new Date().toISOString(),
                });
              }}
            />
          )}

          {/* Other contacts — flat list, no tree lines */}
          {otherContacts.map(c => (
            <ContactCard
              key={c.id}
              contact={c}
              cr={contactRecords.find(d => d.id === c.directoryId)}
              onClick={() => setPopupContactId(c.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Main Component ───────────────────────────────────────────────────────────
export const WorkspaceContacts: React.FC<Props> = ({ deal, onUpdate, contactRecords = [], onCallStarted }) => {
  const { profile } = useAuth();
  const userName = profile?.name || 'TC Staff';
  const [showAddMenu, setShowAddMenu] = useState<'buy' | 'sell' | null>(null);
  const [pickerConfig, setPickerConfig] = useState<{ side: 'buy' | 'sell'; type: 'client' | 'team' | 'contact' } | null>(null);
  const [popupContactId, setPopupContactId] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);

  const existingDirIds = deal.contacts.filter(c => c.directoryId).map(c => c.directoryId!);

  const contactTypeToParticipantRole = (ct: string, side?: 'buy' | 'sell' | 'both'): DealParticipantRole => {
    if (ct === 'client') {
      if (side === 'buy') return 'buyer';
      if (side === 'sell') return 'seller';
      return 'other';
    }
    const map: Record<string, DealParticipantRole> = {
      agent: 'lead_agent', lender: 'lender', title: 'title_officer', attorney: 'other',
      inspector: 'inspector', appraiser: 'appraiser', buyer: 'buyer', seller: 'seller', tc: 'tc', other: 'other',
    };
    return map[ct] || 'other';
  };

  const addFromDirectory = async (cr: ContactRecord, side: 'buy' | 'sell' | 'both') => {
    const effectiveSide = cr.contactType === 'lender' ? 'buy' : side;
    const dealSide = effectiveSide === 'buy' ? 'buyer' : effectiveSide === 'sell' ? 'listing' : 'both' as any;
    const dealRole = contactTypeToParticipantRole(cr.contactType, effectiveSide);

    try {
      await saveDealParticipant({
        dealId: deal.id,
        contactId: cr.id,
        side: dealSide,
        dealRole,
        isPrimary: false,
        isClientSide: !!cr.isClient || pickerConfig?.type === 'client',
      });
    } catch (err) {
      console.error('Failed to add participant:', err);
    }

    const contact: Contact = {
      id: cr.id,
      directoryId: cr.id,
      name: cr.fullName,
      email: cr.email || '',
      phone: cr.phone || '',
      role: (cr.contactType === 'client' ? dealRole : cr.contactType) as ContactRole,
      company: cr.company,
      inNotificationList: true,
      side: effectiveSide,
    };
    const isClientSideFlag = !!cr.isClient || pickerConfig?.type === 'client';
    // Sync agent contacts to deal.buyerAgent / deal.sellerAgent so Overview shows them
    const agentOverride: Partial<import('../types').Deal> = {};
    if (cr.contactType === 'agent') {
      const agentData = { name: cr.fullName, phone: cr.phone || '', email: cr.email || '', isOurClient: !!cr.isClient };
      if (effectiveSide === 'buy') agentOverride.buyerAgent = agentData;
      else if (effectiveSide === 'sell') agentOverride.sellerAgent = agentData;
    }
    const newParticipant: import('../types').DealParticipant = {
      id: crypto.randomUUID() as import('../types').DealParticipant['id'],
      contactId: cr.id,
      dealId: deal.id,
      side: dealSide,
      dealRole,
      isPrimary: false,
      isClientSide: isClientSideFlag,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onUpdate({
      ...deal,
      ...agentOverride,
      contacts: [...deal.contacts, contact],
      participants: [...(deal.participants || []), newParticipant],
      activityLog: [{ id: generateId(), timestamp: new Date().toISOString(), action: `Contact added: ${contact.name}`, detail: `Role: ${roleLabel(contact.role)} · ${effectiveSide === 'buy' ? 'Buy' : effectiveSide === 'sell' ? 'Sell' : 'Both'} Side`, user: userName, type: 'contact_added' }, ...deal.activityLog],
      updatedAt: new Date().toISOString(),
    });
  };

  const toggleNotif = (id: string) => {
    onUpdate({ ...deal, contacts: deal.contacts.map(c => c.id === id ? { ...c, inNotificationList: !c.inNotificationList } : c), updatedAt: new Date().toISOString() });
  };

  const remove = async (id: string) => {
    const participant = deal.participants?.find(p => p.contactId === id || p.contactId === deal.contacts.find(c => c.id === id)?.directoryId);
    if (participant) {
      try {
        await deleteDealParticipant(participant.id);
      } catch (err) {
        console.error('Failed to remove participant:', err);
      }
    }
    const c = deal.contacts.find(x => x.id === id);
    onUpdate({
      ...deal,
      contacts: deal.contacts.filter(x => x.id !== id),
      activityLog: [{ id: generateId(), timestamp: new Date().toISOString(), action: `Contact removed: ${c?.name}`, user: userName, type: 'contact_added' }, ...deal.activityLog],
      updatedAt: new Date().toISOString(),
    });
  };

  const editContact = async (
    contactId: string,
    updates: { name: string; phone: string; email: string; company: string; notes: string }
  ) => {
    const contact = deal.contacts.find(c => c.id === contactId);
    if (!contact) return;

    if (contact.directoryId) {
      const nameParts = updates.name.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || null;
      await supabase.from('contacts').update({
        first_name: firstName,
        last_name: lastName,
        phone: updates.phone || null,
        email: updates.email || null,
        company: updates.company || null,
        notes: updates.notes || null,
      }).eq('id', contact.directoryId);
    }

    onUpdate({
      ...deal,
      contacts: deal.contacts.map(c =>
        c.id === contactId
          ? { ...c, name: updates.name, phone: updates.phone, email: updates.email, company: updates.company }
          : c
      ),
      activityLog: [
        { id: generateId(), timestamp: new Date().toISOString(), action: `Contact updated: ${updates.name}`, user: userName, type: 'contact_added' },
        ...deal.activityLog,
      ],
      updatedAt: new Date().toISOString(),
    });
  };

  const buySide = deal.contacts.filter(c => c.side === 'buy' || c.side === 'both' || (!c.side && defaultSide(c.role) === 'buy'));
  const sellSide = deal.contacts.filter(c => c.side === 'sell' || c.side === 'both' || (!c.side && defaultSide(c.role) === 'sell'));
  const notifList = deal.contacts.filter(c => c.inNotificationList);

  const allDisplayedContacts = [...buySide, ...sellSide.filter(c => !buySide.some(b => b.id === c.id))];
  const popupContact = popupContactId ? allDisplayedContacts.find(c => c.id === popupContactId) : null;
  const popupCr = popupContact?.directoryId ? contactRecords.find(d => d.id === popupContact.directoryId) : undefined;

  // Normalize deal state to 2-letter uppercase code
  const dealState = deal.state?.trim().toUpperCase().slice(0, 2) || undefined;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">

      {/* Notification List */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl overflow-hidden">
        <button onClick={() => setNotifOpen(o => !o)} className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-primary/10 transition-colors">
          <Bell size={15} className="text-primary opacity-70" />
          <span className="font-semibold text-sm text-black flex-1 text-left">Notification List</span>
          <span className="badge badge-primary badge-sm">{notifList.length}</span>
          {notifOpen ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
        </button>
        {notifOpen && (
          <div className="px-4 pb-3 flex flex-wrap gap-2 border-t border-primary/10 pt-3">
            {notifList.length === 0 && <p className="text-xs text-gray-400">No contacts on notification list.</p>}
            {notifList.map(c => (
              <button
                key={c.id}
                onClick={() => setPopupContactId(c.id)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white rounded-lg border border-gray-200 shadow-sm hover:border-primary/40 hover:shadow-md transition-all"
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${roleAvatarBg(c.role)}`}>{getInitials(c.name)}</div>
                <span className="text-xs font-medium text-black">{c.name}</span>
                <span className={`badge badge-xs ${roleBadge(c.role)}`}>{roleLabel(c.role)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Two-column grid: Buy Side | Sell Side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/30">
          <SideSection
            title="Buy Side" dotColor="bg-blue-500" contacts={buySide} side="buy"
            showAddMenu={showAddMenu} setShowAddMenu={setShowAddMenu}
            pickerConfig={pickerConfig} setPickerConfig={setPickerConfig}
            existingDirIds={existingDirIds} contactRecords={contactRecords}
            addFromDirectory={addFromDirectory} deal={deal} onUpdate={onUpdate}
            setPopupContactId={setPopupContactId}
          />
        </div>
        <div className="border border-green-200 rounded-xl p-4 bg-green-50/30">
          <SideSection
            title="Sell Side" dotColor="bg-green-500" contacts={sellSide} side="sell"
            showAddMenu={showAddMenu} setShowAddMenu={setShowAddMenu}
            pickerConfig={pickerConfig} setPickerConfig={setPickerConfig}
            existingDirIds={existingDirIds} contactRecords={contactRecords}
            addFromDirectory={addFromDirectory} deal={deal} onUpdate={onUpdate}
            setPopupContactId={setPopupContactId}
          />
        </div>
      </div>

      {/* Contact info popup */}
      {popupContact && (
        <ContactPopup
          contact={popupContact}
          cr={popupCr}
          onClose={() => setPopupContactId(null)}
          onToggleNotif={() => toggleNotif(popupContact.id)}
          onRemove={() => { setPopupContactId(null); setRemoveId(popupContact.id); }}
          dealId={deal.id}
          dealState={dealState}
          deal={deal}
          onCallStarted={onCallStarted}
          onEdit={async (updates) => editContact(popupContact.id, updates)}
        />
      )}

      {/* Confirm remove */}
      <ConfirmModal
        isOpen={removeId !== null}
        title="Remove from Deal?"
        message="This contact will be removed from the deal."
        confirmLabel="Yes, Remove"
        onConfirm={() => { if (removeId) { remove(removeId); setRemoveId(null); } }}
        onCancel={() => setRemoveId(null)}
      />
    </div>
  );
};
