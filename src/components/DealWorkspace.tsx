import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard, CheckSquare, Users, AlertTriangle,
  Clock, FileText, ArrowLeft, ListChecks, MapPin, Copy, Check, Pencil, Scan, Sparkles, MessageCircle, Phone, GitBranch, Shield, Inbox, MoreVertical, Archive, RotateCcw, ClipboardList,
} from 'lucide-react';
import { EmailCommandCenter } from './EmailCommandCenter';
import { DealChatPanel } from './DealChatPanel';
import WorkspaceVoice from './WorkspaceVoice';
import { DealTimeline } from './DealTimeline';
import { dealToRecord } from '../ai/dealConverter';
import { Deal, ContactRecord, AppUser, EmailTemplate, ComplianceTemplate } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { pendingDocCount } from '../utils/helpers';
import { useDealEmails } from '../hooks/useDealEmails';

const copyToClipboard = (text: string, onSuccess?: () => void): void => {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      onSuccess?.();
    }).catch(() => {
      legacyCopy(text, onSuccess);
    });
  } else {
    legacyCopy(text, onSuccess);
  }
};

const legacyCopy = (text: string, onSuccess?: () => void): void => {
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;';
    document.body.appendChild(el);
    el.focus();
    el.select();
    el.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    if (ok) { onSuccess?.(); return; }
  } catch {}
  window.prompt('Copy (Ctrl+C / Cmd+C):', text);
};
import { TransactionSheet } from './TransactionSheet';
import { FocusViewModal } from './FocusViewModal';
import { WorkspaceOverview } from './WorkspaceOverview';
import { WorkspaceChecklists } from './WorkspaceChecklists';
import { WorkspaceTasks } from './WorkspaceTasks';
import { WorkspaceContacts } from './WorkspaceContacts';
import { WorkspaceDocuments } from './WorkspaceDocuments';
import { WorkspaceActivityLog } from './WorkspaceActivityLog';
import { WorkspaceEmailTemplate } from './WorkspaceEmailTemplate';
import WorkspaceEmailCompose from './WorkspaceEmailCompose';
import { WorkspaceLinkedEmails } from './WorkspaceLinkedEmails';
import { WorkspaceAmendments } from './WorkspaceAmendments';
import { WorkspaceRequests } from './WorkspaceRequests';
import { DealAccessPanel } from './DealAccessPanel';
import { PageIdBadge } from './PageIdBadge';
import { PAGE_IDS } from '../utils/pageTracking';

type Tab = 'overview' | 'checklists' | 'tasks' | 'contacts' | 'documents' | 'requests' | 'activity' | 'email' | 'ai-emails' | 'ai-chat' | 'comms' | 'timeline' | 'linked-emails' | 'amendments' | 'access';

const TAB_PAGE_IDS: Record<Tab, string> = {
  overview:         PAGE_IDS.DEAL_OVERVIEW,      // handled by WorkspaceOverview
  checklists:       PAGE_IDS.WS_CHECKLISTS,
  tasks:            PAGE_IDS.WS_TASKS,
  contacts:         PAGE_IDS.WS_CONTACTS,
  documents:        PAGE_IDS.WS_DOCUMENTS,
  requests:         PAGE_IDS.WS_REQUESTS,
  activity:         PAGE_IDS.WS_ACTIVITY,
  email:            PAGE_IDS.WS_EMAIL_COMPOSE,
  timeline:         PAGE_IDS.WS_TIMELINE,
  'ai-chat':        PAGE_IDS.WS_AI_CHAT,
  comms:            PAGE_IDS.WS_COMMS,
  'ai-emails':      PAGE_IDS.WS_AI_EMAILS,
  'linked-emails':  PAGE_IDS.WS_LINKED_EMAILS,
  amendments:       PAGE_IDS.WS_AMENDMENTS,
  access:           PAGE_IDS.WS_ACCESS,
};

interface Props {
  deal: Deal;
  onUpdate: (deal: Deal) => void;
  onBack?: () => void;
  contactRecords?: ContactRecord[];
  users?: AppUser[];
  emailTemplates?: EmailTemplate[];
  complianceTemplates?: ComplianceTemplate[];
  deals?: Deal[];
  onCallStarted?: (callData: { contactName: string; contactPhone: string; contactId?: string; dealId?: string; callSid?: string; startedAt: string }) => void;
  onArchiveDeal?: (dealId: string, reason: string) => void;
  onRestoreDeal?: (dealId: string) => void;
  onChangeStatus?: (dealId: string, status: import('../types').DealStatus) => void;
  /** If set, workspace opens to this tab instead of 'overview' when deal loads. */
  initialTab?: Tab;
}

/**
 * Derive representation from deal_participants (is_client_side flag).
 * Falls back to deal.transactionType when participants table is empty.
 */
function getRepresentation(deal: Deal): { label: string; style: string; tooltip: string } | null {
  const participants = deal.participants ?? [];

  // ── Primary path: use deal_participants when populated ──────────────────
  if (participants.length > 0) {
    const buyerClients = participants.filter(
      p => p.side === 'buyer' && p.isClientSide && (p.dealRole === 'lead_agent' || p.dealRole === 'co_agent')
    );
    const sellerClients = participants.filter(
      p => (p.side === 'listing' || p.side === 'seller') && p.isClientSide && (p.dealRole === 'lead_agent' || p.dealRole === 'co_agent')
    );

    const hasBuyer  = buyerClients.length > 0;
    const hasSeller = sellerClients.length > 0;
    const buyerNames  = buyerClients.map(p => p.contactName).filter(Boolean).join(', ');
    const sellerNames = sellerClients.map(p => p.contactName).filter(Boolean).join(', ');

    if (hasBuyer && hasSeller) {
      return {
        label: 'Representing Both Sides',
        style: 'bg-violet-100 text-violet-700 border-violet-300',
        tooltip: `Buy side: ${buyerNames || 'Client Agent'} · Sell side: ${sellerNames || 'Client Agent'}`,
      };
    }
    if (hasBuyer) {
      return {
        label: 'Representing Buyer',
        style: 'bg-blue-50 text-blue-700 border-blue-300',
        tooltip: `Our client: ${buyerNames || 'Buyer Agent'}`,
      };
    }
    if (hasSeller) {
      return {
        label: 'Representing Seller',
        style: 'bg-emerald-50 text-emerald-700 border-emerald-300',
        tooltip: `Our client: ${sellerNames || 'Seller Agent'}`,
      };
    }
  }

  // ── Fallback: use transactionType when deal_participants is empty ─────────
  const txType = deal.transactionType;
  if (txType === 'buyer') {
    return {
      label: 'Representing Buyer',
      style: 'bg-blue-50 text-blue-700 border-blue-300',
      tooltip: 'Buyer-side transaction',
    };
  }
  if (txType === 'seller') {
    return {
      label: 'Representing Seller',
      style: 'bg-emerald-50 text-emerald-700 border-emerald-300',
      tooltip: 'Seller-side transaction',
    };
  }

  return null;
}

export const DealWorkspace: React.FC<Props> = ({ deal, onUpdate, onBack, contactRecords = [], users = [], emailTemplates = [], complianceTemplates = [], deals = [], onCallStarted, onArchiveDeal, onRestoreDeal, onChangeStatus, initialTab }) => {
  const { profile, isMasterAdmin } = useAuth();
  const isViewer = profile?.role === 'viewer';
  const canManageAccess = isMasterAdmin() || profile?.role === 'admin' ||
    (deal.orgId ? (profile as any)?.orgMemberships?.some((m: any) => m.orgId === deal.orgId && m.roleInOrg === 'team_admin') : false);
  const [tab, setTab] = useState<Tab>(initialTab ?? 'overview');
  const [copied, setCopied] = useState(false);
  const [wsMenuOpen, setWsMenuOpen]     = useState(false);
  const [wsArchiveOpen, setWsArchiveOpen] = useState(false);
  const [wsArchiveReason, setWsArchiveReason] = useState('deal-closed');
  const WS_ARCHIVE_REASONS = [
    { value: 'deal-closed',  label: 'Deal Closed'  },
    { value: 'fell-through', label: 'Fell Through'  },
    { value: 'duplicate',    label: 'Duplicate'     },
    { value: 'other',        label: 'Other'         },
  ];
  const WS_STATUSES: { value: string; label: string }[] = [
    { value: 'contract',       label: 'Contract'       },
    { value: 'due-diligence',  label: 'Due Diligence'  },
    { value: 'clear-to-close', label: 'Clear to Close' },
    { value: 'closed',         label: 'Closed'         },
    { value: 'terminated',     label: 'Terminated'     },
  ];
  const isArchived = deal.milestone === 'archived';
  const [copiedMls, setCopiedMls] = useState(false);
  const [editTrigger, setEditTrigger] = useState(0);
  const [showSheet, setShowSheet] = useState(false);
  const [showFocusView, setShowFocusView] = useState(false);

  // Fetch deal emails
  const { emails: dealEmails, loading: emailsLoading, stats: emailStats } = useDealEmails(deal);

  // Linked emails unread count for tab badge
  const [linkedEmailUnread, setLinkedEmailUnread] = React.useState(0);

  // Reset to initialTab (or overview) whenever the active deal changes
  useEffect(() => { setTab(initialTab ?? 'overview'); }, [deal.id, initialTab]);
  const pendingDocs = pendingDocCount(deal.documentRequests);
  const overdueTasks = (deal.tasks ?? []).filter(t => !t.completedAt && t.dueDate < new Date().toISOString().slice(0, 10)).length;

  const representation = getRepresentation(deal);

  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'overview',   label: 'Overview',   icon: <LayoutDashboard size={13} /> },
    { id: 'checklists', label: 'Checklists', icon: <CheckSquare size={13} /> },
    { id: 'tasks',      label: 'Tasks',      icon: <ListChecks size={13} />, badge: overdueTasks > 0 ? overdueTasks : undefined },
    { id: 'contacts',   label: 'Contacts',   icon: <Users size={13} /> },
    { id: 'documents',  label: 'Documents',  icon: <AlertTriangle size={13} />, badge: pendingDocs },
    { id: 'requests',   label: 'Requests',   icon: <ClipboardList size={13} /> },
    { id: 'activity',   label: 'Activity',   icon: <Clock size={13} /> },
    { id: 'email',      label: 'Email',      icon: <FileText size={13} /> },
    { id: 'timeline',   label: 'Timeline',   icon: <GitBranch size={13} /> },
    { id: 'ai-chat',    label: 'AI Chat',    icon: <MessageCircle size={13} /> },
    { id: 'comms',      label: 'Comms',      icon: <Phone size={13} /> },
    { id: 'ai-emails',  label: 'AI Emails',  icon: <Sparkles size={13} />, badge: emailStats.total > 0 ? emailStats.total : undefined },
    { id: 'linked-emails', label: 'Emails', icon: <Inbox size={13} />, badge: linkedEmailUnread > 0 ? linkedEmailUnread : undefined },
    ...(canManageAccess ? [{ id: 'access' as Tab, label: 'Access', icon: <Shield size={14} /> }] : []),
  ];

  return (
    <div className="flex flex-col h-full bg-base-100">

      {/* ─── Sticky Address Bar (full header, all screens) ─── */}
      <div className="flex-none bg-white border-b border-base-300 shadow-sm z-20 px-4 py-3">
        <div className="flex items-start justify-between gap-3">

          {/* Left: back button + address block */}
          <div className="flex items-start gap-2 min-w-0 flex-1">
            {onBack && (
              <button
                onClick={onBack}
                className="flex-none flex items-center gap-1 mt-0.5 pr-2 border-r border-base-300 text-xs font-medium text-base-content/50 hover:text-base-content whitespace-nowrap transition-colors"
              >
                <ArrowLeft size={13} />
                <span>Deals</span>
              </button>
            )}
            <div className="min-w-0">
              {/* Street address + copy button */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <MapPin size={14} className="text-primary flex-none" />
                <span className="font-bold text-base text-black leading-tight">{deal.propertyAddress}</span>
                <button
                  onClick={() => {
                    const fullAddr = [deal.propertyAddress, deal.city, deal.state, deal.zipCode].filter(Boolean).join(', ');
                    copyToClipboard(fullAddr, () => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
                  }}
                  title="Copy address"
                  className="btn btn-ghost btn-xs p-1 h-auto min-h-0 opacity-50 hover:opacity-100 transition-opacity"
                >
                  {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                </button>
              </div>
              {/* City, State ZIP */}
              <p className="text-sm text-black/60 leading-tight ml-[22px]">
                {[deal.city, deal.state, deal.zipCode].filter(Boolean).join(', ')}
              </p>
              {/* MLS # */}
              <div className="flex items-center gap-1.5 mt-0.5 ml-[22px]">
                <span className="text-xs text-black/50 font-semibold">MLS —</span>
                <span className="text-xs text-black font-medium">{deal.mlsNumber || <span className="italic text-black/30">not set</span>}</span>
                {deal.mlsNumber && (
                  <button
                    onClick={() => {
                      copyToClipboard(deal.mlsNumber || '', () => { setCopiedMls(true); setTimeout(() => setCopiedMls(false), 2000); });
                    }}
                    title="Copy MLS number"
                    className="btn btn-ghost btn-xs p-1 h-auto min-h-0 opacity-50 hover:opacity-100 transition-opacity"
                  >
                    {copiedMls ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                  </button>
                )}
              </div>
              {/* ── Representation badge ── */}
              {representation ? (
                <div className="mt-2 ml-[22px]">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold shadow-sm ${representation.style}`}
                    title={representation.tooltip}
                  >
                    <Shield size={11} className="flex-none" />
                    {representation.label}
                  </span>
                </div>
              ) : (
                <div className="mt-2 ml-[22px]">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-400 text-xs font-medium">
                    <Shield size={11} className="flex-none" />
                    No client representation
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right: Focus View + Sheet + Edit Deal (hidden for viewers) */}
          <div className="flex items-center gap-2 flex-none mt-0.5">
            <button
              onClick={() => setShowFocusView(true)}
              title="Focus View"
              className="btn btn-sm btn-ghost gap-1.5 border border-gray-300 text-black hover:bg-gray-100"
            >
              <Scan size={13} />
              <span className="hidden sm:inline text-xs">Focus View</span>
            </button>
            <button
              onClick={() => setShowSheet(true)}
              title="View Transaction Sheet"
              className="btn btn-sm btn-ghost gap-1.5 border border-gray-300 text-black hover:bg-gray-100"
            >
              <FileText size={13} />
              <span className="hidden sm:inline">Sheet</span>
            </button>
            {!isViewer && (
              <button
                onClick={() => { setTab('overview'); setEditTrigger(n => n + 1); }}
                className="btn btn-sm btn-primary btn-outline gap-1.5"
              >
                <Pencil size={13} /> Edit Deal
              </button>
            )}
            {/* 3-dot workspace menu */}
            <div className="relative">
              <button
                className="btn btn-sm btn-ghost p-1.5 border border-gray-300"
                onClick={() => setWsMenuOpen(v => !v)}
                title="More actions"
              >
                <MoreVertical size={14} />
              </button>
              {wsMenuOpen && (
                <div className="absolute right-0 top-9 z-50 bg-base-100 border border-base-300 rounded-lg shadow-lg min-w-[170px] py-1">
                  {!isViewer && (
                    <>
                      <div className="px-3 py-1 text-[10px] font-semibold text-base-content/40 uppercase tracking-wide">Change Status</div>
                      {WS_STATUSES.map(s => (
                        <button
                          key={s.value}
                          className={`w-full text-left px-3 py-1 text-xs hover:bg-base-200 ${deal.status === s.value ? 'font-bold text-primary' : ''}`}
                          onClick={() => { onChangeStatus?.(deal.id, s.value as import('../types').DealStatus); setWsMenuOpen(false); }}
                        >
                          {s.label}
                        </button>
                      ))}
                      <div className="border-t border-base-300 my-1" />
                      {isArchived ? (
                        <button
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-base-200 flex items-center gap-2 text-green-600"
                          onClick={() => { onRestoreDeal?.(deal.id); setWsMenuOpen(false); }}
                        >
                          <RotateCcw size={11} /> Restore Deal
                        </button>
                      ) : (
                        <button
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-base-200 flex items-center gap-2 text-red-500"
                          onClick={() => { setWsMenuOpen(false); setWsArchiveReason('deal-closed'); setWsArchiveOpen(true); }}
                        >
                          <Archive size={11} /> Archive Deal
                        </button>
                      )}
                    </>
                  )}
                  {isViewer && (
                    <div className="px-3 py-2 text-xs text-base-content/40 italic">Read-only demo mode</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Transaction Sheet Modal */}
      {showSheet && <TransactionSheet deal={deal} onClose={() => setShowSheet(false)} />}

      {/* Focus View Modal */}
      {showFocusView && <FocusViewModal deal={deal} onClose={() => setShowFocusView(false)} />}

      {/* Tab Bar */}
      <div className="flex-none border-b border-base-300 bg-base-200 flex items-center overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-0 flex-none md:flex-1 overflow-x-auto scrollbar-none px-1 md:px-4">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-2.5 md:px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap flex-none ${
                tab === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-base-content/60 hover:text-base-content'
              }`}
            >
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
              {t.badge !== undefined && t.badge > 0 && (
                <span className="badge badge-warning badge-xs font-bold animate-pulse">{t.badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className={`flex-1 ${tab === 'email' || tab === 'ai-emails' || tab === 'ai-chat' || tab === 'comms' ? 'overflow-hidden' : 'overflow-y-auto'}`}>

        {tab === 'overview'   && <WorkspaceOverview deal={deal} onUpdate={onUpdate} contactRecords={contactRecords} onGoToContacts={() => setTab('contacts')} onGoToEmails={() => setTab('ai-emails')} editTrigger={editTrigger} allDeals={deals} onCallStarted={onCallStarted} />}
        {tab === 'checklists' && <WorkspaceChecklists deal={deal} onUpdate={onUpdate} users={users} contactRecords={contactRecords} complianceTemplates={complianceTemplates} />}
        {tab === 'tasks'      && <WorkspaceTasks deal={deal} onUpdate={onUpdate} users={users} />}
        {tab === 'contacts'   && <WorkspaceContacts deal={deal} onUpdate={onUpdate} contactRecords={contactRecords} onCallStarted={onCallStarted} />}
        {tab === 'documents'  && <WorkspaceDocuments deal={deal} onUpdate={onUpdate} />}
        {tab === 'activity'   && <WorkspaceActivityLog deal={deal} onUpdate={onUpdate} />}
        {tab === 'email'      && <WorkspaceEmailCompose deal={deal} emailTemplates={emailTemplates} complianceTemplates={complianceTemplates} currentUser={profile?.name} />}
        {tab === 'timeline'   && <DealTimeline deal={deal} />}
        {tab === 'ai-chat'    && <DealChatPanel deal={deal} onUpdate={onUpdate} />}
        {tab === 'comms'      && <WorkspaceVoice deal={deal} onUpdate={onUpdate} onCallStarted={onCallStarted} />}
        {tab === 'ai-emails' && (
          <div className="p-4">
            {emailsLoading && dealEmails.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <span className="loading loading-spinner loading-md text-primary" />
                <span className="ml-3 text-sm text-base-content/60">Searching & classifying emails…</span>
              </div>
            ) : (
              <EmailCommandCenter deal={dealToRecord(deal)} emails={dealEmails} />
            )}
          </div>
        )}
        {tab === 'requests'   && <WorkspaceRequests deal={deal} />}
        {tab === 'amendments' && <WorkspaceAmendments deal={deal} onUpdate={onUpdate} />}
        {tab === 'access' && <DealAccessPanel deal={deal} />}
        {tab === 'linked-emails' && (
          <WorkspaceLinkedEmails
            deal={deal}
            onUnreadCount={setLinkedEmailUnread}
          />
        )}
      </div>
      {/* Page ID Badge — show for all tabs except overview (WorkspaceOverview handles that) */}
      {tab !== 'overview' && (
        <PageIdBadge pageId={TAB_PAGE_IDS[tab] ?? tab} context={deal.id.slice(0, 8)} />
      )}

    {/* Workspace archive confirmation modal */}
      {wsArchiveOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" onClick={() => setWsArchiveOpen(false)}>
          <div className="bg-base-100 rounded-xl shadow-xl p-5 w-80 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-base flex items-center gap-2">
              <Archive size={16} className="text-red-500" /> Archive Deal
            </h3>
            <p className="text-sm text-base-content/70">
              Archiving <span className="font-semibold">{deal.propertyAddress}</span>. Choose a reason:
            </p>
            <div className="space-y-1.5">
              {WS_ARCHIVE_REASONS.map(r => (
                <label key={r.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    className="radio radio-sm radio-primary"
                    checked={wsArchiveReason === r.value}
                    onChange={() => setWsArchiveReason(r.value)}
                  />
                  <span className="text-sm">{r.label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button className="btn btn-sm btn-ghost" onClick={() => setWsArchiveOpen(false)}>Cancel</button>
              <button className="btn btn-sm btn-error" onClick={() => { onArchiveDeal?.(deal.id, wsArchiveReason); setWsArchiveOpen(false); }}>Archive</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
