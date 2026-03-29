import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2, Users, Plus, Trash2, RefreshCw,
  Shield, UserCheck, User, AlertCircle, CheckCircle2, Clock, X
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  listOrgMembers, listAllOrgs, addOrgMember,
  updateOrgMemberRole, removeOrgMember, OrgMemberRecord
} from '../../utils/supabaseDb';
import { ConfirmModal } from '../ConfirmModal';
import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/Button';

const ROLE_INFO: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  team_admin: { label: 'Team Admin', color: 'badge-error',   icon: <Shield size={11} /> },
  tc:         { label: 'TC',         color: 'badge-primary', icon: <UserCheck size={11} /> },
  agent:      { label: 'Agent',      color: 'badge-neutral', icon: <User size={11} /> },
};

function formatPhone(e164: string): string {
  const d = e164.replace(/\D/g, '');
  const l = d.startsWith('1') ? d.slice(1) : d;
  if (l.length === 10) return `(${l.slice(0,3)}) ${l.slice(3,6)}-${l.slice(6)}`;
  return e164;
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface AddMemberModalProps {
  orgId: string;
  token: string;
  existingUserIds: string[];
  onAdded: () => void;
  onClose: () => void;
}

function AddMemberModal({ orgId, token, existingUserIds, onAdded, onClose }: AddMemberModalProps) {
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'team_admin' | 'tc' | 'agent'>('tc');
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [foundProfile, setFoundProfile] = useState<{ id: string; name: string; phone: string } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');

  const formatPhoneInput = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0,3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  };

  const searchProfile = async () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 10) { setError('Enter a valid 10-digit US phone'); return; }
    setSearching(true);
    setNotFound(false);
    setFoundProfile(null);
    setError('');
    try {
      const e164 = `+1${digits}`;
      const res = await fetch(`/api/auth?action=lookup-profile&phone=${encodeURIComponent(e164)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.profile) {
        if (existingUserIds.includes(data.profile.id)) {
          setError('This user is already a member of this organization.');
        } else {
          setFoundProfile(data.profile);
        }
      } else {
        setNotFound(true);
      }
    } catch {
      setError('Search failed. Try again.');
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = async () => {
    if (!foundProfile) return;
    setSaving(true);
    try {
      await addOrgMember(token, orgId, foundProfile.id, role);
      onAdded();
    } catch (e: any) {
      setError(e.message ?? 'Failed to add member');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base">Add Member</h3>
          <Button variant="ghost" className="btn-circle" onClick={onClose}><X size={16} /></Button>
        </div>

        <div className="flex gap-2">
          <input
            className="input input-bordered flex-1 text-sm"
            placeholder="(555) 000-0000"
            value={phone}
            onChange={e => { setPhone(formatPhoneInput(e.target.value)); setFoundProfile(null); setNotFound(false); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && searchProfile()}
          />
          <button
            className="btn btn-outline btn-sm"
            onClick={searchProfile}
            disabled={searching}
          >
            {searching ? <span className="loading loading-spinner loading-xs" /> : 'Search'}
          </button>
        </div>

        {notFound && (
          <div className="flex items-center gap-2 text-warning text-sm">
            <AlertCircle size={14} />
            <span>No user found with this phone number. They must log in first.</span>
          </div>
        )}

        {foundProfile && (
          <div className="bg-base-200 rounded-xl p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-success" />
              <span className="font-medium text-sm">{foundProfile.name || 'Unnamed User'}</span>
              <span className="text-xs text-base-content/50">{formatPhone(foundProfile.phone)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-base-content/60">Role:</span>
              <select
                className="select select-bordered select-xs flex-1"
                value={role}
                onChange={e => setRole(e.target.value as any)}
              >
                <option value="tc">TC</option>
                <option value="team_admin">Team Admin</option>
                <option value="agent">Agent</option>
              </select>
            </div>
          </div>
        )}

        {error && (
          <div className="text-error text-xs flex items-center gap-1">
            <AlertCircle size={12} /> {error}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {foundProfile && (
            <button
              className="btn btn-primary btn-sm"
              onClick={handleAdd}
              disabled={saving}
            >
              {saving ? <span className="loading loading-spinner loading-xs" /> : 'Add to Org'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function OrgManagementTab() {
  const { profile, token, isMasterAdmin } = useAuth();
  const [orgs, setOrgs] = useState<{ id: string; name: string; orgCode: string; isActive: boolean; organizationType: string }[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [members, setMembers] = useState<OrgMemberRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<OrgMemberRecord | null>(null);
  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [error, setError] = useState('');

  const isAdmin = isMasterAdmin();

  // Determine which orgs this user can manage
  useEffect(() => {
    if (!token) return;
    if (isAdmin) {
      // Master admin: load all orgs
      listAllOrgs(token)
        .then(data => {
          setOrgs(data);
          if (data.length > 0) setSelectedOrgId(data[0].id);
        })
        .catch(e => setError(e.message));
    } else {
      // Team admin: only their orgs where they are team_admin
      const manageable = (profile?.orgMemberships ?? []).filter(m => m.roleInOrg === 'team_admin');
      const orgList = manageable.map(m => ({
        id: m.orgId,
        name: m.orgName,
        orgCode: m.orgCode,
        isActive: true,
        organizationType: '',
      }));
      setOrgs(orgList);
      if (orgList.length > 0) setSelectedOrgId(orgList[0].id);
    }
  }, [token, isAdmin, profile]);

  const loadMembers = useCallback(async () => {
    if (!token || !selectedOrgId) return;
    setLoading(true);
    setError('');
    try {
      const data = await listOrgMembers(token, selectedOrgId);
      setMembers(data);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [token, selectedOrgId]);

  useEffect(() => {
    if (selectedOrgId) loadMembers();
  }, [selectedOrgId, loadMembers]);

  const handleRoleChange = async (membershipId: string, newRole: string) => {
    if (!token) return;
    setSavingRole(membershipId);
    try {
      await updateOrgMemberRole(token, membershipId, newRole);
      await loadMembers();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingRole(null);
    }
  };

  const handleRemove = async (member: OrgMemberRecord) => {
    if (!token) return;
    try {
      await removeOrgMember(token, member.membershipId);
      setConfirmRemove(null);
      await loadMembers();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const selectedOrg = orgs.find(o => o.id === selectedOrgId);
  const existingUserIds = members.map(m => m.userId);

  if (orgs.length === 0 && !loading) {
    return (
      <EmptyState
        icon={<Building2 size={32} />}
        title="No organizations to manage."
        message={!isAdmin ? 'You need Team Admin role in an organization to manage its members.' : undefined}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      {/* Org selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <Building2 size={18} className="text-primary" />
        <span className="font-semibold text-base">Organization</span>
        {orgs.length > 1 ? (
          <div className="relative">
            <select
              className="select select-bordered select-sm pr-8"
              value={selectedOrgId ?? ''}
              onChange={e => setSelectedOrgId(e.target.value)}
            >
              {orgs.map(o => (
                <option key={o.id} value={o.id}>{o.name} ({o.orgCode})</option>
              ))}
            </select>
          </div>
        ) : selectedOrg ? (
          <span className="font-medium text-base-content">
            {selectedOrg.name}
            <span className="ml-2 badge badge-ghost badge-sm">{selectedOrg.orgCode}</span>
          </span>
        ) : null}
        <button
          className="btn btn-ghost btn-xs ml-auto"
          onClick={loadMembers}
          disabled={loading}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
        <button
          className="btn btn-primary btn-sm gap-1"
          onClick={() => setShowAddModal(true)}
          disabled={!selectedOrgId}
        >
          <Plus size={14} /> Add Member
        </button>
      </div>

      {error && (
        <div className="alert alert-error text-sm py-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Members table */}
      {loading ? (
        <div className="flex justify-center py-8">
          <span className="loading loading-spinner loading-md" />
        </div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center py-10 gap-2 text-base-content/40">
          <Users size={28} />
          <p className="text-sm">No members yet. Add someone to get started.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-base-300">
          <table className="table table-sm w-full">
            <thead>
              <tr className="text-xs text-base-content/50 uppercase tracking-wide">
                <th>Member</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => {
                const _roleInfo = ROLE_INFO[m.roleInOrg] ?? { label: m.roleInOrg, color: 'badge-ghost', icon: null };
                return (
                  <tr key={m.membershipId} className="hover">
                    <td>
                      <div>
                        <div className="font-medium text-sm">{m.profile?.name || 'Unknown'}</div>
                        <div className="text-xs text-base-content/40">
                          {m.profile?.phone ? formatPhone(m.profile.phone) : '—'}
                        </div>
                      </div>
                    </td>
                    <td>
                      {savingRole === m.membershipId ? (
                        <span className="loading loading-spinner loading-xs" />
                      ) : (
                        <select
                          className="select select-bordered select-xs"
                          value={m.roleInOrg}
                          onChange={e => handleRoleChange(m.membershipId, e.target.value)}
                        >
                          <option value="tc">TC</option>
                          <option value="team_admin">Team Admin</option>
                          <option value="agent">Agent</option>
                        </select>
                      )}
                    </td>
                    <td>
                      <span className={`badge badge-sm gap-1 ${m.status === 'active' ? 'badge-success' : m.status === 'pending' ? 'badge-warning' : 'badge-ghost'}`}>
                        {m.status === 'active' ? <CheckCircle2 size={10} /> : <Clock size={10} />}
                        {m.status}
                      </span>
                    </td>
                    <td className="text-xs text-base-content/50">
                      {timeAgo(m.profile?.lastLogin ?? null)}
                    </td>
                    <td>
                      <button
                        className="btn btn-ghost btn-xs text-error hover:bg-error/10"
                        onClick={() => setConfirmRemove(m)}
                        title="Remove from org"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && selectedOrgId && token && (
        <AddMemberModal
          orgId={selectedOrgId}
          token={token}
          existingUserIds={existingUserIds}
          onAdded={() => { setShowAddModal(false); loadMembers(); }}
          onClose={() => setShowAddModal(false)}
        />
      )}

      <ConfirmModal
        isOpen={confirmRemove !== null}
        title="Remove Member"
        message={`Remove ${confirmRemove?.profile?.name || 'this user'} from the organization? They'll lose access to org deals but keep their account.`}
        confirmLabel="Remove"
        confirmClass="btn-error"
        onConfirm={() => { if (confirmRemove) handleRemove(confirmRemove); }}
        onCancel={() => setConfirmRemove(null)}
      />
    </div>
  );
}
