import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard, CheckSquare, Users, AlertTriangle,
  Clock, FileText, ArrowLeft, ListChecks, MapPin, Copy, Check, Pencil, Scan, Sparkles,
} from 'lucide-react';
import { EmailCommandCenter } from './EmailCommandCenter';
import { dealToRecord } from '../ai/dealConverter';
import { Deal, DirectoryContact, AppUser, EmailTemplate, ComplianceTemplate } from '../types';
import { pendingDocCount } from '../utils/helpers';

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

type Tab = 'overview' | 'checklists' | 'tasks' | 'contacts' | 'documents' | 'activity' | 'email' | 'ai-emails';

interface Props {
  deal: Deal;
  onUpdate: (deal: Deal) => void;
  onBack?: () => void;
  directory?: DirectoryContact[];
  users?: AppUser[];
  emailTemplates?: EmailTemplate[];
  complianceTemplates?: ComplianceTemplate[];
}

export const DealWorkspace: React.FC<Props> = ({ deal, onUpdate, onBack, directory = [], users = [], emailTemplates = [], complianceTemplates = [] }) => {
  const [tab, setTab] = useState<Tab>('overview');
  const [copied, setCopied] = useState(false);
  const [copiedMls, setCopiedMls] = useState(false);
  const [editTrigger, setEditTrigger] = useState(0);
  const [showSheet, setShowSheet] = useState(false);
  const [showFocusView, setShowFocusView] = useState(false);

  // Reset to Overview whenever the deal changes
  useEffect(() => { setTab('overview'); }, [deal.id]);
  const pendingDocs = pendingDocCount(deal.documentRequests);
  const overdueTasks = (deal.tasks ?? []).filter(t => !t.completedAt && t.dueDate < new Date().toISOString().slice(0, 10)).length;

  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'overview',   label: 'Overview',   icon: <LayoutDashboard size={13} /> },
    { id: 'checklists', label: 'Checklists', icon: <CheckSquare size={13} /> },
    { id: 'tasks',      label: 'Tasks',      icon: <ListChecks size={13} />, badge: overdueTasks > 0 ? overdueTasks : undefined },
    { id: 'contacts',   label: 'Contacts',   icon: <Users size={13} /> },
    { id: 'documents',  label: 'Documents',  icon: <AlertTriangle size={13} />, badge: pendingDocs },
    { id: 'activity',   label: 'Activity',   icon: <Clock size={13} /> },
    { id: 'email',      label: 'Email',      icon: <FileText size={13} /> },
    { id: 'ai-emails',  label: 'AI Emails',  icon: <Sparkles size={13} /> },
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
                <span className="font-bold text-base text-black leading-tight">{deal.address}</span>
                <button
                  onClick={() => {
                    const fullAddr = [deal.address, deal.city, deal.state, deal.zipCode].filter(Boolean).join(', ');
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
            </div>
          </div>

          {/* Right: Focus View + Sheet + Edit Deal */}
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
            <button
              onClick={() => setEditTrigger(n => n + 1)}
              className="btn btn-sm btn-primary btn-outline gap-1.5"
            >
              <Pencil size={13} /> Edit Deal
            </button>
          </div>
        </div>
      </div>

      {/* Transaction Sheet Modal */}
      {showSheet && <TransactionSheet deal={deal} onClose={() => setShowSheet(false)} />}

      {/* Focus View Modal */}
      {showFocusView && <FocusViewModal deal={deal} onClose={() => setShowFocusView(false)} />}

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
      <div className={`flex-1 ${tab === 'email' || tab === 'ai-emails' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {tab === 'overview'   && <WorkspaceOverview deal={deal} onUpdate={onUpdate} directory={directory} onGoToContacts={() => setTab('contacts')} editTrigger={editTrigger} />}
        {tab === 'checklists' && <WorkspaceChecklists deal={deal} onUpdate={onUpdate} users={users} directory={directory} complianceTemplates={complianceTemplates} />}
        {tab === 'tasks'      && <WorkspaceTasks deal={deal} onUpdate={onUpdate} users={users} />}
        {tab === 'contacts'   && <WorkspaceContacts deal={deal} onUpdate={onUpdate} directory={directory} />}
        {tab === 'documents'  && <WorkspaceDocuments deal={deal} onUpdate={onUpdate} />}
        {tab === 'activity'   && <WorkspaceActivityLog deal={deal} onUpdate={onUpdate} />}
        {tab === 'email'      && <WorkspaceEmailTemplate deal={deal} emailTemplates={emailTemplates} complianceTemplates={complianceTemplates} />}
        {tab === 'ai-emails' && <div className="p-4"><EmailCommandCenter deal={dealToRecord(deal)} emails={[]} /></div>}
      </div>
    </div>
  );
};
