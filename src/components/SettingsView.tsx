import React, { useState } from 'react';
import {
  Users, FileDown, Plus, Pencil, Trash2, X, Check,
  Download, Building2, ClipboardList, Globe, Shield,
  AlertCircle, Mail, Link, FileDown as _fd, Bell, Clock,
} from 'lucide-react';
import {
  AppUser, UserRole, Deal, ContactRecord, MlsEntry,
  ComplianceTemplate, EmailTemplate, ComplianceMasterItem, DDMasterItem,
} from '../types';
import { generateId } from '../utils/helpers';
import { useAuth } from '../contexts/AuthContext';
import { ConfirmModal } from './ConfirmModal';

// -- Tab sub-components
import { EmailTemplatesTab }      from './settings/EmailTemplatesTab';
import { DDChecklistTab }          from './settings/DDChecklistTab';
import { ComplianceChecklistTab }  from './settings/ComplianceChecklistTab';
import { AccessUsersTab }          from './settings/AccessUsersTab';
import { LicenseLinksTab }         from './settings/LicenseLinksTab';
import { BriefingConfigPanel }     from './settings/BriefingConfigPanel';
import { MilestonesTab }           from './settings/MilestonesTab';
import { OrgManagementTab }        from './settings/OrgManagementTab';
import { ClientPortalTab }         from './settings/ClientPortalTab';
import { Button } from './ui/Button';

// -- Props

interface Props {
  users: AppUser[];
  onSaveUsers: (users: AppUser[]) => void;
  deals: Deal[];
  contactRecords: ContactRecord[];
  mlsEntries: MlsEntry[];
  complianceTemplates: ComplianceTemplate[];
  storageMode: string;
  emailTemplates: EmailTemplate[];
  onSaveEmailTemplates: (templates: EmailTemplate[]) => void;
  complianceMasterItems: ComplianceMasterItem[];
  onSaveComplianceMasterItems: (items: ComplianceMasterItem[]) => void;
  ddMasterItems: DDMasterItem[];
  onSaveDdMasterItems: (items: DDMasterItem[]) => void;
}

type SettingsTab = 'team' | 'reports' | 'email-templates' | 'compliance-checklist' | 'dd-checklist' | 'license-links' | 'briefing' | 'milestones' | 'org-management' | 'client-portal';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  tc: 'Transaction Coordinator',
  staff: 'Staff',
};

// -- CSV helpers

function toCSV(headers: string[], rows: (string | number | boolean | undefined | null)[][]): string {
  const escape = (v: string | number | boolean | undefined | null) => {
    const s = v == null ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map(r => r.map(escape).join(',')).join('\n');
}

function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// -- Legacy UserForm

interface UserFormProps {
  user?: AppUser;
  onSave: (u: AppUser) => void;
  onClose: () => void;
}

function UserForm({ user, onSave, onClose }: UserFormProps) {
  const [name,  setName]  = useState(user?.name  ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role,  setRole]  = useState<UserRole>(user?.role ?? 'staff');

  const save = () => {
    if (!name.trim() || !email.trim()) return;
    onSave({
      id: user?.id ?? generateId(),
      name: name.trim(),
      email: email.trim(),
      role,
      active: user?.active ?? true,
      createdAt: user?.createdAt ?? new Date().toISOString(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base">{user ? 'Edit User' : 'Add User'}</h3>
          <Button variant="ghost" size="xs" square onClick={onClose}><X size={14}/></Button>
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <label className="label py-0.5"><span className="label-text text-xs font-medium">Full Name</span></label>
            <input className="input input-bordered input-sm w-full" placeholder="e.g. Maria Lopez" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="label py-0.5"><span className="label-text text-xs font-medium">Email</span></label>
            <input type="email" className="input input-bordered input-sm w-full" placeholder="maria@tcoffice.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label py-0.5"><span className="label-text text-xs font-medium">Role</span></label>
            <select className="select select-bordered select-sm w-full" value={role} onChange={e => setRole(e.target.value as UserRole)}>
              {(Object.keys(ROLE_LABELS) as UserRole[]).map(r => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={!name.trim() || !email.trim()}>
            <Check size={13}/> Save
          </button>
        </div>
      </div>
    </div>
  );
}

// -- Main component

export const SettingsView: React.FC<Props> = ({
  users, onSaveUsers, deals, contactRecords, mlsEntries, complianceTemplates, storageMode,
  emailTemplates, onSaveEmailTemplates,
  complianceMasterItems, onSaveComplianceMasterItems,
  ddMasterItems = [], onSaveDdMasterItems,
}) => {
  const [tab, setTab]             = useState<SettingsTab>('team');
  const { profile, isMasterAdmin, primaryOrgId } = useAuth();

  // Only show org tab for admins or team admins
  const showOrgTab = profile?.role === 'admin' || profile?.is_master_admin ||
    ((profile as any)?.orgMemberships ?? []).some((m: any) => m.roleInOrg === 'team_admin');
  const [showForm, setShowForm]   = useState(false);
  const [editUser, setEditUser]   = useState<AppUser | undefined>();
  const [deleteId, setDeleteId]   = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState<string | null>(null);

  const flash = (key: string) => {
    setDownloaded(key);
    setTimeout(() => setDownloaded(null), 2000);
  };

  const saveUser = (u: AppUser) => {
    const exists = users.find(x => x.id === u.id);
    onSaveUsers(exists ? users.map(x => x.id === u.id ? u : x) : [...users, u]);
    setShowForm(false); setEditUser(undefined);
  };

  const confirmDelete = (id: string) => {
    onSaveUsers(users.filter(u => u.id !== id));
    setDeleteId(null);
  };

  const exportTransactions = () => {
    const headers = ['Address', 'City', 'State', 'Zip', 'MLS #', 'Status', 'Side',
      'Property Type', 'List Price', 'Contract Price', 'Contract Date', 'Closing Date',
      'Agent Name', 'Notes', 'Created'];
    const rows = deals.map(d => [
      d.propertyAddress, d.city, d.state, d.zipCode, d.mlsNumber, d.status, d.transactionType,
      d.propertyType, d.listPrice, d.contractPrice, d.contractDate, d.closingDate,
      d.agentName, d.notes, d.createdAt,
    ]);
    downloadCSV('transactions.csv', toCSV(headers, rows));
    flash('transactions');
  };

  const exportContacts = () => {
    const headers = ['Name', 'Email', 'Phone', 'Role', 'Company', 'States', 'MLS IDs', 'Notes', 'Created'];
    const rows = contactRecords.map(c => [
      c.fullName, c.email, c.phone, c.contactType, c.company ?? '',
      '', '', c.notes ?? '', '',
    ]);
    downloadCSV('contacts.csv', toCSV(headers, rows));
    flash('contacts');
  };

  const exportMLS = () => {
    const headers = ['Name', 'State', 'URL', 'Notes', 'Required Documents', 'Created'];
    const rows = mlsEntries.map(m => [
      m.name, m.state, m.url, m.notes ?? '',
      m.documents.filter(d => d.required).map(d => d.name).join('; '),
      m.createdAt,
    ]);
    downloadCSV('mls-directory.csv', toCSV(headers, rows));
    flash('mls');
  };

  const exportCompliance = () => {
    const headers = ['Template Name', 'Agent Client', 'Item', 'Required', 'Order', 'Updated'];
    const rows: (string | number | boolean)[][] = [];
    complianceTemplates.forEach(t => {
      if (t.items.length === 0) {
        rows.push([t.agentClientName ?? '', t.agentClientName ?? '', '(no items)', false, 0, t.updatedAt ?? '']);
      } else {
        t.items.forEach(item => {
          rows.push([t.agentClientName ?? '', t.agentClientName ?? '', item.title, item.required ?? false, item.order ?? 0, t.updatedAt ?? '']);
        });
      }
    });
    downloadCSV('compliance-templates.csv', toCSV(headers, rows));
    flash('compliance');
  };

  const reports = [
    {
      key: 'transactions',
      label: 'Transactions',
      description: `Export all ${deals.length} transaction records`,
      icon: <Building2 size={22} className="text-primary" />,
      count: deals.length,
      action: exportTransactions,
      color: 'border-primary/20 bg-primary/5',
    },
    {
      key: 'contacts',
      label: 'Contacts',
      description: `Export all ${contactRecords.length} contacts from directory`,
      icon: <Users size={22} className="text-secondary" />,
      count: contactRecords.length,
      action: exportContacts,
      color: 'border-secondary/20 bg-secondary/5',
    },
    {
      key: 'mls',
      label: 'MLS Directory',
      description: `Export all ${mlsEntries.length} MLS systems`,
      icon: <Globe size={22} className="text-accent" />,
      count: mlsEntries.length,
      action: exportMLS,
      color: 'border-accent/20 bg-accent/5',
    },
    {
      key: 'compliance',
      label: 'Compliance Templates',
      description: `Export all ${complianceTemplates.length} compliance templates`,
      icon: <ClipboardList size={22} className="text-success" />,
      count: complianceTemplates.length,
      action: exportCompliance,
      color: 'border-success/20 bg-success/5',
    },
  ];

  return (
    <div className="flex flex-col h-full bg-base-100">
      {/* Header */}
      <div className="flex flex-col gap-3 px-6 py-4 border-b border-base-300 flex-none md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-bold text-base-content">Settings</h1>
          <p className="text-xs text-base-content/50 mt-0.5">Manage your team, email templates, and export data</p>
        </div>
        <div className="badge badge-outline badge-sm whitespace-nowrap">{storageMode}</div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-4 flex-none border-b border-base-300 overflow-x-auto">
        {[
          { id: 'team' as SettingsTab,                  label: 'Access & Users',       icon: <Shield size={14}/> },
          ...(showOrgTab ? [{ id: 'org-management' as SettingsTab, label: 'Organizations', icon: <Building2 size={14}/> }] : []),
          { id: 'license-links' as SettingsTab,         label: 'License Lookup',       icon: <Link size={14}/> },
          { id: 'email-templates' as SettingsTab,       label: 'Email Templates',      icon: <Mail size={14}/> },
          { id: 'briefing' as SettingsTab,              label: 'Morning Briefing',     icon: <Bell size={14}/> },
          { id: 'milestones' as SettingsTab,            label: 'Milestones',           icon: <Clock size={14}/> },
          { id: 'dd-checklist' as SettingsTab,          label: 'Due Diligence',        icon: <ClipboardList size={14}/> },
          { id: 'compliance-checklist' as SettingsTab,  label: 'Compliance Checklist', icon: <Shield size={14}/> },
          { id: 'reports' as SettingsTab,               label: 'CSV Reports',          icon: <FileDown size={14}/> },
          { id: 'client-portal' as SettingsTab,         label: 'Client Portal',        icon: <Globe size={14}/> },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap
              ${tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-base-content/50 hover:text-base-content'}`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className={`flex-1 ${tab === 'email-templates' ? 'overflow-hidden' : 'overflow-y-auto p-6'}`}>
        {tab === 'dd-checklist' && (
          <DDChecklistTab items={ddMasterItems} onSave={onSaveDdMasterItems!} />
        )}
        {tab === 'compliance-checklist' && (
          <ComplianceChecklistTab items={complianceMasterItems} onSave={onSaveComplianceMasterItems} />
        )}
        {tab === 'team' && <AccessUsersTab />}
        {tab === 'org-management' && <OrgManagementTab />}
        {tab === 'license-links' && <LicenseLinksTab />}
        {tab === 'email-templates' && (
          <EmailTemplatesTab emailTemplates={emailTemplates} onSave={onSaveEmailTemplates} orgId={primaryOrgId() ?? undefined} />
        )}
        {tab === 'briefing' && <BriefingConfigPanel />}
        {tab === 'milestones' && <MilestonesTab contactRecords={contactRecords} />}
        {tab === 'client-portal' && <ClientPortalTab />}
        {tab === 'reports' && (
          <div className="max-w-3xl mx-auto flex flex-col gap-5">
            <div className="bg-base-200 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle size={16} className="text-info mt-0.5 flex-none"/>
              <p className="text-xs text-base-content/70 leading-relaxed">
                CSV files include all current data and open directly in Excel, Google Sheets, or any spreadsheet app.
                Downloads happen instantly in your browser.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {reports.map(r => (
                <div key={r.key} className={`rounded-xl border p-5 flex flex-col gap-3 ${r.color}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-base-100 flex items-center justify-center shadow-sm flex-none">
                      {r.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-base-content">{r.label}</div>
                      <div className="text-xs text-base-content/50 mt-0.5">{r.description}</div>
                    </div>
                  </div>
                  <button
                    className={`btn btn-sm w-full gap-1.5 transition-all ${downloaded === r.key ? 'btn-success' : 'btn-neutral'}`}
                    onClick={r.action}
                  >
                    {downloaded === r.key
                      ? <><Check size={13}/> Downloaded!</>
                      : <><Download size={13}/> Export CSV</>}
                  </button>
                </div>
              ))}
            </div>
            <div className="text-center text-xs text-base-content/35 pt-2">
              All exports reflect live data - re-export anytime for the latest snapshot.
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <UserForm
          user={editUser}
          onSave={saveUser}
          onClose={() => { setShowForm(false); setEditUser(undefined); }}
        />
      )}

      <ConfirmModal
        isOpen={deleteId !== null}
        title="Remove this user?"
        message={`${users.find(u => u.id === deleteId)?.name ?? 'This user'} will be removed from the team list.`}
        confirmLabel="Remove"
        onConfirm={() => { if (deleteId) confirmDelete(deleteId); }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
};
