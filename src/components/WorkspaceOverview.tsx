import React, { useState, useEffect, useMemo } from 'react';
import { DollarSign, Calendar, Tag, Bell, Plus, User, Phone, Mail, Users, Check, X, Clock, AlertTriangle, Archive, RotateCcw, ChevronRight, Copy } from 'lucide-react';
import { initPageTracking, PAGE_IDS } from '../utils/pageTracking';
import { PageIdBadge } from './PageIdBadge';
import { DealHealthCard } from './DealHealthCard';
import { EmailSummaryCard } from './EmailSummaryCard';
import { CompliancePreCheck } from './CompliancePreCheck';
import { DraftFollowUp } from './DraftFollowUp';
import { SmartSuggestions } from './SmartSuggestions';
import { dealToRecord } from '../ai/dealConverter';
import { formatPhoneLive, formatPhone, calcCommissionAmount, calcCommissionPct, pf } from '../utils/helpers';
import { supabase } from '../lib/supabase';
import { CallButton } from './CallButton';
import { Deal, DealStatus, PropertyType, AgentContact, ContactRecord, DealMilestone, ActivityType, Reminder, DealTask } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { generateTasksForMilestone, buildMissingTitleCompanyTasks, MILESTONE_ORDER, MILESTONE_LABELS, MILESTONE_COLORS, isTerminalMilestone } from '../utils/taskTemplates';
import {
  formatCurrency, formatDate, daysUntil, statusLabel, propertyTypeLabel,
  closingCountdown, generateId
} from '../utils/helpers';
import { MilestoneAdvanceModal } from './MilestoneAdvanceModal';

interface MilestoneStep {
  id: string;
  key: string;
  label: string;
  sort_order: number;
  due_days_from_contract: number | null;
}

import { Button } from "./ui/Button";
import { useMlsEntries } from '../hooks/useMlsEntries';
import { useDealParticipants } from '../hooks/useDealParticipants';
import { useMilestoneNotifSettings } from '../hooks/useMilestoneNotifSettings';
import { useMlsMilestoneConfigWithTypes } from '../hooks/useMlsMilestoneConfig';

interface CallStartedData {
  contactName: string;
  contactPhone: string;
  contactId?: string;
  dealId?: string;
  callSid?: string;
  startedAt: string;
}

interface Props { deal: Deal; onUpdate: (d: Deal) => void; contactRecords?: ContactRecord[]; onGoToContacts?: () => void; editTrigger?: number; onGoToEmails?: () => void; onGoToRequests?: () => void; allDeals?: any[]; onCallStarted?: (callData: CallStartedData) => void; }

const STATUSES: DealStatus[] = ['contract', 'due-diligence', 'clear-to-close', 'closed', 'terminated'];
const PROP_TYPES: PropertyType[] = ['single-family', 'multi-family', 'condo', 'townhouse', 'land', 'commercial'];
const LOAN_TYPES = [
  { value: 'conventional', label: 'Conventional' },
  { value: 'fha', label: 'FHA' },
  { value: 'va', label: 'VA' },
  { value: 'usda', label: 'USDA' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
];

const log = (deal: Deal, action: string, detail: string, userName = 'TC Staff'): Deal => ({
  ...deal,
  activityLog: [
    { id: generateId(), timestamp: new Date().toISOString(), action, detail, user: userName, type: 'status_change' },
    ...deal.activityLog,
  ],
  updatedAt: new Date().toISOString(),
});

const emptyAgent = (): AgentContact => ({ name: '', phone: '', email: '', isOurClient: false });

/* ─── Agent Contact Popup ─── */
interface AgentPopupProps {
  label: string;
  agent: AgentContact;
  dealId: string;
  onClose: () => void;
  onCallStarted?: (data: CallStartedData) => void;
}

const AgentContactPopup: React.FC<AgentPopupProps> = ({ label, agent, dealId, onClose, onCallStarted }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
    <div
      className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-gray-100 overflow-hidden"
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          {agent.isOurClient && (
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)] flex-none" />
          )}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide leading-none">
              {label}{agent.isOurClient && <span className="ml-1.5 text-red-500">· Our Client</span>}
            </p>
            <p className="font-bold text-base text-black mt-0.5">{agent.name || 'No agent set'}</p>
          </div>
        </div>
        <button onClick={onClose} className="btn btn-ghost btn-sm btn-square">
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-3">
        {agent.phone ? (
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
            <div className="flex items-center gap-2 min-w-0">
              <Phone size={14} className="text-gray-400 flex-none" />
              <span className="text-sm font-medium text-black">{formatPhone(agent.phone)}</span>
            </div>
            <CallButton
              phoneNumber={agent.phone}
              contactName={agent.name || 'Unknown'}
              dealId={dealId}
              size="md"
              variant="icon"
              onCallStarted={(callSid) => {
                onCallStarted?.({
                  contactName: agent.name || 'Unknown',
                  contactPhone: agent.phone || '',
                  dealId,
                  callSid,
                  startedAt: new Date().toISOString(),
                });
                onClose();
              }}
            />
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 border border-gray-100">
            <Phone size={14} className="text-gray-300 flex-none" />
            <span className="text-sm text-gray-400 italic">No phone on file</span>
          </div>
        )}

        {agent.email ? (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 border border-gray-100">
            <Mail size={14} className="text-gray-400 flex-none" />
            <a
              href={`mailto:${agent.email}`}
              className="text-sm font-medium text-primary hover:underline truncate"
              onClick={e => e.stopPropagation()}
            >
              {agent.email}
            </a>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 border border-gray-100">
            <Mail size={14} className="text-gray-300 flex-none" />
            <span className="text-sm text-gray-400 italic">No email on file</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 pb-4">
        <Button variant="ghost" className="w-full text-gray-400" onClick={onClose}>Close</Button>
      </div>
    </div>
  </div>
);

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
  userName?: string;
  contactRecords?: ContactRecord[];
}> = ({ deal, onUpdate, userName = 'TC Staff', contactRecords = [] }) => {
  const current = deal.milestone ?? 'contract-received';
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [advanceTarget, setAdvanceTarget] = useState<DealMilestone | null>(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showUnarchive, setShowUnarchive] = useState(false);
  const [unarchiveTo, setUnarchiveTo] = useState<DealMilestone>('contract-received');
  const [archiveReason, setArchiveReason] = useState('');
  const { data: allMlsEntries = [] } = useMlsEntries();

  const { data: notifSettingsRaw = [] } = useMilestoneNotifSettings();
  const milestoneDueDays = useMemo(() => {
    const map: Record<string, number> = {};
    notifSettingsRaw.forEach((d: any) => {
      if (d.due_days_from_contract != null) map[d.milestone] = d.due_days_from_contract;
    });
    return map;
  }, [notifSettingsRaw]);

  const { data: mlsConfigRaw = [], isLoading: mlsStepsLoading } = useMlsMilestoneConfigWithTypes((deal as any).mlsId);
  const mlsSteps = useMemo<MilestoneStep[]>(() => {
    if (!mlsConfigRaw || mlsConfigRaw.length === 0) return [];
    return mlsConfigRaw.map((row: any) => ({
      id: row.milestone_types.id,
      key: row.milestone_types.key,
      label: row.milestone_types.label,
      sort_order: row.sort_order,
      due_days_from_contract: row.due_days_from_contract,
    }));
  }, [mlsConfigRaw]);

  const effectiveSteps: Array<{ key: string; label: string; dueDays: number | null }> =
    mlsSteps.length > 0
      ? mlsSteps.map(s => ({
          key: s.key,
          label: s.label,
          dueDays: s.due_days_from_contract,
        }))
      : MILESTONE_ORDER.map(key => ({
          key,
          label: MILESTONE_LABELS[key] || key,
          dueDays: milestoneDueDays[key] ?? null,
        }));

  const mainSteps = effectiveSteps.filter(s => s.key !== 'archived');
  const currentIdx = mainSteps.findIndex(s => s.key === current);
  const isArchived = current === 'archived';

  const handleAdvance = (targetMilestone: DealMilestone) => {
    const newTasks = generateTasksForMilestone(targetMilestone);
    const logEntry = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      action: 'Milestone advanced',
      detail: `Deal moved to "${effectiveSteps.find(s => s.key === targetMilestone)?.label ?? MILESTONE_LABELS[targetMilestone] ?? targetMilestone}" — ${newTasks.length} task(s) auto-generated.`,
      user: userName,
      type: 'status_change' as const,
    };
    onUpdate({
      ...deal,
      milestone: targetMilestone,
      tasks: [...(deal.tasks ?? []), ...newTasks],
      activityLog: [logEntry, ...deal.activityLog],
      updatedAt: new Date().toISOString(),
    });
    setAdvanceTarget(null);
  };

  // ── Date countdown helpers ──
  const today = new Date(); today.setHours(0,0,0,0);
  function daysFromToday(dateStr?: string | null): number | null {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T00:00:00');
    return Math.round((d.getTime() - today.getTime()) / 86400000);
  }
  function countdownBadge(label: string, dateStr?: string | null) {
    const n = daysFromToday(dateStr);
    if (n === null) return null;
    const fmtDate = new Date(dateStr! + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    let badge = '';
    let cls = '';
    if (n > 0)       { badge = `${n}d left`;  cls = n <= 7 ? 'text-red-600 bg-red-50 border-red-200' : n <= 14 ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-green-700 bg-green-50 border-green-200'; }
    else if (n === 0){ badge = 'Today';        cls = 'text-red-700 bg-red-50 border-red-300 font-bold'; }
    else             { badge = `${Math.abs(n)}d ago`; cls = 'text-gray-500 bg-gray-50 border-gray-200'; }
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
        {label}: {fmtDate} · {badge}
      </span>
    );
  }

  return (
    <div className="bg-base-200 rounded-xl border border-base-300 p-4 mb-1">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm text-base-content flex items-center gap-2">
          <Clock size={14} className="text-primary opacity-70" />
          Milestone
        </h3>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${MILESTONE_COLORS[current]}`}>
          {effectiveSteps.find(s => s.key === current)?.label ?? MILESTONE_LABELS[current] ?? current}
        </span>
      </div>
      {allMlsEntries.length > 0 && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-base-content/50">MLS Board:</span>
          <select
            className="select select-xs select-bordered"
            value={(deal as any).mlsId || ''}
            onChange={async (e) => {
              const newMlsId = e.target.value;
              await supabase.from('deals').update({ mls_id: newMlsId || null }).eq('id', deal.id);
              onUpdate({ ...deal, mlsId: newMlsId || undefined } as any);
            }}
          >
            <option value="">— No MLS —</option>
            {allMlsEntries.map(e => (
              <option key={e.id} value={e.id}>{e.name} ({e.state})</option>
            ))}
          </select>
          {mlsStepsLoading && <span className="loading loading-spinner loading-xs" />}
        </div>
      )}
      {!(deal as any).mlsId && mlsSteps.length === 0 && (
        <p className="text-[10px] text-base-content/40 italic mb-2">Set MLS board to load milestone template</p>
      )}
      {(deal.contractDate || deal.closingDate) && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {countdownBadge('Contract', deal.contractDate)}
          {countdownBadge('Closing', deal.closingDate)}
        </div>
      )}

      <div className="flex items-center gap-1 overflow-x-auto overflow-y-visible scrollbar-none pb-6 pt-8 -mt-8">
        {mainSteps.map((step, i) => {
          const isDone = i < currentIdx && !isArchived;
          const isCurrent = step.key === current;
          const isFuture = i > currentIdx;
          const isNext = i === currentIdx + 1;

          return (
            <React.Fragment key={step.key}>
              {i > 0 && (
                <div className={`h-0.5 flex-1 min-w-2 rounded transition-colors ${isDone || isCurrent ? 'bg-primary/60' : 'bg-base-300'}`} />
              )}
              <div className="relative flex-none">
                <button
                  onClick={() => {
                    if (isFuture) setAdvanceTarget(step.key as DealMilestone);
                  }}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  title={step.label}
                  className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-bold transition-all
                    ${isDone ? 'bg-primary border-primary text-primary-content' : ''}
                    ${isCurrent ? 'bg-primary border-primary text-primary-content ring-2 ring-primary/30 ring-offset-1 scale-110' : ''}
                    ${isFuture && !isNext ? 'bg-base-100 border-base-300 text-base-content/30 hover:border-primary/40 cursor-pointer' : ''}
                    ${isNext ? 'bg-base-100 border-primary/50 text-primary/60 hover:bg-primary/10 cursor-pointer animate-pulse' : ''}
                  `}
                >
                  {isDone ? <Check size={12} /> : i + 1}
                </button>
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
                      {i + 1}. {step.label}
                    </div>
                  </div>
                )}
                {(() => {
                  const days = step.dueDays;
                  if (days == null || !deal.contractDate) return null;
                  const contractDate = new Date(deal.contractDate + 'T00:00:00');
                  const dueDate = new Date(contractDate);
                  dueDate.setDate(dueDate.getDate() + days);
                  const daysLeft = Math.round((dueDate.getTime() - today.getTime()) / 86400000);
                  let label: string;
                  let cls: string;
                  if (daysLeft > 0)       { label = `${daysLeft}d`; cls = daysLeft <= 7 ? 'text-red-500' : 'text-green-600'; }
                  else if (daysLeft === 0) { label = 'Today'; cls = 'text-red-600 font-bold'; }
                  else                    { label = `${Math.abs(daysLeft)}d ago`; cls = 'text-gray-400'; }
                  return (
                    <div className={`absolute top-full mt-1 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-bold leading-none ${cls}`}>
                      {label}
                    </div>
                  );
                })()}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {advanceTarget && (
        <MilestoneAdvanceModal
          deal={deal}
          targetMilestone={advanceTarget}
          contactRecords={contactRecords}
          userName={userName}
          onConfirm={(milestone) => {
            handleAdvance(milestone);
          }}
          onCancel={() => setAdvanceTarget(null)}
        />
      )}

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
              <Button variant="ghost" onClick={() => setShowArchiveConfirm(false)}>Cancel</Button>
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
                      user: userName,
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
              <Button variant="ghost" onClick={() => setShowUnarchive(false)}>Cancel</Button>
              <button
                onClick={() => {
                  const logEntry = {
                    id: generateId(),
                    timestamp: new Date().toISOString(),
                    action: 'Deal unarchived',
                    detail: `Deal restored from Archived to "${MILESTONE_LABELS[unarchiveTo]}".`,
                    user: userName,
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
  const { profile } = useAuth();
  const userName = profile?.name || 'TC Staff';
  const agentOptions = (contactRecords || []).filter(c => c.contactType === 'agent');

  const [showModal, setShowModal] = useState(false);
  const [agentPopup, setAgentPopup] = useState<{ label: string; agent: AgentContact; accent: string } | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  useEffect(() => {
    initPageTracking(PAGE_IDS.DEAL_OVERVIEW);
  }, []);

  useEffect(() => {
    if (editTrigger && editTrigger > 0) openModal();
  }, [editTrigger]);

  const buildFields = (d: Deal) => ({
    // Property
    propertyAddress: d.propertyAddress,
    city: d.city,
    state: d.state,
    zipCode: d.zipCode,
    mlsNumber: d.mlsNumber,
    propertyType: d.propertyType,
    legalDescription: d.legalDescription || '',
    hoa: d.hoa ?? false,
    hoaMonthlyFee: String(d.hoaMonthlyFee ?? ''),
    surveyRequired: d.surveyRequired ?? false,
    // Transaction
    status: d.status,
    contractPrice: String(d.contractPrice),
    listPrice: String(d.listPrice ?? ''),
    contractDate: d.contractDate,
    closingDate: d.closingDate,
    possessionDate: d.possessionDate || '',
    agentName: d.agentName,
    notes: d.notes,
    // Parties
    buyerName: d.buyerName || '',
    sellerName: d.sellerName || '',
    titleCompanyName: d.titleCompanyName || '',
    loanOfficerName: d.loanOfficerName || '',
    // Financing
    loanType: d.loanType || 'conventional',
    loanAmount: String(d.loanAmount ?? ''),
    downPayment: String(d.downPayment ?? ''),
    earnestMoney: String((d as any).earnestMoney ?? ''),
    earnestMoneyDueDate: d.earnestMoneyDueDate || '',
    sellerConcessions: String(d.sellerConcessions ?? ''),
    totalSellerCredits: String(d.totalSellerCredits ?? ''),
    // Contract Conditions
    asIsSale: d.asIsSale ?? false,
    inspectionWaived: d.inspectionWaived ?? false,
    homeWarranty: d.homeWarranty ?? false,
    homeWarrantyAmount: String(d.homeWarrantyAmount ?? ''),
    homeWarrantyPaidBy: d.homeWarrantyPaidBy || 'seller',
    homeWarrantyCompany: d.homeWarrantyCompany || '',
    // Commission
    clientAgentCommission: String(d.clientAgentCommission ?? ''),
    clientAgentCommissionPct: String(d.clientAgentCommissionPct ?? ''),
    tcFeeType: d.tcFeeType || 'flat',
    tcFeeValue: String(d.tcFeeValue ?? ''),
    tcFeePaidBy: d.tcFeePaidBy || 'seller',
    // New Commission Fields
    listingCommissionType: d.listingCommissionType || 'percent',
    listingCommissionValue: String(d.listingCommissionValue ?? ''),
    buyerCommissionType: d.buyerCommissionType || 'percent',
    buyerCommissionValue: String(d.buyerCommissionValue ?? ''),
    commissionPaidBy: d.commissionPaidBy || 'seller',
  });
  const [fields, setFields] = useState(() => buildFields(deal));
  // ─── Deal participants (mini-panel) ───
  const { data: participants = [] } = useDealParticipants(deal.id);

  const [buyerDraft, setBuyerDraft] = useState<AgentContact>(deal.buyerAgent ?? emptyAgent());
  const [sellerDraft, setSellerDraft] = useState<AgentContact>(deal.sellerAgent ?? emptyAgent());

  const openModal = () => {
    setFields(buildFields(deal));
    setBuyerDraft(deal.buyerAgent ?? emptyAgent());
    setSellerDraft(deal.sellerAgent ?? emptyAgent());
    setShowModal(true);
  };

  const handleCancel = () => setShowModal(false);

  const handleSave = () => {
    const updated = log(deal, 'Deal updated', `Status: ${statusLabel(fields.status as DealStatus)}, Closing: ${formatDate(fields.closingDate)}`, userName);
    onUpdate({
      ...updated,
      // Property
      propertyAddress: fields.propertyAddress,
      city: fields.city,
      state: fields.state,
      zipCode: fields.zipCode,
      mlsNumber: fields.mlsNumber,
      propertyType: fields.propertyType as PropertyType,
      legalDescription: fields.legalDescription,
      hoa: fields.hoa,
      hoaMonthlyFee: fields.hoaMonthlyFee ? pf(fields.hoaMonthlyFee) : undefined,
      surveyRequired: fields.surveyRequired,
      // Transaction
      status: fields.status as DealStatus,
      contractPrice: pf(fields.contractPrice) || deal.contractPrice,
      listPrice: pf(fields.listPrice) || deal.listPrice,
      contractDate: fields.contractDate,
      closingDate: fields.closingDate,
      possessionDate: fields.possessionDate || undefined,
      agentName: fields.agentName,
      notes: fields.notes,
      // Parties
      buyerName: fields.buyerName || undefined,
      sellerName: fields.sellerName || undefined,
      titleCompanyName: fields.titleCompanyName || undefined,
      loanOfficerName: fields.loanOfficerName || undefined,
      // Financing
      loanType: fields.loanType || undefined,
      loanAmount: fields.loanAmount ? pf(fields.loanAmount) : undefined,
      downPayment: fields.downPayment ? pf(fields.downPayment) : undefined,
      earnestMoney: fields.earnestMoney ? pf(fields.earnestMoney) : undefined,
      earnestMoneyDueDate: fields.earnestMoneyDueDate || undefined,
      sellerConcessions: fields.sellerConcessions ? pf(fields.sellerConcessions) : undefined,
      totalSellerCredits: fields.totalSellerCredits ? pf(fields.totalSellerCredits) : undefined,
      // Contract Conditions
      asIsSale: fields.asIsSale,
      inspectionWaived: fields.inspectionWaived,
      homeWarranty: fields.homeWarranty,
      homeWarrantyAmount: fields.homeWarrantyAmount ? pf(fields.homeWarrantyAmount) : undefined,
      homeWarrantyPaidBy: fields.homeWarrantyPaidBy || undefined,
      homeWarrantyCompany: fields.homeWarrantyCompany || undefined,
      // Commission
      clientAgentCommission: fields.clientAgentCommission ? pf(fields.clientAgentCommission) : undefined,
      clientAgentCommissionPct: fields.clientAgentCommissionPct ? pf(fields.clientAgentCommissionPct) : undefined,
      tcFeeType: fields.tcFeeType as 'percent' | 'flat',
      tcFeeValue: fields.tcFeeValue ? pf(fields.tcFeeValue) : undefined,
      tcFeePaidBy: fields.tcFeePaidBy || undefined,
      // New Commission Fields
      listingCommissionType: fields.listingCommissionType as 'percent' | 'flat',
      listingCommissionValue: fields.listingCommissionValue ? parseFloat(fields.listingCommissionValue) : undefined,
      buyerCommissionType: fields.buyerCommissionType as 'percent' | 'flat',
      buyerCommissionValue: fields.buyerCommissionValue ? parseFloat(fields.buyerCommissionValue) : undefined,
      commissionPaidBy: fields.commissionPaidBy || undefined,
      // Agents
      buyerAgent: buyerDraft.name ? buyerDraft : undefined,
      sellerAgent: sellerDraft.name ? sellerDraft : undefined,
      tasks: buildMissingTitleCompanyTasks(fields.titleCompanyName, updated.tasks ?? []),
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
      activityLog: [{ id: generateId(), timestamp: new Date().toISOString(), action: `Reminder set: "${reminder.title}" due ${formatDate(reminder.dueDate)}`, user: userName, type: 'reminder_set' }, ...deal.activityLog],
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
      <PageIdBadge pageId={PAGE_IDS.DEAL_OVERVIEW} context={deal.id?.slice(0, 8)} />

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
      <MilestoneStepper deal={deal} onUpdate={onUpdate} userName={userName} contactRecords={contactRecords} />

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
        <div>
          <span className="text-base-content/50 text-xs">Deal ID</span>
          <div className="flex items-center gap-1.5 mt-1">
            <p className="font-medium text-base-content font-mono text-xs truncate" title={deal.id}>{deal.id}</p>
            <button
              className="btn btn-ghost btn-xs btn-square p-0 min-h-0 h-5 w-5"
              onClick={() => {
                navigator.clipboard.writeText(deal.id);
                setCopiedId(true);
                setTimeout(() => setCopiedId(false), 2000);
              }}
              title="Copy ID"
            >
              <Copy size={11} className={copiedId ? 'text-green-500' : 'text-base-content/40'} />
            </button>
          </div>
        </div>
        <div><span className="text-base-content/50 text-xs">Status</span><p className="font-medium text-base-content">{statusLabel(deal.status)}</p></div>
        <div><span className="text-base-content/50 text-xs">Property Type</span><p className="font-medium text-base-content">{propertyTypeLabel(deal.propertyType)}</p></div>
        <div><span className="text-base-content/50 text-xs">MLS #</span><p className="font-medium text-base-content">{deal.mlsNumber || '—'}</p></div>
        {deal.notes && <div className="col-span-3"><span className="text-base-content/50 text-xs">Notes</span><p className="text-base-content/80">{deal.notes}</p></div>}
      </div>

      {/* ─── Deal Contacts Mini-Panel ─── */}
      <div>
        <button
          className="font-semibold text-sm text-black flex items-center gap-2 mb-2 hover:text-primary transition-colors"
          onClick={onGoToContacts}
        >
          <Users size={14} className="opacity-60" /> Deal Contacts
          <span className="text-[10px] text-base-content/40 font-normal">— click to manage</span>
        </button>

        {participants.length === 0 ? (
          // ── Fallback: show old agentPanels + Title if deal_participants is empty ──
          <div className="flex flex-col gap-2">
            {agentPanels.map(p => (
              <div
                key={p.label}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200 hover:bg-gray-100 hover:border-gray-300 transition-all"
              >
                <div className="flex-none w-5 flex items-center justify-center">
                  {p.agent?.isOurClient
                    ? <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]" title="Our Client" />
                    : <span className="w-2.5 h-2.5 rounded-full bg-gray-300" />
                  }
                </div>
                <button className="flex-1 min-w-0 text-left" onClick={onGoToContacts}>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide leading-none mb-0.5">
                    {p.label}{p.agent?.isOurClient && <span className="ml-1.5 text-red-500">· Our Client</span>}
                  </p>
                  <p className="text-sm font-semibold text-black truncate">
                    {p.agent?.name || <span className="italic text-gray-300 font-normal">Not set</span>}
                  </p>
                </button>
                {p.agent?.phone && (
                  <div className="flex items-center gap-1.5 flex-none">
                    <span className="text-xs text-gray-400 whitespace-nowrap hidden sm:inline">{formatPhone(p.agent.phone)}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); p.agent && setAgentPopup({ label: p.label, agent: p.agent, accent: p.accent }); }}
                      className="btn btn-ghost btn-circle w-7 h-7 min-h-0 text-success hover:bg-success/10 p-0 flex items-center justify-center"
                    ><Phone size={14} /></button>
                  </div>
                )}
                <button
                  onClick={() => p.agent && setAgentPopup({ label: p.label, agent: p.agent, accent: p.accent })}
                  className="btn btn-ghost btn-xs btn-square text-gray-300 hover:text-primary transition-colors flex-none"
                ><ChevronRight size={14} /></button>
              </div>
            ))}
            {(() => {
              const titleContact = (() => {
                const raw = deal.participants?.find(p => p.dealRole === 'title_officer')
                  ?? deal.contacts.find(c => c.role === 'title');
                if (!raw) return null;
                if ('dealRole' in raw) {
                  return { name: (raw as any).contactName ?? '', phone: (raw as any).contactPhone ?? '', email: (raw as any).contactEmail ?? '', directoryId: undefined as string | undefined, company: undefined as string | undefined };
                }
                return { name: (raw as any).name, phone: (raw as any).phone, email: (raw as any).email, directoryId: (raw as any).directoryId, company: (raw as any).company };
              })();
              if (!titleContact) return (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200 border-dashed">
                  <div className="flex-none w-5 flex items-center justify-center"><span className="w-2.5 h-2.5 rounded-full bg-gray-300" /></div>
                  <button className="flex-1 min-w-0 text-left" onClick={onGoToContacts}>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide leading-none mb-0.5">Title Company</p>
                    <p className="text-sm italic text-gray-300 font-normal">Not set</p>
                  </button>
                </div>
              );
              const cr = titleContact.directoryId ? contactRecords.find(r => r.id === titleContact.directoryId) : undefined;
              const companyName = titleContact.company || cr?.company || '';
              return (
                <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 transition-all">
                  <div className="flex-none w-5 flex items-center justify-center"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /></div>
                  <button className="flex-1 min-w-0 text-left" onClick={onGoToContacts}>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide leading-none mb-0.5">Title Company</p>
                    <p className="text-sm font-semibold text-black truncate">
                      {titleContact.name}{companyName ? <span className="font-normal text-gray-500"> ({companyName})</span> : ''}
                    </p>
                  </button>
                  {titleContact.phone && (
                    <div className="flex items-center gap-1.5 flex-none">
                      <span className="text-xs text-gray-400 whitespace-nowrap hidden sm:inline">{formatPhone(titleContact.phone)}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setAgentPopup({ label: 'Title Company', agent: { name: titleContact.name, phone: titleContact.phone || '', email: titleContact.email || '', isOurClient: false }, accent: 'text-success' }); }}
                        className="btn btn-ghost btn-circle w-7 h-7 min-h-0 text-success hover:bg-success/10 p-0 flex items-center justify-center"
                      ><Phone size={14} /></button>
                    </div>
                  )}
                  <button
                    onClick={() => setAgentPopup({ label: 'Title Company', agent: { name: titleContact.name, phone: titleContact.phone || '', email: titleContact.email || '', isOurClient: false }, accent: 'text-success' })}
                    className="btn btn-ghost btn-xs btn-square text-gray-300 hover:text-primary transition-colors flex-none"
                  ><ChevronRight size={14} /></button>
                </div>
              );
            })()}
          </div>
        ) : (
          // ── Live: show all deal_participants split by Buy Side / Sell Side ──
          (() => {
            const roleLabel = (role: string) => {
              const MAP: Record<string, string> = {
                buyers_agent: 'Buyer Agent', listing_agent: 'Seller Agent',
                buyer: 'Buyer', seller: 'Seller',
                title: 'Title Company', title_officer: 'Title Officer',
                lender: 'Lender', inspector: 'Inspector',
                appraiser: 'Appraiser', attorney: 'Attorney',
              };
              return MAP[role] || role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            };
            const dotColor = (role: string) => {
              if (role === 'lead_agent' || role === 'buyers_agent' || role === 'listing_agent') return 'bg-purple-400';
              if (role === 'title' || role === 'title_officer') return 'bg-emerald-500';
              if (role === 'lender') return 'bg-sky-400';
              if (role === 'inspector') return 'bg-orange-400';
              if (role === 'appraiser') return 'bg-yellow-400';
              if (role === 'attorney') return 'bg-rose-400';
              return 'bg-blue-400';
            };
            const renderCard = (p: any) => {
              const c = p.contacts;
              if (!c) return null;
              // company-type contacts (e.g. title company) have no first/last name — use company field
              const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company || 'Unknown';
              const agentContact = { name: fullName, phone: c.phone || '', email: c.email || '', isOurClient: false };
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200 hover:bg-gray-100 hover:border-gray-300 transition-all"
                >
                  <div className="flex-none w-5 flex items-center justify-center">
                    <span className={`w-2.5 h-2.5 rounded-full ${dotColor(p.deal_role)}`} />
                  </div>
                  <button className="flex-1 min-w-0 text-left" onClick={onGoToContacts}>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide leading-none mb-0.5">
                      {roleLabel(p.deal_role)}
                    </p>
                    <p className="text-sm font-semibold text-black truncate">
                      {fullName}{c.company ? <span className="font-normal text-gray-400"> ({c.company})</span> : ''}
                    </p>
                  </button>
                  {c.phone && (
                    <div className="flex items-center gap-1.5 flex-none">
                      <span className="text-xs text-gray-400 whitespace-nowrap hidden sm:inline">{formatPhone(c.phone)}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setAgentPopup({ label: roleLabel(p.deal_role), agent: agentContact, accent: 'text-primary' }); }}
                        className="btn btn-ghost btn-circle w-7 h-7 min-h-0 text-success hover:bg-success/10 p-0 flex items-center justify-center"
                        title={`Call ${fullName}`}
                      ><Phone size={14} /></button>
                    </div>
                  )}
                  <button
                    onClick={() => setAgentPopup({ label: roleLabel(p.deal_role), agent: agentContact, accent: 'text-primary' })}
                    className="btn btn-ghost btn-xs btn-square text-gray-300 hover:text-primary transition-colors flex-none"
                  ><ChevronRight size={14} /></button>
                </div>
              );
            };

            const buySide = participants.filter(p => p.side === 'buyer' || p.side === 'both' || p.side === 'vendor');
            const sellSide = participants.filter(p => p.side === 'seller' || p.side === 'listing' || p.side === 'both');

            return (
              <div className="flex flex-col gap-3">
                {/* Buy Side */}
                {buySide.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1.5 pl-1">Buy Side</p>
                    <div className="flex flex-col gap-2">{buySide.map(renderCard)}</div>
                  </div>
                )}
                {/* Sell Side */}
                {sellSide.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1.5 pl-1">Sell Side</p>
                    <div className="flex flex-col gap-2">{sellSide.map(renderCard)}</div>
                  </div>
                )}
              </div>
            );
          })()
        )}
      </div>

      {/* ─── Agent Contact Popup ─── */}
      {agentPopup && agentPopup.agent && (
        <AgentContactPopup
          label={agentPopup.label}
          agent={agentPopup.agent}
          dealId={deal.id}
          onClose={() => setAgentPopup(null)}
          onCallStarted={onCallStarted}
        />
      )}

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

        {deal.reminders.filter(r => r.completed).length > 0 && (
          <p className="text-xs text-gray-400 mt-1">+ {deal.reminders.filter(r => r.completed).length} completed</p>
        )}

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
            <Button variant="primary" size="xs" onClick={saveReminder}>Add</Button>
            <Button variant="ghost" size="xs" onClick={() => setShowAddReminder(false)}>Cancel</Button>
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

            <div className="flex items-center justify-between px-6 py-4 border-b border-base-300 flex-none">
              <div>
                <h2 className="font-bold text-base-content text-lg">Edit Deal</h2>
                <p className="text-xs text-base-content/50 mt-0.5">{deal.propertyAddress}</p>
              </div>
              <button onClick={handleCancel} className="btn btn-ghost btn-sm btn-square">
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

              {/* ── 1. PROPERTY INFO ── */}
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
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">Legal Description</label>
                    <textarea className="textarea textarea-bordered w-full text-sm" rows={2} value={fields.legalDescription}
                      onChange={e => setFields(p => ({ ...p, legalDescription: e.target.value }))}
                      placeholder="Legal description..." />
                  </div>
                  <div className="flex items-center gap-4 pt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="checkbox checkbox-sm" checked={fields.hoa}
                        onChange={e => setFields(p => ({ ...p, hoa: e.target.checked }))} />
                      <span className="text-sm">HOA</span>
                    </label>
                    {fields.hoa && (
                      <div className="flex-1">
                        <input className="input input-bordered input-sm w-full" placeholder="Monthly fee $"
                          value={fields.hoaMonthlyFee}
                          onChange={e => setFields(p => ({ ...p, hoaMonthlyFee: e.target.value }))} />
                      </div>
                    )}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="checkbox checkbox-sm" checked={fields.surveyRequired}
                        onChange={e => setFields(p => ({ ...p, surveyRequired: e.target.checked }))} />
                      <span className="text-sm">Survey Required</span>
                    </label>
                  </div>
                </div>
              </section>

              {/* ── 2. PARTIES ── */}
              <section>
                <h3 className="text-xs font-bold text-base-content/50 uppercase tracking-widest mb-3">Parties</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">Buyer Name(s)</label>
                    <input className="input input-bordered input-sm w-full" placeholder="Buyer full name(s)"
                      value={fields.buyerName}
                      onChange={e => setFields(p => ({ ...p, buyerName: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">Seller Name(s)</label>
                    <input className="input input-bordered input-sm w-full" placeholder="Seller full name(s)"
                      value={fields.sellerName}
                      onChange={e => setFields(p => ({ ...p, sellerName: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">EM Held With</label>
                    <input className="input input-bordered input-sm w-full" placeholder="Title company name"
                      value={fields.titleCompanyName}
                      onChange={e => setFields(p => ({ ...p, titleCompanyName: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">Lender / Loan Officer</label>
                    <input className="input input-bordered input-sm w-full" placeholder="Lender or loan officer name"
                      value={fields.loanOfficerName}
                      onChange={e => setFields(p => ({ ...p, loanOfficerName: e.target.value }))} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs text-base-content/50 mb-1 block">Agents</label>
                    <div className="space-y-2">
                      <AgentEditSection label="Buyer Agent" draft={buyerDraft} onChange={setBuyerDraft} accent="text-info" agentOptions={agentOptions} />
                      <AgentEditSection label="Seller Agent" draft={sellerDraft} onChange={setSellerDraft} accent="text-success" agentOptions={agentOptions} />
                    </div>
                  </div>
                </div>
              </section>

              {/* ── 3. TRANSACTION DETAILS ── */}
              <section>
                <h3 className="text-xs font-bold text-base-content/50 uppercase tracking-widest mb-3">Transaction Details</h3>
                <div className="grid grid-cols-2 gap-3">
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
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">Possession Date</label>
                    <input type="date" className="input input-bordered input-sm w-full" value={fields.possessionDate}
                      onChange={e => setFields(p => ({ ...p, possessionDate: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-base-content/50 mb-1 block">Internal Notes</label>
                    <textarea className="textarea textarea-bordered w-full text-sm" rows={2} value={fields.notes}
                      onChange={e => setFields(p => ({ ...p, notes: e.target.value }))} />
                  </div>
                </div>
              </section>

              {/* ── 4. FINANCING ── */}
              <section>
                <h3 className="text-xs font-bold text-base-content/50 uppercase tracking-widest mb-3">Financing</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs text-base-content/50 mb-1 block">Loan Type</label>
                    <div className="flex flex-wrap gap-2">
                      {LOAN_TYPES.map(lt => (
                        <button key={lt.value} type="button"
                          className={`btn btn-xs ${fields.loanType === lt.value ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
                          onClick={() => setFields(p => ({ ...p, loanType: lt.value }))}>
                          {lt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {fields.loanType !== 'cash' && (
                    <>
                      <div>
                        <label className="text-xs text-base-content/50 mb-1 block">Loan Amount</label>
                        <input className="input input-bordered input-sm w-full" placeholder="$"
                          value={fields.loanAmount}
                          onChange={e => setFields(p => ({ ...p, loanAmount: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs text-base-content/50 mb-1 block">Down Payment</label>
                        <input className="input input-bordered input-sm w-full" placeholder="$"
                          value={fields.downPayment}
                          onChange={e => setFields(p => ({ ...p, downPayment: e.target.value }))} />
                      </div>
                    </>
                  )}
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">Earnest Money</label>
                    <input className="input input-bordered input-sm w-full" placeholder="$"
                      value={fields.earnestMoney}
                      onChange={e => setFields(p => ({ ...p, earnestMoney: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">EMD Due Date</label>
                    <input type="date" className="input input-bordered input-sm w-full"
                      value={fields.earnestMoneyDueDate}
                      onChange={e => setFields(p => ({ ...p, earnestMoneyDueDate: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">Total Seller Credits</label>
                    <input className="input input-bordered input-sm w-full" placeholder="$"
                      value={fields.totalSellerCredits}
                      onChange={e => setFields(p => ({ ...p, totalSellerCredits: e.target.value }))} />
                  </div>
                </div>
              </section>

              {/* ── 5. CONTRACT CONDITIONS ── */}
              <section>
                <h3 className="text-xs font-bold text-base-content/50 uppercase tracking-widest mb-3">Contract Conditions</h3>
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="checkbox checkbox-sm checkbox-warning" checked={fields.asIsSale}
                        onChange={e => setFields(p => ({ ...p, asIsSale: e.target.checked }))} />
                      <span className="text-sm font-medium">As-Is Sale</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="checkbox checkbox-sm checkbox-warning" checked={fields.inspectionWaived}
                        onChange={e => setFields(p => ({ ...p, inspectionWaived: e.target.checked }))} />
                      <span className="text-sm font-medium">Inspection Waived</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="checkbox checkbox-sm checkbox-success" checked={fields.homeWarranty}
                        onChange={e => setFields(p => ({ ...p, homeWarranty: e.target.checked }))} />
                      <span className="text-sm font-medium">Home Warranty</span>
                    </label>
                  </div>
                  {fields.homeWarranty && (
                    <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-base-200/50 border border-base-300">
                      <div>
                        <label className="text-xs text-base-content/50 mb-1 block">Warranty Company</label>
                        <input className="input input-bordered input-sm w-full" placeholder="Company name"
                          value={fields.homeWarrantyCompany}
                          onChange={e => setFields(p => ({ ...p, homeWarrantyCompany: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs text-base-content/50 mb-1 block">Amount</label>
                        <input className="input input-bordered input-sm w-full" placeholder="$"
                          value={fields.homeWarrantyAmount}
                          onChange={e => setFields(p => ({ ...p, homeWarrantyAmount: e.target.value }))} />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-base-content/50 mb-1 block">Paid By</label>
                        <div className="flex gap-2">
                          {['buyer', 'seller', 'split'].map(opt => (
                            <button key={opt} type="button"
                              className={`btn btn-xs capitalize ${fields.homeWarrantyPaidBy === opt ? 'btn-success' : 'btn-ghost border border-base-300'}`}
                              onClick={() => setFields(p => ({ ...p, homeWarrantyPaidBy: opt }))}>
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* ── 6. COMMISSION ── */}
              <section>
                <h3 className="text-xs font-bold text-base-content/50 uppercase tracking-widest mb-3">Commission</h3>
                <div className="space-y-3">
                  {/* Client Agent Commission */}
                  <div className="p-3 rounded-xl bg-base-200/50 border border-base-300">
                    <p className="text-xs font-semibold text-base-content/60 mb-2">Client Agent Commission</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-base-content/40 mb-1 block">Commission $</label>
                        <input className="input input-bordered input-sm w-full"
                          type="number"
                          placeholder="0.00"
                          value={fields.clientAgentCommission}
                          onChange={e => {
                            const amt = e.target.value;
                            const cp = parseFloat(fields.contractPrice || '0');
                            const pct = cp > 0 ? calcCommissionPct(cp, parseFloat(amt)).toFixed(2) : '';
                            setFields(p => ({ ...p, clientAgentCommission: amt, clientAgentCommissionPct: pct }));
                          }} />
                      </div>
                      <div>
                        <label className="text-xs text-base-content/40 mb-1 block">Commission %</label>
                        <input className="input input-bordered input-sm w-full"
                          type="number"
                          placeholder="0.00"
                          value={fields.clientAgentCommissionPct}
                          onChange={e => {
                            const pct = e.target.value;
                            const cp = parseFloat(fields.contractPrice || '0');
                            const amt = cp > 0 ? calcCommissionAmount(cp, parseFloat(pct)).toFixed(2) : '';
                            setFields(p => ({ ...p, clientAgentCommissionPct: pct, clientAgentCommission: amt }));
                          }} />
                      </div>
                    </div>
                  </div>
                  {/* TC Fee */}
                  <div className="p-3 rounded-xl bg-base-200/50 border border-base-300">
                    <p className="text-xs font-semibold text-base-content/60 mb-2">TC Fee</p>
                    <div className="flex gap-2 items-end">
                      <div className="flex gap-1">
                        {(['percent', 'flat'] as const).map(t => (
                          <button key={t} type="button"
                            className={`btn btn-xs ${fields.tcFeeType === t ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
                            onClick={() => setFields(p => ({ ...p, tcFeeType: t }))}>
                            {t === 'percent' ? '%' : '$'}
                          </button>
                        ))}
                      </div>
                      <input className="input input-bordered input-sm flex-1"
                        placeholder={fields.tcFeeType === 'percent' ? '0.5' : '500'}
                        value={fields.tcFeeValue}
                        onChange={e => setFields(p => ({ ...p, tcFeeValue: e.target.value }))} />
                      <select className="select select-bordered select-sm"
                        value={fields.tcFeePaidBy}
                        onChange={e => setFields(p => ({ ...p, tcFeePaidBy: e.target.value }))}>
                        <option value="seller">Seller pays</option>
                        <option value="buyer">Buyer pays</option>
                        <option value="listing-agent">Listing agent pays</option>
                        <option value="buying-agent">Buying agent pays</option>
                      </select>
                    </div>
                  </div>
                  {/* New Commission Section */}
                  <div>
                    <p className="text-xs font-semibold text-base-content/60 mb-2">Commission</p>
                    <div className="space-y-3">
                      {/* Listing Commission */}
                      <div>
                        <label className="text-xs text-base-content/50 font-semibold block mb-1">Listing Commission</label>
                        <div className="flex gap-2 items-center">
                          <div className="flex gap-1">
                            {(['percent', 'flat'] as const).map(t => (
                              <button key={t} type="button"
                                className={`btn btn-xs ${fields.listingCommissionType === t ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
                                onClick={() => setFields(p => ({ ...p, listingCommissionType: t }))}>
                                {t === 'percent' ? '%' : '$'}
                              </button>
                            ))}
                          </div>
                          <input className="input input-bordered input-sm flex-1"
                            placeholder={fields.listingCommissionType === 'percent' ? '3.0' : '0.00'}
                            value={fields.listingCommissionValue}
                            onChange={e => setFields(p => ({ ...p, listingCommissionValue: e.target.value }))} />
                        </div>
                      </div>
                      {/* Buyer Commission */}
                      <div>
                        <label className="text-xs text-base-content/50 font-semibold block mb-1">Buyer Commission</label>
                        <div className="flex gap-2 items-center">
                          <div className="flex gap-1">
                            {(['percent', 'flat'] as const).map(t => (
                              <button key={t} type="button"
                                className={`btn btn-xs ${fields.buyerCommissionType === t ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
                                onClick={() => setFields(p => ({ ...p, buyerCommissionType: t }))}>
                                {t === 'percent' ? '%' : '$'}
                              </button>
                            ))}
                          </div>
                          <input className="input input-bordered input-sm flex-1"
                            placeholder={fields.buyerCommissionType === 'percent' ? '3.0' : '0.00'}
                            value={fields.buyerCommissionValue}
                            onChange={e => setFields(p => ({ ...p, buyerCommissionValue: e.target.value }))} />
                        </div>
                      </div>
                      {/* Commission Paid By */}
                      <div>
                        <label className="text-xs text-base-content/50 mb-1 block">Commission Paid By</label>
                        <div className="flex gap-2">
                          {(['seller', 'buyer', 'split'] as const).map(opt => (
                            <button key={opt} type="button"
                              className={`btn btn-sm capitalize ${fields.commissionPaidBy === opt ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
                              onClick={() => setFields(p => ({ ...p, commissionPaidBy: opt }))}>
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

            </div>

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