import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
import { AppUser, UserRole } from '../../types';
import { generateId } from '../../utils/helpers';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  tc: 'Transaction Coordinator',
  staff: 'Staff',
};

interface UserFormProps {
  user?: AppUser;
  onSave: (u: AppUser) => void;
  onClose: () => void;
}

export function UserForm({ user, onSave, onClose }: UserFormProps) {
  const [name,   setName]  = useState(user?.name  ?? '');
  const [email,  setEmail] = useState(user?.email ?? '');
  const [role,   setRole]  = useState<UserRole>(user?.role ?? 'staff');

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
          <button className="btn btn-ghost btn-xs btn-square" onClick={onClose}><X size={14}/></button>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="label py-0.5"><span className="label-text text-xs font-medium">Full Name</span></label>
            <input
              className="input input-bordered input-sm w-full"
              placeholder="e.g. Maria Lopez"
              value={name} onChange={e => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="label py-0.5"><span className="label-text text-xs font-medium">Email</span></label>
            <input
              type="email"
              className="input input-bordered input-sm w-full"
              placeholder="maria@tcoffice.com"
              value={email} onChange={e => setEmail(e.target.value)}
            />
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
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={!name.trim() || !email.trim()}>
            <Check size={13}/> Save
          </button>
        </div>
      </div>
    </div>
  );
}
