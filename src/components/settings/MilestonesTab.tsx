import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Plus, Pencil, Trash2, Check, X, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ContactRecord } from '../../types';
import { MilestoneType, useMilestoneTypes, useInvalidateMilestoneTypes } from '../../hooks/useMilestoneTypes';
import { useMlsMilestoneConfigFull, useInvalidateMlsMilestoneConfig } from '../../hooks/useMlsMilestoneConfig';

interface Props {
  contactRecords: ContactRecord[];
}

const MERGE_TAGS = ['{{recipient_name}}', '{{property_address}}', '{{closing_date}}', '{{tc_name}}'];

const ROLE_KEYS = [
  { key: 'notifyAgent',   label: 'Agent',   short: 'Agent' },
  { key: 'notifyLender',  label: 'Lender',  short: 'Lender' },
  { key: 'notifyTitle',   label: 'Title',   short: 'Title' },
  { key: 'notifyBuyer',   label: 'Buyer',   short: 'Buyer' },
  { key: 'notifySeller',  label: 'Seller',  short: 'Seller' },
] as const;

type RoleKey = typeof ROLE_KEYS[number]['key'];

interface NotifFields {
  notifyAgent: boolean;
  notifyLender: boolean;
  notifyTitle: boolean;
  notifyBuyer: boolean;
  notifySeller: boolean;
  sendEmail: boolean;
  emailSubject: string;
  emailBody: string;
}

const defaultNotifFields = (): NotifFields => ({
  notifyAgent: true,
  notifyLender: false,
  notifyTitle: false,
  notifyBuyer: false,
  notifySeller: false,
  sendEmail: true,
  emailSubject: '',
  emailBody: '',
});

function configToFields(row: any): NotifFields {
  return {
    notifyAgent:  row.notify_agent  ?? true,
    notifyLender: row.notify_lender ?? false,
    notifyTitle:  row.notify_title  ?? false,
    notifyBuyer:  row.notify_buyer  ?? false,
    notifySeller: row.notify_seller ?? false,
    sendEmail:    row.send_email    !== false,
    emailSubject: row.email_subject ?? '',
    emailBody:    row.email_body    ?? '',
  };
}

const NotifForm: React.FC<{
  fields: NotifFields;
  onChange: (f: NotifFields) => void;
}> = ({ fields, onChange }) => {
  const emailSubjectRef = useRef<HTMLInputElement>(null);
  const emailBodyRef = useRef<HTMLTextAreaElement>(null);
  const lastFocused = useRef<'emailSubject' | 'emailBody' | null>(null);

  const insertMergeTag = (tag: string) => {
    if (lastFocused.current === 'emailSubject' && emailSubjectRef.current) {
      const el = emailSubjectRef.current;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const newVal = el.value.slice(0, start) + tag + el.value.slice(end);
      onChange({ ...fields, emailSubject: newVal });
      setTimeout(() => { el.focus(); el.setSelectionRange(start + tag.length, start + tag.length); }, 0);
    } else if (lastFocused.current === 'emailBody' && emailBodyRef.current) {
      const el = emailBodyRef.current;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const newVal = el.value.slice(0, start) + tag + el.value.slice(end);
      onChange({ ...fields, emailBody: newVal });
      setTimeout(() => { el.focus(); el.setSelectionRange(start + tag.length, start + tag.length); }, 0);
    } else {
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
            placeholder={"Dear {{recipient_name}},\n\nYour transaction at {{property_address}} has reached a new milestone.\n\nClosing Date: {{closing_date}}\n\nBest regards,\n{{tc_name}}"}
            value={fields.emailBody}
            onFocus={() => { lastFocused.current = 'emailBody'; }}
            onChange={e => onChange({ ...fields, emailBody: e.target.value })}
          />
        </div>
      )}
    </div>
  );
};

/* ─── Milestone Notification Rules Row ─── */
const MilestoneNotifRow: React.FC<{
  milestoneType: MilestoneType;
  index: number;
  configRow: any | undefined;
  mlsId: string;
  onSaved: () => void;
}> = ({ milestoneType, index, configRow, mlsId, onSaved }) => {
  const [expanded, setExpanded] = useState(false);
  const [fields, setFields] = useState<NotifFields>(() =>
    configRow ? configToFields(configRow) : defaultNotifFields()
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setFields(configRow ? configToFields(configRow) : defaultNotifFields());
  }, [configRow]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    const payload = {
      mls_id: mlsId,
      milestone_type_id: milestoneType.id,
      notify_agent:  fields.notifyAgent,
      notify_lender: fields.notifyLender,
      notify_title:  fields.notifyTitle,
      notify_buyer:  fields.notifyBuyer,
      notify_seller: fields.notifySeller,
      send_email:    fields.sendEmail,
      email_subject: fields.emailSubject || null,
      email_body:    fields.emailBody    || null,
      updated_at:    new Date().toISOString(),
    };

    const { error } = await supabase
      .from('mls_milestone_config')
      .upsert(payload, { onConflict: 'mls_id,milestone_type_id' });

    if (error) {
      setSaveError(error.message);
    } else {
      onSaved();
      setExpanded(false);
    }
    setSaving(false);
  };

  const handleCancel = () => {
    setFields(configRow ? configToFields(configRow) : defaultNotifFields());
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
          {milestoneType.label}
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

        {/* Channel badge */}
        {fields.sendEmail && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/15 text-primary border border-primary/20 flex-none">Email</span>
        )}

        {expanded
          ? <ChevronUp size={14} className="flex-none text-base-content/40" />
          : <ChevronDown size={14} className="flex-none text-base-content/40" />}
      </button>

      {/* Expanded form */}
      {expanded && (
        <div className="p-4 border-t border-base-300 bg-base-100">
          <NotifForm fields={fields} onChange={setFields} />

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

/* ─── Main Component ─── */
export const MilestonesTab: React.FC<Props> = ({ contactRecords }) => {

  // ─── MLS board + Notification Rules state ────────────────────────────────
  const [mlsEntries, setMlsEntries] = useState<{ id: string; name: string }[]>([]);
  const [selectedMlsId, setSelectedMlsId] = useState<string>('');
  const { data: mlsConfig = [], isLoading: loadingConfig } = useMlsMilestoneConfigFull(selectedMlsId || undefined);
  const invalidateMlsConfig = useInvalidateMlsMilestoneConfig();

  useEffect(() => {
    supabase.from('mls_entries').select('id, name').order('name').then(({ data }) => {
      const entries = (data || []) as { id: string; name: string }[];
      setMlsEntries(entries);
      if (entries.length > 0) setSelectedMlsId(prev => prev || entries[0].id);
    });
  }, []);

  // ─── Milestone Catalog state ────────────────────────────────────────────
  const [addingType, setAddingType] = useState(false);
  const [newTypeLabel, setNewTypeLabel] = useState('');
  const [savingNewType, setSavingNewType] = useState(false);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editingTypeLabel, setEditingTypeLabel] = useState('');
  const [savingEditType, setSavingEditType] = useState(false);
  const [deleteTypeId, setDeleteTypeId] = useState<string | null>(null);
  const [deleteTypeError, setDeleteTypeError] = useState<string | null>(null);
  const [deletingType, setDeletingType] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // ── Shared TanStack Query hooks ──────────────────────────────────────────
  const { data: milestoneTypes = [] } = useMilestoneTypes();
  const invalidateMilestoneTypes = useInvalidateMilestoneTypes();

  // ─── Milestone Catalog handlers ─────────────────────────────────────────

  const handleAddType = async () => {
    const label = newTypeLabel.trim();
    if (!label) return;
    setSavingNewType(true);
    setCatalogError(null);
    const key = label.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const maxSortOrder = milestoneTypes.length > 0
      ? Math.max(...milestoneTypes.map(mt => mt.sort_order))
      : 0;
    const { data, error } = await supabase
      .from('milestone_types')
      .insert({ key, label, sort_order: maxSortOrder + 1 })
      .select()
      .single();
    if (error) {
      setCatalogError(error.message);
    } else if (data) {
      invalidateMilestoneTypes();
      setNewTypeLabel('');
      setAddingType(false);
    }
    setSavingNewType(false);
  };

  const handleEditType = async (id: string) => {
    const label = editingTypeLabel.trim();
    if (!label) return;
    setSavingEditType(true);
    setCatalogError(null);
    const { error } = await supabase
      .from('milestone_types')
      .update({ label })
      .eq('id', id);
    if (error) {
      setCatalogError(error.message);
    } else {
      invalidateMilestoneTypes();
      setEditingTypeId(null);
    }
    setSavingEditType(false);
  };

  const handleDeleteType = async (id: string) => {
    setDeletingType(true);
    setDeleteTypeError(null);
    // Check if in use
    const { data: usages, error: checkError } = await supabase
      .from('mls_milestone_config')
      .select('id')
      .eq('milestone_type_id', id)
      .limit(1);
    if (checkError) {
      setDeleteTypeError(checkError.message);
      setDeletingType(false);
      return;
    }
    if (usages && usages.length > 0) {
      setDeleteTypeError('This milestone is used by MLS templates and cannot be deleted.');
      setDeletingType(false);
      return;
    }
    const { error } = await supabase.from('milestone_types').delete().eq('id', id);
    if (error) {
      setDeleteTypeError(error.message);
    } else {
      invalidateMilestoneTypes();
      setDeleteTypeId(null);
    }
    setDeletingType(false);
  };

  return (
    <div className="space-y-10">
      {/* ── Section 0: Milestone Catalog ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-base-content">Milestone Catalog</h2>
            <p className="text-xs text-base-content/50 mt-0.5">
              Define the global list of milestone steps.
            </p>
          </div>
          <button
            onClick={() => { setAddingType(true); setNewTypeLabel(''); setCatalogError(null); }}
            className="btn btn-sm btn-primary gap-1.5"
          >
            <Plus size={13} /> Add Milestone
          </button>
        </div>

        <div className="border border-base-300 rounded-xl overflow-hidden">
          {milestoneTypes.length === 0 && !addingType && (
            <div className="p-6 text-center">
              <p className="text-sm text-base-content/50">No milestone types defined yet.</p>
              <p className="text-xs text-base-content/40 mt-1">Click "Add Milestone" to create your first step.</p>
            </div>
          )}

          <div className="divide-y divide-base-300">
            {milestoneTypes.map(mt => (
              <div key={mt.id}>
                <div className="flex items-center gap-3 px-4 py-3 bg-base-100 hover:bg-base-200/40 transition-colors">
                  <span className="text-base-content/30 text-sm select-none">⠿</span>

                  {editingTypeId === mt.id ? (
                    <input
                      className="input input-bordered input-sm flex-1"
                      value={editingTypeLabel}
                      onChange={e => setEditingTypeLabel(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleEditType(mt.id);
                        if (e.key === 'Escape') setEditingTypeId(null);
                      }}
                      autoFocus
                    />
                  ) : (
                    <span className="flex-1 text-sm font-medium text-base-content">{mt.label}</span>
                  )}

                  {editingTypeId === mt.id ? (
                    <div className="flex gap-1 flex-none">
                      <button
                        onClick={() => handleEditType(mt.id)}
                        disabled={savingEditType}
                        className="btn btn-xs btn-primary gap-1"
                      >
                        {savingEditType ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                        Save
                      </button>
                      <button
                        onClick={() => setEditingTypeId(null)}
                        className="btn btn-xs btn-ghost"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1 flex-none">
                      <button
                        onClick={() => {
                          setEditingTypeId(mt.id);
                          setEditingTypeLabel(mt.label);
                          setCatalogError(null);
                          setDeleteTypeId(null);
                        }}
                        className="btn btn-ghost btn-xs btn-square"
                        title="Edit"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => {
                          setDeleteTypeId(mt.id);
                          setDeleteTypeError(null);
                          setEditingTypeId(null);
                        }}
                        className="btn btn-ghost btn-xs btn-square text-error"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Delete confirm */}
                {deleteTypeId === mt.id && (
                  <div className="mx-4 mb-3 mt-1 p-3 rounded-lg bg-error/10 border border-error/20">
                    <p className="text-xs font-semibold text-error mb-2">
                      Delete "{mt.label}"? This cannot be undone.
                    </p>
                    {deleteTypeError && (
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle size={12} className="text-error flex-none" />
                        <p className="text-xs text-error">{deleteTypeError}</p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDeleteType(mt.id)}
                        disabled={deletingType}
                        className="btn btn-xs btn-error gap-1"
                      >
                        {deletingType ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                        Yes, Delete
                      </button>
                      <button
                        onClick={() => { setDeleteTypeId(null); setDeleteTypeError(null); }}
                        className="btn btn-xs btn-ghost"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Add new row */}
            {addingType && (
              <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border-t border-primary/20">
                <span className="text-base-content/30 text-sm select-none">⠿</span>
                <input
                  className="input input-bordered input-sm flex-1"
                  placeholder="e.g. HOA Approval"
                  value={newTypeLabel}
                  onChange={e => setNewTypeLabel(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddType();
                    if (e.key === 'Escape') setAddingType(false);
                  }}
                  autoFocus
                />
                <div className="flex gap-1 flex-none">
                  <button
                    onClick={handleAddType}
                    disabled={savingNewType || !newTypeLabel.trim()}
                    className="btn btn-xs btn-primary gap-1"
                  >
                    {savingNewType ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                    Save
                  </button>
                  <button
                    onClick={() => { setAddingType(false); setNewTypeLabel(''); }}
                    className="btn btn-xs btn-ghost"
                  >
                    <X size={10} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {catalogError && (
          <div className="mt-2 flex items-center gap-2 p-2 rounded-lg bg-error/10 border border-error/20">
            <AlertCircle size={13} className="text-error flex-none" />
            <p className="text-xs text-error">{catalogError}</p>
          </div>
        )}
      </section>

      <div className="divider" />

      {/* ── Section 1: Milestone Notification Rules ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-base-content">Milestone Notification Rules</h2>
            <p className="text-xs text-base-content/50 mt-0.5">
              Configure who gets notified and what message they receive at each milestone, per MLS board.
            </p>
          </div>
          {mlsEntries.length > 1 && (
            <select
              className="select select-bordered select-sm"
              value={selectedMlsId}
              onChange={e => setSelectedMlsId(e.target.value)}
            >
              {mlsEntries.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          )}
        </div>

        {!selectedMlsId ? (
          <div className="p-6 text-center border border-base-300 rounded-xl">
            <p className="text-sm text-base-content/50">No MLS boards configured.</p>
          </div>
        ) : milestoneTypes.length === 0 ? (
          <div className="p-6 text-center border border-base-300 rounded-xl">
            <p className="text-sm text-base-content/50">
              Add milestones to the Milestone Catalog above to configure notification rules.
            </p>
          </div>
        ) : loadingConfig ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 rounded-xl bg-base-200 animate-pulse border border-base-300" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {milestoneTypes.map((mt, i) => {
              const configRow = (mlsConfig as any[]).find(c => c.milestone_type_id === mt.id);
              return (
                <MilestoneNotifRow
                  key={mt.id}
                  milestoneType={mt}
                  index={i}
                  configRow={configRow}
                  mlsId={selectedMlsId}
                  onSaved={() => invalidateMlsConfig(selectedMlsId)}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
