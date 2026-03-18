import React, { useState, useEffect } from 'react';
import { DollarSign, Calendar, Tag, Bell, Plus, User, Phone, Mail, Users, Check, X, Clock, AlertTriangle, Archive, RotateCcw, ChevronRight } from 'lucide-react';
import { DealHealthCard } from './DealHealthCard';
import { EmailSummaryCard } from './EmailSummaryCard';
import { CompliancePreCheck } from './CompliancePreCheck';
import { DraftFollowUp } from './DraftFollowUp';
import { SmartSuggestions } from './SmartSuggestions';
import { dealToRecord } from '../ai/dealConverter';
import { formatPhoneLive, formatPhone } from '../utils/helpers';
import { CallButton } from './CallButton';
import { Deal, DealStatus, PropertyType, AgentContact, ContactRecord, DealMilestone, ActivityType, Reminder } from '../types';
import { generateTasksForMilestone, MILESTONE_ORDER, MILESTONE_LABELS, MILESTONE_COLORS, isTerminalMilestone } from '../utils/taskTemplates';
import {
  formatCurrency, formatDate, daysUntil, statusLabel, propertyTypeLabel,
  closingCountdown, generateId
} from '../utils/helpers';

interface CallStartedData {
  contactName: string;
  contactPhone: string;
  contactId?: string;
  dealId?: string;
  callSid?: string;
  startedAt: string;
}

interface Props { deal: Deal; onUpdate: (d: Deal) => void; contactRecords?: ContactRecord[]; onGoToContacts?: () => void; editTrigger?: number; onGoToEmails?: () => void; allDeals?: any[]; onCallStarted?: (callData: CallStartedData) => void; }

const STATUSES: DealStatus[] = ['contract', 'due-diligence', 'clear-to-close', 'closed', 'terminated'];
const PROP_TYPES: PropertyType[] = ['single-family', 'multi-family', 'condo', 'townhouse', 'land', 'commercial'];

const log = (deal: Deal, action: string, detail: string): Deal => ({
  ...deal,
  activityLog: [
    { id: generateId(), timestamp: new Date().toISOString(), action, detail, user: 'TC Staff', type: 'status_change' },
    ...deal.activityLog,
  ],
  updatedAt: new Date().toISOString(),
});

const emptyAgent = (): AgentContact => ({ name: '', phone: '', email: '', isOurClient: false });



/* ─── Agent display card (view mode only) ─── */
/* ─── Agent edit section inside modal ─── */
const AgentEditSection: React.FC<{
  label: string;
  draft: AgentContact;
  onChange: (a: AgentContact) => void;
  accent: string;
  agentOptions: ContactRecord[];
}> = ({ label, draft, onChange, accent, agentOptions }) => {
  const selectedContact = agentOptions.find(x => x.fullName === draft.name && (x.phone || '') === draft.phone);
  const selectedId = selectedContact?.id ?? '';

  return (
  <div className={`rounded-xl border p-4 space-y-3 ${draft.isOurClient ? 'border-error/40 bg-error/5 ring-1 ring-error/20' : 'border-base-300 bg-base-200'}`}>
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Users size={13} className={accent} />
        <span className="text-xs font-semibold text-base-content/60 uppercase tracking-wide">{label}</span>
      </div>
      {draft.isOurClient && (
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-error/10 border border-error/30 text-[10px] font-bold text-error">
          <span className="w-2 h-2 rounded-full bg-error inline-block shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
          Our Client
        </span>
      )}
    </div>

    {/* Dropdown — Agent Clients auto-flagged */}
    <div>
      <label className="text-[10px] text-base-content/40 mb-1 block uppercase tracking-wide">Select Agent</label>
      <select
        className="select select-bordered select-sm w-full"
        value={selectedId}
        onChange={e => {
          if (!e.target.value) {
            onChange({ name: '', phone: '', email: '', isOurClient: false });
            return;
          }
          const cr = agentOptions.find(x => x.id === e.target.value);
          if (cr) onChange({
            name: cr.fullName,
            phone: cr.phone || '',
            email: cr.email || '',
            isOurClient: !!cr.isClient,
          });
        }}
      >
        <option value="">— clear / none —</option>
        {/* Agent Clients first */}
        {agentOptions.filter(x => x.isClient).length > 0 && (
          <optgroup label="⭐ Agent Clients (Our Clients)">
            {agentOptions.filter(x => x.isClient).map(cr => (
              <option key={cr.id} value={cr.id}>{cr.fullName}{cr.company ? ` — ${cr.company}` : ''}</option>
            ))}
          </optgroup>
        )}
        {agentOptions.filter(x => !x.isClient).length > 0 && (
          <optgroup label="Agents">
            {agentOptions.filter(x => !x.isClient).map(cr => (
              <option key={cr.id} value={cr.id}>{cr.fullName}{cr.company ? ` — ${cr.company}` : ''}</option>
            ))}
          </optgroup>
        )}
      </select>
    </div>

    {/* Read-only info preview after selection */}
    {draft.name && (
      <div className="rounded-lg bg-base-300/50 border border-base-300 p-3 space-y-1.5">
        <div className="flex items-center gap-2">
          <User size={11} className="text-base-content/40 flex-none" />
          <span className="text-sm font-medium text-base-content">{draft.name}</span>
        </div>
        {draft.phone && (
          <div className="flex items-center gap-2">
            <Phone size={11} className="text-base-content/40 flex-none" />
            <span className="text-xs text-base-content/60">{formatPhone(draft.phone)}</span>
          </div>
        )}
        {draft.email && (
          <div className="flex items-center gap-2">
            <Mail size={11} className="text-base-content/40 flex-none" />
            <span className="text-xs text-base-content/60 truncate">{draft.email}</span>
          </div>
        )}
      </div>
    )}
    {/* hidden spacer to keep structure consistent with old 3-col grid removal */}
    <div className="hidden">
      <div>
        <label className="text-[10px] text-base-content/40 mb-0.5 block">Full Name</label>
        <input className="input input-bordered input-sm w-full" placeholder="Agent name" value={draft.name}
          onChange={e => onChange({ ...draft, name: e.target.value })} />
      </div>
      <div>
        <label className="text-[10px] text-base-content/40 mb-0.5 block">Phone</label>
        <input className="input input-bordered input-sm w-full" placeholder="+1-000-000-0000" value={draft.phone}
          onChange={e => onChange({ ...draft, phone: formatPhoneLive(e.target.value) })} />
      </div>
      <div>
        <label className="text-[10px] text-base-content/40 mb-0.5 block">Email</label>
        <input className="input input-bordered input-sm w-full" placeholder="agent@email.com" value={draft.email}
          onChange={e => onChange({ ...draft, email: e.target.value })} />
      </div>
    </div>
  </div>
  );
};

/* ─── Milestone Stepper ─── */
const MilestoneStepper: React.FC<{
  deal: Deal;
  onUpdate: (d: Deal) => void;
}> = ({ deal, onUpdate }) => {
  const current = deal.milestone ?? 'contract-received';
  const currentIdx = MILESTONE_ORDER.indexOf(current);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [confirmIdx, setConfirmIdx] = useState<number | null>(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showUnarchive, setShowUnarchive] = useState(false);
  const [unarchiveTo, setUnarchiveTo] = useState<DealMilestone>('contract-received');
  const [archiveReason, setArchiveReason] = useState('');

  const mainSteps = MILESTONE_ORDER.filter(m => m !== 'archived');
  const isArchived = current === 'archived';

  const handleAdvance = (targetMilestone: DealMilestone) => {
    const newTasks = generateTasksForMilestone(targetMilestone);
    const logEntry = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      action: 'Milestone advanced',
      detail: `Deal moved to "${MILESTONE_LABELS[targetMilestone]}" — ${newTasks.length} task(s) auto-generated.`,
      user: 'TC Staff',
      type: 'status_change' as const,
    };
    onUpdate({
      ...deal,
      milestone: targetMilestone,
      tasks: [...(deal.tasks ?? []), ...newTasks],
      activityLog: [logEntry, ...deal.activityLog],
      updatedAt: new Date().toISOString(),
    });
    setConfirmIdx(null);
  };

  return (
    <div className="bg-base-200 rounded-xl border border-base-300 p-4 mb-1">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm text-base-content flex items-center gap-2">
          <Clock size={14} className="text-primary opacity-70" />
          Milestone
        </h3>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${MILESTONE_COLORS[current]}`}>
          {MILESTONE_LABELS[current]}
        </span>
      </div>

      {/* Step dots - horizontal scrollable */}
      <div className="flex items-center gap-1 overflow-x-auto overflow-y-visible scrollbar-none pb-1 pt-8 -mt-8">
        {mainSteps.map((m, i) => {
          const isDone = i < currentIdx && !isArchived;
          const isCurrent = m === current;
          const isFuture = i > currentIdx;
          const isNext = i === currentIdx + 1;

          return (
            <React.Fragment key={m}>
              {i > 0 && (
                <div className={`h-0.5 flex-1 min-w-2 rounded transition-colors ${isDone || isCurrent ? 'bg-primary/60' : 'bg-base-300'}`} />
              )}
              <div className="relative flex-none">
                <button
                  onClick={() => {
                    if (isFuture) setConfirmIdx(confirmIdx === i ? null : i);
                  }}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  title={MILESTONE_LABELS[m]}
                  className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-bold transition-all
                    ${isDone ? 'bg-primary border-primary text-primary-content' : ''}
                    ${isCurrent ? 'bg-primary border-primary text-primary-content ring-2 ring-primary/30 ring-offset-1 scale-110' : ''}
                    ${isFuture && !isNext ? 'bg-base-100 border-base-300 text-base-content/30 hover:border-primary/40 cursor-pointer' : ''}
                    ${isNext ? 'bg-base-100 border-primary/50 text-primary/60 hover:bg-primary/10 cursor-pointer animate-pulse' : ''}
                  `}
                >
                  {isDone ? <Check size={12} /> : i + 1}
                </button>
                {/* Tooltip */}
                {hoveredIdx === i && (
                  <div
                    className="absolute bottom-full mb-2 z-50 pointer-events-none"
                    style={{
                      left: i === 0 ? '0' : i >= mainSteps.length - 2 ? 'auto' : '50%',
                      right: i >= mainSteps.length - 2 ? '0' : 'auto',
                      transform: i === 0 ? 'none' : i >= mainSteps.length - 2 ? 'none' : 'translateX(-50%)',
                    }}
                  >
                    <div className="bg-gray-800 text-white text-[11px] font-semibold px-2.5 py-1 rounded-md whitespace-nowrap shadow-xl">
                      {i + 1}. {MILESTONE_LABELS[m]}
                    </div>
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Confirmation panel */}
      {confirmIdx !== null && (
        <div className="mt-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
          <p className="text-xs font-semibold text-base-content mb-2">
            Advance to: <span className="text-primary">{MILESTONE_LABELS[MILESTONE_ORDER[confirmIdx]]}</span>?
          </p>
          <p className="text-xs text-base-content/50 mb-3">
            This will auto-generate {generateTasksForMilestone(MILESTONE_ORDER[confirmIdx]).length} tasks for this stage.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handleAdvance(MILESTONE_ORDER[confirmIdx!])}
              className="btn btn-xs btn-primary gap-1"
            >
              <Check size={10} /> Yes, Advance
            </button>
            <button onClick={() => setConfirmIdx(null)} className="btn btn-xs btn-ghost">Cancel</button>
          </div>
        </div>
      )}

      {/* Archive button */}
      {!isArchived && !isTerminalMilestone(current) && (
        <div className="mt-2 flex justify-end">
          <button
            onClick={() => setShowArchiveConfirm(true)}
            className="text-xs text-red-400 hover:text-red-600 font-medium underline underline-offset-2"
          >
            Mark as Archived / Fell Apart
          </button>
        </div>
      )}

      {/* Unarchive button */}
      {isArchived && (
        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-300 rounded-lg">
          <p className="text-xs font-semibold text-base-content mb-1">This deal is archived.</p>
          {deal.archiveReason && (
            <p className="text-xs text-yellow-700 mt-0.5 mb-2">
              Reason: {deal.archiveReason.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
            </p>
          )}
          <button
            onClick={() => setShowUnarchive(true)}
            className="btn btn-xs btn-outline btn-warning gap-1 mt-1"
          >
            <RotateCcw size={11} /> Unarchive Deal
          </button>
        </div>
      )}

      {/* Archive confirmation modal */}
      {showArchiveConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowArchiveConfirm(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-base text-base-content">Archive this deal?</h3>
                <p className="text-xs text-gray-500">This will mark the deal as Archived / Fell Apart</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to archive this deal? You can unarchive it later if needed.
            </p>
            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-600 block mb-1">Reason for Archiving</label>
              <select
                className="select select-bordered select-sm w-full text-black"
                value={archiveReason}
                onChange={e => setArchiveReason(e.target.value)}
              >
                <option value="">-- Select reason (optional) --</option>
                <option value="fell-apart-financing">Fell Apart — Financing</option>
                <option value="fell-apart-inspection">Fell Apart — Inspection Issues</option>
                <option value="fell-apart-title">Fell Apart — Title Issues</option>
                <option value="fell-apart-buyer">Fell Apart — Buyer Walk Away</option>
                <option value="fell-apart-seller">Fell Apart — Seller Walk Away</option>
                <option value="deal-completed">Deal Completed / Closed</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowArchiveConfirm(false)} className="btn btn-sm btn-ghost">Cancel</button>
              <button
                onClick={() => {
                  const updated = {
                    ...deal,
                    milestone: 'archived' as DealMilestone,
                    archiveReason: archiveReason || undefined,
                    activityLog: [{
                      id: generateId(),
                      timestamp: new Date().toISOString(),
                      action: `Deal archived${archiveReason ? ` — ${archiveReason}` : ''}`,
                      user: 'TC Staff',
                      type: 'status_change' as ActivityType,
                    }, ...deal.activityLog],
                    updatedAt: new Date().toISOString(),
                  };
                  onUpdate(updated);
                  setShowArchiveConfirm(false);
                  setArchiveReason('');
                }}
                className="btn btn-sm btn-error text-white gap-1"
              >
                <Archive size={13} /> Yes, Archive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unarchive modal */}
      {showUnarchive && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowUnarchive(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <RotateCcw size={20} className="text-blue-500" />
              </div>
              <div>
                <h3 className="font-bold text-base text-base-content">Unarchive Deal</h3>
                <p className="text-xs text-gray-500">Restore this deal to an active milestone</p>
              </div>
            </div>
            <label className="text-sm font-medium text-base-content block mb-1.5">Restore to milestone:</label>
            <select
              className="select select-bordered select-sm w-full mb-5 text-black"
              value={unarchiveTo}
              onChange={e => setUnarchiveTo(e.target.value as DealMilestone)}
            >
              {MILESTONE_ORDER.filter(m => m !== 'archived').map(m => (
                <option key={m} value={m}>{MILESTONE_LABELS[m]}</option>
              ))}
            </select>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowUnarchive(false)} className="btn btn-sm btn-ghost">Cancel</button>
              <button
                onClick={() => {
                  const logEntry = {
                    id: generateId(),
                    timestamp: new Date().toISOString(),
                    action: 'Deal unarchived',
                    detail: `Deal restored from Archived to "${MILESTONE_LABELS[unarchiveTo]}".`,
                    user: 'TC Staff',
                    type: 'status_change' as const,
                  };
                  onUpdate({
                    ...deal,
                    milestone: unarchiveTo,
                    activityLog: [logEntry, ...deal.activityLog],
                    updatedAt: new Date().toISOString(),
                  });
                  setShowUnarchive(false);
                }}
                className="btn btn-sm btn-primary gap-1"
              >
                <Check size={13} /> Restore Deal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const WorkspaceOverview: React.FC<Props> = ({ deal, onUpdate, contactRecords = [], onGoToContacts, editTrigger, onGoToEmails, allDeals = [], onCallStarted }) => {
  const agentOptions = (contactRecords || []).filter(c => c.contactType === 'agent');

  const [showModal, setShowModal] = useState(false);

  // Open modal when parent fires Edit Deal button
  useEffect(() => {
    if (editTrigger && editTrigger > 0) openModal();
  }, [editTrigger]);

  // Modal draft state
  const [fields, setFields] = useState({
    status: deal.status,
    contractPrice: String(deal.contractPrice),
    listPrice: String(deal.listPrice ?? ''),
    closingDate: deal.closingDate,
    contractDate: deal.contractDate,
    notes: deal.notes,
    propertyType: deal.propertyType,
    mlsNumber: deal.mlsNumber,
    agentName: deal.agentName,
    propertyAddress: deal.propertyAddress,
    city: deal.city,
    state: deal.state,
    zipCode: deal.zipCode,
    legalDescription: deal.legalDescription || '',
  });
  const [buyerDraft, setBuyerDraft] = useState<AgentContact>(deal.buyerAgent ?? emptyAgent());
  const [sellerDraft, setSellerDraft] = useState<AgentContact>(deal.sellerAgent ?? emptyAgent());

  const openModal = () => {
    setFields({
      status: deal.status,
      contractPrice: String(deal.contractPrice),
      listPrice: String(deal.listPrice ?? ''),
      closingDate: deal.closingDate,
      contractDate: deal.contractDate,
      notes: deal.notes,
      propertyType: deal.propertyType,
      mlsNumber: deal.mlsNumber,
      agentName: deal.agentName,
      propertyAddress: deal.propertyAddress,
      city: deal.city,
      state: deal.state,
      zipCode: deal.zipCode,
      legalDescription: deal.legalDescription || '',
    });
    setBuyerDraft(deal.buyerAgent ?? emptyAgent());
    setSellerDraft(deal.sellerAgent ?? emptyAgent());
    setShowModal(true);
  };

  const handleCancel = () => setShowModal(false);

  const handleSave = () => {
    const updated = log(deal, 'Deal updated', `Status: ${statusLabel(fields.status as DealStatus)}, Closing: ${formatDate(fields.closingDate)}`);
    onUpdate({
      ...updated,
      status: fields.status as DealStatus,
      contractPrice: parseFloat(fields.contractPrice.replace(/[^0-9.]/g, '')) || deal.contractPrice,
      listPrice: parseFloat(fields.listPrice.replace(/[^0-9.]/g, '')) || deal.listPrice,
      closingDate: fields.closingDate,
      contractDate: fields.contractDate,
      notes: fields.notes,
      propertyType: fields.propertyType as PropertyType,
      mlsNumber: fields.mlsNumber,
      agentName: fields.agentName,
      propertyAddress: fields.propertyAddress,
      city: fields.city,
      state: fields.state,
      zipCode: fields.zipCode,
      legalDescription: fields.legalDescription,
      buyerAgent: buyerDraft.name ? buyerDraft : undefined,
      sellerAgent: sellerDraft.name ? sellerDraft : undefined,
    });
    setShowModal(false);
  };

  const [newReminderDate, setNewReminderDate] = useState('');
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [newReminderTitle, setNewReminderTitle] = useState('');

  const saveReminder = () => {
    if (!newReminderTitle.trim() || !newReminderDate) return;
    const reminder: Reminder = {
      id: generateId(),
      title: newReminderTitle.trim(),
      dueDate: newReminderDate,
      completed: false,
    };
    onUpdate({
      ...deal,
      reminders: [...deal.reminders, reminder],
      activityLog: [{ id: generateId(), timestamp: new Date().toISOString(), action: `Reminder set: "${reminder.title}" due ${formatDate(reminder.dueDate)}`, user: 'TC Staff', type: 'reminder_set' }, ...deal.activityLog],
      updatedAt: new Date().toISOString(),
    });
    setNewReminderTitle('');
    setNewReminderDate('');
    setShowAddReminder(false);
  };

  const countdown = closingCountdown(deal.closingDate);
  const daysContract = daysUntil(deal.contractDate);

  const buyerIsClient = deal.buyerAgent?.isOurClient;
  const sellerIsClient = deal.sellerAgent?.isOurClient;
  const showBuyerFirst = buyerIsClient || (!sellerIsClient && deal.transactionType !== 'seller');
  const agentPanels = showBuyerFirst
    ? [{ label: 'Buyer Agent', agent: deal.buyerAgent, accent: 'text-info' }, { label: 'Seller Agent', agent: deal.sellerAgent, accent: 'text-success' }]
    : [{ label: 'Seller Agent', agent: deal.sellerAgent, accent: 'text-success' }, { label: 'Buyer Agent', agent: deal.buyerAgent, accent: 'text-info' }];

  return (
    <div className="p-5 space-y-5 max-w-4xl">

      {/* ─── Deal Health ─── */}
      <DealHealthCard dealRecord={dealToRecord(deal)} />

      {/* ─── Email Summary ─── */}
      <EmailSummaryCard deal={deal} onGoToEmails={onGoToEmails} />

      {/* ─── Compliance Pre-Check ─── */}
      <CompliancePreCheck deal={deal} />

      {/* ─── Draft Follow-Up ─── */}
      <DraftFollowUp deal={deal} onSwitchToEmail={onGoToEmails} />

      {/* ─── Smart Suggestions ─── */}
      <SmartSuggestions deal={deal} allDeals={allDeals} />

      {/* ─── Milestone Stepper ─── */}
      <MilestoneStepper deal={deal} onUpdate={onUpdate} />

      {/* ─── Key Stats ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Contract $', value: formatCurrency(deal.contractPrice), icon: <DollarSign size={13} />, color: 'text-success' },
          { label: 'List $', value: formatCurrency(deal.listPrice), icon: <Tag size={13} />, color: 'text-base-content/60' },
          { label: 'Contract Date', value: deal.contractDate ? new Date(deal.contractDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—', icon: <Calendar size={13} />, color: 'text-info' },
          { label: 'Closing Date', value: deal.closingDate ? new Date(deal.closingDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—', icon: <Calendar size={13} />, color: 'text-black' },
        ].map(s => (
          <div key={s.label} className="group relative bg-base-200 rounded-xl p-2.5 border border-base-300 min-w-0 hover:z-10 hover:shadow-lg transition-shadow cursor-default">
            <div className="flex items-center gap-1 mb-1 min-w-0">
              <span className={`opacity-60 flex-none ${s.color}`}>{s.icon}</span>
              <span className="text-[11px] text-base-content/50 truncate">{s.label}</span>
            </div>
            <p className={`font-bold text-sm whitespace-nowrap truncate group-hover:whitespace-normal group-hover:truncate-none ${s.color}`}>{s.value}</p>
            {/* Hover tooltip for full value */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-20 pointer-events-none">
              <div className={`bg-gray-900 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-xl`}>
                <span className="text-gray-400 mr-1">{s.label}:</span>{s.value}
              </div>
              <div className="w-2 h-2 bg-gray-900 rotate-45 mx-auto -mt-1"></div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Countdown Banner ─── */}
      <div className="flex items-center gap-3 p-3 rounded-xl border bg-base-200 border-base-300">
        <Calendar size={16} className="text-black flex-none" />
        <div className="flex-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${countdown.pillBg} ${countdown.pillText}`}>{countdown.label}</span>
          <span className="text-black text-sm whitespace-nowrap">— Closing {formatDate(deal.closingDate)}</span>
        </div>
        <span className="text-xs text-black/50 whitespace-nowrap flex-none">Signed {Math.abs(daysContract)}d ago</span>
      </div>

      {/* ─── Deal Details (read-only) ─── */}
      <div className="bg-base-200 rounded-xl border border-base-300 p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        <div><span className="text-base-content/50 text-xs">Status</span><p className="font-medium text-base-content">{statusLabel(deal.status)}</p></div>
        <div><span className="text-base-content/50 text-xs">Property Type</span><p className="font-medium text-base-content">{propertyTypeLabel(deal.propertyType)}</p></div>
        <div><span className="text-base-content/50 text-xs">MLS #</span><p className="font-medium text-base-content">{deal.mlsNumber || '—'}</p></div>
        {deal.notes && <div className="col-span-3"><span className="text-base-content/50 text-xs">Notes</span><p className="text-base-content/80">{deal.notes}</p></div>}
      </div>

      {/* ─── Agent Rows (clickable → Contacts tab) ─── */}
      <div>
        <h3 className="font-semibold text-sm text-black flex items-center gap-2 mb-2">
          <Users size={14} className="opacity-60" /> Agents
          <span className="text-[10px] text-base-content/40 font-normal">— click to view all deal contacts</span>
        </h3>
        <div className="flex flex-col gap-2">
          {agentPanels.map(p => (
            <button
              key={p.label}
              onClick={onGoToContacts}
              className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200 hover:bg-gray-100 hover:border-gray-300 transition-all text-left w-full group"
            >
              {/* Red dot for our client */}
              <div className="flex-none w-5 flex items-center justify-center">
                {p.agent?.isOurClient
                  ? <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]" title="Our Client" />
                  : <span className="w-2.5 h-2.5 rounded-full bg-gray-300" />
                }
              </div>
              {/* Label + Name */}
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide leading-none mb-0.5">
                  {p.label}{p.agent?.isOurClient && <span className="ml-1.5 text-red-500">· Our Client</span>}
                </p>
                <p className="text-sm font-semibold text-black truncate">
                  {p.agent?.name || <span className="italic text-gray-300 font-normal">Not set</span>}
                </p>
              </div>
              {/* Phone */}
              {p.agent?.phone && (
                <span className="text-xs text-gray-400 whitespace-nowrap flex-none hidden sm:flex sm:items-center sm:gap-1.5">
                  {formatPhone(p.agent.phone)}
                  <span onClick={e => e.stopPropagation()}>
                    <CallButton
                      phoneNumber={p.agent.phone}
                      contactName={p.agent.name || 'Unknown'}
                      dealId={deal.id}
                      size="sm"
                      variant="icon"
                      onCallStarted={(callId) => onCallStarted?.({
                        contactName: p.agent?.name || 'Unknown',
                        contactPhone: p.agent?.phone || '',
                        dealId: deal.id,
                        callSid: callId,
                        startedAt: new Date().toISOString(),
                      })}
                    />
                  </span>
                </span>
              )}
              <ChevronRight size={14} className="text-gray-300 flex-none group-hover:text-primary transition-colors" />
            </button>
          ))}
        </div>
      </div>

      {/* ─── Reminders ─── */}
      <div className="bg-base-200 rounded-xl border border-base-300 p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-black uppercase tracking-wide flex items-center gap-1.5">
            <Bell size={12} className="text-primary" /> Reminders
          </p>
          <span className="badge badge-sm badge-ghost">{deal.reminders.filter(r => !r.completed).length} pending</span>
        </div>

        {deal.reminders.length === 0 && (
          <p className="text-xs text-gray-400 py-2 text-center">No reminders set</p>
        )}

        {deal.reminders.filter(r => !r.completed).map(r => {
          const today = new Date().toISOString().slice(0, 10);
          const isOverdue = r.dueDate < today;
          const isToday = r.dueDate === today;
          return (
            <div key={r.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border-l-2 mb-1 ${
              isOverdue ? 'bg-red-50 border-red-400' : isToday ? 'bg-yellow-50 border-yellow-400' : 'bg-white border-gray-200'
            }`}>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium ${isOverdue ? 'text-red-700' : 'text-black'}`}>{r.title}</p>
                <p className={`text-xs ${isOverdue ? 'text-red-500' : isToday ? 'text-yellow-600' : 'text-gray-400'}`}>
                  {isOverdue ? '⚠ Overdue · ' : isToday ? '⏰ Today · ' : '📅 '}
                  {formatDate(r.dueDate)}
                </p>
              </div>
              <button
                className="btn btn-xs btn-ghost text-green-600"
                onClick={() => {
                  const updated = { ...deal, reminders: deal.reminders.map(rem => rem.id === r.id ? { ...rem, completed: true } : rem), updatedAt: new Date().toISOString() };
                  onUpdate(updated);
                }}
                title="Mark complete"
              >✓</button>
            </div>
          );
        })}

        {/* Completed reminders (collapsed) */}
        {deal.reminders.filter(r => r.completed).length > 0 && (
          <p className="text-xs text-gray-400 mt-1">+ {deal.reminders.filter(r => r.completed).length} completed</p>
        )}

        {/* Add reminder quick form */}
        {showAddReminder ? (
          <div className="flex gap-1.5 mt-2 flex-wrap">
            <input
              className="input input-xs input-bordered flex-1 min-w-[120px] text-black"
              placeholder="Reminder title..."
              value={newReminderTitle}
              onChange={e => setNewReminderTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveReminder(); if (e.key === 'Escape') setShowAddReminder(false); }}
              autoFocus
            />
            <input
              type="date"
              className="input input-xs input-bordered w-32 text-black"
              value={newReminderDate}
              onChange={e => setNewReminderDate(e.target.value)}
            />
            <button className="btn btn-xs btn-primary" onClick={saveReminder}>Add</button>
            <button className="btn btn-xs btn-ghost" onClick={() => setShowAddReminder(false)}>Cancel</button>
          </div>
        ) : (
          <button
            className="btn btn-xs btn-ghost gap-1 w-full mt-1 text-gray-400 hover:text-primary"
            onClick={() => setShowAddReminder(true)}
          >
            <Plus size={11} /> Add reminder
          </button>
        )}
      </div>

      {/* ══════════════════════════════════════════════════
          EDIT DEAL MODAL
      ══════════════════════════════════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-base-300">

            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-base-300 flex-none">
              <div>
                <h2 className="font-bold text-base-content text-lg">Edit Deal</h2>
                <p className="text-xs text-base-content/50 mt-0.5">{deal.propertyAddress}</p>
              </div>
              <button onClick={handleCancel} className="btn btn-ghost btn-sm btn-square">
                <X size={16} />
              </button>
            </div>

            {/* Modal Body — scrollable */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

              {/* Property Info */}
              <section>
                <h3 className="text-xs font-bold text-base-content/50 uppercase tracking-widest mb-3">Property Info</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-xs text-base-content/50 mb-1 block">Street Address</label>
                    <input className="input input-bordered input-sm w-full" value={fields.propertyAddress}
                      onChange={e => setFields(p => ({ ...p, propertyAddress: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">City</label>
                    <input className="input input-bordered input-sm w-full" value={fields.city}
                      onChange={e => setFields(p => ({ ...p, city: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-base-content/50 mb-1 block">State</label>
                      <input className="input input-bordered input-sm w-full" value={fields.state}
                        onChange={e => setFields(p => ({ ...p, state: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-base-content/50 mb-1 block">ZIP</label>
                      <input className="input input-bordered input-sm w-full" value={fields.zipCode}
                        onChange={e => setFields(p => ({ ...p, zipCode: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">MLS Number</label>
                    <input className="input input-bordered input-sm w-full" value={fields.mlsNumber}
                      onChange={e => setFields(p => ({ ...p, mlsNumber: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">Property Type</label>
                    <select className="select select-bordered select-sm w-full" value={fields.propertyType}
                      onChange={e => setFields(p => ({ ...p, propertyType: e.target.value as PropertyType }))}>
                      {PROP_TYPES.map(t => <option key={t} value={t}>{propertyTypeLabel(t)}</option>)}
                    </select>
                  </div>
                </div>
              </section>

              {/* Transaction Details */}
              <section>
                <h3 className="text-xs font-bold text-base-content/50 uppercase tracking-widest mb-3">Transaction Details</h3>
                <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">Status</label>
                    <select className="select select-bordered select-sm w-full" value={fields.status}
                      onChange={e => setFields(p => ({ ...p, status: e.target.value as DealStatus }))}>
                      {STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">Contract Price</label>
                    <input className="input input-bordered input-sm w-full" placeholder="0.00" value={fields.contractPrice}
                      onChange={e => setFields(p => ({ ...p, contractPrice: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">List Price</label>
                    <input className="input input-bordered input-sm w-full" placeholder="0.00" value={fields.listPrice}
                      onChange={e => setFields(p => ({ ...p, listPrice: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">Contract Date</label>
                    <input type="date" className="input input-bordered input-sm w-full" value={fields.contractDate}
                      onChange={e => setFields(p => ({ ...p, contractDate: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">Closing Date</label>
                    <input type="date" className="input input-bordered input-sm w-full" value={fields.closingDate}
                      onChange={e => setFields(p => ({ ...p, closingDate: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                  <div className="sm:col-span-2">
                    <label className="text-xs text-base-content/50 mb-1 block">Legal Description</label>
                    <textarea className="textarea textarea-bordered w-full text-sm" rows={3} value={fields.legalDescription}
                      onChange={e => setFields(p => ({ ...p, legalDescription: e.target.value }))}
                      placeholder="Enter the property legal description..." />
                  </div>
                    <label className="text-xs text-base-content/50 mb-1 block">Internal Notes</label>
                    <textarea className="textarea textarea-bordered w-full text-sm" rows={2} value={fields.notes}
                      onChange={e => setFields(p => ({ ...p, notes: e.target.value }))} />
                  </div>
                </div>
              </section>

              {/* Agents */}
              <section>
                <h3 className="text-xs font-bold text-base-content/50 uppercase tracking-widest mb-3">Agents</h3>
                <div className="space-y-3">
                  <AgentEditSection label="Buyer Agent" draft={buyerDraft} onChange={setBuyerDraft} accent="text-info" agentOptions={agentOptions} />
                  <AgentEditSection label="Seller Agent" draft={sellerDraft} onChange={setSellerDraft} accent="text-success" agentOptions={agentOptions} />
                </div>
              </section>

            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-base-300 flex-none bg-base-200/50 rounded-b-2xl">
              <button onClick={handleCancel} className="btn btn-sm btn-ghost gap-1.5">
                <X size={13} /> Cancel Changes
              </button>
              <button onClick={handleSave} className="btn btn-sm btn-success gap-1.5">
                <Check size={13} /> Save Changes
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
