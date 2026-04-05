import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard, CheckSquare, Users, AlertTriangle,
  Clock, FileText, ArrowLeft, ListChecks, MapPin, Copy, Check, Pencil, Scan, Sparkles, MessageCircle, Phone, GitBranch, Shield, Inbox, MoreVertical, Archive, RotateCcw, ClipboardList, Database, X as XIcon,
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
import { PageIdBadge } from './PageIdBadge';

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
import { supabase } from '../lib/supabase';
import { Button } from './ui/Button';

type Tab = 'overview' | 'checklists' | 'tasks' | 'contacts' | 'documents' | 'requests' | 'activity' | 'email' | 'ai-emails' | 'ai-chat' | 'comms' | 'timeline' | 'linked-emails' | 'amendments' | 'access';

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
  /** If set, auto-opens the new request modal in the Requests tab. */
  initialRequestType?: string;
}

/**
 * Derive representation from deal_participants (is_client_side flag).
 * Uses participants array directly — more reliable than deprecated buyerAgent/sellerAgent fields.
 */
function getRepresentation(deal: Deal): { label: string; style: string; tooltip: string } | null {
  const participants = deal.participants ?? [];

  // Find client-side agents by side
  const buyerClients = participants.filter(
    p => (p.side === 'buyer') && p.isClientSide && (p.dealRole === 'lead_agent' || p.dealRole === 'co_agent')
  );
  const sellerClients = participants.filter(
    p => (p.side === 'listing' || p.side === 'seller') && p.isClientSide && (p.dealRole === 'lead_agent' || p.dealRole === 'co_agent')
  );

  const hasBuyer = buyerClients.length > 0;
  const hasSeller = sellerClients.length > 0;

  const buyerNames = buyerClients.map(p => p.contactName).filter(Boolean).join(', ');
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
  return null;
}

// ── Helper: contract + closing dates row ──────────────────────────────────
function DealHeaderDates({ contractDate, closingDate }: { contractDate?: string; closingDate?: string }) {
  const fmt = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const closingObj = closingDate ? new Date(closingDate + 'T00:00:00') : null;
  const daysToClose = closingObj
    ? Math.ceil((closingObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const closingColor =
    daysToClose === null
      ? 'text-black/50'
      : daysToClose < 0
      ? 'text-black/40'
      : daysToClose <= 7
      ? 'text-red-600 font-semibold'
      : daysToClose <= 14
      ? 'text-amber-600 font-semibold'
      : 'text-emerald-700';

  return (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      {contractDate && (
        <span className="flex items-center gap-1 text-xs text-black/50">
          <span className="font-medium text-black/40">Contract</span>
          <span>{fmt(contractDate)}</span>
        </span>
      )}
      {contractDate && closingDate && <span className="text-black/20 text-xs">·</span>}
      {closingDate && (
        <span className={`flex items-center gap-1 text-xs ${closingColor}`}>
          <span className="font-medium opacity-70">Closing</span>
          <span>{fmt(closingDate)}</span>
          {daysToClose !== null && daysToClose >= 0 && (
            <span className="ml-0.5 opacity-75">({daysToClose}d)</span>
          )}
          {daysToClose !== null && daysToClose < 0 && (
            <span className="ml-0.5 text-black/35">(closed)</span>
          )}
        </span>
      )}
    </div>
  );
}

export const DealWorkspace: React.FC<Props> = ({ deal, onUpdate, onBack, contactRecords = [], users = [], emailTemplates = [], complianceTemplates = [], deals = [], onCallStarted, onArchiveDeal, onRestoreDeal, onChangeStatus, initialTab, initialRequestType }) => {
  const { profile, isMasterAdmin } = useAuth();
  const isViewer = profile?.role === 'viewer';
  const canManageAccess = isMasterAdmin() || profile?.role === 'admin' ||
    (deal.orgId ? (profile as any)?.orgMemberships?.some((m: any) => m.orgId === deal.orgId && m.roleInOrg === 'team_admin') : false);
  const [tab, setTab] = useState<Tab>(initialTab ?? 'overview');
  const [activeRequestCount, setActiveRequestCount] = React.useState(0);
  const [internalRequestType, setInternalRequestType] = useState<string | null>(null);
  const [internalTaskId, setInternalTaskId] = useState<string | null>(null);

  // Clear internal request state when leaving the requests tab
  useEffect(() => {
    if (tab !== 'requests') {
      setInternalRequestType(null);
      setInternalTaskId(null);
    }
  }, [tab]);

  // Fetch active request count for badge
  useEffect(() => {
    let cancelled = false;
    supabase
      .from('requests')
      .select('id', { count: 'exact', head: true })
      .eq('deal_id', deal.id)
      .not('status', 'in', '(completed,cancelled,accepted,rejected)')
      .then(({ count }) => {
        if (!cancelled) setActiveRequestCount(count || 0);
      });
    return () => { cancelled = true; };
  }, [deal.id]);
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
  const [showMlsData, setShowMlsData] = useState(false);
  const [mlsData, setMlsData] = useState<any | null>(null);
  const [mlsDataFetchedAt, setMlsDataFetchedAt] = useState<string | null>(null);
  const [mlsDataFetchedBy, setMlsDataFetchedBy] = useState<string | null>(null);
  const [mlsDataLoading, setMlsDataLoading] = useState(false);
  const [mlsDataError, setMlsDataError] = useState<string | null>(null);
  // Re-run confirmation state
  const [showMlsRerunConfirm, setShowMlsRerunConfirm] = useState(false);
  const [mlsRerunFirstName, setMlsRerunFirstName] = useState('');
  const [mlsRerunning, setMlsRerunning] = useState(false);

  // Fetch deal emails
  const { emails: dealEmails, loading: emailsLoading, stats: emailStats } = useDealEmails(deal);

  // Linked emails unread count for tab badge
  const [linkedEmailUnread, setLinkedEmailUnread] = React.useState(0);

  // Reset to initialTab (or overview) whenever the active deal changes
  useEffect(() => { setTab(initialTab ?? 'overview'); }, [deal.id, initialTab]);

  // Load MLS data from DB when panel opens
  useEffect(() => {
    if (!showMlsData) return;
    const loadMlsData = async () => {
      setMlsDataLoading(true);
      setMlsDataError(null);
      try {
        const { data, error } = await supabase
          .from('deals')
          .select('mls_data, mls_data_fetched_at, mls_data_fetched_by')
          .eq('id', deal.id)
          .single();
        if (error) throw error;
        setMlsData(data?.mls_data || null);
        setMlsDataFetchedAt(data?.mls_data_fetched_at || null);
        setMlsDataFetchedBy(data?.mls_data_fetched_by || null);
      } catch (err: any) {
        setMlsDataError('Failed to load MLS data');
      } finally {
        setMlsDataLoading(false);
      }
    };
    loadMlsData();
  }, [showMlsData, deal.id]);

  const runMlsSearch = async () => {
    setMlsRerunning(true);
    setMlsDataError(null);
    try {
      const address = deal.propertyAddress || '';
      const city = deal.city || '';
      const state = deal.state || '';
      const zipCode = deal.zipCode || '';
      const secondaryAddress = (deal as any).secondaryAddress || (deal as any).secondary_address || '';

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-mls-number`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ address, city, state, zipCode, ...(secondaryAddress ? { secondaryAddress } : {}) }),
      });
      const result = await res.json();

      if (result.found && result.data) {
        const now = new Date().toISOString();
        const fetchedBy = profile?.name || 'TC Staff';
        // Save to DB
        await supabase.from('deals').update({
          mls_data: result.data,
          mls_data_fetched_at: now,
          mls_data_fetched_by: fetchedBy,
        }).eq('id', deal.id);
        setMlsData(result.data);
        setMlsDataFetchedAt(now);
        setMlsDataFetchedBy(fetchedBy);
      } else {
        setMlsDataError('No active listing found for this property.');
      }
    } catch (err: any) {
      setMlsDataError('Search failed. Please try again.');
    } finally {
      setMlsRerunning(false);
      setShowMlsRerunConfirm(false);
      setMlsRerunFirstName('');
    }
  };
  const pendingDocs = pendingDocCount(deal.documentRequests);
  const overdueTasks = (deal.tasks ?? []).filter(t => !t.completedAt && t.dueDate < new Date().toISOString().slice(0, 10)).length;

  const representation = getRepresentation(deal);

  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'overview',   label: 'Overview',   icon: <LayoutDashboard size={13} /> },
    { id: 'checklists', label: 'Checklists', icon: <CheckSquare size={13} /> },
    { id: 'tasks',      label: 'Tasks',      icon: <ListChecks size={13} />, badge: overdueTasks > 0 ? overdueTasks : undefined },
    { id: 'contacts',   label: 'Contacts',   icon: <Users size={13} /> },
    { id: 'documents',  label: 'Documents',  icon: <AlertTriangle size={13} />, badge: pendingDocs },
    { id: 'requests',   label: 'Requests',   icon: <ClipboardList size={13} />, badge: activeRequestCount > 0 ? activeRequestCount : undefined },
    { id: 'activity',   label: 'Activity',   icon: <Clock size={13} /> },
    { id: 'email',      label: 'Email',      icon: <FileText size={13} /> },
    { id: 'timeline',   label: 'Timeline',   icon: <GitBranch size={13} /> },
    { id: 'ai-chat',    label: 'AI Chat',    icon: <MessageCircle size={13} /> },
    { id: 'comms',      label: 'Comms',      icon: <Phone size={13} /> },
    { id: 'ai-emails',  label: 'AI Emails',  icon: <Sparkles size={13} />, badge: emailStats.total > 0 ? emailStats.total : undefined },
    { id: 'linked-emails', label: 'Emails', icon: <Inbox size={13} />, badge: linkedEmailUnread > 0 ? linkedEmailUnread : undefined },
    // Amendments & Addenda are handled inside the Documents tab
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
          <div className="flex flex-col items-end gap-1.5 flex-none mt-0.5">
          <div className="flex items-center gap-2">
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
            <button
              onClick={() => setShowMlsData(true)}
              title="MLS Property Data"
              className="btn btn-sm btn-ghost gap-1.5 border border-gray-300 text-black hover:bg-gray-100"
            >
              <Database size={13} />
              <span className="hidden sm:inline text-xs">MLS Data</span>
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
          </div>{/* end buttons row */}

          {/* ── Contract & Closing dates under buttons ── */}
          {(deal.contractDate || deal.closingDate) && <DealHeaderDates contractDate={deal.contractDate} closingDate={deal.closingDate} />}
          </div>{/* end right col flex-col */}
        </div>
      </div>

      {/* Transaction Sheet Modal */}
      {showSheet && <TransactionSheet deal={deal} onClose={() => setShowSheet(false)} />}

      {/* Focus View Modal */}
      {showFocusView && <FocusViewModal deal={deal} onClose={() => setShowFocusView(false)} />}

      {/* MLS Data Panel */}
      {showMlsData && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
          <div className="bg-base-100 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-base-300 flex-none">
              <div className="flex items-center gap-2">
                <Database size={16} className="text-primary" />
                <span className="font-bold text-base-content">MLS Property Data</span>
              </div>
              <button onClick={() => { setShowMlsData(false); setShowMlsRerunConfirm(false); setMlsRerunFirstName(''); }} className="btn btn-ghost btn-xs btn-circle">
                <XIcon size={14} />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

              {/* Disclaimer */}
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
                <span className="mt-0.5 flex-none">⚠️</span>
                <span>This information is sourced from public MLS listings and may not be accurate or up to date. Always verify with official sources before use.</span>
              </div>

              {/* Loading */}
              {mlsDataLoading && (
                <div className="flex items-center justify-center py-8 gap-2 text-base-content/40">
                  <span className="loading loading-spinner loading-sm" />
                  <span className="text-sm">Loading MLS data...</span>
                </div>
              )}

              {/* Error */}
              {!mlsDataLoading && mlsDataError && (
                <div className="px-4 py-3 rounded-lg bg-error/10 border border-error/20 text-sm text-error">
                  {mlsDataError}
                </div>
              )}

              {/* Data Card */}
              {!mlsDataLoading && !mlsDataError && mlsData && (
                <div className="rounded-xl border border-info/30 bg-info/5 p-4 space-y-3">
                  {/* Status + Type */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {mlsData.listingStatus && (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        mlsData.listingStatus === 'Active' ? 'bg-green-100 text-green-700' :
                        mlsData.listingStatus === 'Pending' ? 'bg-amber-100 text-amber-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>{mlsData.listingStatus}</span>
                    )}
                    {mlsData.propertyType && <span className="text-sm font-semibold text-base-content">{mlsData.propertyType}</span>}
                    {mlsData.daysOnMarket != null && <span className="text-xs text-base-content/50 ml-auto">DOM: {mlsData.daysOnMarket} days</span>}
                  </div>
                  {mlsData.mlsNumber && (
                    <div className="text-xs text-base-content/50">MLS #: <span className="font-mono font-semibold text-base-content">{mlsData.mlsNumber}</span></div>
                  )}
                  {mlsData.listPrice != null && (
                    <div className="text-xl font-bold text-base-content">${mlsData.listPrice.toLocaleString()}</div>
                  )}
                  <div className="flex flex-wrap gap-3 text-sm text-base-content/70">
                    {mlsData.bedrooms != null && <span><span className="font-semibold text-base-content">{mlsData.bedrooms}</span> bed</span>}
                    {mlsData.bathrooms != null && <span><span className="font-semibold text-base-content">{mlsData.bathrooms}</span> bath</span>}
                    {mlsData.sqftLiving != null && <span><span className="font-semibold text-base-content">{mlsData.sqftLiving.toLocaleString()}</span> sqft</span>}
                    {mlsData.yearBuilt != null && <span>Built <span className="font-semibold text-base-content">{mlsData.yearBuilt}</span></span>}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-base-content/60">
                    {mlsData.subdivision && <span>📍 {mlsData.subdivision}</span>}
                    {mlsData.hoaFee != null && <span>HOA: ${mlsData.hoaFee}/mo</span>}
                    {mlsData.garage && <span>🚗 {mlsData.garage}</span>}
                    {mlsData.pool === true && <span>🏊 Pool</span>}
                  </div>
                  {(mlsData.listingAgentName || mlsData.listingOfficeName) && (
                    <div className="pt-2 border-t border-info/20 text-xs text-base-content/50">
                      {mlsData.listingAgentName && <span>Agent: <span className="text-base-content/70 font-medium">{mlsData.listingAgentName}</span></span>}
                      {mlsData.listingAgentName && mlsData.listingOfficeName && <span className="mx-2">·</span>}
                      {mlsData.listingOfficeName && <span>Office: <span className="text-base-content/70 font-medium">{mlsData.listingOfficeName}</span></span>}
                    </div>
                  )}
                </div>
              )}

              {/* Empty state */}
              {!mlsDataLoading && !mlsDataError && !mlsData && (
                <div className="text-center py-6 text-sm text-base-content/40 italic">
                  No MLS data fetched yet for this deal.
                </div>
              )}

              {/* Fetched at / by */}
              {mlsDataFetchedAt && (
                <div className="text-xs text-base-content/40 text-center">
                  Last fetched {new Date(mlsDataFetchedAt).toLocaleString()}{mlsDataFetchedBy ? ` by ${mlsDataFetchedBy}` : ''}
                </div>
              )}

              {/* Re-run Confirmation */}
              {showMlsRerunConfirm ? (
                <div className="rounded-xl border border-warning/40 bg-warning/5 p-4 space-y-3">
                  <p className="text-sm font-semibold text-base-content">Confirm Re-run MLS Search</p>
                  <p className="text-xs text-base-content/60">This will overwrite existing MLS data for this deal.</p>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-base-content/50">Staff:</span>
                    <span className="font-medium text-base-content">{profile?.name || 'Unknown'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-base-content/50">Type your first name to confirm</label>
                    <input
                      type="text"
                      value={mlsRerunFirstName}
                      onChange={e => setMlsRerunFirstName(e.target.value)}
                      placeholder="First name"
                      className="input input-bordered input-sm w-full"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowMlsRerunConfirm(false); setMlsRerunFirstName(''); }}
                      className="btn btn-sm btn-ghost flex-1"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={runMlsSearch}
                      disabled={
                        mlsRerunning ||
                        mlsRerunFirstName.trim().toLowerCase() !== (profile?.name || '').split(' ')[0].toLowerCase()
                      }
                      className="btn btn-sm btn-warning flex-1"
                    >
                      {mlsRerunning ? <span className="loading loading-spinner loading-xs" /> : <RotateCcw size={13} />}
                      {mlsRerunning ? 'Searching...' : 'Confirm Re-run'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowMlsRerunConfirm(true)}
                  className="btn btn-sm btn-ghost gap-1.5 w-full border border-base-300"
                >
                  <RotateCcw size={13} />
                  {mlsData ? 'Re-run MLS Search' : 'Run MLS Search'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab Bar */}
      <div className="flex-none border-b border-base-300 bg-base-200 flex items-center overflow-x-auto scrollbar-none">
        {/* Tabs */}
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
      <div className={`flex-1 min-h-0 flex flex-col ${tab === 'email' || tab === 'ai-emails' || tab === 'ai-chat' || tab === 'comms' ? 'overflow-hidden' : 'overflow-y-auto'}`}>

        {tab === 'overview'   && <WorkspaceOverview deal={deal} onUpdate={onUpdate} contactRecords={contactRecords} onGoToContacts={() => setTab('contacts')} onGoToEmails={() => setTab('ai-emails')} editTrigger={editTrigger} allDeals={deals} onCallStarted={onCallStarted} />}
        {tab === 'checklists' && <WorkspaceChecklists deal={deal} onUpdate={onUpdate} users={users} contactRecords={contactRecords} complianceTemplates={complianceTemplates} />}
        {tab === 'tasks'      && <WorkspaceTasks deal={deal} onUpdate={onUpdate} users={users} onSendRequest={(taskId, requestType) => { setInternalTaskId(taskId); setInternalRequestType(requestType); setTab('requests'); }} />}
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
        {tab === 'requests'   && <WorkspaceRequests deal={deal} autoOpenType={(internalRequestType || initialRequestType) as any} taskId={internalTaskId || undefined} />}
        {tab === 'amendments' && <WorkspaceAmendments deal={deal} onUpdate={onUpdate} />}
        {tab === 'access' && <DealAccessPanel deal={deal} />}
        {tab === 'linked-emails' && (
          <WorkspaceLinkedEmails
            deal={deal}
            onUnreadCount={setLinkedEmailUnread}
          />
        )}
      </div>
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
              <Button variant="ghost" onClick={() => setWsArchiveOpen(false)}>Cancel</Button>
              <Button variant="error" onClick={() => { onArchiveDeal?.(deal.id, wsArchiveReason); setWsArchiveOpen(false); }}>Archive</Button>
            </div>
          </div>
        </div>
      )}

      {/* Page ID badge — bottom-right, for quick reference & bug reporting */}
      <PageIdBadge pageId="deal-workspace" context={`${deal.id} · tab:${tab}`} />
    </div>
  );
};
