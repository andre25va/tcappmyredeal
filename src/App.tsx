import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Eye } from 'lucide-react';

import { Deal, DealStatus, DealMilestone, ContactRecord, MlsEntry, ComplianceTemplate, AppUser, EmailTemplate, ComplianceMasterItem, DDMasterItem } from './types';
import {
  loadDeals, saveDeals, saveSingleDeal,
  loadContactsFull,
  loadMls, saveMls,
  loadCompliance, saveCompliance,
  loadUsers, saveUsers,
  loadEmailTemplates, saveEmailTemplates,
  loadMasterItems, saveMasterItems,
} from './utils/supabaseDb';
import { generateId } from './utils/helpers';
import { Sidebar, MobileMenuButton, View } from './components/Sidebar';
import { DealList } from './components/DealList';
import { AgentCardView } from './components/AgentCardView';
import { ByTaskView } from './components/ByTaskView';
import { DealWorkspace } from './components/DealWorkspace';
import { GuidedDealWizard } from './components/GuidedDealWizard';
import { HomeDashboard } from './components/HomeDashboard';
import { ContactsDirectory } from './components/ContactsDirectory';
import { MLSDirectory } from './components/MLSDirectory';
import { ComplianceManager } from './components/ComplianceManager';
import { SettingsView } from './components/SettingsView';
import { Topbar } from './components/Topbar';
import { AIChat } from './components/AIChat';
import { ActiveCallOverlay } from './components/ActiveCallOverlay';
import { Inbox } from './components/Inbox';
import { CommTasksView } from './components/CommTasksView';
import { CommunicationsConsole } from './components/CommunicationsConsole';
import { AIReports } from './components/AIReports';
import { LoginPage } from './components/LoginPage';
import { ProfileSetupModal } from './components/ProfileSetupModal';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useAudit } from './hooks/useAudit';
import { supabase } from './lib/supabase';
import { NotificationBell } from './components/NotificationBell';
import { EmailReviewQueueView } from './components/EmailReviewQueueView';
import { RequestCenterView } from './components/RequestCenterView';
import { PageIdBadge } from './components/PageIdBadge';
import { PAGE_IDS } from './utils/pageTracking';
import { Button } from './components/ui/Button';

// View → Page ID mapping for the floating badge
const VIEW_PAGE_IDS: Record<string, string> = {
  dashboard:       PAGE_IDS.HOME_DASHBOARD,
  contacts:        PAGE_IDS.CONTACTS,
  mls:             PAGE_IDS.MLS_DIRECTORY,
  compliance:      PAGE_IDS.COMPLIANCE,
  inbox:           PAGE_IDS.INBOX,
  'email-review':  PAGE_IDS.EMAIL_REVIEW,
  tasks:           PAGE_IDS.COMM_TASKS,
  voice:           PAGE_IDS.VOICE,
  reports:         PAGE_IDS.AI_REPORTS,
  requests:        PAGE_IDS.REQUESTS,
  settings:        PAGE_IDS.SETTINGS,
  transactions:    PAGE_IDS.TRANSACTIONS_LIST,
};

// One-time localStorage wipe so old cached data never overrides Supabase
const LS_CLEARED_KEY = 'tc-supabase-v2-cleared';
if (!sessionStorage.getItem(LS_CLEARED_KEY)) {
  const savedSession = localStorage.getItem('tc_session');
  localStorage.clear();
  if (savedSession) localStorage.setItem('tc_session', savedSession);
  sessionStorage.setItem(LS_CLEARED_KEY, '1');
}

function AppInner() {
  const { profile, loading: authLoading, isFirstLogin, logout, primaryOrgId } = useAuth();
  const { logAction } = useAudit();

  // ── ALL useState/useEffect hooks must be declared before any conditional returns ──
  const [view, setView]                     = useState<View>('dashboard');
  const [listMode, setListMode]             = useState<'deals' | 'agents' | 'tasks'>('agents');
  const [mobileOpen, setMobileOpen]         = useState(false);

  const [deals, setDeals]                   = useState<Deal[]>([]);
  const [selectedId, setSelectedId]         = useState<string | null>(null);
  const [txPanel, setTxPanel]               = useState<'list' | 'workspace'>('list');
  const [txContainerWide, setTxContainerWide] = useState(false);
  const txContainerRef                      = useRef<HTMLDivElement>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState<number>(() => {
    try { return parseInt(localStorage.getItem('tc-panel-width') || '360') || 360; } catch { return 360; }
  });
  const lastWidthRef = useRef<number>(360);
  const [showAdd, setShowAdd]               = useState(false);
  const [loading, setLoading]               = useState(true);
  const [loadError, setLoadError]           = useState<string | null>(null);
  const [amberFilter, setAmberFilter]       = useState(false);
  const [quickAddRole, setQuickAddRole]     = useState<'agent' | 'contact' | null>(null);
  const [inboxUnread, setInboxUnread]       = useState(0);
  const [tasksPending, setTasksPending]     = useState(0);
  const [voicePending, setVoicePending]     = useState(0);
  const [emailQueuePending, setEmailQueuePending] = useState(0);
  const [needsReviewCount, setNeedsReviewCount]   = useState(0);
  const [unmatchedCount, setUnmatchedCount]        = useState(0);
  const [inboxInitEmailSubTab, setInboxInitEmailSubTab] = useState<'all' | 'linked' | 'needs_review' | 'unmatched' | undefined>(undefined);
  const [activeCall, setActiveCall]         = useState<{contactName:string;contactPhone:string;contactId?:string;dealId?:string;callSid?:string;startedAt:string} | null>(null);
  const [isCallMinimized, setIsCallMinimized] = useState(false);

  const [inboxInitConvId, setInboxInitConvId] = useState<string | undefined>(undefined);
  const [inboxInitChannel, setInboxInitChannel] = useState<'sms' | 'email' | 'whatsapp' | undefined>(undefined);

  const [contactRecords, setContactRecords]     = useState<ContactRecord[]>([]);
  const [mlsEntries, setMlsEntries]             = useState<MlsEntry[]>([]);
  const [complianceTemplates, setComplianceTemplates] = useState<ComplianceTemplate[]>([]);
  const [users, setUsers]                       = useState<AppUser[]>([]);
  const [emailTemplates, setEmailTemplates]     = useState<EmailTemplate[]>([]);
  const [complianceMasterItems, setComplianceMasterItems] = useState<ComplianceMasterItem[]>([]);
  const [ddMasterItems, setDdMasterItems]               = useState<DDMasterItem[]>([]);
  const [requestsPending, setRequestsPending] = useState(0);
  const [pendingWorkspaceTab, setPendingWorkspaceTab] = useState<string | null>(null);

  // ── Load deals ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    const init = async () => {
      try {
        const data = await loadDeals(primaryOrgId() ?? undefined);
        setDeals(data);
        const isMobile = window.innerWidth < 768;
        if (!isMobile && data.length > 0) setSelectedId(data[0].id);
      } catch (err) {
        console.error('Failed to load deals:', err);
        setLoadError('Unable to connect to database. Please check your connection and refresh.');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [profile]);

  // Track actual width of transactions container for split-panel logic
  useEffect(() => {
    const el = txContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0;
      setTxContainerWide(w >= 640);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  // ── Load contact records ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    loadContactsFull()
      .then(data => setContactRecords(data))
      .catch(err => { console.error('Failed to load contacts:', err); setContactRecords([]); });
  }, [profile]);

  // ── Load MLS ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    loadMls()
      .then(data => setMlsEntries(data))
      .catch(err => { console.error('Failed to load MLS:', err); setMlsEntries([]); });
  }, [profile]);

  // ── Load compliance templates ─────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    loadCompliance()
      .then(data => setComplianceTemplates(data))
      .catch(err => { console.error('Failed to load compliance:', err); setComplianceTemplates([]); });
  }, [profile]);

  // ── Load users ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    loadUsers()
      .then(data => setUsers(data))
      .catch(err => { console.error('Failed to load users:', err); setUsers([]); });
  }, [profile]);

  // ── Load email templates ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    loadEmailTemplates()
      .then(data => setEmailTemplates(data))
      .catch(err => { console.error('Failed to load email templates:', err); setEmailTemplates([]); });
  }, [profile]);

  // ── Load compliance master items ─────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    loadMasterItems('compliance')
      .then(data => setComplianceMasterItems(data as ComplianceMasterItem[]))
      .catch(err => { console.error('Failed to load compliance master:', err); setComplianceMasterItems([]); });
  }, [profile]);

  // ── Load DD master items ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    loadMasterItems('dd')
      .then(data => setDdMasterItems(data as DDMasterItem[]))
      .catch(err => { console.error('Failed to load DD master:', err); setDdMasterItems([]); });
  }, [profile]);

  // ── Poll inbox unread count ──────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    const fetchUnread = async () => {
      try {
        const resp = await fetch('/api/sms/conversations');
        if (resp.ok) {
          const data = await resp.json();
          const total = (data.conversations || []).reduce((a: number, c: any) => a + (c.unread_count || 0), 0);
          setInboxUnread(total);
        }
      } catch { /* silent */ }
    };
    fetchUnread();
    const t = setInterval(fetchUnread, 60000);
    return () => clearInterval(t);
  }, [profile]);

  // ── Poll comm tasks pending count ────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    const fetchTaskCount = async () => {
      try {
        const { count } = await supabase
          .from('comm_tasks')
          .select('id', { count: 'exact', head: true })
          .neq('status', 'done');
        setTasksPending(count || 0);
      } catch { /* silent */ }
    };
    fetchTaskCount();
    const t = setInterval(fetchTaskCount, 60000);
    return () => clearInterval(t);
  }, [profile]);

  // ── Poll voice pending count ─────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    const fetchVoiceCount = async () => {
      try {
        const [vuRes, cbRes, crRes] = await Promise.all([
          supabase.from('voice_deal_updates').select('id', { count: 'exact', head: true }).eq('review_status', 'pending'),
          supabase.from('callback_requests').select('id', { count: 'exact', head: true }).eq('status', 'open'),
          supabase.from('change_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
        ]);
        setVoicePending((vuRes.count || 0) + (cbRes.count || 0) + (crRes.count || 0));
      } catch { /* silent */ }
    };
    fetchVoiceCount();
    const t = setInterval(fetchVoiceCount, 60000);
    return () => clearInterval(t);
  }, [profile]);

  // ── Poll email review queue pending count ────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    const fetchQueueCount = async () => {
      try {
        const { count } = await supabase
          .from('email_review_queue')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending');
        setEmailQueuePending(count || 0);
      } catch { /* silent */ }
    };
    fetchQueueCount();
    const t = setInterval(fetchQueueCount, 60000);
    return () => clearInterval(t);
  }, [profile]);

  // ── Poll requests pending count ──────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    const fetchRequestCount = async () => {
      try {
        const { count } = await supabase
          .from('requests')
          .select('id', { count: 'exact', head: true })
          .in('status', ['reply_received', 'document_received', 'under_review']);
        setRequestsPending(count || 0);
      } catch { /* silent */ }
    };
    fetchRequestCount();
    const t = setInterval(fetchRequestCount, 60000);
    return () => clearInterval(t);
  }, [profile]);

  // ── Keep selectedId valid ────────────────────────────────────────────────────
  useEffect(() => {
    const activeDeals = deals.filter(d => d.milestone !== 'archived');
    if (activeDeals.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    const stillActive = selectedId && activeDeals.some((deal) => deal.id === selectedId);
    if (!stillActive) {
      // Don't auto-select — let user pick from the list
      setSelectedId(null);
    }
  }, [deals, selectedId]);

  const storageMode = useMemo(() => 'Supabase Cloud Database', []);

  // ── NOW it's safe to do conditional returns ──────────────────────────────────
  if (authLoading) {
    return (
      <div data-theme="light" className="flex flex-col items-center justify-center h-screen bg-base-100 gap-3">
        <span className="loading loading-spinner loading-lg text-primary" />
        <p className="text-sm text-base-content/50">Loading TC Command...</p>
      </div>
    );
  }

  if (!profile) return <LoginPage />;

  // ── Persist helpers ──────────────────────────────────────────────────────────
  const persistMls = (updated: MlsEntry[]) => {
    setMlsEntries(updated);
    saveMls(updated).catch(console.error);
  };

  const persistCompliance = (updated: ComplianceTemplate[]) => {
    setComplianceTemplates(updated);
    saveCompliance(updated).catch(console.error);
  };

  const persistUsers = (updated: AppUser[]) => {
    setUsers(updated);
    saveUsers(updated).catch(console.error);
  };

  const persistEmailTemplates = async (updated: EmailTemplate[]) => {
    setEmailTemplates(updated);
    saveEmailTemplates(updated).catch(console.error);
  };

  const persistComplianceMasterItems = (updated: ComplianceMasterItem[]) => {
    setComplianceMasterItems(updated);
    saveMasterItems('compliance', updated).catch(console.error);
  };

  const persistDdMasterItems = (updated: DDMasterItem[]) => {
    setDdMasterItems(updated);
    saveMasterItems('dd', updated).catch(console.error);
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    const startX = e.clientX;
    const startW = leftPanelWidth;
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(260, Math.min(640, startW + (ev.clientX - startX)));
      lastWidthRef.current = w;
      setLeftPanelWidth(w);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      localStorage.setItem('tc-panel-width', String(lastWidthRef.current));
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
  };

  const handleCallStarted = (cd: {contactName:string;contactPhone:string;contactId?:string;dealId?:string;callSid?:string;startedAt:string}) => {
    setActiveCall(cd);
    setIsCallMinimized(false);
  };

  // ── Agent name cascade ─────────────────────────────────────────────────────
  const handleContactUpdated = (contactId: string, fullName: string, phone: string, email: string) => {
    setDeals(prev => {
      const updated = prev.map(deal => {
        if (deal.agentId !== contactId) return deal;
        const updatedDeal: Deal = {
          ...deal,
          agentName: fullName,
          buyerAgent: deal.buyerAgent ? { ...deal.buyerAgent, name: fullName, phone, email } : deal.buyerAgent,
          sellerAgent: deal.sellerAgent ? { ...deal.sellerAgent, name: fullName, phone, email } : deal.sellerAgent,
        };
        saveSingleDeal(updatedDeal).catch(console.error);
        return updatedDeal;
      });
      return updated;
    });
  };

  const handleArchiveDeal = (dealId: string, reason: string) => {
    const deal = deals.find(d => d.id === dealId);
    if (!deal) return;
    const updated = { ...deal, milestone: 'archived' as DealMilestone, archiveReason: reason };
    setDeals(prev => prev.map(d => d.id === dealId ? updated : d));
    saveSingleDeal(updated).catch(console.error);
    // Deselect the deal so the workspace doesn't keep showing an archived deal
    if (selectedId === dealId) {
      setSelectedId(null);
      setTxPanel('list');
    }
  };

  const handleRestoreDeal = (dealId: string) => {
    const deal = deals.find(d => d.id === dealId);
    if (!deal) return;
    const updated = { ...deal, milestone: 'contract-received' as DealMilestone, archiveReason: undefined };
    setDeals(prev => prev.map(d => d.id === dealId ? updated : d));
    saveSingleDeal(updated).catch(console.error);
  };

  const handleChangeStatus = (dealId: string, status: DealStatus) => {
    const deal = deals.find(d => d.id === dealId);
    if (!deal) return;
    const updated = { ...deal, status };
    setDeals(prev => prev.map(d => d.id === dealId ? updated : d));
    saveSingleDeal(updated).catch(console.error);
  };

  const handleUpdate = (deal: Deal) => {
    setDeals(prev => prev.map(d => d.id === deal.id ? deal : d));
    saveSingleDeal(deal, profile?.id).catch(console.error);
    logAction('update', 'deal', deal.id, deal.propertyAddress);
  };

  const handleAdd = async (deal: Deal) => {
    setDeals(prev => [deal, ...prev]);
    try {
      await saveSingleDeal(deal, profile?.id);
      setSelectedId(deal.id);
      setTxPanel('workspace');
      setShowAdd(false);
      setView('transactions');
      logAction('create', 'deal', deal.id, deal.propertyAddress);
    } catch (err: any) {
      // Remove from UI if save failed
      setDeals(prev => prev.filter(d => d.id !== deal.id));
      alert('❌ Failed to create deal:\n\n' + (err.message || JSON.stringify(err)));
      console.error('[App.tsx] saveSingleDeal error:', err);
    }
  };

  const handleSelectDeal = (id: string) => {
    setPendingWorkspaceTab(null);
    setSelectedId(id);
    setTxPanel('workspace');
    setView('transactions');
  };

  const handleSelectDealWithTab = (id: string, tab: string) => {
    setPendingWorkspaceTab(tab);
    setSelectedId(id);
  };

  const handleSetView = (v: View) => {
    logAction('navigate', undefined, undefined, v);
    if (v === 'transactions') { setSelectedId(null); setTxPanel('list'); }
    setView(v);
  };

  const handleNotificationNavigate = (navView: string, id?: string) => {
    if (navView === 'inbox' && id) {
      setInboxInitConvId(id);
      setInboxInitChannel(undefined);
      setView('inbox');
    } else if (navView === 'inbox-email') {
      setInboxInitConvId(undefined);
      setInboxInitChannel('email');
      setView('inbox');
    } else if (navView === 'inbox') {
      setInboxInitConvId(undefined);
      setInboxInitChannel(undefined);
      setView('inbox');
    } else if (navView === 'transactions' && id) {
      handleSelectDeal(id);
    } else {
      setView(navView as View);
    }
  };

  const selected = deals.find(d => d.id === selectedId) ?? null;

  const totalPending = deals.reduce((a, d) =>
    a + d.documentRequests.filter(r => r.status === 'pending').length, 0);

  if (loading) {
    return (
      <div data-theme="light" className="flex flex-col items-center justify-center h-screen bg-base-100 gap-3">
        <span className="loading loading-spinner loading-lg text-primary" />
        <p className="text-sm text-base-content/50">Loading from Supabase...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div data-theme="light" className="flex flex-col items-center justify-center h-screen bg-base-100 gap-4 p-8">
        <span className="text-5xl">⚠️</span>
        <h2 className="text-xl font-bold text-base-content">Database Connection Error</h2>
        <p className="text-sm text-base-content/60 text-center max-w-sm">{loadError}</p>
        <Button variant="primary" size="md" onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  // ── Sidebar props — TypeScript will error at build time if any required prop is missing ──
  const sidebarProps = {
    view,
    onSetView: handleSetView,
    mobileOpen,
    onCloseMobile: () => setMobileOpen(false),
    inboxUnread,
    tasksPending,
    voicePending,
    emailQueuePending,
    needsReviewCount,
    unmatchedCount,
    requestsPending,
    onSetInboxSubTab: (subTab: 'needs_review' | 'unmatched') => {
      setInboxInitEmailSubTab(subTab);
      setView('inbox');
    },
    onLogout: logout,
    userName: profile.name,
    userRole: profile.role,
    userInitials: profile.initials,
  };

  // ── Derived contact lists for wizard ─────────────────────────────────────────
  const agentClients  = contactRecords.filter(c => c.isClient === true);
  const agentContacts = contactRecords.filter(c => c.contactType === 'agent');

  const isViewer = profile?.role === 'viewer';

  return (
    <div data-theme="light" className="h-screen flex bg-base-100 overflow-hidden">
      {isFirstLogin && <ProfileSetupModal />}

      <Sidebar {...sidebarProps} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Demo Mode Banner */}
        {isViewer && (
          <div className="w-full bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between text-xs text-amber-800 z-50 flex-none">
            <div className="flex items-center gap-2">
              <Eye size={13} />
              <span><strong>Demo Mode</strong> · Read-only access · Session expires in 24 hours</span>
            </div>
            <span className="text-amber-500">TC Command Demo</span>
          </div>
        )}

        <div className="hidden md:flex items-center flex-none">
          <div className="flex-1">
            <Topbar
              onAddDeal={() => { if (isViewer) return; setShowAdd(true); }}
              onAddAgentClient={() => { setQuickAddRole('agent'); setView('contacts'); }}
              onAddContact={() => { setQuickAddRole('contact'); setView('contacts'); }}
              dealCount={deals.filter(d => d.milestone !== 'archived').length}
              pendingAlerts={totalPending}
              onSelectDeal={handleSelectDeal}
              onSetView={(v) => setView(v as any)}
            />
          </div>
          <div className="pr-3">
            <NotificationBell onNavigate={handleNotificationNavigate} />
          </div>
        </div>
        <div className="flex md:hidden flex-none shrink-0 bg-base-100 border-b border-base-300 mobile-header-safe">
          <div className="flex items-center h-14 px-3 gap-2 w-full">
            <MobileMenuButton onClick={() => setMobileOpen(true)} pendingAlerts={totalPending} />
            <span className="font-bold text-sm text-base-content flex-1">
              {view === 'dashboard' ? 'Dashboard' : view === 'transactions' ? 'Transactions' : view === 'contacts' ? 'Contacts' : view === 'mls' ? 'MLS' : view === 'compliance' ? 'Compliance' : view === 'inbox' ? 'Inbox' : view === 'email-review' ? 'Email Queue' : view === 'tasks' ? 'Comm Tasks' : view === 'voice' ? 'Voice' : view === 'reports' ? 'AI Reports' : view === 'requests' ? 'Requests' : 'Settings'}
            </span>
            <NotificationBell onNavigate={handleNotificationNavigate} />
            {!isViewer && (
              <button onClick={() => setShowAdd(true)} className="btn btn-primary btn-xs gap-1">
                + New Deal
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {view === 'dashboard' && (
            <div className="flex-1 overflow-auto">
              <HomeDashboard
                deals={deals}
                onSelectDeal={handleSelectDeal}
                onGoToDeals={() => { setAmberFilter(false); setSelectedId(null); setTxPanel('list'); setView('transactions'); }}
                onGoToAlerts={() => { setAmberFilter(true); setSelectedId(null); setTxPanel('list'); setView('transactions'); }}
              />
            </div>
          )}

          {view === 'transactions' && (
            <div ref={txContainerRef} className="flex flex-1 min-w-0 min-h-0 overflow-hidden">
              {(txContainerWide || txPanel === 'list') && (
                <div
                  className={txContainerWide ? 'flex-none' : 'flex-1'}
                  style={txContainerWide
                    ? { width: leftPanelWidth, minWidth: 260, display: 'flex', flexDirection: 'column' }
                    : { display: 'flex', flexDirection: 'column' }}
                >
                  {/* View mode toggle */}
                  <div className="flex items-center gap-0 bg-white border-b border-base-300 shrink-0">
                    <button
                      className={`flex-1 py-2 text-xs font-bold tracking-wide transition-all ${listMode === 'deals' ? 'text-primary border-b-2 border-primary' : 'text-base-content/40 hover:text-base-content hover:bg-base-100'}`}
                      onClick={() => { setListMode('deals'); setSelectedId(null); }}
                    >
                      By Deal
                    </button>
                    <button
                      className={`flex-1 py-2 text-xs font-bold tracking-wide transition-all ${listMode === 'agents' ? 'text-primary border-b-2 border-primary' : 'text-base-content/40 hover:text-base-content hover:bg-base-100'}`}
                      onClick={() => { setListMode('agents'); setSelectedId(null); }}
                    >
                      By Agent
                    </button>
                    <button
                      className={`flex-1 py-2 text-xs font-bold tracking-wide transition-all ${listMode === 'tasks' ? 'text-primary border-b-2 border-primary' : 'text-base-content/40 hover:text-base-content hover:bg-base-100'}`}
                      onClick={() => { setListMode('tasks'); setSelectedId(null); }}
                    >
                      By Task
                    </button>
                  </div>
                  {listMode === 'deals' ? (
                    <DealList
                      deals={deals}
                      selectedId={selectedId}
                      onSelect={(id) => { setSelectedId(id); setTxPanel('workspace'); }}
                      amberFilter={amberFilter}
                      onClearAmberFilter={() => setAmberFilter(false)}
                      contactRecords={contactRecords}
                      onArchiveDeal={handleArchiveDeal}
                      onRestoreDeal={handleRestoreDeal}
                      onChangeStatus={handleChangeStatus}
                    />
                  ) : listMode === 'agents' ? (
                    <AgentCardView
                      deals={deals}
                      selectedId={selectedId}
                      onSelectDeal={(id) => { setSelectedId(id); setTxPanel('workspace'); }}
                      onArchiveDeal={handleArchiveDeal}
                      onRestoreDeal={handleRestoreDeal}
                      onChangeStatus={handleChangeStatus}
                    />
                  ) : (
                    <ByTaskView
                      deals={deals}
                      onSelectDeal={(id) => {
                        setSelectedId(id);
                        setTxPanel('workspace');
                        setPendingWorkspaceTab('tasks');
                      }}
                    />
                  )}
                </div>
              )}

              {txContainerWide && (
                <div
                  className="w-1 flex-none bg-base-200 hover:bg-primary/40 active:bg-primary/60 transition-colors cursor-col-resize select-none relative group"
                  onMouseDown={handleResizeStart}
                  title="Drag to resize"
                >
                  <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-primary/10" />
                </div>
              )}

              {(txContainerWide || txPanel === 'workspace') && (
                <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
                  {!txContainerWide && (
                    <button
                      className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-base-200 border-b border-base-300 hover:bg-base-300 text-base-content"
                      onClick={() => { setSelectedId(null); setTxPanel('list'); }}
                    >
                      ← Back to Deals
                    </button>
                  )}
                  <div className="flex-1 min-h-0 overflow-hidden">
                    {selected
                      ? <DealWorkspace deal={selected} onUpdate={handleUpdate} contactRecords={contactRecords} users={users} emailTemplates={emailTemplates} complianceTemplates={complianceTemplates} deals={deals} onCallStarted={handleCallStarted} onArchiveDeal={handleArchiveDeal} onRestoreDeal={handleRestoreDeal} onChangeStatus={handleChangeStatus} initialTab={(pendingWorkspaceTab ?? undefined) as any} />
                      : (
                        <div className="flex flex-col items-center justify-center h-full text-base-content/30 gap-3">
                          <span className="text-5xl">📋</span>
                          <p className="text-sm">Select a deal from the list</p>
                        </div>
                      )
                    }
                  </div>
                </div>
              )}
            </div>
          )}

          {view === 'contacts' && (
            <div className="flex-1 overflow-auto">
              <ContactsDirectory
                triggerAdd={quickAddRole}
                onTriggerHandled={() => setQuickAddRole(null)}
                onDirectoryChanged={() => {
                  loadContactsFull().then(data => setContactRecords(data)).catch(console.error);
                }}
                onContactUpdated={handleContactUpdated}
              />
            </div>
          )}

          {view === 'mls' && (
            <div className="flex-1 overflow-auto">
              <MLSDirectory mls={mlsEntries} onUpdate={persistMls} />
            </div>
          )}

          {view === 'compliance' && (
            <div className="flex-1 overflow-hidden">
              <ComplianceManager
                templates={complianceTemplates}
                onSave={persistCompliance}
                agentClients={agentClients}
                deals={deals.map(d => ({ agentClientId: d.agentClientId }))}
                masterItems={complianceMasterItems}
              />
            </div>
          )}

          {view === 'inbox' && (
            <div className="flex-1 overflow-hidden">
              <Inbox
                onSelectDeal={handleSelectDeal}
                initialConversationId={inboxInitConvId}
                initialChannel={inboxInitChannel}
                initialEmailSubTab={inboxInitEmailSubTab}
                onEmailSubTabCounts={({ needsReview, unmatched }) => {
                  setNeedsReviewCount(needsReview);
                  setUnmatchedCount(unmatched);
                }}
                onInitHandled={() => { setInboxInitConvId(undefined); setInboxInitChannel(undefined); setInboxInitEmailSubTab(undefined); }}
              />
            </div>
          )}

          {view === 'email-review' && (
            <div className="flex-1 overflow-hidden">
              <EmailReviewQueueView
                deals={deals}
                onSelectDeal={handleSelectDeal}
              />
            </div>
          )}

          {view === 'tasks' && (
            <div className="flex-1 overflow-hidden">
              <CommTasksView
                onOpenInbox={(channel, phone, email) => { setView('inbox'); }}
                onSelectDeal={handleSelectDeal}
              />
            </div>
          )}

          {view === 'voice' && (
            <div className="flex-1 overflow-hidden">
              <CommunicationsConsole onSelectDeal={handleSelectDeal} />
            </div>
          )}

          {view === 'reports' && (
            <div className="flex-1 overflow-auto">
              <AIReports deals={deals} />
            </div>
          )}

          {view === 'requests' && (
            <div className="flex-1 overflow-hidden">
              <RequestCenterView
                onSelectDeal={handleSelectDeal}
                onSelectDealWithTab={handleSelectDealWithTab}
              />
            </div>
          )}

          {view === 'settings' && (
            <div className="flex-1 overflow-hidden">
              <SettingsView
                users={users}
                onSaveUsers={persistUsers}
                deals={deals}
                contactRecords={contactRecords}
                mlsEntries={mlsEntries}
                complianceTemplates={complianceTemplates}
                storageMode={storageMode}
                emailTemplates={emailTemplates}
                onSaveEmailTemplates={persistEmailTemplates}
                complianceMasterItems={complianceMasterItems}
                onSaveComplianceMasterItems={persistComplianceMasterItems}
                ddMasterItems={ddMasterItems}
                onSaveDdMasterItems={persistDdMasterItems}
              />
            </div>
          )}
        </div>
      </div>

      {showAdd && (
        <GuidedDealWizard
          onAdd={handleAdd}
          onClose={() => { setShowAdd(false); loadContactsFull().then(data => setContactRecords(data)).catch(console.error); }}
          complianceTemplates={complianceTemplates}
          agentClients={agentClients}
          ddMasterItems={ddMasterItems}
        />
      )}

      <ActiveCallOverlay
        isActive={!!activeCall}
        callData={activeCall}
        deal={activeCall?.dealId ? deals.find(d => d.id === activeCall.dealId) : undefined}
        onEndCall={async () => {
          const sid = activeCall?.callSid;
          if (sid && sid !== 'call-initiated') {
            try {
              await fetch('/api/end-call', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callSid: sid }),
              });
            } catch (err) {
              console.error('Failed to end call via API:', err);
            }
          }
          setActiveCall(null);
          setIsCallMinimized(false);
        }}
        onMinimize={() => setIsCallMinimized(prev => !prev)}
        onAddNote={(note) => {
          if (activeCall?.dealId) {
            const deal = deals.find(d => d.id === activeCall.dealId);
            if (deal) handleUpdate({ ...deal, notes: (deal.notes ? deal.notes + '\n' : '') + `[Call] ${note}` });
          }
        }}
        onCreateTask={(desc) => {
          if (activeCall?.dealId) {
            const deal = deals.find(d => d.id === activeCall.dealId);
            if (deal) handleUpdate({ ...deal, tasks: [...(deal.tasks || []), { id: Date.now().toString(), title: desc, dueDate: '', priority: 'medium', category: 'General', milestone: deal.milestone, autoGenerated: false }] });
          }
        }}
        isMinimized={isCallMinimized}
      />

      <AIChat
        onNavigateToDeal={(id) => { handleSelectDeal(id); }}
        onSetView={(v) => setView(v as any)}
      />

      {/* Page ID Badge — floating pill showing current view for quick troubleshooting */}
      {/* Suppressed when any wizard/modal with its own badge is open to avoid duplicate badges */}
      {!(view === 'transactions' && selected) && !showAdd && !activeCall && (
        <PageIdBadge pageId={VIEW_PAGE_IDS[view] || view} />
      )}

    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}