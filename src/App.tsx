import React, { useState, useEffect, useRef, useMemo } from 'react';

import { Deal, DirectoryContact, MlsEntry, ComplianceTemplate, AppUser, EmailTemplate, ComplianceMasterItem, DDMasterItem } from './types';
import { generateSampleData, generateDirectoryContacts } from './utils/sampleData';
import {
  loadDeals, saveDeals, saveSingleDeal,
  loadDirectory, saveDirectory,
  loadMls, saveMls,
  loadCompliance, saveCompliance,
  loadUsers, saveUsers,
  loadEmailTemplates, saveEmailTemplates,
  loadMasterItems, saveMasterItems,
} from './utils/supabaseDb';
import { migrateDeals, migrateDirectory, migrateMls, migrateCompliance, migrateUsers } from './utils/storage';
import { generateId } from './utils/helpers';
import { Sidebar, MobileMenuButton, View } from './components/Sidebar';
import { DealList } from './components/DealList';
import { DealWorkspace } from './components/DealWorkspace';
import { AddDealModal } from './components/AddDealModal';
import { HomeDashboard } from './components/HomeDashboard';
import { ContactsDirectory } from './components/ContactsDirectory';
import { MLSDirectory } from './components/MLSDirectory';
import { ComplianceManager } from './components/ComplianceManager';
import { SettingsView } from './components/SettingsView';
import { Topbar } from './components/Topbar';
import { AIChat } from './components/AIChat';

export default function App() {

  const [view, setView]                     = useState<View>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen]         = useState(false);

  const [deals, setDeals]                   = useState<Deal[]>([]);
  const [selectedId, setSelectedId]         = useState<string | null>(null);
  const [txPanel, setTxPanel]               = useState<'list' | 'workspace'>('list');
  const [txContainerWide, setTxContainerWide] = useState(false);
  const txContainerRef                      = useRef<HTMLDivElement>(null);
  const [showAdd, setShowAdd]               = useState(false);
  const [loading, setLoading]               = useState(true);
  const [amberFilter, setAmberFilter]       = useState(false);
  const [quickAddRole, setQuickAddRole]     = useState<'agent-client' | 'contact' | null>(null);

  const [directory, setDirectory]               = useState<DirectoryContact[]>([]);
  const [mlsEntries, setMlsEntries]             = useState<MlsEntry[]>([]);
  const [complianceTemplates, setComplianceTemplates] = useState<ComplianceTemplate[]>([]);
  const [users, setUsers]                       = useState<AppUser[]>([]);
  const [emailTemplates, setEmailTemplates]     = useState<EmailTemplate[]>([]);
  const [complianceMasterItems, setComplianceMasterItems] = useState<ComplianceMasterItem[]>([]);
  const [ddMasterItems, setDdMasterItems]               = useState<DDMasterItem[]>([]);

  // ── Load deals ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        let data = await loadDeals();
        if (!data || data.length === 0) {
          data = migrateDeals(generateSampleData());
          saveDeals(data).catch(console.error);
        }
        setDeals(data);
        const isMobile = window.innerWidth < 768;
        if (!isMobile) setSelectedId(current => current ?? data[0]?.id ?? null);
      } catch (err) {
        console.error('Failed to load deals:', err);
        const fallback = migrateDeals(generateSampleData());
        setDeals(fallback);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

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

  // ── Load directory ───────────────────────────────────────────────────────────
  useEffect(() => {
    loadDirectory()
      .then(data => setDirectory(data.length ? data : migrateDirectory(generateDirectoryContacts())))
      .catch(() => setDirectory(migrateDirectory(generateDirectoryContacts())));
  }, []);

  // ── Load MLS ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadMls()
      .then(data => setMlsEntries(data))
      .catch(() => setMlsEntries([]));
  }, []);

  // ── Load compliance templates ────────────────────────────────────────────────
  useEffect(() => {
    loadCompliance()
      .then(data => setComplianceTemplates(data))
      .catch(() => setComplianceTemplates([]));
  }, []);

  const persistCompliance = (updated: ComplianceTemplate[]) => {
    setComplianceTemplates(updated);
    saveCompliance(updated).catch(console.error);
  };

  // ── Load users ───────────────────────────────────────────────────────────────
  useEffect(() => {
    loadUsers()
      .then(data => setUsers(data))
      .catch(() => setUsers([]));
  }, []);

  const persistUsers = (updated: AppUser[]) => {
    setUsers(updated);
    saveUsers(updated).catch(console.error);
  };

  // ── Load email templates ─────────────────────────────────────────────────────
  useEffect(() => {
    loadEmailTemplates()
      .then(data => setEmailTemplates(data))
      .catch(() => setEmailTemplates([]));
  }, []);

  const persistEmailTemplates = async (updated: EmailTemplate[]) => {
    setEmailTemplates(updated);
    saveEmailTemplates(updated).catch(console.error);
  };

  // ── Load compliance master items ─────────────────────────────────────────────
  useEffect(() => {
    loadMasterItems('compliance')
      .then(data => setComplianceMasterItems(data as ComplianceMasterItem[]))
      .catch(() => setComplianceMasterItems([]));
  }, []);

  const persistComplianceMasterItems = (updated: ComplianceMasterItem[]) => {
    setComplianceMasterItems(updated);
    saveMasterItems('compliance', updated).catch(console.error);
  };

  // ── Load DD master items ─────────────────────────────────────────────────────
  useEffect(() => {
    loadMasterItems('dd')
      .then(data => setDdMasterItems(data as DDMasterItem[]))
      .catch(() => setDdMasterItems([]));
  }, []);

  const persistDdMasterItems = (updated: DDMasterItem[]) => {
    setDdMasterItems(updated);
    saveMasterItems('dd', updated).catch(console.error);
  };

  // ── Persist helpers ──────────────────────────────────────────────────────────
  const persistDeals = (updated: Deal[]) => {
    setDeals(updated);
    saveDeals(updated).catch(console.error);
  };

  const persistDirectory = (updated: DirectoryContact[]) => {
    setDirectory(updated);
    saveDirectory(updated).catch(console.error);
  };

  const persistMls = (updated: MlsEntry[]) => {
    setMlsEntries(updated);
    saveMls(updated).catch(console.error);
  };

  useEffect(() => {
    if (deals.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    const stillExists = selectedId && deals.some((deal) => deal.id === selectedId);
    if (!stillExists) {
      setSelectedId(deals[0].id);
    }
  }, [deals, selectedId]);

  const storageMode = useMemo(() => 'Supabase Cloud Database', []);

  const handleUpdate = (deal: Deal) => {
    setDeals(prev => prev.map(d => d.id === deal.id ? deal : d));
    saveSingleDeal(deal).catch(console.error);
  };

  const handleAdd = (deal: Deal) => {
    const withId = { ...deal, id: generateId() };
    const updated = [withId, ...deals];
    setDeals(updated);
    saveSingleDeal(withId).catch(console.error);
    setSelectedId(withId.id);
    setTxPanel('workspace');
    setShowAdd(false);
    setView('transactions');
  };

  const handleSelectDeal = (id: string) => {
    setSelectedId(id);
    setTxPanel('workspace');
    setView('transactions');
  };

  const selected = deals.find(d => d.id === selectedId) ?? null;

  const totalPending = deals.reduce((a, d) =>
    a + d.documentRequests.filter(r => r.status === 'pending').length, 0);

  if (loading) {
    return (
      <div data-theme="light" className="flex items-center justify-center h-screen bg-base-100">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  return (
    <div data-theme="light" className="h-screen flex bg-base-100 overflow-hidden">
      {/* Left sidebar */}
      <Sidebar
        onAddAgentClient={() => { setQuickAddRole('agent-client'); setView('contacts'); }}
        onAddContact={() => { setQuickAddRole('contact'); setView('contacts'); }}

        onAddDeal={() => setShowAdd(true)}
        dealCount={deals.length}
        pendingAlerts={totalPending}
        onAmberClick={() => { setAmberFilter(true); setSelectedId(null); setTxPanel('list'); setView('transactions'); }}
        view={view}
        onSetView={(v) => { if (v === 'transactions') { setSelectedId(null); setTxPanel('list'); } setView(v); }}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(c => !c)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Desktop top bar */}
        <div className="hidden md:block flex-none">
          <Topbar
            onAddDeal={() => setShowAdd(true)}
            onAddAgentClient={() => { setQuickAddRole('agent-client'); setView('contacts'); }}
            onAddContact={() => { setQuickAddRole('contact'); setView('contacts'); }}
            dealCount={deals.filter(d => d.milestone !== 'archived').length}
            pendingAlerts={totalPending}
          />
        </div>
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center h-12 px-3 border-b border-base-300 bg-base-200 flex-none gap-3">
          <MobileMenuButton onClick={() => setMobileOpen(true)} pendingAlerts={totalPending} />
          <span className="font-bold text-sm text-base-content flex-1">
            {view === 'dashboard' ? 'Dashboard' : view === 'transactions' ? 'Transactions' : view === 'contacts' ? 'Contacts' : view === 'mls' ? 'MLS' : view === 'compliance' ? 'Compliance' : 'Settings'}
          </span>
          <button onClick={() => setShowAdd(true)} className="btn btn-primary btn-xs gap-1">
            + New Deal
          </button>
        </div>

        {/* View content */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {view === 'dashboard' && (
            <div className="flex-1 overflow-auto">
              <HomeDashboard
                deals={deals}
                onSelectDeal={handleSelectDeal}
                onGoToDeals={() => { setSelectedId(null); setTxPanel('list'); setView('transactions'); }}
                onGoToAlerts={() => { setAmberFilter(true); setSelectedId(null); setTxPanel('list'); setView('transactions'); }}
              />
            </div>
          )}

          {view === 'transactions' && (
            <div ref={txContainerRef} className="flex flex-1 min-w-0 min-h-0 overflow-hidden">
              {(txContainerWide || txPanel === 'list') && (
                <div className={txContainerWide ? 'flex-none' : 'flex-1'}>
                  <DealList
                    deals={deals}
                    selectedId={selectedId}
                    onSelect={(id) => { setSelectedId(id); setTxPanel('workspace'); }}
                    amberFilter={amberFilter}
                    onClearAmberFilter={() => setAmberFilter(false)}
                    directory={directory}
                  />
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
                      ? <DealWorkspace deal={selected} onUpdate={handleUpdate} directory={directory} users={users} emailTemplates={emailTemplates} complianceTemplates={complianceTemplates} />
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
                directory={directory}
                onUpdate={persistDirectory}
                mlsEntries={mlsEntries}
                triggerAdd={quickAddRole}
                onTriggerHandled={() => setQuickAddRole(null)}
              />
            </div>
          )}

          {view === 'mls' && (
            <div className="flex-1 overflow-auto">
              <MLSDirectory
                mls={mlsEntries}
                onUpdate={persistMls}
              />
            </div>
          )}

          {view === 'compliance' && (
            <div className="flex-1 overflow-hidden">
              <ComplianceManager
                templates={complianceTemplates}
                onSave={persistCompliance}
                agentClients={directory.filter(c => c.role === 'agent-client')}
                deals={deals.map(d => ({ agentClientId: d.agentClientId }))}
                masterItems={complianceMasterItems}
              />
            </div>
          )}

          {view === 'settings' && (
            <div className="flex-1 overflow-hidden">
              <SettingsView
                users={users}
                onSaveUsers={persistUsers}
                deals={deals}
                directory={directory}
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
        <AddDealModal
          onAdd={handleAdd}
          onClose={() => setShowAdd(false)}
          complianceTemplates={complianceTemplates}
          agentClients={directory.filter(c => c.role === 'agent-client')}
          ddMasterItems={ddMasterItems}
        />
      )}

      {/* AI Chat — floating widget available on all views */}
      <AIChat />
    </div>
  );
}
