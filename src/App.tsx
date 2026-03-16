import React, { useState, useEffect, useRef, useMemo } from 'react';

import { Deal, DirectoryContact, MlsEntry, ComplianceTemplate, AppUser, EmailTemplate, ComplianceMasterItem, DDMasterItem } from './types';
import { generateSampleData, generateDirectoryContacts } from './utils/sampleData';
import {
  readPersistedData,
  writePersistedData,
  migrateDeals,
  migrateDirectory,
  migrateMls,
  migrateCompliance,
  migrateUsers,
} from './utils/storage';
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

const DEALS_PATH           = '/agent/home/apps/tc-dashboard/deals.json';
const DIR_PATH             = '/agent/home/apps/tc-dashboard/directory.json';
const MLS_PATH             = '/agent/home/apps/tc-dashboard/mls.json';
const COMPLIANCE_PATH      = '/agent/home/apps/tc-dashboard/compliance.json';
const USERS_PATH           = '/agent/home/apps/tc-dashboard/users.json';
const EMAIL_TEMPLATES_PATH        = '/agent/home/apps/tc-dashboard/emailTemplates.json';
const COMPLIANCE_MASTER_PATH      = '/agent/home/apps/tc-dashboard/complianceMaster.json';
const DD_MASTER_PATH              = '/agent/home/apps/tc-dashboard/ddMaster.json';

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

  const loadCollection = async <T,>(
    path: string,
    migrate: (input: unknown) => T,
    fallback: T,
    apply: (value: T) => void,
  ) => {
    try {
      const data = await readPersistedData(path, migrate);
      apply(data);
      return data;
    } catch {
      apply(fallback);
      writePersistedData(path, fallback).catch(console.error);
      return fallback;
    }
  };

  // Load deals
  useEffect(() => {
    loadCollection(DEALS_PATH, migrateDeals, generateSampleData(), (data) => {
      setDeals(data);
      // Only auto-select first deal on desktop (md+), not on mobile
      const isMobile = window.innerWidth < 768;
      if (!isMobile) setSelectedId(current => current ?? data[0]?.id ?? null);
    }).finally(() => setLoading(false));
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
  }, [view]); // re-attach when switching to transactions view

  // Load contact directory
  useEffect(() => {
    loadCollection(DIR_PATH, migrateDirectory, generateDirectoryContacts(), setDirectory);
  }, []);

  // Load MLS entries
  useEffect(() => {
    loadCollection(MLS_PATH, migrateMls, [], setMlsEntries);
  }, []);

  // Load compliance templates
  useEffect(() => {
    loadCollection(COMPLIANCE_PATH, migrateCompliance, [], setComplianceTemplates);
  }, []);

  const persistCompliance = (updated: ComplianceTemplate[]) => {
    setComplianceTemplates(updated);
    writePersistedData(COMPLIANCE_PATH, updated).catch(console.error);
  };

  // Load users
  useEffect(() => {
    loadCollection(USERS_PATH, migrateUsers, [], setUsers);
  }, []);

  const persistUsers = (updated: AppUser[]) => {
    setUsers(updated);
    writePersistedData(USERS_PATH, updated).catch(console.error);
  };

  // Load email templates
  useEffect(() => {
    loadCollection<EmailTemplate[]>(
      EMAIL_TEMPLATES_PATH,
      (input: unknown) => (Array.isArray(input) ? input : []) as EmailTemplate[],
      [],
      setEmailTemplates,
    );
  }, []);

  const persistEmailTemplates = async (updated: EmailTemplate[]) => {
    setEmailTemplates(updated);
    writePersistedData(EMAIL_TEMPLATES_PATH, updated).catch(console.error);
  };

  // Load compliance master checklist items
  useEffect(() => {
    loadCollection<ComplianceMasterItem[]>(
      COMPLIANCE_MASTER_PATH,
      (input: unknown) => (Array.isArray(input) ? input : []) as ComplianceMasterItem[],
      [],
      setComplianceMasterItems,
    );
  }, []);

  const persistComplianceMasterItems = (updated: ComplianceMasterItem[]) => {
    setComplianceMasterItems(updated);
    writePersistedData(COMPLIANCE_MASTER_PATH, updated).catch(console.error);
  };

  // Load DD master checklist items
  useEffect(() => {
    loadCollection<DDMasterItem[]>(
      DD_MASTER_PATH,
      (input: unknown) => (Array.isArray(input) ? input : []) as DDMasterItem[],
      [],
      setDdMasterItems,
    );
  }, []);

  const persistDdMasterItems = (updated: DDMasterItem[]) => {
    setDdMasterItems(updated);
    writePersistedData(DD_MASTER_PATH, updated).catch(console.error);
  };

  const persistDeals = (updated: Deal[]) => {
    setDeals(updated);
    writePersistedData(DEALS_PATH, updated).catch(console.error);
  };

  const persistDirectory = (updated: DirectoryContact[]) => {
    setDirectory(updated);
    writePersistedData(DIR_PATH, updated).catch(console.error);
  };

  const persistMls = (updated: MlsEntry[]) => {
    setMlsEntries(updated);
    writePersistedData(MLS_PATH, updated).catch(console.error);
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

  const storageMode = useMemo(
    () => 'Browser local storage',
    [],
  );

  const handleUpdate = (deal: Deal) => persistDeals(deals.map(d => d.id === deal.id ? deal : d));

  const handleAdd = (deal: Deal) => {
    const withId = { ...deal, id: generateId() };
    persistDeals([withId, ...deals]);
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
              {/* Deal List panel — always visible when wide, or when txPanel='list' on narrow */}
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

              {/* Workspace panel — always visible when wide, or when txPanel='workspace' on narrow */}
              {(txContainerWide || txPanel === 'workspace') && (
                <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
                  {/* Back button — only on narrow screens */}
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
    </div>
  );
}

