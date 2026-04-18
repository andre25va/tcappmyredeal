import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, TableProperties, ChevronDown, ChevronRight, Info } from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────── */
interface FieldRow {
  id: string;
  field_key: string;
  field_type: string;
  page_num: number;
  contract_line_num: number | null;
  label: string | null;
  section: string | null;
  group_key: string | null;
  valid_options: string[] | null;
  required: boolean;
  is_signature: boolean;
  is_initial: boolean;
}

const FIELD_TYPE_STYLE: Record<string, { badge: string; icon: string }> = {
  checkbox: { badge: 'badge-warning',  icon: '☑' },
  text:     { badge: 'badge-info',     icon: '📝' },
  date:     { badge: 'badge-success',  icon: '📅' },
  number:   { badge: 'badge-secondary', icon: '#' },
  radio:    { badge: 'badge-primary',  icon: '🔘' },
};

const typeStyle = (t: string) =>
  FIELD_TYPE_STYLE[t] ?? { badge: 'badge-ghost', icon: '?' };

/* ─── Known form slugs ───────────────────────────────────── */
const FORM_OPTIONS = [
  { slug: 'residential-sale-contract', label: 'Residential Sale Contract (KS)' },
  { slug: 'exclusive-right-to-sell',   label: 'Exclusive Right to Sell Listing Agreement' },
  { slug: 'seller-disclosure',         label: 'Seller Disclosure Statement' },
];

/* ─── Component ─────────────────────────────────────────── */
export const FormSchemaViewer: React.FC = () => {
  const [formSlug, setFormSlug]         = useState(FORM_OPTIONS[0].slug);
  const [fields, setFields]             = useState<FieldRow[]>([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [collapsed, setCollapsed]       = useState<Record<string, boolean>>({});
  const [search, setSearch]             = useState('');

  /* ── Load fields when slug changes ── */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setFields([]);
      const { data, error: err } = await supabase
        .from('field_coordinates')
        .select('id,field_key,field_type,page_num,contract_line_num,label,section,group_key,valid_options,required,is_signature,is_initial')
        .eq('form_slug', formSlug)
        .order('page_num', { ascending: true })
        .order('contract_line_num', { ascending: true, nullsFirst: false });

      if (cancelled) return;
      if (err) { setError(err.message); setLoading(false); return; }
      setFields(data ?? []);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [formSlug]);

  /* ── Group by section ── */
  const filtered = search.trim()
    ? fields.filter(f =>
        (f.label ?? f.field_key).toLowerCase().includes(search.toLowerCase()) ||
        (f.section ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (f.group_key ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : fields;

  const sections = Array.from(
    new Map(filtered.map(f => [f.section ?? 'Uncategorised', f.section ?? 'Uncategorised']))
  ).map(([s]) => s);

  const bySection = (sec: string) => filtered.filter(f => (f.section ?? 'Uncategorised') === sec);

  const toggleSection = (sec: string) =>
    setCollapsed(p => ({ ...p, [sec]: !p[sec] }));

  /* ── Totals ── */
  const totalFields     = fields.length;
  const totalCheckboxes = fields.filter(f => f.field_type === 'checkbox').length;
  const totalText       = fields.filter(f => f.field_type === 'text').length;
  const totalDates      = fields.filter(f => f.field_type === 'date').length;

  /* ── Render ── */
  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-base-300 flex-none flex-wrap gap-y-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-base-content">Form Field Schema</h3>
          <p className="text-xs text-base-content/40 mt-0.5">
            Every fillable field on the contract — exact line numbers, valid values, and groups
          </p>
        </div>

        {/* Form picker */}
        <select
          value={formSlug}
          onChange={e => { setFormSlug(e.target.value); setSearch(''); setCollapsed({}); }}
          className="select select-bordered select-xs w-64"
        >
          {FORM_OPTIONS.map(o => (
            <option key={o.slug} value={o.slug}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* ── Stats row ── */}
      {!loading && fields.length > 0 && (
        <div className="flex gap-3 px-6 py-3 border-b border-base-300 flex-none flex-wrap">
          <div className="badge badge-ghost badge-sm gap-1">
            <TableProperties size={9} /> {totalFields} fields
          </div>
          <div className="badge badge-warning badge-sm gap-1">☑ {totalCheckboxes} checkboxes</div>
          <div className="badge badge-info badge-sm gap-1">📝 {totalText} text</div>
          <div className="badge badge-success badge-sm gap-1">📅 {totalDates} dates</div>
          <div className="badge badge-base-300 badge-sm gap-1">
            {sections.length} sections
          </div>

          {/* Search */}
          <div className="ml-auto">
            <input
              type="text"
              placeholder="Filter fields…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input input-bordered input-xs w-40"
            />
          </div>
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex-1 overflow-auto px-4 py-3">
        {loading && (
          <div className="flex items-center justify-center h-40 gap-2 text-base-content/40">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading field schema…</span>
          </div>
        )}

        {error && (
          <div className="alert alert-error text-xs mt-4">{error}</div>
        )}

        {!loading && !error && fields.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-base-content/30 border-2 border-dashed border-base-300 rounded-2xl mt-4">
            <TableProperties size={36} strokeWidth={1} />
            <div className="text-center">
              <p className="text-sm font-medium text-base-content/40">No field schema yet</p>
              <p className="text-xs mt-1">Upload a blank PDF template to auto-generate the field schema</p>
            </div>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && fields.length > 0 && (
          <div className="text-center py-10 text-base-content/40 text-sm">
            No fields match "{search}"
          </div>
        )}

        {!loading && !error && sections.map(sec => {
          const rows = bySection(sec);
          const isOpen = !collapsed[sec];
          const checkboxCount = rows.filter(f => f.field_type === 'checkbox').length;
          const hasGroup = rows.some(f => f.group_key);

          return (
            <div key={sec} className="mb-3 border border-base-300 rounded-xl overflow-hidden">

              {/* Section header */}
              <button
                className="w-full flex items-center gap-2 px-4 py-3 bg-base-200/70 hover:bg-base-200 transition-colors text-left"
                onClick={() => toggleSection(sec)}
              >
                {isOpen
                  ? <ChevronDown size={14} className="text-base-content/40 flex-none" />
                  : <ChevronRight size={14} className="text-base-content/40 flex-none" />
                }
                <span className="font-semibold text-xs text-base-content">{sec}</span>
                <span className="text-xs text-base-content/40">({rows.length} fields)</span>
                {checkboxCount > 0 && (
                  <span className="badge badge-warning badge-xs ml-1">{checkboxCount} ☑</span>
                )}
                {hasGroup && (
                  <span className="badge badge-info badge-xs ml-1">grouped</span>
                )}
              </button>

              {/* Field rows */}
              {isOpen && (
                <div className="overflow-x-auto">
                  <table className="table table-xs w-full">
                    <thead>
                      <tr className="text-base-content/50 text-xs bg-base-100">
                        <th className="w-14">Line</th>
                        <th className="w-10">Pg</th>
                        <th>Label</th>
                        <th className="w-24">Type</th>
                        <th>Valid Values</th>
                        <th className="w-32">Group</th>
                        <th className="w-16">Flags</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(f => {
                        const ts = typeStyle(f.field_type);
                        return (
                          <tr key={f.id} className="hover:bg-base-200/40 transition-colors">
                            {/* Line # */}
                            <td>
                              {f.contract_line_num != null ? (
                                <span className="font-mono text-xs font-bold text-primary">
                                  L{f.contract_line_num}
                                </span>
                              ) : (
                                <span className="text-base-content/25 text-xs">—</span>
                              )}
                            </td>

                            {/* Page */}
                            <td>
                              <span className="text-xs text-base-content/50">p{f.page_num}</span>
                            </td>

                            {/* Label */}
                            <td>
                              <div className="font-medium text-xs text-base-content">
                                {f.label ?? f.field_key}
                              </div>
                              {f.label && (
                                <div className="text-[10px] text-base-content/30 font-mono">
                                  {f.field_key}
                                </div>
                              )}
                            </td>

                            {/* Type */}
                            <td>
                              <span className={`badge ${ts.badge} badge-xs gap-0.5`}>
                                {ts.icon} {f.field_type}
                              </span>
                            </td>

                            {/* Valid values */}
                            <td>
                              {f.valid_options && f.valid_options.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {f.valid_options.map(v => (
                                    <span
                                      key={v}
                                      className="badge badge-ghost badge-xs font-mono text-[10px]"
                                    >
                                      {v}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-base-content/25 text-xs">free-form</span>
                              )}
                            </td>

                            {/* Group */}
                            <td>
                              {f.group_key ? (
                                <span
                                  className="badge badge-outline badge-xs font-mono text-[10px] truncate max-w-[120px]"
                                  title={f.group_key}
                                >
                                  {f.group_key}
                                </span>
                              ) : (
                                <span className="text-base-content/25 text-xs">—</span>
                              )}
                            </td>

                            {/* Flags */}
                            <td>
                              <div className="flex gap-1 flex-wrap">
                                {f.required && (
                                  <span className="badge badge-error badge-xs">req</span>
                                )}
                                {f.is_signature && (
                                  <span className="badge badge-secondary badge-xs">sig</span>
                                )}
                                {f.is_initial && (
                                  <span className="badge badge-secondary badge-xs">ini</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}

        {/* Info note */}
        {!loading && fields.length > 0 && (
          <div className="flex items-start gap-2 mt-4 px-4 py-3 bg-info/5 border border-info/20 rounded-xl text-xs text-info/80">
            <Info size={13} className="flex-none mt-0.5" />
            <p>
              These line numbers match the printed left-margin numbers on the physical contract.
              Groups (e.g. <span className="font-mono">primary_loan_type</span>) are mutually exclusive —
              only one checkbox in a group can be checked. The AI uses this schema to extract
              values with precision instead of guessing.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
