import React, { useState, useEffect } from 'react';
import { LoadingSpinner } from './ui/LoadingSpinner';
import {
  Sun,
  Clock,
  Globe,
  Mail,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Send,
  X,
  ListChecks,
  CalendarClock,
  FileWarning,
  Inbox,
} from 'lucide-react';
import type { EmailTemplate, BriefingConfig } from '../types';
import { loadBriefingConfig, saveBriefingConfig } from '../utils/supabaseDb';

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
];

const TIMEZONE_LABELS: Record<string, string> = {
  'America/New_York': 'Eastern (ET)',
  'America/Chicago': 'Central (CT)',
  'America/Denver': 'Mountain (MT)',
  'America/Los_Angeles': 'Pacific (PT)',
  'America/Phoenix': 'Arizona (MST)',
  'America/Anchorage': 'Alaska (AKT)',
  'Pacific/Honolulu': 'Hawaii (HST)',
};

interface Props {
  emailTemplates: EmailTemplate[];
  onSave: () => void;
}

export default function BriefingConfigPanel({ emailTemplates, onSave }: Props) {
  const [config, setConfig] = useState<BriefingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // New email input
  const [emailInput, setEmailInput] = useState('');

  useEffect(() => {
    loadBriefingConfig()
      .then((c) => {
        setConfig(
          c || {
            id: '',
            enabled: false,
            sendTime: '08:00',
            timezone: 'America/Chicago',
            toAddresses: ['tc@myredeal.com'],
            includeOverdueTasks: true,
            includeUpcomingCloses: true,
            includePendingDocs: true,
            includeNewEmails: true,
            createdAt: '',
            updatedAt: '',
          }
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  };

  const updateField = <K extends keyof BriefingConfig>(
    key: K,
    value: BriefingConfig[K]
  ) => {
    setConfig((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const addEmail = () => {
    const email = emailInput.trim().toLowerCase();
    if (email && email.includes('@') && config && !config.toAddresses.includes(email)) {
      updateField('toAddresses', [...config.toAddresses, email]);
    }
    setEmailInput('');
  };

  const removeEmail = (email: string) => {
    if (config) {
      updateField(
        'toAddresses',
        config.toAddresses.filter((e) => e !== email)
      );
    }
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await saveBriefingConfig(config);
      showToast('success', 'Briefing config saved!');
      onSave();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to save config.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestSend = async () => {
    if (!config) return;
    setTestSending(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const res = await fetch(`${supabaseUrl}/functions/v1/send-briefing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ test: true }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Test send failed (${res.status})`);
      }

      showToast('success', 'Test briefing sent!');
    } catch (err: any) {
      showToast('error', err.message || 'Failed to send test briefing.');
    } finally {
      setTestSending(false);
    }
  };

  if (loading) {
    return (
      <LoadingSpinner label="Loading briefing config…" />
    );
  }

  if (!config) return null;

  return (
    <div className="max-w-xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-lg font-semibold text-black flex items-center gap-2">
            <Sun size={20} />
            Morning Briefing
          </h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Daily summary of your deals delivered to your inbox.
          </p>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-sm text-gray-600">
            {config.enabled ? 'Active' : 'Off'}
          </span>
          <input
            type="checkbox"
            className="toggle toggle-primary toggle-sm"
            checked={config.enabled}
            onChange={(e) => updateField('enabled', e.target.checked)}
          />
        </label>
      </div>

      <div
        className={`space-y-5 ${!config.enabled ? 'opacity-50 pointer-events-none' : ''}`}
      >
        {/* Send Time & Timezone */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
              <Clock size={14} />
              Send Time
            </label>
            <input
              type="time"
              className="input input-bordered input-sm w-full"
              value={config.sendTime}
              onChange={(e) => updateField('sendTime', e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
              <Globe size={14} />
              Timezone
            </label>
            <select
              className="select select-bordered select-sm w-full"
              value={config.timezone}
              onChange={(e) => updateField('timezone', e.target.value)}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {TIMEZONE_LABELS[tz] || tz}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Template */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
            <Mail size={14} />
            Email Template (optional)
          </label>
          <select
            className="select select-bordered select-sm w-full"
            value={config.templateId || ''}
            onChange={(e) => updateField('templateId', e.target.value || undefined)}
          >
            <option value="">Default briefing format</option>
            {emailTemplates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </select>
        </div>

        {/* Include sections */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Include in briefing:</p>
          <div className="space-y-2">
            {[
              {
                key: 'includeOverdueTasks' as const,
                label: 'Overdue tasks',
                icon: <ListChecks size={14} />,
              },
              {
                key: 'includeUpcomingCloses' as const,
                label: 'Upcoming closings (next 7 days)',
                icon: <CalendarClock size={14} />,
              },
              {
                key: 'includePendingDocs' as const,
                label: 'Pending documents',
                icon: <FileWarning size={14} />,
              },
              {
                key: 'includeNewEmails' as const,
                label: 'New unread emails',
                icon: <Inbox size={14} />,
              },
            ].map(({ key, label, icon }) => (
              <label
                key={key}
                className="flex items-center gap-2.5 cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm checkbox-primary"
                  checked={config[key]}
                  onChange={(e) => updateField(key, e.target.checked)}
                />
                <span className="text-gray-500">{icon}</span>
                <span className="text-sm text-gray-700">{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Recipients */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
            <Mail size={14} />
            Recipients
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {config.toAddresses.map((email) => (
              <span
                key={email}
                className="badge badge-sm gap-1 bg-gray-100 text-gray-700 border-gray-200"
              >
                {email}
                <button
                  type="button"
                  onClick={() => removeEmail(email)}
                  className="hover:text-red-500"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="email"
              className="input input-bordered input-sm flex-1"
              placeholder="Add email address…"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addEmail();
                }
              }}
            />
            <button className="btn btn-sm btn-ghost" onClick={addEmail}>
              Add
            </button>
          </div>
        </div>

        {/* Last sent */}
        {config.lastSentAt && (
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-500">
              Last sent:{' '}
              <span className="text-gray-700 font-medium">
                {new Date(config.lastSentAt).toLocaleString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-6 pt-4 border-t border-gray-100">
        <button
          className="btn btn-primary btn-sm gap-1.5"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Save size={14} />
          )}
          Save Config
        </button>

        <button
          className="btn btn-outline btn-sm gap-1.5"
          onClick={handleTestSend}
          disabled={testSending || !config.enabled}
        >
          {testSending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Send size={14} />
          )}
          Test Send
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
              toast.type === 'success'
                ? 'bg-green-600 text-white'
                : 'bg-red-600 text-white'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
