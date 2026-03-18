import React from 'react';
import { Plus, Pencil, Trash2, X, Check, Shield, UserCheck, AlertCircle, Copy, CheckCheck, Ban } from 'lucide-react';
import { ConfirmModal } from '../ConfirmModal';

interface AllowedUser {
  id: string;           // allowed_phones.id (access record ID)
  phone: string;
  name: string;
  role: string;
  email: string | null;
  is_demo: boolean;
  is_active: boolean;
  created_at: string;
  profile_id: string | null;  // profiles.id — canonical ID in audit logs
  last_login: string | null;
  active_sessions: number;
}

const ACCESS_ROLE_INFO: Record<string, { label: string; color: string }> = {
  admin:  { label: 'Admin',   color: 'badge-error' },
  tc:     { label: 'TC',      color: 'badge-primary' },
  staff:  { label: 'Staff',   color: 'badge-neutral' },
  viewer: { label: 'Viewer',  color: 'badge-ghost' },
};

function formatPhoneDisplay(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  const local = digits.startsWith('1') ? digits.slice(1) : digits;
  if (local.length === 10) return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
  return e164;
}

function timeAgoShort(iso: string): string {
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

interface UserAccessFormProps {
  user?: AllowedUser;
  onSave: (data: any) => void;
  onClose: () => void;
  saving: boolean;
}

function UserAccessForm({ user, onSave, onClose, saving }: UserAccessFormProps) {
  const [rawPhone, setRawPhone] = React.useState(user ? formatPhoneDisplay(user.phone) : '');
  const [name, setName] = React.useState(user?.name ?? '');
  const [role, setRole] = React.useState(user?.role ?? 'tc');
  const [email, setEmail] = React.useState(user?.email ?? '');
  const [isDemo, setIsDemo] = React.useState(user?.is_demo ?? false);
  const [phoneError, setPhoneError] = React.useState('');

  const formatPhoneInput = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const phoneDigits = rawPhone.replace(/\D/g, '');
  const phoneValid = phoneDigits.length === 10;

  const save = () => {
    if (!phoneValid) { setPhoneError('Enter a valid 10-digit US phone number'); return; }
    if (!name.trim()) return;
    onSave({ phone: rawPhone, name: name.trim(), role, email: email.trim() || null, is_demo: isDemo });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base">{user ? 'Edit User' : 'Add User'}</h3>
          <button className="btn btn-ghost btn-xs btn-square" onClick={onClose}><X size={14} /></button>
        </div>

        <div className="flex flex-col gap-3">
          {/* Phone */}
          <div>
            <label className="label py-0.5">
              <span className="label-text text-xs font-medium">Phone Number *</span>
              {user && <span className="label-text-alt text-xs text-base-content/40">Cannot change</span>}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-base-content/40 font-mono select-none">+1</span>
              <input
                className={`input input-bordered input-sm w-full pl-8 font-mono ${phoneError ? 'input-error' : ''}`}
                placeholder="(312) 555-0100"
                value={rawPhone}
                onChange={e => { setRawPhone(formatPhoneInput(e.target.value)); setPhoneError(''); }}
                disabled={!!user}
                maxLength={14}
              />
            </div>
            {phoneError && <p className="text-xs text-error mt-0.5">{phoneError}</p>}
          </div>

          {/* Name */}
          <div>
            <label className="label py-0.5"><span className="label-text text-xs font-medium">Full Name *</span></label>
            <input
              className="input input-bordered input-sm w-full"
              placeholder="e.g. Maria Lopez"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          {/* Role */}
          <div>
            <label className="label py-0.5"><span className="label-text text-xs font-medium">Role</span></label>
            <select className="select select-bordered select-sm w-full" value={role} onChange={e => setRole(e.target.value)}>
              <option value="admin">Admin</option>
              <option value="tc">Transaction Coordinator</option>
              <option value="staff">Staff</option>
              <option value="viewer">Viewer (read-only)</option>
            </select>
          </div>

          {/* Email for OTP */}
          <div>
            <label className="label py-0.5">
              <span className="label-text text-xs font-medium">Email for OTP</span>
              <span className="label-text-alt text-xs text-base-content/40">optional</span>
            </label>
            <input
              type="email"
              className="input input-bordered input-sm w-full"
              placeholder="user@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
            <p className="text-xs text-base-content/40 mt-0.5">If set, user can receive their login code by email instead of SMS.</p>
          </div>

          {/* Demo toggle */}
          <label className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl border border-amber-200 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox checkbox-sm checkbox-warning mt-0.5"
              checked={isDemo}
              onChange={e => setIsDemo(e.target.checked)}
            />
            <div>
              <p className="text-xs font-semibold text-amber-800">Demo / Presentation Account</p>
              <p className="text-xs text-amber-600 mt-0.5">No OTP required, instant access, viewer role, unlimited concurrent sessions allowed.</p>
            </div>
          </label>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary btn-sm gap-1"
            onClick={save}
            disabled={saving || !name.trim() || !phoneValid}
          >
            {saving ? <span className="loading loading-spinner loading-xs" /> : <Check size={13} />}
            {user ? 'Save Changes' : 'Add User'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AccessUsersTab() {
  const [users, setUsers] = React.useState<AllowedUser[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const [editUser, setEditUser] = React.useState<AllowedUser | undefined>();
  const [deleteTarget, setDeleteTarget] = React.useState<AllowedUser | null>(null);
  const [revokeTarget, setRevokeTarget] = React.useState<AllowedUser | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const token = localStorage.getItem('tc_token') || '';

  const loadUsers = React.useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/auth?action=list-users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load users');
      setUsers(data.users || []);
    } catch (e: any) {
      setFetchError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  React.useEffect(() => { loadUsers(); }, [loadUsers]);

  const copyUserId = (id: string) => {
    navigator.clipboard.writeText(id).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleSave = async (formData: any) => {
    setSaving(true);
    setActionError(null);
    try {
      const isEdit = !!editUser;
      const action = isEdit ? 'edit-user' : 'add-user';
      const body = isEdit ? { id: editUser!.id, ...formData } : formData;
      const res = await fetch(`/api/auth?action=${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      await loadUsers();
      setShowForm(false);
      setEditUser(undefined);
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch('/api/auth?action=delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete');
      await loadUsers();
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    try {
      const res = await fetch('/api/auth?action=edit-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: revokeTarget.id, is_active: !revokeTarget.is_active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      await loadUsers();
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setRevokeTarget(null);
    }
  };

  const activeCount  = users.filter(u => u.is_active && !u.is_demo).length;
  const demoCount    = users.filter(u => u.is_demo).length;
  const revokedCount = users.filter(u => !u.is_active).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="loading loading-spinner loading-md text-primary" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="max-w-xl mx-auto mt-8 bg-error/10 border border-error/20 rounded-xl p-4 text-sm text-error flex items-center gap-2">
        <AlertCircle size={16} className="flex-none" /> {fetchError}
        <button className="btn btn-xs btn-ghost ml-auto" onClick={loadUsers}>Retry</button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-5">
      {/* Info banner */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-3">
        <Shield size={14} className="text-blue-500 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-700 leading-relaxed">
          <strong>Phone-based access control.</strong> Only numbers listed here can log in to TC Command via OTP.
          Each user's <strong>User ID</strong> is assigned on first login and tags all their activity in audit logs.
          The User ID is their <code className="bg-blue-100 px-1 rounded font-mono text-[10px]">profiles.id</code> — used across sessions, audit trail, and communications.
        </p>
      </div>

      {/* Action error */}
      {actionError && (
        <div className="flex items-center gap-2 bg-error/10 border border-error/20 rounded-xl px-3 py-2 text-xs text-error">
          <AlertCircle size={13} className="flex-none" /> {actionError}
          <button className="ml-auto btn btn-ghost btn-xs" onClick={() => setActionError(null)}><X size={11} /></button>
        </div>
      )}

      {/* Stats + Add button */}
      <div className="flex items-center gap-4">
        <div className="flex-1 flex gap-3 flex-wrap">
          <div className="stat bg-base-200 rounded-xl p-3 flex-1 min-w-[80px]">
            <div className="stat-title text-xs">Total</div>
            <div className="stat-value text-2xl">{users.length}</div>
          </div>
          <div className="stat bg-success/10 rounded-xl p-3 flex-1 min-w-[80px]">
            <div className="stat-title text-xs text-success/70">Active</div>
            <div className="stat-value text-2xl text-success">{activeCount}</div>
          </div>
          {demoCount > 0 && (
            <div className="stat bg-amber-50 rounded-xl p-3 flex-1 min-w-[80px]">
              <div className="stat-title text-xs text-amber-600">Demo</div>
              <div className="stat-value text-2xl text-amber-500">{demoCount}</div>
            </div>
          )}
          {revokedCount > 0 && (
            <div className="stat bg-base-200 rounded-xl p-3 flex-1 min-w-[80px]">
              <div className="stat-title text-xs text-base-content/40">Revoked</div>
              <div className="stat-value text-2xl text-base-content/30">{revokedCount}</div>
            </div>
          )}
        </div>
        <button
          className="btn btn-primary btn-sm gap-1.5 flex-none"
          onClick={() => { setEditUser(undefined); setShowForm(true); }}
        >
          <Plus size={14} /> Add User
        </button>
      </div>

      {/* User list */}
      {users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-base-content/40">
          <UserCheck size={40} strokeWidth={1.5} />
          <p className="text-sm">No users yet. Add your first team member.</p>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
            <Plus size={13} /> Add First User
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {users.map(u => {
            const ri = ACCESS_ROLE_INFO[u.role] || { label: u.role, color: 'badge-ghost' };
            const initials = u.name.split(' ').map((n: string) => n[0] || '').join('').slice(0, 2).toUpperCase() || '?';
            const isOnline = u.active_sessions > 0;

            return (
              <div
                key={u.id}
                className={`rounded-xl border transition-all ${
                  !u.is_active
                    ? 'bg-base-200/50 border-base-300 opacity-60'
                    : u.is_demo
                    ? 'bg-amber-50/40 border-amber-200'
                    : 'bg-base-100 border-base-300 hover:border-base-400'
                }`}
              >
                <div className="flex items-center gap-3 p-3">
                  {/* Avatar with online indicator */}
                  <div className="relative flex-none">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                        u.is_active ? 'bg-primary text-primary-content' : 'bg-base-300 text-base-content/40'
                      }`}
                    >
                      {initials}
                    </div>
                    {isOnline && (
                      <span
                        className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-success border-2 border-base-100"
                        title={`${u.active_sessions} active session${u.active_sessions !== 1 ? 's' : ''}`}
                      />
                    )}
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-base-content">{u.name}</span>
                      <span className={`badge badge-sm ${ri.color}`}>{ri.label}</span>
                      {u.is_demo && <span className="badge badge-sm badge-warning gap-1">⚡ Demo</span>}
                      {!u.is_active && <span className="badge badge-sm badge-ghost text-base-content/40">Revoked</span>}
                      {isOnline && !u.is_demo && (
                        <span className="badge badge-sm badge-success gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-success-content inline-block" />
                          Online
                        </span>
                      )}
                    </div>

                    {/* Phone + Email */}
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-xs text-base-content/60 font-mono">{formatPhoneDisplay(u.phone)}</span>
                      {u.email && (
                        <span className="text-xs text-base-content/40">{u.email}</span>
                      )}
                    </div>

                    {/* User ID row */}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {u.profile_id ? (
                        <div className="flex items-center gap-1.5 bg-base-200 rounded-lg px-2 py-0.5">
                          <span className="text-[10px] text-base-content/40 font-mono select-all" title={u.profile_id}>
                            UID: {u.profile_id.slice(0, 8)}…
                          </span>
                          <button
                            className="flex items-center gap-0.5 text-[10px] text-base-content/30 hover:text-primary transition-colors"
                            onClick={() => copyUserId(u.profile_id!)}
                            title="Copy full User ID (used in audit logs)"
                          >
                            {copiedId === u.profile_id
                              ? <><CheckCheck size={9} className="text-success" /><span className="text-success font-medium">Copied!</span></>
                              : <><Copy size={9} /> copy</>}
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-base-content/25 italic bg-base-200 rounded px-2 py-0.5">
                          UID assigned on first login
                        </span>
                      )}
                      {u.last_login && (
                        <span className="text-[10px] text-base-content/30">
                          Last login: {timeAgoShort(u.last_login)}
                        </span>
                      )}
                      {!u.last_login && u.is_active && !u.is_demo && (
                        <span className="text-[10px] text-base-content/25 italic">Never logged in</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 flex-none">
                    <button
                      className="btn btn-xs btn-ghost tooltip tooltip-left"
                      data-tip={u.is_active ? 'Revoke access' : 'Restore access'}
                      onClick={() => setRevokeTarget(u)}
                      title={u.is_active ? 'Revoke access' : 'Restore access'}
                    >
                      <Ban size={13} className={u.is_active ? 'text-base-content/30 hover:text-warning' : 'text-success'} />
                    </button>
                    <button
                      className="btn btn-xs btn-ghost"
                      title="Edit user"
                      onClick={() => { setEditUser(u); setShowForm(true); }}
                    >
                      <Pencil size={13} className="text-base-content/40" />
                    </button>
                    <button
                      className="btn btn-xs btn-ghost"
                      title="Delete user"
                      onClick={() => setDeleteTarget(u)}
                    >
                      <Trash2 size={13} className="text-error/50 hover:text-error" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit modal */}
      {showForm && (
        <UserAccessForm
          user={editUser}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditUser(undefined); }}
          saving={saving}
        />
      )}

      {/* Delete confirm */}
      <ConfirmModal
        isOpen={deleteTarget !== null}
        title="Remove user access?"
        message={`${deleteTarget?.name ?? 'This user'} will be permanently removed from the whitelist and their sessions invalidated. They will not be able to log in until re-added.`}
        confirmLabel="Remove Access"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Revoke/Restore confirm */}
      <ConfirmModal
        isOpen={revokeTarget !== null}
        title={revokeTarget?.is_active ? 'Revoke access?' : 'Restore access?'}
        message={
          revokeTarget?.is_active
            ? `${revokeTarget.name}'s access will be suspended and all active sessions will be invalidated immediately.`
            : `${revokeTarget?.name}'s access will be restored. They can log in again.`
        }
        confirmLabel={revokeTarget?.is_active ? 'Revoke' : 'Restore'}
        onConfirm={handleRevoke}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
}
