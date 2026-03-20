import React, { useEffect, useRef, useState } from 'react';
import {
  Bell, Clock, Mail, Save, Send, CheckCircle2,
  AlertCircle, Loader2, X, Plus, ToggleLeft, ToggleRight, Users, Search,
} from 'lucide-react';
import { loadBriefingConfig, saveBriefingConfig } from '../../utils/supabaseDb';
import { supabase } from '../../lib/supabase';
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

interface AgentContact {
  id: string;
  fullName: string;
  email: string;
  briefingEnabled: boolean;
}

/* ─── Email chip input ─────────────────────────────────────────────────── */
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
        placeholder={emails.length === 0 ? 'Add email address...' : ''}
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

/* ─── Section toggle ───────────────────────────────────────────────────── */
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

/* ─── Agent avatar ─────────────────────────────────────────────────────── */
function AgentAvatar({ name }: { name: string }) {
  const initials = name.split(' ').map(w => w[0] ?? '').slice(0, 2).join('').toUpperCase();
  return (
    <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
      <span className="text-xs font-bold text-primary">{initials || '?'}</span>
    </div>
  );
}

/* ─── Searchable agent dropdown ────────────────────────────────────────── */
function AgentSearchDropdown({
  allAgents,
  enabledIds,
  onAdd,
}: {
  allAgents: AgentContact[];
  enabledIds: Set<string>;
  onAdd: (agent: AgentContact) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const available = allAgents.filter(
    (a) => !enabledIds.has(a.id) && a.email &&
      a.fullName.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex items-center gap-2 border border-base-300 rounded-lg px-3 py-2 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/30 bg-base-100 cursor-text"
        onClick={() => setOpen(true)}
      >
        <Search size={14} className="text-base-content/40 shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search agents to add..."
          className="flex-1 outline-none text-sm bg-transparent"
        />
      </div>

      {open && available.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-base-100 border border-base-300 rounded-xl shadow-lg z-50 max-h-52 overflow-y-auto">
          {available.map((agent) => (
            <button
              key={agent.id}
              type="button"
              className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-base-200 transition-colors text-left"
              onMouseDown={(e) => {
                e.preventDefault(); // prevent blur closing before click registers
                onAdd(agent);
                setQuery('');
                setOpen(false);
              }}
            >
              <AgentAvatar name={agent.fullName} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-base-content truncate">{agent.fullName}</p>
                <p className="text-xs text-base-content/50 truncate">{agent.email}</p>
              </div>
              <Plus size={14} className="text-primary shrink-0" />
            </button>
          ))}
        </div>
      )}

      {open && available.length === 0 && query.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-base-100 border border-base-300 rounded-xl shadow-lg z-50 px-3 py-3 text-sm text-base-content/50">
          No matching active agents found.
        </div>
      )}
    </div>
  );
}

/* ─── Main component ───────────────────────────────────────────────────── */
export function BriefingConfigPanel() {
  const [config, setConfig] = useState<BriefingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [allAgents, setAllAgents] = useState<AgentContact[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [togglingAgent, setTogglingAgent] = useState<string | null>(null);

  useEffect(() => {
    loadBriefingConfig()
      .then(setConfig)
      .finally(() => setLoading(false));
    fetchAgents();
  }, []);

  async function fetchAgents() {
    setAgentsLoading(true);
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, full_name, first_name, last_name, email, briefing_enabled')
        .eq('contact_type', 'agent')
        .eq('is_active', true)          // inactive agents never appear
        .not('email', 'is', null)       // must have an email to receive briefings
        .order('last_name', { ascending: true });

      if (error) throw error;
      setAllAgents((data ?? []).map((row: any) => ({
        id: row.id,
        fullName: row.full_name || `${row.first_name || ''} ${row.last_name || ''}`.trim() || '(unnamed)',
        email: row.email || '',
        briefingEnabled: row.briefing_enabled ?? false,
      })));
    } catch (e) {
      console.error('Failed to load agent contacts', e);
    } finally {
      setAgentsLoading(false);
    }
  }

  // Agents currently enabled for briefings
  const enabledAgents = allAgents.filter(a => a.briefingEnabled);
  const enabledIds = new Set(enabledAgents.map(a => a.id));

  async function addAgent(agent: AgentContact) {
    setTogglingAgent(agent.id);
    try {
      const { error } = await supabase
        .from('contacts')
        .update({ briefing_enabled: true, updated_at: new Date().toISOString() })
        .eq('id', agent.id);
      if (error) throw error;
      setAllAgents(prev => prev.map(a => a.id === agent.id ? { ...a, briefingEnabled: true } : a));
    } catch (e: any) {
      showToast('error', 'Failed to enable briefing: ' + (e.message || ''));
    } finally {
      setTogglingAgent(null);
    }
  }

  async function removeAgent(agentId: string) {
    setTogglingAgent(agentId);
    try {
      const { error } = await supabase
        .from('contacts')
        .update({ briefing_enabled: false, updated_at: new Date().toISOString() })
        .eq('id', agentId);
      if (error) throw error;
      setAllAgents(prev => prev.map(a => a.id === agentId ? { ...a, briefingEnabled: false } : a));
    } catch (e: any) {
      showToast('error', 'Failed to disable briefing: ' + (e.message || ''));
    } finally {
      setTogglingAgent(null);
    }
  }

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

      const result = await res.json();
      const agentCount = result.agentBriefings?.filter((a: any) => a.success).length ?? 0;
      const msg = agentCount > 0
        ? `Briefing sent! Also sent to ${agentCount} agent${agentCount > 1 ? 's' : ''}.`
        : `Test briefing sent to ${config.toAddresses.join(', ')}`;
      showToast('success', msg);

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

      {/* TC Recipients */}
      <div className="bg-base-100 border border-base-300 rounded-xl p-5 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-base-content flex items-center gap-2">
          <Mail size={15} className="text-primary" /> TC Recipients
        </h3>
        <p className="text-xs text-base-content/50">Press Enter or comma to add each address.</p>
        <EmailChipInput
          emails={config.toAddresses}
          onChange={(toAddresses) => update({ toAddresses })}
        />
      </div>

      {/* Briefing Sections */}
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

      {/* Per-Agent Briefings */}
      <div className="bg-base-100 border border-base-300 rounded-xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-base-content flex items-center gap-2">
            <Users size={15} className="text-primary" /> Per-Agent Briefings
            {enabledAgents.length > 0 && (
              <span className="badge badge-primary badge-sm">{enabledAgents.length} active</span>
            )}
          </h3>
        </div>
        <p className="text-xs text-base-content/50 leading-relaxed -mt-2">
          Each enabled agent receives a personalized morning email showing only their deals.
          Inactive agents are automatically excluded and removed from this list.
        </p>

        {/* Enabled agent chips */}
        {agentsLoading ? (
          <div className="flex items-center gap-2 text-sm text-base-content/50">
            <Loader2 size={14} className="animate-spin" /> Loading agents...
          </div>
        ) : enabledAgents.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {enabledAgents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center gap-2 px-3 py-1.5 bg-primary/8 border border-primary/20 rounded-full text-sm"
              >
                <AgentAvatar name={agent.fullName} />
                <div className="flex flex-col min-w-0">
                  <span className="font-medium text-base-content text-xs leading-tight truncate max-w-[120px]">{agent.fullName}</span>
                  <span className="text-base-content/50 text-[10px] truncate max-w-[120px]">{agent.email}</span>
                </div>
                <button
                  type="button"
                  className="ml-1 text-base-content/40 hover:text-red-500 transition-colors disabled:opacity-40"
                  disabled={togglingAgent === agent.id}
                  onClick={() => removeAgent(agent.id)}
                  title="Remove from briefing list"
                >
                  {togglingAgent === agent.id
                    ? <Loader2 size={12} className="animate-spin" />
                    : <X size={12} />}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-base-content/40 italic">
            No agents added yet — use the search below to add agents.
          </p>
        )}

        {/* Searchable dropdown to add more */}
        <AgentSearchDropdown
          allAgents={allAgents}
          enabledIds={enabledIds}
          onAdd={addAgent}
        />

        {allAgents.length === 0 && !agentsLoading && (
          <p className="text-xs text-base-content/40 text-center py-2">
            No active agent contacts with email addresses found.
          </p>
        )}
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
          title={config.toAddresses.length === 0 ? 'Add at least one TC recipient first' : ''}
        >
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Send Test Now
        </button>
        <span className="text-xs text-base-content/40 ml-auto">
          {config.toAddresses.length} TC recipient{config.toAddresses.length !== 1 ? 's' : ''}
          {enabledAgents.length > 0 && ` · ${enabledAgents.length} agent${enabledAgents.length > 1 ? 's' : ''}`}
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
