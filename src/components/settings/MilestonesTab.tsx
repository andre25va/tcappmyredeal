import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Plus, Pencil, Trash2, Check, X, Loader2, AlertCircle } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { ContactRecord, DealMilestone, MilestoneNotificationSetting, CustomMilestone } from '../../types';
import { MILESTONE_ORDER, MILESTONE_LABELS } from '../../utils/taskTemplates';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const supabase = createClient(supabaseUrl, supabaseKey);

interface Props {
  contactRecords: ContactRecord[];
}

const MERGE_TAGS = ['{{recipient_name}}', '{{property_address}}', '{{closing_date}}', '{{tc_name}}'];

const ROLE_KEYS = [
  { key: 'notifyBuyerAgent',  label: 'Buyer Agent',   short: 'BA' },
  { key: 'notifySellerAgent', label: 'Seller Agent',  short: 'SA' },
  { key: 'notifyLender',      label: 'Lender',        short: 'Lender' },
  { key: 'notifyTitle',       label: 'Title',         short: 'Title' },
  { key: 'notifyBuyer',       label: 'Buyer',         short: 'Buyer' },
  { key: 'notifySeller',      label: 'Seller',        short: 'Seller' },
] as const;

type RoleKey = typeof ROLE_KEYS[number]['key'];

interface NotifFields {
  notifyBuyerAgent: boolean;
  notifySellerAgent: boolean;
  notifyLender: boolean;
  notifyTitle: boolean;
  notifyBuyer: boolean;
  notifySeller: boolean;
  sendEmail: boolean;
  sendSms: boolean;
  emailSubject: string;
  emailBody: string;
  smsBody: string;
}

const defaultNotifFields = (): NotifFields => ({
  notifyBuyerAgent: true,
  notifySellerAgent: true,
  notifyLender: false,
  notifyTitle: false,
  notifyBuyer: false,
  notifySeller: false,
  sendEmail: true,
  sendSms: false,
  emailSubject: '',
  emailBody: '',
  smsBody: '',
});

function settingToFields(s: MilestoneNotificationSetting): NotifFields {
  return {
    notifyBuyerAgent: s.notifyBuyerAgent,
    notifySellerAgent: s.notifySellerAgent,
    notifyLender: s.notifyLender,
    notifyTitle: s.notifyTitle,
    notifyBuyer: s.notifyBuyer,
    notifySeller: s.notifySeller,
    sendEmail: s.sendEmail,
    sendSms: s.sendSms,
    emailSubject: s.emailSubject || '',
    emailBody: s.emailBody || '',
    smsBody: s.smsBody || '',
  };
}

/* ─── Notification Fields Form ─── */
const NotifForm: React.FC<{
  fields: NotifFields;
  onChange: (f: NotifFields) => void;
}> = ({ fields, onChange }) => {
  const emailSubjectRef = useRef<HTMLInputElement>(null);
  const emailBodyRef = useRef<HTMLTextAreaElement>(null);
  const smsBodyRef = useRef<HTMLTextAreaElement>(null);
  const lastFocused = useRef<'emailSubject' | 'emailBody' | 'smsBody' | null>(null);

  const insertMergeTag = (tag: string) => {
    if (lastFocused.current === 'emailSubject' && emailSubjectRef.current) {
      const el = emailSubjectRef.current;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const newVal = el.value.slice(0, start) + tag + el.value.slice(end);
      onChange({ ...fields, emailSubject: newVal });
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + tag.length, start + tag.length);
      }, 0);
    } else if (lastFocused.current === 'emailBody' && emailBodyRef.current) {
      const el = emailBodyRef.current;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const newVal = el.value.slice(0, start) + tag + el.value.slice(end);
      onChange({ ...fields, emailBody: newVal });
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + tag.length, start + tag.length);
      }, 0);
    } else if (lastFocused.current === 'smsBody' && smsBodyRef.current) {
      const el = smsBodyRef.current;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const newVal = el.value.slice(0, start) + tag + el.value.slice(end);
      onChange({ ...fields, smsBody: newVal });
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + tag.length, start + tag.length);
      }, 0);
    } else {
      // Default: append to emailBody
      onChange({ ...fields, emailBody: fields.emailBody + tag });
    }
  };

  return (
    <div className="space-y-4 pt-1">
      {/* Roles */}
      <div>
        <label className="text-xs font-semibold text-base-content/60 uppercase tracking-wide block mb-2">
          Roles to notify
        </label>
        <div className="flex flex-wrap gap-2">
          {ROLE_KEYS.map(r => (
            <label key={r.key} className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                className="checkbox checkbox-sm checkbox-primary"
                checked={fields[r.key as RoleKey]}
                onChange={e => onChange({ ...fields, [r.key]: e.target.checked })}
              />
              <span className="text-sm">{r.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Channels */}
      <div>
        <label className="text-xs font-semibold text-base-content/60 uppercase tracking-wide block mb-2">
          Channels
        </label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox checkbox-sm checkbox-primary"
              checked={fields.sendEmail}
              onChange={e => onChange({ ...fields, sendEmail: e.target.checked })}
            />
            <span className="text-sm">Email</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox checkbox-sm checkbox-success"
              checked={fields.sendSms}
              onChange={e => onChange({ ...fields, sendSms: e.target.checked })}
            />
            <span className="text-sm">SMS</span>
          </label>
        </div>
      </div>

      {/* Merge tag helper */}
      <div>
        <label className="text-xs text-base-content/40 block mb-1.5">
          Merge tags (click to insert into focused field):
        </label>
        <div className="flex flex-wrap gap-1.5">
          {MERGE_TAGS.map(tag => (
            <button
              key={tag}
              type="button"
              onClick={() => insertMergeTag(tag)}
              className="px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-primary text-xs font-mono hover:bg-primary/20 transition-colors"
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Email Subject */}
      {fields.sendEmail && (
        <div>
          <label className="text-xs font-semibold text-base-content/60 uppercase tracking-wide block mb-1">
            Email Subject
          </label>
          <input
            ref={emailSubjectRef}
            className="input input-bordered input-sm w-full"
            placeholder="e.g. Milestone Update: {{property_address}}"
            value={fields.emailSubject}
            onFocus={() => { lastFocused.current = 'emailSubject'; }}
            onChange={e => onChange({ ...fields, emailSubject: e.target.value })}
          />
        </div>
      )}

      {/* Email Body */}
      {fields.sendEmail && (
        <div>
          <label className="text-xs font-semibold text-base-content/60 uppercase tracking-wide block mb-1">
            Email Body
          </label>
          <textarea
            ref={emailBodyRef}
            className="textarea textarea-bordered w-full text-sm"
            rows={6}
            placeholder="Dear {{recipient_name}},&#10;&#10;Your transaction at {{property_address}} has reached a new milestone.&#10;&#10;Closing Date: {{closing_date}}&#10;&#10;Best regards,&#10;{{tc_name}}"
            value={fields.emailBody}
            onFocus={() => { lastFocused.current = 'emailBody'; }}
            onChange={e => onChange({ ...fields, emailBody: e.target.value })}
          />
        </div>
      )}

      {/* SMS Body */}
      {fields.sendSms && (
        <div>
          <label className="text-xs font-semibold text-base-content/60 uppercase tracking-wide block mb-1">
            SMS Body
          </label>
          <textarea
            ref={smsBodyRef}
            className="textarea textarea-bordered w-full text-sm"
            rows={3}
            placeholder="TC Update: {{property_address}} has reached a new milestone. Closing: {{closing_date}}. — {{tc_name}}"
            value={fields.smsBody}
            onFocus={() => { lastFocused.current = 'smsBody'; }}
            onChange={e => onChange({ ...fields, smsBody: e.target.value })}
          />
        </div>
      )}
    </div>
  );
};

/* ─── Standard Milestones Accordion Row ─── */
const MilestoneRow: React.FC<{
  milestone: DealMilestone;
  index: number;
  setting: MilestoneNotificationSetting | undefined;
  onSaved: (s: MilestoneNotificationSetting) => void;
}> = ({ milestone, index, setting, onSaved }) => {
  const [expanded, setExpanded] = useState(false);
  const [fields, setFields] = useState<NotifFields>(() =>
    setting ? settingToFields(setting) : defaultNotifFields()
  );
  const [saving, setSaving] = useState(false);
  const [dueDays, setDueDays] = useState<number | ''>(() => setting?.dueDaysFromContract ?? '');
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setFields(setting ? settingToFields(setting) : defaultNotifFields());
    setDueDays(setting?.dueDaysFromContract ?? '');
  }, [setting]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    const payload = {
      milestone,
      notify_buyer_agent: fields.notifyBuyerAgent,
      notify_seller_agent: fields.notifySellerAgent,
      notify_lender: fields.notifyLender,
      notify_title: fields.notifyTitle,
      notify_buyer: fields.notifyBuyer,
      notify_seller: fields.notifySeller,
      send_email: fields.sendEmail,
      send_sms: fields.sendSms,
      email_subject: fields.emailSubject || null,
      email_body: fields.emailBody || null,
      sms_body: fields.smsBody || null,
      due_days_from_contract: dueDays === '' ? null : Number(dueDays),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('milestone_notification_settings')
      .upsert(payload, { onConflict: 'milestone' })
      .select()
      .single();

    if (error) {
      setSaveError(error.message);
    } else if (data) {
      onSaved({
        id: data.id,
        milestone: data.milestone,
        notifyBuyerAgent: data.notify_buyer_agent,
        notifySellerAgent: data.notify_seller_agent,
        notifyLender: data.notify_lender,
        notifyTitle: data.notify_title,
        notifyBuyer: data.notify_buyer,
        notifySeller: data.notify_seller,
        sendEmail: data.send_email,
        sendSms: data.send_sms,
        emailSubject: data.email_subject,
        emailBody: data.email_body,
        smsBody: data.sms_body,
        dueDaysFromContract: data.due_days_from_contract ?? undefined,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      });
      setExpanded(false);
    }
    setSaving(false);
  };

  const handleCancel = () => {
    setFields(setting ? settingToFields(setting) : defaultNotifFields());
    setExpanded(false);
    setSaveError(null);
  };

  const enabledRoles = ROLE_KEYS.filter(r => fields[r.key as RoleKey]);

  return (
    <div className="border border-base-300 rounded-xl overflow-hidden">
      {/* Collapsed header */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 bg-base-200 hover:bg-base-300/50 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <span className="badge badge-sm badge-outline flex-none">{index + 1}</span>
        <span className="font-semibold text-sm text-base-content flex-1 text-left">
          {MILESTONE_LABELS[milestone]}
        </span>

        {/* Role pills */}
        <div className="flex flex-wrap gap-1 flex-none">
          {enabledRoles.map(r => (
            <span key={r.key} className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/15 text-primary border border-primary/20">
              {r.short}
            </span>
          ))}
          {enabledRoles.length === 0 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] text-base-content/30 border border-base-300">
              None
            </span>
          )}
        </div>

        {/* Channel badges */}
        <div className="flex gap-1 flex-none">
          {fields.sendEmail && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/15 text-primary border border-primary/20">Email</span>
          )}
          {fields.sendSms && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-success/15 text-success border border-success/20">SMS</span>
          )}
        </div>

        {dueDays !== '' && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-info/15 text-info border border-info/20 flex-none">
            {dueDays}d
          </span>
        )}

        {expanded ? <ChevronUp size={14} className="flex-none text-base-content/40" /> : <ChevronDown size={14} className="flex-none text-base-content/40" />}
      </button>

      {/* Expanded form */}
      {expanded && (
        <div className="p-4 border-t border-base-300 bg-base-100">
          <NotifForm fields={fields} onChange={setFields} />

          <div className="mt-4 flex items-center gap-3">
            <label className="text-xs font-semibold text-base-content/70 whitespace-nowrap">Days from contract date</label>
            <input
              type="number"
              min={0}
              max={365}
              placeholder="e.g. 3"
              value={dueDays}
              onChange={e => setDueDays(e.target.value === '' ? '' : Number(e.target.value))}
              className="input input-xs input-bordered w-24"
            />
            <span className="text-[10px] text-base-content/40">Leave blank if not applicable</span>
          </div>

          {saveError && (
            <div className="flex items-center gap-2 mt-3 p-2 rounded-lg bg-error/10 border border-error/20">
              <AlertCircle size={13} className="text-error flex-none" />
              <p className="text-xs text-error">{saveError}</p>
            </div>
          )}

          <div className="flex gap-2 justify-end mt-4">
            <button onClick={handleCancel} className="btn btn-sm btn-ghost gap-1">
              <X size={12} /> Cancel
            </button>
            <button onClick={handleSave} disabled={saving} className="btn btn-sm btn-primary gap-1">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ─── Custom Milestone Form ─── */
interface CustomMilestoneFormData {
  name: string;
  description: string;
  insertAfter: DealMilestone;
  agentContactId: string;
  notifFields: NotifFields;
}

const emptyCustomForm = (): CustomMilestoneFormData => ({
  name: '',
  description: '',
  insertAfter: 'contract-received',
  agentContactId: '',
  notifFields: defaultNotifFields(),
});

/* ─── Main Component ─── */
export const MilestonesTab: React.FC<Props> = ({ contactRecords }) => {
  const [settings, setSettings] = useState<MilestoneNotificationSetting[]>([]);
  const [customMilestones, setCustomMilestones] = useState<CustomMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showCustomForm, setShowCustomForm] = useState(false);
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null);
  const [customForm, setCustomForm] = useState<CustomMilestoneFormData>(emptyCustomForm());
  const [savingCustom, setSavingCustom] = useState(false);
  const [customSaveError, setCustomSaveError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const agentClients = contactRecords.filter(c => c.isClient);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError(null);

      const [settingsRes, customRes] = await Promise.all([
        supabase.from('milestone_notification_settings').select('*').order('created_at'),
        supabase
          .from('custom_milestones')
          .select('*, contacts(id, first_name, last_name)')
          .order('created_at'),
      ]);

      if (settingsRes.error) {
        setLoadError(settingsRes.error.message);
      } else {
        setSettings(
          (settingsRes.data || []).map(d => ({
            id: d.id,
            milestone: d.milestone,
            notifyBuyerAgent: d.notify_buyer_agent,
            notifySellerAgent: d.notify_seller_agent,
            notifyLender: d.notify_lender,
            notifyTitle: d.notify_title,
            notifyBuyer: d.notify_buyer,
            notifySeller: d.notify_seller,
            sendEmail: d.send_email,
            sendSms: d.send_sms,
            emailSubject: d.email_subject,
            emailBody: d.email_body,
            smsBody: d.sms_body,
            dueDaysFromContract: d.due_days_from_contract ?? undefined,
            createdAt: d.created_at,
            updatedAt: d.updated_at,
          }))
        );
      }

      if (customRes.error) {
        // Non-fatal; custom milestones may be empty
        console.error('Error loading custom milestones:', customRes.error.message);
      } else {
        setCustomMilestones(
          (customRes.data || []).map(d => {
            const contact = d.contacts as { id: string; first_name: string; last_name: string } | null;
            return {
              id: d.id,
              agentContactId: d.agent_contact_id,
              name: d.name,
              description: d.description,
              insertAfter: d.insert_after,
              notifyBuyerAgent: d.notify_buyer_agent,
              notifySellerAgent: d.notify_seller_agent,
              notifyLender: d.notify_lender,
              notifyTitle: d.notify_title,
              notifyBuyer: d.notify_buyer,
              notifySeller: d.notify_seller,
              sendEmail: d.send_email,
              sendSms: d.send_sms,
              emailSubject: d.email_subject,
              emailBody: d.email_body,
              smsBody: d.sms_body,
              createdAt: d.created_at,
              updatedAt: d.updated_at,
              agentName: contact
                ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
                : undefined,
            };
          })
        );
      }

      setLoading(false);
    };

    load();
  }, []);

  const handleSettingSaved = (updated: MilestoneNotificationSetting) => {
    setSettings(prev => {
      const idx = prev.findIndex(s => s.milestone === updated.milestone);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [...prev, updated];
    });
  };

  const openAddCustom = () => {
    setEditingCustomId(null);
    setCustomForm(emptyCustomForm());
    setCustomSaveError(null);
    setShowCustomForm(true);
  };

  const openEditCustom = (cm: CustomMilestone) => {
    setEditingCustomId(cm.id);
    setCustomForm({
      name: cm.name,
      description: cm.description || '',
      insertAfter: cm.insertAfter as DealMilestone,
      agentContactId: cm.agentContactId || '',
      notifFields: {
        notifyBuyerAgent: cm.notifyBuyerAgent,
        notifySellerAgent: cm.notifySellerAgent,
        notifyLender: cm.notifyLender,
        notifyTitle: cm.notifyTitle,
        notifyBuyer: cm.notifyBuyer,
        notifySeller: cm.notifySeller,
        sendEmail: cm.sendEmail,
        sendSms: cm.sendSms,
        emailSubject: cm.emailSubject || '',
        emailBody: cm.emailBody || '',
        smsBody: cm.smsBody || '',
      },
    });
    setCustomSaveError(null);
    setShowCustomForm(true);
  };

  const handleSaveCustom = async () => {
    if (!customForm.name.trim()) {
      setCustomSaveError('Name is required.');
      return;
    }
    setSavingCustom(true);
    setCustomSaveError(null);

    const payload = {
      name: customForm.name.trim(),
      description: customForm.description || null,
      insert_after: customForm.insertAfter,
      agent_contact_id: customForm.agentContactId || null,
      notify_buyer_agent: customForm.notifFields.notifyBuyerAgent,
      notify_seller_agent: customForm.notifFields.notifySellerAgent,
      notify_lender: customForm.notifFields.notifyLender,
      notify_title: customForm.notifFields.notifyTitle,
      notify_buyer: customForm.notifFields.notifyBuyer,
      notify_seller: customForm.notifFields.notifySeller,
      send_email: customForm.notifFields.sendEmail,
      send_sms: customForm.notifFields.sendSms,
      email_subject: customForm.notifFields.emailSubject || null,
      email_body: customForm.notifFields.emailBody || null,
      sms_body: customForm.notifFields.smsBody || null,
      updated_at: new Date().toISOString(),
    };

    if (editingCustomId) {
      const { data, error } = await supabase
        .from('custom_milestones')
        .update(payload)
        .eq('id', editingCustomId)
        .select()
        .single();

      if (error) {
        setCustomSaveError(error.message);
      } else if (data) {
        const agentRecord = contactRecords.find(c => c.id === data.agent_contact_id);
        setCustomMilestones(prev =>
          prev.map(cm =>
            cm.id === editingCustomId
              ? {
                  ...cm,
                  name: data.name,
                  description: data.description,
                  insertAfter: data.insert_after,
                  agentContactId: data.agent_contact_id,
                  notifyBuyerAgent: data.notify_buyer_agent,
                  notifySellerAgent: data.notify_seller_agent,
                  notifyLender: data.notify_lender,
                  notifyTitle: data.notify_title,
                  notifyBuyer: data.notify_buyer,
                  notifySeller: data.notify_seller,
                  sendEmail: data.send_email,
                  sendSms: data.send_sms,
                  emailSubject: data.email_subject,
                  emailBody: data.email_body,
                  smsBody: data.sms_body,
                  updatedAt: data.updated_at,
                  agentName: agentRecord?.fullName,
                }
              : cm
          )
        );
        setShowCustomForm(false);
        setEditingCustomId(null);
      }
    } else {
      const { data, error } = await supabase
        .from('custom_milestones')
        .insert(payload)
        .select()
        .single();

      if (error) {
        setCustomSaveError(error.message);
      } else if (data) {
        const agentRecord = contactRecords.find(c => c.id === data.agent_contact_id);
        setCustomMilestones(prev => [
          ...prev,
          {
            id: data.id,
            agentContactId: data.agent_contact_id,
            name: data.name,
            description: data.description,
            insertAfter: data.insert_after,
            notifyBuyerAgent: data.notify_buyer_agent,
            notifySellerAgent: data.notify_seller_agent,
            notifyLender: data.notify_lender,
            notifyTitle: data.notify_title,
            notifyBuyer: data.notify_buyer,
            notifySeller: data.notify_seller,
            sendEmail: data.send_email,
            sendSms: data.send_sms,
            emailSubject: data.email_subject,
            emailBody: data.email_body,
            smsBody: data.sms_body,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
            agentName: agentRecord?.fullName,
          },
        ]);
        setShowCustomForm(false);
      }
    }
    setSavingCustom(false);
  };

  const handleDeleteCustom = async (id: string) => {
    const { error } = await supabase.from('custom_milestones').delete().eq('id', id);
    if (!error) {
      setCustomMilestones(prev => prev.filter(cm => cm.id !== id));
    }
    setDeleteConfirmId(null);
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-3 max-w-3xl mx-auto">
        {MILESTONE_ORDER.filter(m => m !== 'archived').map(m => (
          <div key={m} className="h-14 rounded-xl bg-base-200 animate-pulse border border-base-300" />
        ))}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-error/10 border border-error/20 max-w-3xl mx-auto">
        <AlertCircle size={16} className="text-error flex-none" />
        <p className="text-sm text-error">Failed to load settings: {loadError}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* ── Section 1: Standard Milestones ── */}
      <section>
        <div className="mb-4">
          <h2 className="text-base font-bold text-base-content">Standard Milestones</h2>
          <p className="text-xs text-base-content/50 mt-0.5">
            Configure who gets notified and what message they receive at each deal milestone.
          </p>
        </div>
        <div className="space-y-2">
          {MILESTONE_ORDER.filter(m => m !== 'archived').map((m, i) => (
            <MilestoneRow
              key={m}
              milestone={m}
              index={i}
              setting={settings.find(s => s.milestone === m)}
              onSaved={handleSettingSaved}
            />
          ))}
        </div>
      </section>

      {/* ── Section 2: Custom Milestones ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-base-content">Custom Milestones</h2>
            <p className="text-xs text-base-content/50 mt-0.5">
              Add extra milestone steps for specific agent clients.
            </p>
          </div>
          <button
            onClick={openAddCustom}
            className="btn btn-sm btn-primary gap-1.5"
          >
            <Plus size={13} /> Add Custom Milestone
          </button>
        </div>

        {/* Custom form */}
        {showCustomForm && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 mb-4 space-y-4">
            <h3 className="font-semibold text-sm text-base-content">
              {editingCustomId ? 'Edit Custom Milestone' : 'New Custom Milestone'}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-base-content/50 mb-1 block">Name *</label>
                <input
                  className="input input-bordered input-sm w-full"
                  placeholder="e.g. HOA Approval"
                  value={customForm.name}
                  onChange={e => setCustomForm(p => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-base-content/50 mb-1 block">Insert After</label>
                <select
                  className="select select-bordered select-sm w-full"
                  value={customForm.insertAfter}
                  onChange={e => setCustomForm(p => ({ ...p, insertAfter: e.target.value as DealMilestone }))}
                >
                  {MILESTONE_ORDER.filter(m => m !== 'archived').map(m => (
                    <option key={m} value={m}>{MILESTONE_LABELS[m]}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-base-content/50 mb-1 block">Description</label>
                <textarea
                  className="textarea textarea-bordered w-full text-sm"
                  rows={2}
                  placeholder="Optional description..."
                  value={customForm.description}
                  onChange={e => setCustomForm(p => ({ ...p, description: e.target.value }))}
                />
              </div>
              {agentClients.length > 0 && (
                <div className="sm:col-span-2">
                  <label className="text-xs text-base-content/50 mb-1 block">
                    Agent Client (optional)
                  </label>
                  <select
                    className="select select-bordered select-sm w-full"
                    value={customForm.agentContactId}
                    onChange={e => setCustomForm(p => ({ ...p, agentContactId: e.target.value }))}
                  >
                    <option value="">All clients</option>
                    {agentClients.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.fullName}{c.company ? ` — ${c.company}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <NotifForm
              fields={customForm.notifFields}
              onChange={notifFields => setCustomForm(p => ({ ...p, notifFields }))}
            />

            {customSaveError && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-error/10 border border-error/20">
                <AlertCircle size={13} className="text-error flex-none" />
                <p className="text-xs text-error">{customSaveError}</p>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowCustomForm(false); setEditingCustomId(null); setCustomSaveError(null); }}
                className="btn btn-sm btn-ghost gap-1"
              >
                <X size={12} /> Cancel
              </button>
              <button onClick={handleSaveCustom} disabled={savingCustom} className="btn btn-sm btn-primary gap-1">
                {savingCustom ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Save
              </button>
            </div>
          </div>
        )}

        {/* Custom milestones list */}
        {customMilestones.length === 0 && !showCustomForm && (
          <div className="rounded-xl border border-base-300 bg-base-200 p-6 text-center">
            <p className="text-sm text-base-content/50">No custom milestones yet.</p>
            <p className="text-xs text-base-content/40 mt-1">
              Add custom steps to tailor the workflow for specific agent clients.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {customMilestones.map(cm => (
            <div key={cm.id} className="rounded-xl border border-base-300 bg-base-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-base-content">{cm.name}</p>
                  {cm.description && (
                    <p className="text-xs text-base-content/60 mt-0.5">{cm.description}</p>
                  )}
                  <p className="text-xs text-base-content/40 mt-1">
                    Inserted after: <span className="font-medium text-base-content/60">{MILESTONE_LABELS[cm.insertAfter as DealMilestone]}</span>
                    {cm.agentName && (
                      <> · Agent: <span className="font-medium text-base-content/60">{cm.agentName}</span></>
                    )}
                  </p>
                  <div className="flex gap-1 mt-2">
                    {ROLE_KEYS.filter(r => cm[r.key as RoleKey]).map(r => (
                      <span key={r.key} className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/15 text-primary border border-primary/20">
                        {r.short}
                      </span>
                    ))}
                    {cm.sendEmail && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/15 text-primary border border-primary/20">Email</span>}
                    {cm.sendSms && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-success/15 text-success border border-success/20">SMS</span>}
                  </div>
                </div>
                <div className="flex gap-1 flex-none">
                  <button
                    onClick={() => openEditCustom(cm)}
                    className="btn btn-ghost btn-xs btn-square"
                    title="Edit"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(cm.id)}
                    className="btn btn-ghost btn-xs btn-square text-error"
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Delete confirm */}
              {deleteConfirmId === cm.id && (
                <div className="mt-3 p-3 rounded-lg bg-error/10 border border-error/20">
                  <p className="text-xs font-semibold text-error mb-2">
                    Delete "{cm.name}"? This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDeleteCustom(cm.id)}
                      className="btn btn-xs btn-error gap-1"
                    >
                      <Trash2 size={10} /> Yes, Delete
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="btn btn-xs btn-ghost"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
