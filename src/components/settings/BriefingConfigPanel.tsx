import React, { useEffect, useState } from 'react';
import {
  Bell, Clock, Mail, Save, Send, CheckCircle2,
  AlertCircle, Loader2, X, Plus, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { loadBriefingConfig, saveBriefingConfig } from '../../utils/supabaseDb';
import type { BriefingConfig } from '../../types';

const TIMEZONES = [
  { value: 'America/Chicago',      label: 'Central Time (CT)' },
  { value: 'America/New_York',     label: 'Eastern Time (ET)' },
  { value: 'America/Denver',       label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles',  label: 'Pacific Time (PT)' },
  { value: 'America/Phoenix',      label: 'Arizona (MST, no DST)' },
  { value: 'America/Anchorage',    label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu',     label: 'Hawaii Time (HST)' },
];

function EmailChipInput({
  emails,
  onChange,
}: {
  emails: string[];
  onChange: (emails: string[]) => void;
}) {
  const [input, setInput] = useState('');

  const add = (raw: string) => {
    const email = raw.trim().toLowerCase();
    if (email && email.includes('@') && !emails.includes(email)) {
      onChange([...emails, email]);
    }
    setInput('');
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 border border-base-300 rounded-lg px-2.5 py-2 min-h-[42px] focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/30 bg-base-100">
      {emails.map((email) => (
        <span key={email} className="badge badge-sm gap-1 bg-primary/10 text-primary border-primary/20">
          {email}
          <button type="button" onClick={() => onChange(emails.filter((e) => e !== email))} className="hover:text-red-500">
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
            e.preventDefault();
            add(input);
          } else if (e.key === 'Backspace' && !input && emails.length) {
            onChange(emails.slice(0, -1));
          }
        }}
        onBlur={() => input && add(input)}
        placeholder={emails.length === 0 ? 'Add email address…' : ''}
        className="flex-1 min-w-[160px] outline-none text-sm bg-transparent"
      />
      {input && (
        <button
          type="button"
          className="btn btn-xs btn-ghost text-primary"
          onClick={() => add(input)}
        >
          <Plus size={12} /> Add
        </button>
      )}
    </div>
  );
}

function SectionToggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
        value
          ? 'border-primary/30 bg-primary/5'
          : 'border-base-300 bg-base-100 hover:border-base-400'
      }`}
      onClick={() => onChange(!value)}
    >
      <div className="mt-0.5">
        {value ? (
          <ToggleRight size={20} className="text-primary" />
        ) : (
          <ToggleLeft size={20} className="text-base-content/30" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-base-content">{label}</p>
        <p className="text-xs text-base-content/50 mt-0.5">{description}</p>
      </div>
    </div>
  );
}

export function BriefingConfigPanel() {
  const [config, setConfig] = useState<BriefingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    loadBriefingConfig()
      .then(setConfig)
      .finally(() => setLoading(false));
  }, []);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await saveBriefingConfig(config);
      showToast('success', 'Briefing settings saved!');
    } catch (e: any) {
      showToast('error', e.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTestSend = async () => {
    if (!config) return;
    setTesting(true);
    try {
      // First save current config
      await saveBriefingConfig(config);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const res = await fetch(`${supabaseUrl}/functions/v1/send-briefing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ force: true }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Send failed (${res.status})`);
      }

      showToast('success', `Test briefing sent to ${config.toAddresses.join(', ')}`);
      // Refresh to show updated last_sent_at
      const updated = await loadBriefingConfig();
      if (updated) setConfig(updated);
    } catch (e: any) {
      showToast('error', e.message || 'Failed to send test briefing');
    } finally {
      setTesting(false);
    }
  };

  const update = (patch: Partial<BriefingConfig>) =>
    setConfig((prev) => (prev ? { ...prev, ...patch } : prev));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="loading loading-spinner loading-md text-primary" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="max-w-xl mx-auto mt-8 bg-error/10 border border-error/20 rounded-xl p-4 text-sm text-error">
        Failed to load briefing configuration. Please refresh and try again.
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">

      {/* Header card */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-start gap-3">
        <Bell size={18} className="text-primary mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-primary">Daily Morning Briefing</p>
          <p className="text-xs text-base-content/60 mt-0.5 leading-relaxed">
            A daily email summary of your active deals, overdue tasks, upcoming closes,
            and pending documents — sent automatically each morning.
          </p>
          {config.lastSentAt && (
            <p className="text-xs text-base-content/40 mt-1">
              Last sent: {new Date(config.lastSentAt).toLocaleString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
                hour: 'numeric', minute: '2-digit',
              })}
            </p>
          )}
        </div>
        <div className="ml-auto">
          <button
            className={`btn btn-sm gap-1.5 ${
              config.enabled ? 'btn-primary' : 'btn-ghost border border-base-300'
            }`}
            onClick={() => update({ enabled: !config.enabled })}
          >
            {config.enabled ? (
              <><ToggleRight size={15} /> Enabled</>
            ) : (
              <><ToggleLeft size={15} /> Disabled</>
            )}
          </button>
        </div>
      </div>

      {/* Schedule */}
      <div className="bg-base-100 border border-base-300 rounded-xl p-5 flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-base-content flex items-center gap-2">
          <Clock size={15} className="text-primary" /> Schedule
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label py-0.5">
              <span className="label-text text-xs font-medium">Send Time</span>
            </label>
            <input
              type="time"
              className="input input-bordered input-sm w-full"
              value={config.sendTime}
              onChange={(e) => update({ sendTime: e.target.value })}
            />
          </div>
          <div>
            <label className="label py-0.5">
              <span className="label-text text-xs font-medium">Timezone</span>
            </label>
            <select
              className="select select-bordered select-sm w-full"
              value={config.timezone}
              onChange={(e) => update({ timezone: e.target.value })}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Recipients */}
      <div className="bg-base-100 border border-base-300 rounded-xl p-5 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-base-content flex items-center gap-2">
          <Mail size={15} className="text-primary" /> Recipients
        </h3>
        <p className="text-xs text-base-content/50">Press Enter or comma to add each address.</p>
        <EmailChipInput
          emails={config.toAddresses}
          onChange={(toAddresses) => update({ toAddresses })}
        />
      </div>

      {/* Sections */}
      <div className="bg-base-100 border border-base-300 rounded-xl p-5 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-base-content">Briefing Sections</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <SectionToggle
            label="Overdue Tasks"
            description="Shows count of overdue vs total tasks"
            value={config.includeOverdueTasks}
            onChange={(v) => update({ includeOverdueTasks: v })}
          />
          <SectionToggle
            label="Upcoming Closes"
            description="Deals closing within the next 14 days"
            value={config.includeUpcomingCloses}
            onChange={(v) => update({ includeUpcomingCloses: v })}
          />
          <SectionToggle
            label="Pending Documents"
            description="Documents still awaiting receipt"
            value={config.includePendingDocs}
            onChange={(v) => update({ includePendingDocs: v })}
          />
          <SectionToggle
            label="Active Deals Table"
            description="Full table of all active deals"
            value={config.includeNewEmails}
            onChange={(v) => update({ includeNewEmails: v })}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pb-4">
        <button
          className="btn btn-primary btn-sm gap-1.5"
          onClick={handleSave}
          disabled={saving || testing}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save Settings
        </button>
        <button
          className="btn btn-outline btn-sm gap-1.5"
          onClick={handleTestSend}
          disabled={saving || testing || config.toAddresses.length === 0}
          title={config.toAddresses.length === 0 ? 'Add at least one recipient first' : ''}
        >
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Send Test Now
        </button>
        <span className="text-xs text-base-content/40 ml-auto">
          {config.toAddresses.length} recipient{config.toAddresses.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
              toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
