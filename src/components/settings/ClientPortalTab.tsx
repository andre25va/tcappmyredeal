import React, { useEffect, useMemo, useState } from 'react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import {
  Globe,
  Shield,
  Eye,
  MessageSquare,
  Check,
  Loader2,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { usePortalSettings, useInvalidatePortalSettings } from '../../hooks/usePortalSettings';

// ── Types ─────────────────────────────────────────────────────────────────────
interface PortalSettings {
  portal_show_status: boolean;
  portal_show_closing_date: boolean;
  portal_show_next_item: boolean;
  portal_welcome_message: string;
  portal_request_types: string[];
  portal_allowed_roles: string[];
}

const ALL_REQUEST_TYPES = [
  'Document Request',
  'Milestone Status',
  'General Question',
  'Deal Sheet',
  'Special Task Request',
];

const ALL_ROLES: { value: string; label: string }[] = [
  { value: 'lead_agent', label: 'Agent (Lead)' },
  { value: 'co_agent', label: 'Agent (Co-Agent)' },
  { value: 'buyer', label: 'Buyer' },
  { value: 'seller', label: 'Seller' },
  { value: 'lender', label: 'Lender / Loan Officer' },
  { value: 'title_officer', label: 'Title Officer' },
  { value: 'inspector', label: 'Inspector' },
  { value: 'appraiser', label: 'Appraiser' },
];

const DEFAULT_SETTINGS: PortalSettings = {
  portal_show_status: true,
  portal_show_closing_date: true,
  portal_show_next_item: true,
  portal_welcome_message: '',
  portal_request_types: [...ALL_REQUEST_TYPES],
  portal_allowed_roles: ALL_ROLES.map((r) => r.value),
};

// ── DB helpers ────────────────────────────────────────────────────────────────
function mapRawToSettings(raw: { key: string; value: unknown }[]): PortalSettings {
  const map: Record<string, unknown> = {};
  for (const row of raw) map[row.key] = row.value;

  return {
    portal_show_status:
      map.portal_show_status !== undefined
        ? Boolean(map.portal_show_status)
        : DEFAULT_SETTINGS.portal_show_status,
    portal_show_closing_date:
      map.portal_show_closing_date !== undefined
        ? Boolean(map.portal_show_closing_date)
        : DEFAULT_SETTINGS.portal_show_closing_date,
    portal_show_next_item:
      map.portal_show_next_item !== undefined
        ? Boolean(map.portal_show_next_item)
        : DEFAULT_SETTINGS.portal_show_next_item,
    portal_welcome_message:
      typeof map.portal_welcome_message === 'string'
        ? map.portal_welcome_message
        : DEFAULT_SETTINGS.portal_welcome_message,
    portal_request_types: Array.isArray(map.portal_request_types)
      ? (map.portal_request_types as string[])
      : DEFAULT_SETTINGS.portal_request_types,
    portal_allowed_roles: Array.isArray(map.portal_allowed_roles)
      ? (map.portal_allowed_roles as string[])
      : DEFAULT_SETTINGS.portal_allowed_roles,
  };
}

async function savePortalSettings(settings: PortalSettings): Promise<void> {
  const rows = (Object.entries(settings) as [string, unknown][]).map(([key, value]) => ({
    key,
    value,
    updated_at: new Date().toISOString(),
  }));

  for (const row of rows) {
    const { error } = await supabase
      .from('settings')
      .upsert(row, { onConflict: 'key' });
    if (error) throw error;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export function ClientPortalTab() {
  const { data: rawSettings, isLoading } = usePortalSettings();
  const invalidatePortalSettings = useInvalidatePortalSettings();

  const loadedSettings = useMemo(
    () => mapRawToSettings(rawSettings ?? []),
    [rawSettings],
  );

  const [settings, setSettings] = useState<PortalSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [dirty, setDirty] = useState(false);

  // Sync local state when hook data loads/refreshes
  useEffect(() => {
    if (!isLoading && rawSettings) {
      setSettings(loadedSettings);
      setDirty(false);
    }
  }, [isLoading, rawSettings, loadedSettings]);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const update = <K extends keyof PortalSettings>(key: K, value: PortalSettings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
    setDirty(true);
  };

  const toggleBool = (key: 'portal_show_status' | 'portal_show_closing_date' | 'portal_show_next_item') =>
    update(key, !settings[key]);

  const toggleRequestType = (type: string) => {
    const next = settings.portal_request_types.includes(type)
      ? settings.portal_request_types.filter((t) => t !== type)
      : [...settings.portal_request_types, type];
    update('portal_request_types', next);
  };

  const toggleRole = (role: string) => {
    const next = settings.portal_allowed_roles.includes(role)
      ? settings.portal_allowed_roles.filter((r) => r !== role)
      : [...settings.portal_allowed_roles, role];
    update('portal_allowed_roles', next);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await savePortalSettings(settings);
      setDirty(false);
      invalidatePortalSettings();
      showToast('success', 'Portal settings saved!');
    } catch {
      showToast('error', 'Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    invalidatePortalSettings();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <LoadingSpinner label="Loading portal settings…" />
    );
  }

  return (
    <div className="space-y-5 max-w-2xl">

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2
            ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}
        >
          {toast.type === 'success' && <Check size={14} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Globe size={16} className="text-[#1B2C5E]" />
            Client Portal Settings
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Control what your clients see at{' '}
            <a
              href="https://client.myredeal.com"
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:underline inline-flex items-center gap-0.5"
            >
              client.myredeal.com <ExternalLink size={11} />
            </a>
          </p>
        </div>
        <button
          onClick={handleReset}
          className="btn btn-ghost btn-xs gap-1 text-gray-500"
          title="Reload settings"
        >
          <RefreshCw size={12} /> Reload
        </button>
      </div>

      {/* Deal Card Visibility */}
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
          <Eye size={14} className="text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700">Deal Card Sections</h3>
          <span className="text-xs text-gray-400 ml-1">— what shows on client deal cards</span>
        </div>
        <div className="divide-y divide-gray-100">
          {[
            {
              key: 'portal_show_status' as const,
              label: 'Deal Status',
              desc: 'Under Contract, Clear to Close, etc.',
            },
            {
              key: 'portal_show_closing_date' as const,
              label: 'Closing Date',
              desc: 'The scheduled closing date',
            },
            {
              key: 'portal_show_next_item' as const,
              label: "What's Next",
              desc: 'Next pending task or milestone',
            },
          ].map(({ key, label, desc }) => (
            <label
              key={key}
              className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-gray-50 transition"
            >
              <div>
                <p className="text-sm font-medium text-gray-800">{label}</p>
                <p className="text-xs text-gray-400">{desc}</p>
              </div>
              <input
                type="checkbox"
                checked={settings[key]}
                onChange={() => toggleBool(key)}
                className="toggle toggle-primary toggle-sm"
              />
            </label>
          ))}
        </div>
      </section>

      {/* Request Types */}
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
          <MessageSquare size={14} className="text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700">Available Request Types</h3>
          <span className="text-xs text-gray-400 ml-1">— what clients can submit</span>
        </div>
        <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {ALL_REQUEST_TYPES.map((type) => (
            <label key={type} className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={settings.portal_request_types.includes(type)}
                onChange={() => toggleRequestType(type)}
                className="checkbox checkbox-primary checkbox-sm"
              />
              <span className="text-sm text-gray-700 group-hover:text-gray-900">{type}</span>
            </label>
          ))}
        </div>
        {settings.portal_request_types.length === 0 && (
          <p className="px-5 pb-3 text-xs text-amber-600 font-medium">
            ⚠ At least one request type must be enabled.
          </p>
        )}
      </section>

      {/* Portal Access by Role */}
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
          <Shield size={14} className="text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700">Portal Access by Role</h3>
          <span className="text-xs text-gray-400 ml-1">— which deal participants can log in</span>
        </div>
        <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {ALL_ROLES.map(({ value, label }) => (
            <label key={value} className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={settings.portal_allowed_roles.includes(value)}
                onChange={() => toggleRole(value)}
                className="checkbox checkbox-primary checkbox-sm"
              />
              <span className="text-sm text-gray-700 group-hover:text-gray-900">{label}</span>
            </label>
          ))}
        </div>
        {settings.portal_allowed_roles.length === 0 && (
          <p className="px-5 pb-3 text-xs text-amber-600 font-medium">
            ⚠ No roles selected — no one will be able to log in.
          </p>
        )}
      </section>

      {/* Custom Welcome Message */}
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700">Custom Welcome Message</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Shown on the portal login screen — leave blank for default
          </p>
        </div>
        <div className="px-5 py-4">
          <textarea
            value={settings.portal_welcome_message}
            onChange={(e) => update('portal_welcome_message', e.target.value)}
            placeholder="e.g. Log in with your phone number and the PIN provided by your TC."
            rows={3}
            className="textarea textarea-bordered w-full text-sm resize-none"
            maxLength={250}
          />
          <p className="text-xs text-gray-400 mt-1">
            {settings.portal_welcome_message.length}/250 characters
          </p>
        </div>
      </section>

      {/* Save bar */}
      <div className="flex items-center justify-between pt-1 pb-2">
        <p className="text-xs text-gray-400">
          {dirty ? '● Unsaved changes' : 'All changes saved'}
        </p>
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="btn btn-primary btn-sm gap-2"
        >
          {saving ? (
            <><Loader2 size={14} className="animate-spin" /> Saving…</>
          ) : (
            <><Check size={14} /> Save Portal Settings</>
          )}
        </button>
      </div>
    </div>
  );
}
