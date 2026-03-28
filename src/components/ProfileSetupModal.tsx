import React, { useState } from 'react';
import { User, Clock, Palette } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PageIdBadge } from './PageIdBadge';
import { PAGE_IDS } from '../utils/pageTracking';

const TIMEZONES = [
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Phoenix', label: 'Arizona (MST)' },
];

const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#06b6d4',
];

export function ProfileSetupModal() {
  const { profile, updateProfile, clearFirstLogin } = useAuth();
  const [name, setName] = useState(profile?.name || '');
  const [timezone, setTimezone] = useState(profile?.timezone || 'America/Chicago');
  const [avatarColor, setAvatarColor] = useState(profile?.avatar_color || '#6366f1');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const initials = name.trim()
    ? name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Please enter your name.'); return; }
    setSaving(true);
    setError('');
    try {
      await updateProfile({ name: name.trim(), timezone, avatar_color: avatarColor });
      clearFirstLogin();
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-primary p-6 text-primary-content">
          <h2 className="text-xl font-bold">Welcome to TC Command! 🎉</h2>
          <p className="text-sm opacity-80 mt-1">Let's set up your profile before you dive in.</p>
        </div>

        <form onSubmit={handleSave} className="p-6 flex flex-col gap-5">
          {/* Avatar preview */}
          <div className="flex justify-center">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-lg transition-colors"
              style={{ backgroundColor: avatarColor }}
            >
              {initials}
            </div>
          </div>

          {/* Name */}
          <div className="form-control">
            <label className="label py-1">
              <span className="label-text font-medium flex items-center gap-1.5">
                <User size={14} /> Your name
              </span>
            </label>
            <input
              autoFocus
              type="text"
              placeholder="e.g. Andre Vargas"
              className="input input-bordered w-full"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          {/* Timezone */}
          <div className="form-control">
            <label className="label py-1">
              <span className="label-text font-medium flex items-center gap-1.5">
                <Clock size={14} /> Time zone
              </span>
            </label>
            <select
              className="select select-bordered w-full"
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
            >
              {TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </div>

          {/* Avatar color */}
          <div className="form-control">
            <label className="label py-1">
              <span className="label-text font-medium flex items-center gap-1.5">
                <Palette size={14} /> Avatar color
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              {AVATAR_COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setAvatarColor(color)}
                  className={`w-8 h-8 rounded-full transition-all ${avatarColor === color ? 'ring-2 ring-offset-2 ring-base-content scale-110' : 'hover:scale-105'}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {error && <div className="alert alert-error py-2 text-sm">{error}</div>}

          <button type="submit" className="btn btn-primary w-full" disabled={saving}>
            {saving ? <span className="loading loading-spinner loading-sm" /> : 'Save & Enter TC Command →'}
          </button>
        </form>
      </div>

      {/* Page ID Badge */}
      <PageIdBadge pageId={PAGE_IDS.PROFILE_SETUP} />
    </div>
  );
}
