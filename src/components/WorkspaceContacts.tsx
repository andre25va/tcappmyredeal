import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Plus, Mail, Phone, Bell, BellOff, Trash2, Users, ChevronDown, ChevronRight,
  Search, X, Building2, User, UserCheck, UserPlus, Edit2, Save, Loader2,
  ExternalLink, FileText, Send, AlertCircle, CheckCircle2, Info,
} from 'lucide-react';
import { Deal, Contact, ContactRole, ContactRecord, AdditionalPerson, DealParticipantRole } from '../types';
import { saveDealParticipant, deleteDealParticipant } from '../utils/supabaseDb';
import { formatPhone, roleLabel, roleBadge, roleAvatarBg, getInitials, generateId } from '../utils/helpers';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ConfirmModal } from './ConfirmModal';
import { CallButton } from './CallButton';
import { MRDChip } from './ui/MRDChip';

// ── Types ────────────────────────────────────────────────────────────────────

interface CallStartedData {
  contactName: string;
  contactPhone: string;
  contactId?: string;
  dealId?: string;
  callSid?: string;
  startedAt: string;
}

interface Props {
  deal: Deal;
  onUpdate: (d: Deal) => void;
  contactRecords?: ContactRecord[];
  onCallStarted?: (callData: CallStartedData) => void;
}

interface DealParticipantRow {
  dp_id: string;
  deal_role: string;
  side: 'buyer' | 'seller' | 'both';
  is_primary: boolean;
  is_client_side: boolean;
  is_extracted: boolean;
  dp_notes?: string;
  contact_id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company?: string;
  contact_type?: string;
  full_name?: string;
}

interface ChangeDiff {
  field: string;
  old_value: string;
  new_value: string;
}

interface RoleSlot {
  deal_role: string;
  label: string;
  contact_type: string;
  allowMultiple?: boolean;
}

// ── Role slot definitions ────────────────────────────────────────────────────

const BUY_SIDE_ROLES: RoleSlot[] = [
  { deal_role: 'lead_agent',   label: 'Buyer Agent',   contact_type: 'agent',     allowMultiple: true },
  { deal_role: 'co_agent',     label: 'Co-Agent',      contact_type: 'agent',     allowMultiple: true },
  { deal_role: 'buyer',        label: 'Buyer',         contact_type: 'buyer',     allowMultiple: true },
  { deal_role: 'lender',       label: 'Lender',        contact_type: 'lender',    allowMultiple: true },
  { deal_role: 'inspector',    label: 'Inspector',     contact_type: 'inspector', allowMultiple: true },
  { deal_role: 'appraiser',    label: 'Appraiser',     contact_type: 'appraiser', allowMultiple: true },
];

const SELL_SIDE_ROLES: RoleSlot[] = [
  { deal_role: 'lead_agent',    label: 'Seller Agent', contact_type: 'agent',    allowMultiple: true },
  { deal_role: 'co_agent',      label: 'Co-Agent',     contact_type: 'agent',    allowMultiple: true },
  { deal_role: 'seller',        label: 'Seller',       contact_type: 'seller',   allowMultiple: true },
  { deal_role: 'attorney',      label: 'Attorney',     contact_type: 'attorney', allowMultiple: true },
];

const BOTH_SIDES_ROLES: RoleSlot[] = [
  { deal_role: 'title_officer', label: 'Title Company', contact_type: 'title', allowMultiple: true },
];

// Which side a role defaults to (used for legacy deal.contacts fallback)
const defaultSide = (role: ContactRole): 'buy' | 'sell' | 'both' => {
  if (['buyer'].includes(role)) return 'buy';
  if (['seller'].includes(role)) return 'sell';
  if (['client'].includes(role)) return 'both';
  if (['lender'].includes(role)) return 'buy';
  if (['title', 'attorney'].includes(role)) return 'both';
  return 'both';
};

// ── Edit Confirm Modal ────────────────────────────────────────────────────────
const EditConfirmModal: React.FC<{
  isOpen: boolean;
  diffs: ChangeDiff[];
  profileName: string;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  subtitle?: string;
  actionLabel?: string;
}> = ({ isOpen, diffs, profileName, onConfirm, onCancel, title = 'Confirm Contact Update', subtitle, actionLabel = 'Confirm Update' }) => {
  const [firstNameInput, setFirstNameInput] = useState('');
  const profileFirstName = (profileName || '').split(' ')[0];
  const canConfirm = firstNameInput.trim().toLowerCase() === profileFirstName.toLowerCase();

  useEffect(() => { if (!isOpen) setFirstNameInput(''); }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gray-50 border-b border-gray-200 px-5 py-4">
          <p className="font-bold text-black text-sm">{title}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Blue info banner */}
          <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5">
            <Info size={14} className="text-blue-500 flex-none mt-0.5" />
            <p className="text-xs text-blue-700 leading-relaxed">
              This updates the master contact record — changes reflect across all deals &amp; the contacts directory.
            </p>
          </div>

          {/* Staff identity */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-none">
              <span className="text-xs font-bold text-primary">{getInitials(profileName || 'TC')}</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-black">{profileName || 'TC Staff'}</p>
              <p className="text-[11px] text-gray-400">Making this change</p>
            </div>
          </div>

          {/* Diff list */}
          {diffs.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-gray-500">What's changing:</p>
              {diffs.map((d, i) => (
                <div key={i} className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5">
                  <p className="text-[11px] font-semibold text-gray-500 mb-0.5">{d.field}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-gray-400 line-through">{d.old_value || '(empty)'}</span>
                    <span className="text-gray-300">→</span>
                    <span className="text-xs font-semibold text-black">{d.new_value || '(empty)'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* First name confirmation */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">
              Type your first name to confirm: <span className="text-primary">{profileFirstName}</span>
            </label>
            <input
              className="input input-bordered input-sm w-full"
              placeholder={`Type "${profileFirstName}" to confirm`}
              value={firstNameInput}
              onChange={e => setFirstNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && canConfirm && onConfirm()}
              autoFocus
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-4 flex gap-2">
          <button onClick={onCancel} className="btn btn-ghost btn-sm flex-1">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className="btn btn-primary btn-sm flex-1 gap-1.5"
          >
            <CheckCircle2 size={13} /> {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
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

  const { profile } = useAuth();

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

// ── Contact Popup ─────────────────────────────────────────────────────────────
const ContactPopup: React.FC<{
  contact: Contact;
  cr?: ContactRecord;
  onClose: () => void;
  onToggleNotif: () => void;
  onRemove: () => void;
  dealId: string;
  dealState?: string;
  deal?: Deal;
  dpId?: string;
  onCallStarted?: (callData: CallStartedData) => void;
  onEdit: (updates: { name: string; phone: string; email: string; company: string; notes: string }) => Promise<void>;
  onUpdateContact?: (updated: Contact) => void;
  onUpdateSide?: (dpId: string, side: 'buyer' | 'seller' | 'both') => Promise<void>;
  primaryOrgId?: () => string | null;
}> = ({ contact, cr, onClose, onToggleNotif, onRemove, dealId, dealState, deal, dpId, onCallStarted, onEdit, onUpdateContact, onUpdateSide, primaryOrgId }) => {
  const { profile } = useAuth();
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

  // Edit confirm modal state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDiffs, setPendingDiffs] = useState<ChangeDiff[]>([]);
  const [pendingForm, setPendingForm] = useState<typeof form | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (emailMenuRef.current && !emailMenuRef.current.contains(e.target as Node)) setEmailMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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

  const stateMls = dealState && cr?.mlsMemberships?.length
    ? cr.mlsMemberships.filter(m => m.stateCode === dealState)
    : [];

  // Compute diff between form and original contact values
  const computeDiff = (f: typeof form): ChangeDiff[] => {
    const diffs: ChangeDiff[] = [];
    const origName = contact.name || '';
    const origPhone = contact.phone || '';
    const origEmail = contact.email || '';
    const origCompany = contact.company || cr?.company || '';
    if (f.name.trim() !== origName)    diffs.push({ field: 'Name',    old_value: origName,    new_value: f.name.trim() });
    if (f.phone !== origPhone)          diffs.push({ field: 'Phone',   old_value: origPhone,   new_value: f.phone });
    if (f.email !== origEmail)          diffs.push({ field: 'Email',   old_value: origEmail,   new_value: f.email });
    if (f.company !== origCompany)      diffs.push({ field: 'Company', old_value: origCompany, new_value: f.company });
    return diffs;
  };

  const handleSaveClick = () => {
    if (!form.name.trim()) return;
    const diffs = computeDiff(form);
    if (diffs.length === 0) {
      setEditing(false);
      return;
    }
    setPendingDiffs(diffs);
    setPendingForm({ ...form });
    setConfirmOpen(true);
  };

  const handleConfirmSave = async () => {
    if (!pendingForm) return;
    setSaving(true);
    try {
      await onEdit(pendingForm);
      setEditing(false);
      setConfirmOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <>
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
                onClick={handleSaveClick}
                disabled={saving || !form.name.trim()}
                className="btn btn-primary btn-sm flex-1 gap-1.5"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
        {/* Edit confirm modal */}
        <EditConfirmModal
          isOpen={confirmOpen}
          diffs={pendingDiffs}
          profileName={profile?.name || 'TC Staff'}
          onConfirm={handleConfirmSave}
          onCancel={() => setConfirmOpen(false)}
        />
      </>
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
              <a
                href={`tel:${contact.phone}`}
                onClick={() => onCallStarted?.({ contactName: contact.name, contactPhone: contact.phone!, contactId: contact.id, dealId, startedAt: new Date().toISOString() })}
                className="text-sm text-black hover:text-primary"
              >
                {formatPhone(contact.phone)}
              </a>
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

          {/* State-matched MLS memberships */}
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
                    <span className={`badge badge-xs mt-1 ${mls.status === 'active' ? 'badge-success' : 'badge-warning'}`}>{mls.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {contact.side === 'both' && (
            <div className="flex items-center gap-1 pt-1">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-600">
                <Building2 size={9} /> Both Sides
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
            {contact.inNotificationList
              ? <><Bell size={13} className="text-primary" /><span className="text-xs text-gray-500">On notification list</span></>
              : <><BellOff size={13} className="text-gray-300" /><span className="text-xs text-gray-400">Not on notification list</span></>
            }
          </div>

          {/* Additional people for client-side contacts */}
          {onUpdateContact && (['buyer', 'seller', 'client'].includes(contact.role) || !(['agent', 'lender', 'title', 'escrow', 'attorney', 'inspector', 'appraiser', 'tc'] as string[]).includes(contact.role)) && (
            <div className="pt-1 border-t border-gray-100">
              <AdditionalPeopleSection
                contact={contact}
                onUpdateContact={onUpdateContact}
                side={contact.side || (contact.role === 'buyer' ? 'buy' : contact.role === 'seller' ? 'sell' : undefined)}
              />
            </div>
          )}

          {/* Representing both sides toggle */}
          {dpId && onUpdateSide && (['title', 'escrow', 'attorney', 'inspector', 'appraiser', 'tc', 'other'] as string[]).includes(contact.role) && !contact.id.startsWith('__agent_') && (
            <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="checkbox checkbox-xs checkbox-primary"
                  checked={contact.side === 'both'}
                  onChange={async (e) => {
                    const newSide = e.target.checked ? 'both' : ((contact as any).originalSide || defaultSide(contact.role) === 'buy' ? 'buyer' : 'seller');
                    await onUpdateSide(dpId, newSide as 'buyer' | 'seller' | 'both');
                  }}
                />
                <span className="text-xs text-gray-500">Representing both sides</span>
              </label>
            </div>
          )}

          {/* Legacy both sides toggle for contacts without dpId */}
          {!dpId && (['title', 'escrow', 'attorney', 'inspector', 'appraiser', 'tc', 'other'] as string[]).includes(contact.role) && !contact.id.startsWith('__agent_') && (
            <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="checkbox checkbox-xs checkbox-primary"
                  checked={contact.side === 'both'}
                  onChange={async (e) => {
                    if (e.target.checked) {
                      await onEdit({ side: 'both', originalSide: contact.side || defaultSide(contact.role) || 'sell' } as any);
                    } else {
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

// ── Additional People Section ─────────────────────────────────────────────────
const MARITAL_OPTIONS = ['Single', 'Married', 'Divorced', 'Widowed', 'Separated', 'Other'];
const RELATIONSHIP_OPTIONS = ['Spouse', 'Co-Buyer', 'Co-Seller', 'Partner', 'Guarantor', 'POA', 'Family Member', 'Other'];

const AdditionalPeopleSection: React.FC<{
  contact: Contact;
  onUpdateContact: (updated: Contact) => void;
  side?: 'buy' | 'sell' | 'both';
}> = ({ contact, onUpdateContact, side }) => {
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
        <span className="font-medium">{side === 'sell' ? 'Co-Seller / Partner' : 'Spouse / Co-Buyer'}</span>
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

// ── Agent Client Card ─────────────────────────────────────────────────────────
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

// ── Contact Search Modal (for empty role slots) ────────────────────────────────
const ContactSearchModal: React.FC<{
  slot: RoleSlot;
  columnSide: 'buyer' | 'seller';
  dealId: string;
  orgId: string | null;
  profileName: string;
  onClose: () => void;
  onConfirmAdd: (contactId: string, contactName: string, deal_role: string, side: 'buyer' | 'seller' | 'both') => Promise<void>;
}> = ({ slot, columnSide, dealId, orgId, profileName, onClose, onConfirmAdd }) => {
  const [search, setSearch] = useState('');
  const [contacts, setContacts] = useState<any[]>([]);
  const [allContacts, setAllContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newCompany, setNewCompany] = useState('');

  // Add confirm modal state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<any>(null);

  const { profile, primaryOrgId } = useAuth();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const effectiveOrgId = orgId || primaryOrgId?.();
        // Role-matched
        const { data: matched } = await supabase
          .from('contacts')
          .select('id, first_name, last_name, full_name, email, phone, company, contact_type')
          .eq('contact_type', slot.contact_type)
          .is('deleted_at', null)
          .order('first_name')
          .limit(30);
        setContacts(matched || []);

        // All contacts for fallback
        const { data: all } = await supabase
          .from('contacts')
          .select('id, first_name, last_name, full_name, email, phone, company, contact_type')
          .is('deleted_at', null)
          .order('first_name')
          .limit(100);
        setAllContacts(all || []);
      } catch (err) {
        console.error('ContactSearchModal load error:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [slot.contact_type, orgId]);

  const sideLabel = columnSide === 'buyer' ? 'Buy Side' : 'Sell Side';

  const displayList = showAll ? allContacts : contacts;
  const filtered = displayList.filter(c => {
    const name = c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ');
    const q = search.toLowerCase();
    return !q || name.toLowerCase().includes(q) || (c.company || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q);
  });

  const otherCount = allContacts.length - contacts.length;

  const handleSelectContact = (c: any) => {
    setSelectedContact(c);
    setConfirmOpen(true);
  };

  const handleConfirmAdd = async () => {
    if (!selectedContact) return;
    const name = selectedContact.full_name || [selectedContact.first_name, selectedContact.last_name].filter(Boolean).join(' ') || 'Contact';
    await onConfirmAdd(selectedContact.id, name, slot.deal_role, columnSide);
    setConfirmOpen(false);
    onClose();
  };

  const handleCreateContact = async () => {
    if (!newName.trim()) return;
    try {
      const effectiveOrgId = orgId || primaryOrgId?.();
      const parts = newName.trim().split(' ');
      const { data: newContact, error } = await supabase.from('contacts').insert({
        first_name: parts[0],
        last_name: parts.slice(1).join(' ') || null,
        email: newEmail || null,
        phone: newPhone || null,
        company: newCompany || null,
        contact_type: slot.contact_type,
        org_id: effectiveOrgId,
      }).select().single();
      if (error) throw error;
      const name = newName.trim();
      await onConfirmAdd(newContact.id, name, slot.deal_role, columnSide);
      onClose();
    } catch (err) {
      console.error('Failed to create contact:', err);
    }
  };

  const confirmSubtitle = selectedContact
    ? `Adding ${selectedContact.full_name || [selectedContact.first_name, selectedContact.last_name].filter(Boolean).join(' ')} as ${slot.label} on ${sideLabel}`
    : '';

  return (
    <>
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm mx-4 overflow-hidden max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="bg-gray-50 border-b border-gray-200 px-5 py-4 flex items-center justify-between flex-none">
            <div>
              <p className="font-bold text-black text-sm">Add {slot.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">Showing {slot.label}s from your contacts directory</p>
            </div>
            <button onClick={onClose} className="btn btn-ghost btn-xs btn-square"><X size={14} /></button>
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2 flex-none">
            <Search size={13} className="text-gray-400 flex-none" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 text-sm outline-none bg-transparent placeholder-gray-400"
              placeholder="Search by name, company..."
            />
            {search && <button onClick={() => setSearch('')}><X size={12} className="text-gray-300" /></button>}
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <span className="loading loading-spinner loading-sm text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                <User size={24} className="text-gray-200 mb-2" />
                <p className="text-sm text-gray-400 font-medium">No {slot.label}s in your directory yet</p>
                <p className="text-xs text-gray-300 mt-0.5">Create a new contact below</p>
              </div>
            ) : (
              filtered.map(c => {
                const name = c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown';
                return (
                  <button
                    key={c.id}
                    onClick={() => handleSelectContact(c)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left border-b border-gray-50 last:border-0"
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-none ${roleAvatarBg(c.contact_type as ContactRole)}`}>
                      {getInitials(name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-black truncate">{name}</p>
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        {c.company && <span className="truncate">{c.company}</span>}
                        {c.company && c.email && <span>·</span>}
                        {c.email && <span className="truncate">{c.email}</span>}
                      </div>
                    </div>
                  </button>
                );
              })
            )}

            {/* Show all fallback */}
            {!showAll && otherCount > 0 && !loading && (
              <button
                onClick={() => setShowAll(true)}
                className="w-full text-xs text-primary/70 hover:text-primary py-2 px-4 border-t border-gray-100 text-left hover:bg-gray-50"
              >
                Search all contacts instead ({otherCount} others)
              </button>
            )}
          </div>

          {/* Create new contact */}
          <div className="flex-none border-t border-gray-100">
            {showCreateForm ? (
              <div className="p-3 space-y-2 bg-gray-50">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">New {slot.label}</p>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Full name *"
                  className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary" />
                <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="Phone (optional)"
                  className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary" />
                <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="Email (optional)"
                  className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary" />
                <input value={newCompany} onChange={e => setNewCompany(e.target.value)} placeholder="Company (optional)"
                  className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-primary" />
                <div className="flex gap-2 pt-1">
                  <button onClick={handleCreateContact} disabled={!newName.trim()}
                    className="flex-1 btn btn-primary btn-xs disabled:opacity-40">
                    Create &amp; Add
                  </button>
                  <button onClick={() => setShowCreateForm(false)} className="btn btn-ghost btn-xs">Cancel</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowCreateForm(true)}
                className="w-full flex items-center gap-2 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-none">
                  <UserPlus size={13} className="text-primary" />
                </div>
                <span className="text-sm font-medium text-primary">Create new contact</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Add confirm modal */}
      <EditConfirmModal
        isOpen={confirmOpen}
        diffs={[]}
        profileName={profileName}
        onConfirm={handleConfirmAdd}
        onCancel={() => setConfirmOpen(false)}
        title={`Add ${slot.label}`}
        subtitle={confirmSubtitle}
        actionLabel="Confirm Add"
      />
    </>
  );
};

// ── Role Slot Row ─────────────────────────────────────────────────────────────
const RoleSlotRow: React.FC<{
  slot: RoleSlot;
  participant?: DealParticipantRow;
  columnSide: 'buyer' | 'seller';
  dealId: string;
  onOpenContact: (dp: DealParticipantRow) => void;
  onOpenSearch: (slot: RoleSlot, side: 'buyer' | 'seller') => void;
  onCallStarted?: (data: CallStartedData) => void;
  onMoveSide?: (dpId: string, newSide: 'buyer' | 'seller') => Promise<void>;
}> = ({ slot, participant, columnSide, dealId, onOpenContact, onOpenSearch, onCallStarted, onMoveSide }) => {
  if (!participant) {
    return (
      <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 border-dashed border-gray-200 hover:border-gray-300 hover:bg-gray-50/50 transition-all group">
        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-none">
          <Search size={12} className="text-gray-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-400">{slot.label}</p>
          <p className="text-[11px] text-gray-300">Not set</p>
        </div>
        <button
          onClick={() => onOpenSearch(slot, columnSide)}
          className="opacity-0 group-hover:opacity-100 btn btn-ghost btn-xs btn-square transition-opacity"
          title={`Add ${slot.label}`}
        >
          <Plus size={12} className="text-gray-400" />
        </button>
      </div>
    );
  }

  const name = participant.full_name ||
    [participant.first_name, participant.last_name].filter(Boolean).join(' ') ||
    'Unknown';
  const avatarBg = roleAvatarBg((participant.contact_type || slot.contact_type) as ContactRole);

  const canDrag = !!onMoveSide && !!participant.dp_id && participant.side !== 'both';

  return (
    <button
      onClick={() => onOpenContact(participant)}
      draggable={canDrag}
      onDragStart={canDrag ? (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify({ dpId: participant.dp_id, currentSide: columnSide }));
        (e.currentTarget as HTMLElement).style.opacity = '0.5';
      } : undefined}
      onDragEnd={canDrag ? (e) => {
        (e.currentTarget as HTMLElement).style.opacity = '1';
      } : undefined}
      title={canDrag ? `Drag to move to ${columnSide === 'buyer' ? 'Sell' : 'Buy'} Side` : undefined}
      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all text-left group${canDrag ? ' cursor-grab active:cursor-grabbing' : ''}`}
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-none ${avatarBg}`}>
        {getInitials(name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-sm font-semibold text-black truncate">{name}</p>
          {participant.is_extracted && (
            <span className="badge badge-xs bg-green-100 text-green-700 border-green-200 flex-none text-[10px]">extracted</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">{slot.label}</span>
          {participant.company && <span className="text-xs text-gray-400">· {participant.company}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-none">
        {participant.phone && (
          <div onClick={e => e.stopPropagation()}>
            <CallButton
              phoneNumber={participant.phone}
              contactName={name}
              contactId={participant.contact_id}
              dealId={dealId}
              size="sm"
              variant="icon"
              onCallStarted={(callId) => onCallStarted?.({
                contactName: name,
                contactPhone: participant.phone!,
                contactId: participant.contact_id,
                dealId,
                callSid: callId,
                startedAt: new Date().toISOString(),
              })}
            />
          </div>
        )}
        <ChevronRight size={12} className="text-gray-300 group-hover:text-primary transition-colors" />
      </div>
    </button>
  );
};

// ── Role-Slot Column ──────────────────────────────────────────────────────────
// Role display order: agents first, buyers/sellers second, then support roles
const ROLE_PRIORITY: Record<string, number> = {
  lead_agent: 0, co_agent: 1,
  buyer: 2, seller: 2,
  lender: 3, title_officer: 4, attorney: 5,
  inspector: 6, appraiser: 7,
  tc: 8, other: 9,
};

const RoleSlotColumn: React.FC<{
  title: string;
  dotColor: string;
  bgColor: string;
  borderColor: string;
  roles: RoleSlot[];
  sharedRoles: RoleSlot[];
  participants: DealParticipantRow[];
  columnSide: 'buyer' | 'seller';
  dealId: string;
  onOpenContact: (dp: DealParticipantRow) => void;
  onOpenSearch: (slot: RoleSlot, side: 'buyer' | 'seller') => void;
  onCallStarted?: (data: CallStartedData) => void;
  onMoveSide?: (dpId: string, newSide: 'buyer' | 'seller') => Promise<void>;
}> = ({ title, dotColor, bgColor, borderColor, roles, sharedRoles, participants, columnSide, dealId, onOpenContact, onOpenSearch, onCallStarted, onMoveSide }) => {
  const [isDragOver, setIsDragOver] = React.useState(false);

  // Find all participants for a given slot
  const getParticipants = (deal_role: string): DealParticipantRow[] => {
    return participants.filter(p =>
      p.deal_role === deal_role &&
      (p.side === columnSide || p.side === 'both')
    );
  };

  const allSlots = [...roles, ...sharedRoles].sort((a, b) => {
    // 1. Filled slots always before empty slots
    const aFilled = getParticipants(a.deal_role).length > 0;
    const bFilled = getParticipants(b.deal_role).length > 0;
    if (aFilled !== bFilled) return Number(bFilled) - Number(aFilled);
    // 2. Within same fill status, agents first → buyers/sellers → others
    const aPri = ROLE_PRIORITY[a.deal_role] ?? 99;
    const bPri = ROLE_PRIORITY[b.deal_role] ?? 99;
    return aPri - bPri;
  });

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
  };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!onMoveSide) return;
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.dpId && data.currentSide !== columnSide) {
        await onMoveSide(data.dpId, columnSide);
      }
    } catch {}
  };

  return (
    <div
      className={`${bgColor} ${borderColor} border rounded-xl p-4 transition-all ${isDragOver ? 'ring-2 ring-primary/40 bg-primary/5' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
        <h3 className="font-bold text-base text-black">{title}</h3>
        <span className="text-xs text-gray-400 font-medium">
          ({participants.filter(p => p.side === columnSide || p.side === 'both').length})
        </span>
      </div>
      <div className="space-y-2">
        {allSlots.map(slot => {
          const slotParticipants = getParticipants(slot.deal_role);
          return (
            <div key={slot.deal_role} className="space-y-1.5">
              {slotParticipants.length === 0 ? (
                <RoleSlotRow
                  slot={slot}
                  participant={undefined}
                  columnSide={columnSide}
                  dealId={dealId}
                  onOpenContact={onOpenContact}
                  onOpenSearch={onOpenSearch}
                  onCallStarted={onCallStarted}
                />
              ) : (
                <>
                  {slotParticipants.map(p => (
                    <RoleSlotRow
                      key={p.dp_id}
                      slot={slot}
                      participant={p}
                      columnSide={columnSide}
                      dealId={dealId}
                      onOpenContact={onOpenContact}
                      onOpenSearch={onOpenSearch}
                      onCallStarted={onCallStarted}
                      onMoveSide={onMoveSide}
                    />
                  ))}
                  {slot.allowMultiple && (
                    <button
                      onClick={() => onOpenSearch(slot, columnSide)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl border border-dashed border-primary/30 hover:border-primary/50 hover:bg-primary/5 transition-all text-left group"
                    >
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-none">
                        <Plus size={10} className="text-primary" />
                      </div>
                      <span className="text-xs font-medium text-primary/70 group-hover:text-primary">Add another {slot.label}</span>
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
export const WorkspaceContacts: React.FC<Props> = ({ deal, onUpdate, contactRecords = [], onCallStarted }) => {
  const { profile, primaryOrgId } = useAuth();
  const userName = profile?.name || 'TC Staff';

  // Legacy state (kept for notification list + popup)
  const [showAddMenu, setShowAddMenu] = useState<'buy' | 'sell' | null>(null);
  const [pickerConfig, setPickerConfig] = useState<{ side: 'buy' | 'sell'; type: 'client' | 'team' | 'contact' } | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);

  // DB-backed participants state
  const [participants, setParticipants] = useState<DealParticipantRow[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(true);

  // Popup state — keyed by dp_id for DB participants, or contact id for legacy
  const [popupDp, setPopupDp] = useState<DealParticipantRow | null>(null);

  // Contact search modal
  const [searchSlot, setSearchSlot] = useState<{ slot: RoleSlot; side: 'buyer' | 'seller' } | null>(null);

  // Normalize deal state
  const dealState = deal.state?.trim().toUpperCase().slice(0, 2) || undefined;

  // Load participants from DB
  const loadParticipants = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('deal_participants')
        .select(`
          id,
          deal_role,
          side,
          is_primary,
          is_client_side,
          is_extracted,
          notes,
          contact:contact_id (
            id,
            first_name,
            last_name,
            email,
            phone,
            company,
            contact_type,
            full_name
          )
        `)
        .eq('deal_id', deal.id);

      if (error) throw error;

      const rows: DealParticipantRow[] = (data || []).map((dp: any) => {
        const c = dp.contact as any;
        return {
          dp_id: dp.id,
          deal_role: dp.deal_role,
          side: (dp.side === 'vendor' ? 'both' : dp.side === 'listing' ? 'seller' : dp.side) as 'buyer' | 'seller' | 'both',
          is_primary: dp.is_primary ?? false,
          is_client_side: dp.is_client_side ?? false,
          is_extracted: dp.is_extracted ?? false,
          dp_notes: dp.notes,
          contact_id: c?.id,
          first_name: c?.first_name,
          last_name: c?.last_name,
          email: c?.email,
          phone: c?.phone,
          company: c?.company,
          contact_type: c?.contact_type,
          full_name: c?.full_name,
        };
      });

      // If no participants in DB, fall back to deal.contacts to map to participant rows
      if (rows.length === 0 && deal.contacts?.length > 0) {
        const fallback: DealParticipantRow[] = deal.contacts.map(c => {
          const side = c.side === 'buy' ? 'buyer' : c.side === 'sell' ? 'seller' : 'both';
          const deal_role = c.role === 'agent'
            ? 'lead_agent'
            : c.role as string;
          return {
            dp_id: c.id,
            deal_role,
            side: (side as 'buyer' | 'seller' | 'both'),
            is_primary: false,
            is_client_side: false,
            is_extracted: false,
            dp_notes: undefined,
            contact_id: c.directoryId || c.id,
            first_name: c.firstName || c.name.split(' ')[0],
            last_name: c.lastName || c.name.split(' ').slice(1).join(' '),
            email: c.email,
            phone: c.phone,
            company: c.company,
            contact_type: c.role,
            full_name: c.name,
          };
        });
        setParticipants(fallback);
      } else {
        setParticipants(rows);
      }
    } catch (err) {
      console.error('WorkspaceContacts: Failed to load participants', err);
    } finally {
      setLoadingParticipants(false);
    }
  }, [deal.id, deal.contacts]);

  useEffect(() => { loadParticipants(); }, [loadParticipants]);

  // Add participant from search modal
  const addParticipant = async (contactId: string, contactName: string, deal_role: string, side: 'buyer' | 'seller' | 'both') => {
    const orgId = primaryOrgId?.() ?? null;
    try {
      const { data: inserted } = await supabase
        .from('deal_participants')
        .insert({
          deal_id: deal.id,
          contact_id: contactId,
          side: side === 'both' ? 'vendor' : side,
          deal_role,
          is_primary: false,
          is_client_side: false,
          organization_id: orgId,
        })
        .select('id')
        .single();

      // Write to contact_change_log
      await supabase.from('contact_change_log').insert({
        deal_id: deal.id,
        contact_id: contactId,
        changed_by: profile?.id ?? null,
        changed_by_name: profile?.name ?? 'TC Staff',
        action_type: 'add',
        changes: [],
        contact_name: contactName,
        org_id: orgId,
      });

      // Also update deal.contacts for backward compat
      const nameParts = contactName.split(' ');
      const newContact: Contact = {
        id: contactId,
        directoryId: contactId,
        name: contactName,
        email: '',
        phone: '',
        role: (['lead_agent', 'co_agent'].includes(deal_role) ? 'agent' : deal_role) as ContactRole,
        inNotificationList: true,
        side: side === 'buyer' ? 'buy' : side === 'seller' ? 'sell' : 'both',
      };
      onUpdate({
        ...deal,
        contacts: [...(deal.contacts || []), newContact],
        activityLog: [
          { id: generateId(), timestamp: new Date().toISOString(), action: `Contact added: ${contactName}`, detail: `Role: ${deal_role}`, user: userName, type: 'contact_added' },
          ...deal.activityLog,
        ],
        updatedAt: new Date().toISOString(),
      });

      await loadParticipants();
    } catch (err) {
      console.error('Failed to add participant:', err);
    }
  };

  // Edit contact in master contacts table + log to contact_change_log
  const editParticipantContact = async (
    contactId: string,
    dpContactName: string,
    updates: { name: string; phone: string; email: string; company: string; notes: string }
  ) => {
    const orgId = primaryOrgId?.() ?? null;
    // Compute diff (called from ContactPopup's onEdit handler)
    const origContact = deal.contacts.find(c => c.directoryId === contactId || c.id === contactId);
    const diffs: ChangeDiff[] = [];
    if (origContact) {
      if (updates.name.trim() !== origContact.name) diffs.push({ field: 'Name', old_value: origContact.name, new_value: updates.name.trim() });
      if (updates.phone !== (origContact.phone || '')) diffs.push({ field: 'Phone', old_value: origContact.phone || '', new_value: updates.phone });
      if (updates.email !== (origContact.email || '')) diffs.push({ field: 'Email', old_value: origContact.email || '', new_value: updates.email });
      if (updates.company !== (origContact.company || '')) diffs.push({ field: 'Company', old_value: origContact.company || '', new_value: updates.company });
    }

    try {
      // Update contacts table
      const nameParts = updates.name.trim().split(' ');
      await supabase.from('contacts').update({
        first_name: nameParts[0] || '',
        last_name: nameParts.slice(1).join(' ') || null,
        phone: updates.phone || null,
        email: updates.email || null,
        company: updates.company || null,
        notes: updates.notes || null,
      }).eq('id', contactId);

      // Write to contact_change_log
      if (diffs.length > 0) {
        await supabase.from('contact_change_log').insert({
          deal_id: deal.id,
          contact_id: contactId,
          changed_by: profile?.id ?? null,
          changed_by_name: profile?.name ?? 'TC Staff',
          action_type: 'update',
          changes: diffs,
          contact_name: dpContactName || updates.name.trim(),
          org_id: orgId,
        });
      }
    } catch (err) {
      console.error('Failed to update contact:', err);
    }

    // Also update deal.contacts for UI
    onUpdate({
      ...deal,
      contacts: deal.contacts.map(c =>
        (c.directoryId === contactId || c.id === contactId)
          ? { ...c, name: updates.name, phone: updates.phone, email: updates.email, company: updates.company }
          : c
      ),
      activityLog: [
        { id: generateId(), timestamp: new Date().toISOString(), action: `Contact updated: ${updates.name}`, user: userName, type: 'contact_added' },
        ...deal.activityLog,
      ],
      updatedAt: new Date().toISOString(),
    });

    await loadParticipants();
  };

  // Update side for a deal_participant
  const updateParticipantSide = async (dpId: string, side: 'buyer' | 'seller' | 'both') => {
    try {
      await supabase.from('deal_participants').update({ side: side === 'both' ? 'vendor' : side }).eq('id', dpId);
      await loadParticipants();
    } catch (err) {
      console.error('Failed to update participant side:', err);
    }
  };

  // Remove participant
  const removeParticipant = async (dpId: string) => {
    const dp = participants.find(p => p.dp_id === dpId);
    const orgId = primaryOrgId?.() ?? null;
    try {
      await supabase.from('deal_participants').delete().eq('id', dpId);
      if (dp) {
        const name = dp.full_name || [dp.first_name, dp.last_name].filter(Boolean).join(' ') || 'Contact';
        await supabase.from('contact_change_log').insert({
          deal_id: deal.id,
          contact_id: dp.contact_id,
          changed_by: profile?.id ?? null,
          changed_by_name: profile?.name ?? 'TC Staff',
          action_type: 'remove',
          changes: [],
          contact_name: name,
          org_id: orgId,
        });
        onUpdate({
          ...deal,
          contacts: deal.contacts.filter(c => c.directoryId !== dp.contact_id && c.id !== dp.contact_id),
          activityLog: [
            { id: generateId(), timestamp: new Date().toISOString(), action: `Contact removed: ${name}`, user: userName, type: 'contact_added' },
            ...deal.activityLog,
          ],
          updatedAt: new Date().toISOString(),
        });
      }
      await loadParticipants();
    } catch (err) {
      console.error('Failed to remove participant:', err);
    }
  };

  // Build Contact from DealParticipantRow for popup (backward compat)
  const dpRowToContact = (dp: DealParticipantRow): Contact => {
    const name = dp.full_name || [dp.first_name, dp.last_name].filter(Boolean).join(' ') || 'Unknown';
    const role = (dp.deal_role === 'lead_agent' ? 'agent' : dp.deal_role) as ContactRole;
    const sideUi = dp.side === 'buyer' ? 'buy' : dp.side === 'seller' ? 'sell' : 'both';
    const legacyContact = deal.contacts.find(c => c.directoryId === dp.contact_id || c.id === dp.contact_id);
    return {
      id: dp.contact_id,
      directoryId: dp.contact_id,
      name,
      email: dp.email || '',
      phone: dp.phone || '',
      role,
      company: dp.company,
      inNotificationList: legacyContact?.inNotificationList ?? false,
      side: sideUi as 'buy' | 'sell' | 'both',
    };
  };

  // Legacy methods
  const toggleNotif = (id: string) => {
    onUpdate({ ...deal, contacts: deal.contacts.map(c => c.id === id ? { ...c, inNotificationList: !c.inNotificationList } : c), updatedAt: new Date().toISOString() });
  };

  const existingDirIds = deal.contacts.filter(c => c.directoryId).map(c => c.directoryId!);

  const contactTypeToParticipantRole = (ct: string, side?: 'buy' | 'sell' | 'both'): DealParticipantRole => {
    if (ct === 'client') {
      if (side === 'buy') return 'buyer';
      if (side === 'sell') return 'seller';
      return 'other';
    }
    const map: Record<string, DealParticipantRole> = {
      agent: 'lead_agent', co_agent: 'co_agent', lender: 'lender', title: 'title_officer', attorney: 'other',
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
      isCompany: (cr as any).isCompany || false,
    };
    const agentOverride: Partial<Deal> = {};
    if (cr.contactType === 'agent') {
      const agentData = { name: cr.fullName, phone: cr.phone || '', email: cr.email || '', isOurClient: !!cr.isClient };
      if (effectiveSide === 'buy') agentOverride.buyerAgent = agentData;
      else if (effectiveSide === 'sell') agentOverride.sellerAgent = agentData;
    }
    const newParticipant = {
      id: crypto.randomUUID() as any,
      contactId: cr.id,
      dealId: deal.id,
      side: dealSide,
      dealRole,
      isPrimary: false,
      isClientSide: !!cr.isClient || pickerConfig?.type === 'client',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onUpdate({
      ...deal,
      ...agentOverride,
      contacts: [...deal.contacts, contact],
      participants: [...(deal.participants || []), newParticipant],
      activityLog: [
        { id: generateId(), timestamp: new Date().toISOString(), action: `Contact added: ${contact.name}`, detail: `Role: ${roleLabel(contact.role)}`, user: userName, type: 'contact_added' },
        ...deal.activityLog,
      ],
      updatedAt: new Date().toISOString(),
    });

    await loadParticipants();
  };

  // Notification list from deal.contacts
  const notifList = deal.contacts.filter(c => c.inNotificationList);

  // All contacts for popup (combining legacy + dp-based)
  const allDisplayedContacts = deal.contacts;

  // Popup contact from dp row
  const popupContact = popupDp ? dpRowToContact(popupDp) : null;
  const popupCr = popupDp ? contactRecords.find(d => d.id === popupDp.contact_id) : undefined;

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
              <MRDChip
                key={c.id}
                name={c.name}
                role={c.role}
                isNotifier
                onClick={() => {
                  // Try to find dp row for this contact
                  const dp = participants.find(p => p.contact_id === c.directoryId || p.contact_id === c.id);
                  if (dp) setPopupDp(dp);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Two-column role-slot grid */}
      {loadingParticipants ? (
        <div className="flex items-center justify-center py-8">
          <span className="loading loading-spinner loading-md text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <RoleSlotColumn
            title="Buy Side"
            dotColor="bg-blue-500"
            bgColor="bg-blue-50/30"
            borderColor="border-blue-200"
            roles={BUY_SIDE_ROLES}
            sharedRoles={BOTH_SIDES_ROLES}
            participants={participants}
            columnSide="buyer"
            dealId={deal.id}
            onOpenContact={(dp) => setPopupDp(dp)}
            onOpenSearch={(slot, side) => setSearchSlot({ slot, side })}
            onCallStarted={onCallStarted}
            onMoveSide={async (dpId, newSide) => { await updateParticipantSide(dpId, newSide); }}
          />
          <RoleSlotColumn
            title="Sell Side"
            dotColor="bg-green-500"
            bgColor="bg-green-50/30"
            borderColor="border-green-200"
            roles={SELL_SIDE_ROLES}
            sharedRoles={BOTH_SIDES_ROLES}
            participants={participants}
            columnSide="seller"
            dealId={deal.id}
            onOpenContact={(dp) => setPopupDp(dp)}
            onOpenSearch={(slot, side) => setSearchSlot({ slot, side })}
            onCallStarted={onCallStarted}
            onMoveSide={async (dpId, newSide) => { await updateParticipantSide(dpId, newSide); }}
          />
        </div>
      )}

      {/* Contact info popup */}
      {popupContact && popupDp && (
        <ContactPopup
          contact={popupContact}
          cr={popupCr}
          onClose={() => setPopupDp(null)}
          onToggleNotif={() => toggleNotif(popupContact.id)}
          onRemove={() => { setPopupDp(null); removeParticipant(popupDp.dp_id); }}
          dealId={deal.id}
          dealState={dealState}
          deal={deal}
          dpId={popupDp.dp_id}
          onCallStarted={onCallStarted}
          onEdit={async (updates) => {
            await editParticipantContact(popupDp.contact_id, popupContact.name, updates);
          }}
          onUpdateContact={(updated) => {
            onUpdate({
              ...deal,
              contacts: deal.contacts.map(c => c.id === updated.id ? updated : c),
              updatedAt: new Date().toISOString(),
            });
          }}
          onUpdateSide={updateParticipantSide}
          primaryOrgId={primaryOrgId}
        />
      )}

      {/* Contact search modal for empty slots */}
      {searchSlot && (
        <ContactSearchModal
          slot={searchSlot.slot}
          columnSide={searchSlot.side}
          dealId={deal.id}
          orgId={primaryOrgId?.() ?? null}
          profileName={userName}
          onClose={() => setSearchSlot(null)}
          onConfirmAdd={addParticipant}
        />
      )}

      {/* Confirm remove */}
      <ConfirmModal
        isOpen={removeId !== null}
        title="Remove from Deal?"
        message="This contact will be removed from the deal."
        confirmLabel="Yes, Remove"
        onConfirm={() => { if (removeId) { removeId && removeParticipant(removeId); setRemoveId(null); } }}
        onCancel={() => setRemoveId(null)}
      />
    </div>
  );
};

export default WorkspaceContacts;
