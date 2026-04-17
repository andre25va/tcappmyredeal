import React, { useState } from 'react';
import { Plus, Trash2, Save, X, Check, Loader2, Shield, AlertCircle, ToggleLeft, ToggleRight, ChevronRight } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity   = 'error' | 'warning' | 'info';
type CheckType  = 'field_present' | 'field_value' | 'signature_present' | 'addendum_required' | 'custom';

interface ComplianceRule {
  id: string;
  org_id: string | null;
  state: string;
  form_type: string;
  rule_code: string;
  rule_name: string;
  description: string | null;
  severity: Severity;
  check_type: CheckType;
  config: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

type RuleDraft = Omit<ComplianceRule, 'id' | 'created_at' | 'updated_at'>;

// ─── Constants ────────────────────────────────────────────────────────────────

const SEVERITIES: { value: Severity; label: string; badge: string }[] = [
  { value: 'error',   label: '🔴 Error',   badge: 'badge-error'   },
  { value: 'warning', label: '🟡 Warning', badge: 'badge-warning' },
  { value: 'info',    label: '🔵 Info',    badge: 'badge-info'    },
];

const CHECK_TYPES: { value: CheckType; label: string }[] = [
  { value: 'field_present',     label: 'Field Present'      },
  { value: 'field_value',       label: 'Field Value Check'  },
  { value: 'signature_present', label: 'Signature Present'  },
  { value: 'addendum_required', label: 'Addendum Required'  },
  { value: 'custom',            label: 'Custom Rule'        },
];

const FORM_TYPES = [
  'residential-sale-contract',
  'seller-disclosure',
  'exclusive-right-to-sell',
  'buyer-representation',
  'amendment',
  'other',
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];

const emptyDraft = (): RuleDraft => ({
  org_id: null,
  state: 'KS',
  form_type: 'residential-sale-contract',
  rule_code: '',
  rule_name: '',
  description: '',
  severity: 'error',
  check_type: 'field_present',
  config: {},
  is_active: true,
});

const RULES_KEY = ['compliance_rules'] as const;

// ─── Data hooks ───────────────────────────────────────────────────────────────

function useComplianceRules() {
  return useQuery({
    queryKey: RULES_KEY,
    queryFn: async (): Promise<ComplianceRule[]> => {
      const { data, error } = await supabase
        .from('compliance_rules')
        .select('*')
        .order('state')
        .order('form_type')
        .order('severity')
        .order('rule_name');
      if (error) throw error;
      return (data ?? []) as ComplianceRule[];
    },
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ComplianceRulesTab() {
  const qc = useQueryClient();
  const { data: rules = [], isLoading } = useComplianceRules();

  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [draft, setDraft]             = useState<RuleDraft | null>(null);
  const [configText, setConfigText]   = useState('{}');
  const [configErr, setConfigErr]     = useState<string | null>(null);
  const [saved, setSaved]             = useState(false);
  const [stateFilter, setStateFilter] = useState('all');
  const [typeFilter, setTypeFilter]   = useState('all');
  const [deleteId, setDeleteId]       = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: RULES_KEY });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (d: { id: string | null; draft: RuleDraft }) => {
      if (d.id) {
        const { error } = await supabase.from('compliance_rules').update({
          ...d.draft,
          updated_at: new Date().toISOString(),
        }).eq('id', d.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('compliance_rules').insert(d.draft).select().single();
        if (error) throw error;
        setSelectedId((data as any).id);
      }
    },
    onSuccess: () => {
      invalidate();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('compliance_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      if (selectedId === deleteId) { setSelectedId(null); setDraft(null); }
      setDeleteId(null);
    },
  });

  // Toggle active
  const toggleActive = async (rule: ComplianceRule) => {
    await supabase.from('compliance_rules').update({ is_active: !rule.is_active }).eq('id', rule.id);
    invalidate();
  };

  const openNew = () => {
    setSelectedId(null);
    const d = emptyDraft();
    setDraft(d);
    setConfigText('{}');
    setConfigErr(null);
    setSaved(false);
  };

  const selectRule = (rule: ComplianceRule) => {
    setSelectedId(rule.id);
    setDraft({
      org_id: rule.org_id,
      state: rule.state,
      form_type: rule.form_type,
      rule_code: rule.rule_code,
      rule_name: rule.rule_name,
      description: rule.description ?? '',
      severity: rule.severity,
      check_type: rule.check_type,
      config: rule.config ?? {},
      is_active: rule.is_active,
    });
    setConfigText(JSON.stringify(rule.config ?? {}, null, 2));
    setConfigErr(null);
    setSaved(false);
  };

  const handleSave = () => {
    if (!draft) return;
    // Validate config JSON
    try {
      const parsed = JSON.parse(configText);
      const finalDraft = { ...draft, config: parsed };
      saveMutation.mutate({ id: selectedId, draft: finalDraft });
    } catch {
      setConfigErr('Invalid JSON in Config field');
    }
  };

  const patch = (field: keyof RuleDraft, value: any) =>
    setDraft(prev => prev ? { ...prev, [field]: value } : prev);

  // Filtered list
  const allStates = Array.from(new Set(rules.map(r => r.state))).sort();
  const allTypes  = Array.from(new Set(rules.map(r => r.form_type))).sort();
  const filtered  = rules.filter(r =>
    (stateFilter === 'all' || r.state === stateFilter) &&
    (typeFilter  === 'all' || r.form_type === typeFilter)
  );

  const sevBadge = (s: Severity) => SEVERITIES.find(x => x.value === s)?.badge ?? 'badge-ghost';
  const sevLabel = (s: Severity) => SEVERITIES.find(x => x.value === s)?.label ?? s;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-base-content/50">
        <Loader2 size={18} className="animate-spin" /> Loading compliance rules…
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Shield size={15} className="text-primary" />
            <h2 className="text-sm font-bold text-base-content">Compliance Rules</h2>
          </div>
          <p className="text-xs text-base-content/50">
            Define rules that the AI compliance engine checks against extracted contracts. {rules.length} rule{rules.length !== 1 ? 's' : ''} total.
          </p>
        </div>
        <button className="btn btn-primary btn-sm gap-1.5" onClick={openNew}>
          <Plus size={13} /> New Rule
        </button>
      </div>

      <div className="flex gap-5">
        {/* ── Left: Rule List ──────────────────────────────────────── */}
        <div className="w-72 flex-none flex flex-col gap-2">
          {/* Filters */}
          <div className="flex gap-2">
            <select
              className="select select-bordered select-xs flex-1"
              value={stateFilter}
              onChange={e => setStateFilter(e.target.value)}
            >
              <option value="all">All States</option>
              {allStates.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              className="select select-bordered select-xs flex-1"
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
            >
              <option value="all">All Forms</option>
              {allTypes.map(t => <option key={t} value={t}>{t.replace('residential-sale-contract','Residential').replace('seller-disclosure','Disclosure').replace('exclusive-right-to-sell','Exclusive')}</option>)}
            </select>
          </div>

          {/* Rule list */}
          <div className="flex flex-col gap-1 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
            {filtered.length === 0 && (
              <div className="text-xs text-base-content/40 text-center py-8 border border-dashed border-base-300 rounded-xl">
                No rules — click New Rule to add one
              </div>
            )}
            {filtered.map(rule => (
              <button
                key={rule.id}
                onClick={() => selectRule(rule)}
                className={`w-full text-left rounded-xl border px-3 py-2 flex items-center gap-2 transition-all
                  ${selectedId === rule.id
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-base-300 bg-white hover:border-primary/40 text-base-content'}
                  ${!rule.is_active ? 'opacity-50' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate">{rule.rule_name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className={`badge badge-xs ${sevBadge(rule.severity)}`}>{rule.severity}</span>
                    <span className="text-[10px] text-base-content/40 truncate">{rule.state} · {rule.rule_code}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={e => { e.stopPropagation(); toggleActive(rule); }}
                    className={`transition-colors ${rule.is_active ? 'text-success' : 'text-base-content/20'}`}
                    title={rule.is_active ? 'Disable rule' : 'Enable rule'}
                  >
                    {rule.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                  </button>
                  <ChevronRight size={12} className="opacity-30" />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Right: Edit Panel ─────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {!draft ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-base-content/40 border border-dashed border-base-300 rounded-xl">
              <Shield size={28} className="opacity-30" />
              <p className="text-sm">Select a rule to edit, or create a new one</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Action bar */}
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-base-content">
                  {selectedId ? 'Edit Rule' : 'New Rule'}
                </h3>
                <div className="flex gap-2 shrink-0">
                  {selectedId && (
                    <button
                      className="btn btn-xs btn-error btn-outline gap-1"
                      onClick={() => setDeleteId(selectedId)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 size={11} /> Delete
                    </button>
                  )}
                  <button
                    className={`btn btn-xs gap-1 ${saved ? 'btn-success' : 'btn-primary'}`}
                    onClick={handleSave}
                    disabled={saveMutation.isPending}
                  >
                    {saveMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : saved ? <Check size={11} /> : <Save size={11} />}
                    {saved ? 'Saved!' : 'Save Rule'}
                  </button>
                </div>
              </div>

              {saveMutation.isError && (
                <div className="flex items-center gap-2 bg-error/10 border border-error/30 rounded-lg px-3 py-2">
                  <AlertCircle size={13} className="text-error shrink-0" />
                  <span className="text-xs text-error">{(saveMutation.error as any)?.message ?? 'Save failed'}</span>
                  <button className="ml-auto" onClick={() => saveMutation.reset()}><X size={12} /></button>
                </div>
              )}

              {/* Form grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-base-content/60 mb-1 block">State</label>
                  <select className="select select-bordered select-sm w-full" value={draft.state} onChange={e => patch('state', e.target.value)}>
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="text-xs font-semibold text-base-content/60 mb-1 block">Form Type</label>
                  <select className="select select-bordered select-sm w-full" value={draft.form_type} onChange={e => patch('form_type', e.target.value)}>
                    {FORM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-base-content/60 mb-1 block">Rule Code</label>
                  <input
                    className="input input-bordered input-sm w-full font-mono uppercase"
                    value={draft.rule_code}
                    onChange={e => patch('rule_code', e.target.value.toUpperCase().replace(/\s/g, '_'))}
                    placeholder="e.g. SIG_BUYER_PRESENT"
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-xs font-semibold text-base-content/60 mb-1 block">Rule Name</label>
                  <input
                    className="input input-bordered input-sm w-full"
                    value={draft.rule_name}
                    onChange={e => patch('rule_name', e.target.value)}
                    placeholder="e.g. Buyer Signature Present"
                  />
                </div>

                <div className="col-span-3">
                  <label className="text-xs font-semibold text-base-content/60 mb-1 block">Description</label>
                  <textarea
                    className="textarea textarea-bordered textarea-sm w-full"
                    rows={2}
                    value={draft.description ?? ''}
                    onChange={e => patch('description', e.target.value)}
                    placeholder="Describe what this rule checks and why it matters"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-base-content/60 mb-1 block">Severity</label>
                  <select className="select select-bordered select-sm w-full" value={draft.severity} onChange={e => patch('severity', e.target.value as Severity)}>
                    {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-base-content/60 mb-1 block">Check Type</label>
                  <select className="select select-bordered select-sm w-full" value={draft.check_type} onChange={e => patch('check_type', e.target.value as CheckType)}>
                    {CHECK_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>

                <div className="flex items-center gap-2 mt-5">
                  <button
                    onClick={() => patch('is_active', !draft.is_active)}
                    className={`transition-colors ${draft.is_active ? 'text-success' : 'text-base-content/30'}`}
                  >
                    {draft.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                  </button>
                  <span className="text-xs font-semibold text-base-content/60">{draft.is_active ? 'Active' : 'Inactive'}</span>
                </div>

                <div className="col-span-3">
                  <label className="text-xs font-semibold text-base-content/60 mb-1 block">Config (JSON)</label>
                  <textarea
                    className={`textarea textarea-bordered textarea-sm w-full font-mono text-xs ${configErr ? 'textarea-error' : ''}`}
                    rows={4}
                    value={configText}
                    onChange={e => { setConfigText(e.target.value); setConfigErr(null); }}
                    placeholder={`{\n  "field": "purchase_price"\n}`}
                  />
                  {configErr && (
                    <p className="text-xs text-error mt-1 flex items-center gap-1">
                      <AlertCircle size={11} /> {configErr}
                    </p>
                  )}
                  <p className="text-xs text-base-content/40 mt-1">
                    JSON config passed to the compliance engine.
                    {draft.check_type === 'field_present' && ' e.g. {"field": "purchase_price"}'}
                    {draft.check_type === 'signature_present' && ' e.g. {"party": "buyer", "page": 8}'}
                    {draft.check_type === 'addendum_required' && ' e.g. {"form": "lead_paint_disclosure"}'}
                    {draft.check_type === 'custom' && ' e.g. {"rule": "after_contract_date", "field": "closing_date"}'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirm modal */}
      {deleteId && (
        <div className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-sm mb-2">Delete this rule?</h3>
            <p className="text-xs text-base-content/60 mb-4">
              This will permanently remove the rule. Existing compliance check results are not affected.
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn btn-sm btn-ghost" onClick={() => setDeleteId(null)}>Cancel</button>
              <button
                className="btn btn-sm btn-error"
                onClick={() => deleteMutation.mutate(deleteId!)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Delete'}
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setDeleteId(null)} />
        </div>
      )}
    </div>
  );
}
