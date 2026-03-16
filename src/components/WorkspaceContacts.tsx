import React, { useState, useRef, useEffect } from 'react';
import { Plus, Mail, Phone, Bell, BellOff, Trash2, Users, ChevronDown, ChevronRight, MoreVertical, Search, X, Building2, User, UserCheck } from 'lucide-react';
import { formatPhone } from '../utils/helpers';
import { Deal, Contact, ContactRole, DirectoryContact } from '../types';
import { roleLabel, roleBadge, roleAvatarBg, getInitials, generateId } from '../utils/helpers';
import { ConfirmModal } from './ConfirmModal';

interface Props { deal: Deal; onUpdate: (d: Deal) => void; directory?: DirectoryContact[]; }

// Which side a role defaults to
const defaultSide = (role: ContactRole): 'buy' | 'sell' | 'both' => {
  if (['buyer'].includes(role)) return 'buy';
  if (['seller'].includes(role)) return 'sell';
  if (['lender'].includes(role)) return 'buy';
  if (['title', 'attorney'].includes(role)) return 'sell';
  return 'both';
};

// Full contact info popup
const ContactPopup: React.FC<{ contact: Contact; dc?: DirectoryContact; onClose: () => void; onToggleNotif: () => void; onRemove: () => void }> = ({ contact, dc, onClose, onToggleNotif, onRemove }) => (
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
            <a href={`mailto:${contact.email}`} className="text-sm text-primary hover:underline truncate">{contact.email}</a>
          </div>
        )}
        {contact.phone && (
          <div className="flex items-center gap-3">
            <Phone size={14} className="text-gray-400 flex-none" />
            <a href={`tel:${contact.phone}`} className="text-sm text-black hover:text-primary">{formatPhone(contact.phone)}</a>
          </div>
        )}
        {(contact.company || dc?.company) && (
          <div className="flex items-center gap-3">
            <Building2 size={14} className="text-gray-400 flex-none" />
            <span className="text-sm text-black">{contact.company || dc?.company}</span>
          </div>
        )}
        {dc?.notes && (
          <div className="pt-1 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-0.5">Notes</p>
            <p className="text-sm text-black">{dc.notes}</p>
          </div>
        )}
        {/* Notification status */}
        <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
          {contact.inNotificationList
            ? <><Bell size={13} className="text-primary" /><span className="text-xs text-gray-500">On notification list</span></>
            : <><BellOff size={13} className="text-gray-300" /><span className="text-xs text-gray-400">Not on notification list</span></>
          }
        </div>
      </div>
      {/* Actions */}
      <div className="px-5 pb-4 flex gap-2">
        <button onClick={() => { onToggleNotif(); onClose(); }} className="btn btn-sm btn-outline flex-1 gap-1.5">
          {contact.inNotificationList ? <><BellOff size={12} />Remove Notif</> : <><Bell size={12} />Add Notif</>}
        </button>
        <button onClick={() => { onRemove(); onClose(); }} className="btn btn-sm btn-error btn-outline gap-1.5">
          <Trash2 size={12} /> Remove
        </button>
      </div>
    </div>
  </div>
);

// Searchable directory picker
const DirectoryPicker: React.FC<{
  directory: DirectoryContact[];
  existingIds: string[];
  defaultSide: 'buy' | 'sell' | 'both';
  pickerType: 'agent-client' | 'team' | 'contact';
  onAdd: (dc: DirectoryContact, side: 'buy' | 'sell' | 'both') => void;
  onClose: () => void;
}> = ({ directory, existingIds, defaultSide: presetSide, pickerType, onAdd, onClose }) => {
  const [search, setSearch] = useState('');
  const side = presetSide;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Filter directory by picker type
  const byType = (dc: DirectoryContact) => {
    if (pickerType === 'agent-client') return dc.role === 'agent-client';
    if (pickerType === 'team') return ['agent', 'tc', 'other', 'inspector'].includes(dc.role);
    // 'contact' — everything except agent-client
    return dc.role !== 'agent-client';
  };

  const filtered = directory.filter(dc =>
    !existingIds.includes(dc.id) &&
    byType(dc) &&
    (dc.name.toLowerCase().includes(search.toLowerCase()) ||
     dc.email?.toLowerCase().includes(search.toLowerCase()) ||
     roleLabel(dc.role).toLowerCase().includes(search.toLowerCase()) ||
     dc.company?.toLowerCase().includes(search.toLowerCase()))
  );

  const pickerLabel = pickerType === 'agent-client' ? 'Select Agent Client'
    : pickerType === 'team' ? 'Select Team Member'
    : 'Select Contact';

  return (
    <div ref={ref} className="absolute right-0 z-40 bg-white border border-gray-200 rounded-2xl shadow-2xl w-72 overflow-hidden">
      {/* Side label */}
      <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full flex-none ${side === 'buy' ? 'bg-blue-500' : side === 'sell' ? 'bg-green-500' : 'bg-gray-400'}`} />
        <span className="text-xs font-semibold text-gray-600">
          {pickerLabel} — {side === 'buy' ? 'Buy Side' : side === 'sell' ? 'Sell Side' : 'Both Sides'}
        </span>
      </div>
      {/* Search */}
      <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
        <Search size={13} className="text-gray-400 flex-none" />
        <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 text-sm outline-none bg-transparent placeholder-gray-400"
          placeholder="Search contacts..." />
        {search && <button onClick={() => setSearch('')}><X size={12} className="text-gray-300" /></button>}
      </div>
      {/* Results */}
      <div className="max-h-56 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-6">No contacts found</p>
        )}
        {filtered.map(dc => (
          <button key={dc.id} onClick={() => { onAdd(dc, side); onClose(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-none ${roleAvatarBg(dc.role)}`}>
              {getInitials(dc.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-black truncate">{dc.name}</p>
              <p className="text-xs text-gray-400 truncate">{roleLabel(dc.role)}{dc.company ? ` · ${dc.company}` : ''}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

// Agent Client — primary contact row with red dot + "our client"
const AgentClientRow: React.FC<{ contact: Contact; onClick: () => void }> = ({ contact, onClick }) => (
  <button onClick={onClick}
    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/70 transition-colors text-left group">
    <div className="relative flex-none">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${roleAvatarBg(contact.role)}`}>
        {getInitials(contact.name)}
      </div>
      {/* Red dot */}
      <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-sm font-bold text-black truncate">{contact.name}</span>
        <span className="text-xs bg-red-100 text-red-600 rounded-full px-1.5 py-0 font-semibold whitespace-nowrap">our client</span>
      </div>
      <span className="text-xs text-gray-500">{roleLabel(contact.role)}</span>
    </div>
    <ChevronRight size={12} className="text-gray-300 group-hover:text-primary transition-colors flex-none" />
  </button>
);

// Sub-contact row — indented with tree line
const SubContactRow: React.FC<{ contact: Contact; isLast: boolean; onClick: () => void }> = ({ contact, isLast, onClick }) => (
  <div className="flex items-stretch">
    {/* Tree line */}
    <div className="flex flex-col items-center w-5 flex-none ml-3">
      <div className="w-px bg-gray-300 flex-1" />
      <div className={`w-px ${isLast ? 'bg-transparent' : 'bg-gray-300'} flex-1`} />
    </div>
    <div className="flex items-center w-3 flex-none">
      <div className="w-full h-px bg-gray-300" />
    </div>
    <button onClick={onClick}
      className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/70 transition-colors text-left group min-w-0">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-none ${roleAvatarBg(contact.role)}`}>
        {getInitials(contact.name)}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-semibold text-black truncate block">{contact.name}</span>
        <span className="text-xs text-gray-400 truncate block">{roleLabel(contact.role)}</span>
      </div>
      {contact.inNotificationList && <Bell size={10} className="text-primary opacity-50 flex-none" />}
      <ChevronRight size={11} className="text-gray-300 group-hover:text-primary transition-colors flex-none" />
    </button>
  </div>
);

// Regular contact row (no agent client on this side)
const ContactCard: React.FC<{ contact: Contact; dc?: DirectoryContact; onClick: () => void }> = ({ contact, dc, onClick }) => (
  <button onClick={onClick}
    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/70 transition-colors text-left group">
    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-none ${roleAvatarBg(contact.role)}`}>
      {getInitials(contact.name)}
    </div>
    <div className="flex-1 min-w-0">
      <span className="text-xs font-semibold text-black truncate block">{contact.name}</span>
      <span className="text-xs text-gray-400 truncate block">{roleLabel(contact.role)}</span>
    </div>
    <div className="flex items-center gap-1 flex-none">
      {contact.inNotificationList && <Bell size={10} className="text-primary opacity-50" />}
      <ChevronRight size={11} className="text-gray-300 group-hover:text-primary transition-colors" />
    </div>
  </button>
);

export const WorkspaceContacts: React.FC<Props> = ({ deal, onUpdate, directory = [] }) => {
  const [showAddMenu, setShowAddMenu] = useState<'buy' | 'sell' | null>(null);
  const [pickerConfig, setPickerConfig] = useState<{ side: 'buy' | 'sell'; type: 'agent-client' | 'team' | 'contact' } | null>(null);
  const [popupContactId, setPopupContactId] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);



  const existingDirIds = deal.contacts.filter(c => c.directoryId).map(c => c.directoryId!);

  const addFromDirectory = (dc: DirectoryContact, side: 'buy' | 'sell' | 'both') => {
    const contact: Contact = {
      id: generateId(),
      directoryId: dc.id,
      name: dc.name,
      email: dc.email || '',
      phone: dc.phone || '',
      role: dc.role as ContactRole,
      company: dc.company,
      inNotificationList: true,
      side,
    };
    onUpdate({
      ...deal,
      contacts: [...deal.contacts, contact],
      activityLog: [{ id: generateId(), timestamp: new Date().toISOString(), action: `Contact added: ${contact.name}`, detail: `Role: ${roleLabel(contact.role)} · ${side === 'buy' ? 'Buy' : side === 'sell' ? 'Sell' : 'Both'} Side`, user: 'TC Staff', type: 'contact_added' }, ...deal.activityLog],
      updatedAt: new Date().toISOString(),
    });
  };

  const toggleNotif = (id: string) => {
    onUpdate({ ...deal, contacts: deal.contacts.map(c => c.id === id ? { ...c, inNotificationList: !c.inNotificationList } : c), updatedAt: new Date().toISOString() });
  };

  const remove = (id: string) => {
    const c = deal.contacts.find(x => x.id === id);
    onUpdate({
      ...deal,
      contacts: deal.contacts.filter(x => x.id !== id),
      activityLog: [{ id: generateId(), timestamp: new Date().toISOString(), action: `Contact removed: ${c?.name}`, user: 'TC Staff', type: 'contact_added' }, ...deal.activityLog],
      updatedAt: new Date().toISOString(),
    });
  };

  const buySide = deal.contacts.filter(c => c.side === 'buy' || c.side === 'both' || (!c.side && defaultSide(c.role) === 'buy'));
  const sellSide = deal.contacts.filter(c => c.side === 'sell' || c.side === 'both' || (!c.side && defaultSide(c.role) === 'sell'));
  const notifList = deal.contacts.filter(c => c.inNotificationList);

  const popupContact = popupContactId ? deal.contacts.find(c => c.id === popupContactId) : null;
  const popupDc = popupContact?.directoryId ? directory.find(d => d.id === popupContact.directoryId) : undefined;

  const SideSection: React.FC<{ title: string; accent: string; contacts: Contact[]; side: 'buy' | 'sell' }> = ({ title, accent, contacts, side }) => {
    // Separate agent client from sub-contacts
    const agentClient = contacts.find(c => c.role === 'agent-client');
    const subContacts = contacts.filter(c => c.role !== 'agent-client');
    const hasAgentClient = !!agentClient;

    // Each side gets its own ref for click-outside
    const menuWrapRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      const handler = (e: MouseEvent) => {
        if (menuWrapRef.current && !menuWrapRef.current.contains(e.target as Node)) {
          if (showAddMenu === side) setShowAddMenu(null);
        }
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, [side, showAddMenu]);

    const openMenu = () => { setShowAddMenu(showAddMenu === side ? null : side); setPickerConfig(null); };
    const openPicker = (type: 'agent-client' | 'team' | 'contact') => { setPickerConfig({ side, type }); setShowAddMenu(null); };

    return (
      <div className="flex-1 min-w-0">
        {/* Section header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${side === 'buy' ? 'bg-blue-500' : 'bg-green-500'}`} />
            <h3 className={`font-bold text-sm ${accent}`}>{title}</h3>
            <span className="text-xs text-gray-400 font-normal">({contacts.length})</span>
          </div>
          <div className="relative" ref={menuWrapRef}>
            <button
              onClick={openMenu}
              className="btn btn-xs btn-outline gap-1 border-gray-300 text-gray-600 hover:bg-gray-50"
            >
              <Plus size={11} /> Add <ChevronDown size={10} />
            </button>

            {/* Sub-menu dropdown — always 3 options */}
            {showAddMenu === side && (
              <div className="absolute right-0 top-full mt-1 z-40 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden w-48">
                <div className="px-3 py-1.5 border-b border-gray-100">
                  <p className="text-xs text-gray-400 font-medium">Add to {side === 'buy' ? 'Buy' : 'Sell'} Side</p>
                </div>
                {/* Add Agent Client */}
                <button
                  onClick={() => openPicker('agent-client')}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-red-50 transition-colors text-left"
                >
                  <div className="w-6 h-6 rounded-lg bg-red-100 flex items-center justify-center flex-none">
                    <UserCheck size={12} className="text-red-500" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-black">Add Agent Client</p>
                    <p className="text-xs text-gray-400">Our client (red dot)</p>
                  </div>
                </button>
                {/* Add Team — only if agent client exists */}
                {hasAgentClient && (
                  <button
                    onClick={() => openPicker('team')}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-blue-50 transition-colors text-left"
                  >
                    <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center flex-none">
                      <Users size={12} className="text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-black">Add Team Member</p>
                      <p className="text-xs text-gray-400">TC, showing agent…</p>
                    </div>
                  </button>
                )}
                {/* Add Contact */}
                <button
                  onClick={() => openPicker('contact')}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-green-50 transition-colors text-left"
                >
                  <div className="w-6 h-6 rounded-lg bg-green-100 flex items-center justify-center flex-none">
                    <User size={12} className="text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-black">Add Contact</p>
                    <p className="text-xs text-gray-400">End Client, Lender, Title…</p>
                  </div>
                </button>
              </div>
            )}

            {/* Directory picker (filtered by type) */}
            {pickerConfig?.side === side && (
              <DirectoryPicker
                directory={directory}
                existingIds={existingDirIds}
                defaultSide={side}
                pickerType={pickerConfig.type}
                onAdd={addFromDirectory}
                onClose={() => setPickerConfig(null)}
              />
            )}
          </div>
        </div>

        {/* Contacts */}
        {contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-3 border border-dashed border-gray-200 rounded-lg">
            <p className="text-xs text-gray-400">No contacts yet</p>
            <button onClick={() => setShowAddMenu(side)} className="text-xs text-primary mt-0.5 hover:underline">+ Add</button>
          </div>
        ) : (
          <div>
            {/* Agent Client — primary */}
            {agentClient && (
              <AgentClientRow
                contact={agentClient}
                onClick={() => setPopupContactId(agentClient.id)}
              />
            )}
            {/* Sub-contacts — indented under agent client if present, flat if not */}
            {agentClient ? (
              <div className="mt-0.5">
                {subContacts.map((c, i) => (
                  <SubContactRow
                    key={c.id}
                    contact={c}
                    isLast={i === subContacts.length - 1}
                    onClick={() => setPopupContactId(c.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                {subContacts.map(c => (
                  <ContactCard
                    key={c.id}
                    contact={c}
                    dc={directory.find(d => d.id === c.directoryId)}
                    onClick={() => setPopupContactId(c.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-5 space-y-5">

      {/* Notification List */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl overflow-hidden">
        <button onClick={() => setNotifOpen(o => !o)} className="w-full flex items-center gap-2 p-3 hover:bg-primary/10 transition-colors">
          <Bell size={14} className="text-primary opacity-70" />
          <span className="font-semibold text-sm text-black flex-1 text-left">Notification List</span>
          <span className="badge badge-primary badge-xs mr-1">{notifList.length}</span>
          {notifOpen ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />}
        </button>
        {notifOpen && (
          <div className="px-3 pb-3 flex flex-wrap gap-2 border-t border-primary/10 pt-2">
            {notifList.length === 0 && <p className="text-xs text-gray-400">No contacts on notification list.</p>}
            {notifList.map(c => (
              <div key={c.id} className="flex items-center gap-1.5 px-2 py-1 bg-white rounded-lg border border-gray-200">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${roleAvatarBg(c.role)}`}>{getInitials(c.name)}</div>
                <span className="text-xs text-black">{c.name}</span>
                <span className={`badge badge-xs ${roleBadge(c.role)}`}>{roleLabel(c.role)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Buy Side / Sell Side — stacked */}
      <div className="flex flex-col gap-3">
        <div className="border border-blue-100 rounded-xl p-3 bg-blue-50/30">
          <SideSection title="Buy Side" accent="text-blue-600" contacts={buySide} side="buy" />
        </div>
        <div className="border border-green-100 rounded-xl p-3 bg-green-50/30">
          <SideSection title="Sell Side" accent="text-green-600" contacts={sellSide} side="sell" />
        </div>
      </div>

      {/* Contact info popup */}
      {popupContact && (
        <ContactPopup
          contact={popupContact}
          dc={popupDc}
          onClose={() => setPopupContactId(null)}
          onToggleNotif={() => toggleNotif(popupContact.id)}
          onRemove={() => { setPopupContactId(null); setRemoveId(popupContact.id); }}
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
