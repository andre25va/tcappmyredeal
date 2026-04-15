import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle2, AlertCircle, RefreshCw, Search, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

// --- Types ---
interface ContactSuggestion {
  id: string;
  full_name: string;
  contact_type: string;
}

type FieldType = 'text' | 'date' | 'money' | 'number' | 'select' | 'contact';

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  section: string;
}

interface StepExtractedDataProps {
  extractedData: Record<string, unknown> | null;
  onConfirm: (verifiedData: Record<string, unknown>) => void;
  onEdit: () => void;
  onReExtract: () => void;
}

// --- Field Definitions ---
const FIELD_DEFS: FieldDef[] = [
  // Property
  { key: 'address',             label: 'Street Address',      type: 'text',    section: 'Property' },
  { key: 'city',                label: 'City',                type: 'text',    section: 'Property' },
  { key: 'state',               label: 'State',               type: 'text',    section: 'Property' },
  { key: 'zipCode',             label: 'ZIP Code',            type: 'text',    section: 'Property' },
  { key: 'propertyType',        label: 'Property Type',       type: 'select',  section: 'Property',
    options: ['Single Family', 'Condo', 'Townhouse', 'Multi-Family', 'Land', 'Commercial', 'Other'] },
  { key: 'mlsNumber',           label: 'MLS Number',          type: 'text',    section: 'Property' },
  { key: 'mlsBoard',            label: 'MLS Board',           type: 'text',    section: 'Property' },
  { key: 'legalDescription',    label: 'Legal Description',   type: 'text',    section: 'Property' },

  // Transaction
  { key: 'transactionType',     label: 'Transaction Type',    type: 'select',  section: 'Transaction',
    options: ['buyer', 'seller', 'both'] },
  { key: 'salePrice',           label: 'Sale Price',          type: 'money',   section: 'Transaction' },
  { key: 'earnestMoney',        label: 'Earnest Money',       type: 'money',   section: 'Transaction' },
  { key: 'sellerCredit',        label: 'Seller Credit',       type: 'money',   section: 'Transaction' },
  { key: 'downPayment',         label: 'Down Payment',        type: 'money',   section: 'Transaction' },
  { key: 'downPaymentPercent',  label: 'Down Payment %',      type: 'number',  section: 'Transaction' },

  // Financing
  { key: 'loanType',            label: 'Loan Type',           type: 'select',  section: 'Financing',
    options: ['Conventional', 'FHA', 'VA', 'USDA', 'Cash', 'Other'] },
  { key: 'loanAmount',          label: 'Loan Amount',         type: 'money',   section: 'Financing' },
  { key: 'loanOfficer',         label: 'Loan Officer',        type: 'contact', section: 'Financing' },
  { key: 'loanOfficerCompany',  label: 'Lender Company',      type: 'text',    section: 'Financing' },

  // Dates
  { key: 'closingDate',            label: 'Closing Date',        type: 'date', section: 'Dates' },
  { key: 'inspectionDate',         label: 'Inspection Deadline', type: 'date', section: 'Dates' },
  { key: 'financeDeadline',        label: 'Finance Deadline',    type: 'date', section: 'Dates' },
  { key: 'possessionDate',         label: 'Possession Date',     type: 'date', section: 'Dates' },
  { key: 'listingExpirationDate',  label: 'Listing Expiration',  type: 'date', section: 'Dates' },

  // Parties
  { key: 'buyerAgentName',      label: "Buyer's Agent",       type: 'contact', section: 'Parties' },
  { key: 'sellerAgentName',     label: "Seller's Agent",      type: 'contact', section: 'Parties' },
  { key: 'titleCompany',        label: 'Title Company',       type: 'contact', section: 'Parties' },
  { key: 'homeWarrantyCompany', label: 'Warranty Company',    type: 'text',    section: 'Parties' },
];

const SECTIONS = ['Property', 'Transaction', 'Financing', 'Dates', 'Parties'];

// --- Contact Typeahead ---
const ContactTypeahead: React.FC<{
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder }) => {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setSuggestions([]); setOpen(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from('contacts')
      .select('id, full_name, contact_type')
      .ilike('full_name', `%${q}%`)
      .is('deleted_at', null)
      .limit(6);
    setSuggestions(data || []);
    setOpen(true);
    setLoading(false);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    onChange(val);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(val), 280);
  };

  const handleSelect = (name: string) => {
    setQuery(name);
    onChange(name);
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={handleChange}
          placeholder={placeholder || 'Search contacts or type name…'}
          className="input input-sm input-bordered w-full pr-7 text-sm"
        />
        {loading ? (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
            <span className="loading loading-spinner loading-xs" />
          </span>
        ) : (
          <Search size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-base-content/30 pointer-events-none" />
        )}
      </div>
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-base-100 border border-base-300 rounded-lg shadow-lg overflow-hidden">
          {suggestions.map(s => (
            <li
              key={s.id}
              onMouseDown={() => handleSelect(s.full_name)}
              className="px-3 py-2 text-sm hover:bg-base-200 cursor-pointer flex items-center justify-between"
            >
              <span className="font-medium text-base-content">{s.full_name}</span>
              {s.contact_type && (
                <span className="text-xs text-base-content/40 capitalize ml-2">{s.contact_type}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// --- Main Component ---
const StepExtractedData: React.FC<StepExtractedDataProps> = ({
  extractedData,
  onConfirm,
  onEdit,
  onReExtract,
}) => {
  const [values, setValues] = useState<Record<string, string>>(() => {
    if (!extractedData) return {};
    const init: Record<string, string> = {};
    FIELD_DEFS.forEach(({ key }) => {
      const raw = extractedData[key];
      init[key] = (raw !== null && raw !== undefined && raw !== '') ? String(raw) : '';
    });
    return init;
  });

  const setValue = (key: string, val: string) =>
    setValues(prev => ({ ...prev, [key]: val }));

  const hasData = extractedData && Object.keys(extractedData).some(k => {
    const v = extractedData[k];
    return v !== null && v !== undefined && v !== '';
  });

  const confidenceRaw = (extractedData as any)?.confidence;
  const confidence: 'high' | 'medium' | 'low' | undefined =
    confidenceRaw == null ? undefined :
    typeof confidenceRaw === 'number'
      ? (confidenceRaw >= 0.8 ? 'high' : confidenceRaw >= 0.5 ? 'medium' : 'low')
      : typeof confidenceRaw === 'string' ? (confidenceRaw as any)
      : undefined;

  const foundCount = FIELD_DEFS.filter(({ key }) => {
    const raw = extractedData?.[key];
    return raw !== null && raw !== undefined && raw !== '';
  }).length;

  const handleConfirm = () => {
    const verified: Record<string, unknown> = { ...(extractedData || {}) };
    FIELD_DEFS.forEach(({ key, type }) => {
      const v = values[key];
      if (!v) {
        verified[key] = null;
      } else if (type === 'money' || type === 'number') {
        verified[key] = parseFloat(v.replace(/,/g, '')) || null;
      } else {
        verified[key] = v;
      }
    });
    onConfirm(verified);
  };

  // Empty / no-data state
  if (!hasData) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <AlertCircle size={18} className="text-base-content/40" />
          <h3 className="text-lg font-bold text-base-content">AI Extraction Review</h3>
        </div>
        <p className="text-sm text-base-content/60">
          No data could be extracted from this contract. Fill in manually or try a different file.
        </p>
        <div className="flex flex-col gap-2">
          <button onClick={onEdit} className="btn btn-primary btn-sm gap-1.5">
            Continue Manually <ChevronRight size={14} />
          </button>
          <button onClick={onReExtract} className="btn btn-ghost btn-sm gap-1.5 text-base-content/60">
            <RefreshCw size={14} /> Try uploading a different contract
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={18} className="text-green-500" />
          <h3 className="text-lg font-bold text-base-content">Review & Verify</h3>
        </div>
        {confidence && (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
            confidence === 'high'   ? 'bg-green-100 text-green-700' :
            confidence === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                      'bg-red-100 text-red-700'
          }`}>
            {confidence === 'high' ? '✓' : confidence === 'medium' ? '~' : '!'}&nbsp;
            {confidence.charAt(0).toUpperCase() + confidence.slice(1)} confidence
          </span>
        )}
      </div>

      <p className="text-sm text-base-content/60">
        {foundCount} of {FIELD_DEFS.length} fields found.{' '}
        <span className="text-red-400 font-medium">Red rows</span> were not found — fill them in or leave blank.
        Edit anything that looks wrong, then confirm.
      </p>

      {/* Sectioned Table */}
      <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1 -mr-1">
        {SECTIONS.map(section => {
          const fields = FIELD_DEFS.filter(f => f.section === section);
          return (
            <div key={section} className="rounded-xl border border-base-300 overflow-hidden">
              <div className="bg-base-200/60 px-3 py-1.5 border-b border-base-300">
                <p className="text-xs font-semibold text-base-content/50 uppercase tracking-wide">{section}</p>
              </div>
              <div className="divide-y divide-base-200">
                {fields.map(field => {
                  const originalRaw = extractedData?.[field.key];
                  const wasFound = originalRaw !== null && originalRaw !== undefined && originalRaw !== '';
                  const currentVal = values[field.key] ?? '';

                  return (
                    <div
                      key={field.key}
                      className={`flex items-center gap-3 px-3 py-2 ${
                        !wasFound ? 'bg-red-50/60 dark:bg-red-900/10' : ''
                      }`}
                    >
                      {/* Label */}
                      <div className="w-36 flex-none flex items-center gap-1.5">
                        <span className="text-xs font-medium text-base-content/60 leading-tight">
                          {field.label}
                        </span>
                        {!wasFound && (
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-none" title="Not found in contract" />
                        )}
                      </div>

                      {/* Input */}
                      <div className="flex-1 min-w-0">
                        {field.type === 'select' && (
                          <select
                            value={currentVal}
                            onChange={e => setValue(field.key, e.target.value)}
                            className="select select-sm select-bordered w-full text-sm"
                          >
                            <option value="">— not set —</option>
                            {field.options!.map(opt => (
                              <option key={opt} value={opt}>
                                {opt.charAt(0).toUpperCase() + opt.slice(1)}
                              </option>
                            ))}
                          </select>
                        )}

                        {field.type === 'date' && (
                          <input
                            type="date"
                            value={currentVal}
                            onChange={e => setValue(field.key, e.target.value)}
                            className="input input-sm input-bordered w-full text-sm"
                          />
                        )}

                        {field.type === 'money' && (
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-base-content/40 pointer-events-none">$</span>
                            <input
                              type="number"
                              value={currentVal}
                              onChange={e => setValue(field.key, e.target.value)}
                              className="input input-sm input-bordered w-full pl-6 text-sm"
                              min="0"
                              step="0.01"
                              placeholder="0.00"
                            />
                          </div>
                        )}

                        {field.type === 'number' && (
                          <input
                            type="number"
                            value={currentVal}
                            onChange={e => setValue(field.key, e.target.value)}
                            className="input input-sm input-bordered w-full text-sm"
                            min="0"
                            step="0.01"
                            placeholder="0"
                          />
                        )}

                        {field.type === 'contact' && (
                          <ContactTypeahead
                            value={currentVal}
                            onChange={val => setValue(field.key, val)}
                          />
                        )}

                        {field.type === 'text' && (
                          <input
                            type="text"
                            value={currentVal}
                            onChange={e => setValue(field.key, e.target.value)}
                            className="input input-sm input-bordered w-full text-sm"
                            placeholder={!wasFound ? 'Not found — type to fill in' : ''}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 pt-1">
        <button onClick={handleConfirm} className="btn btn-primary btn-sm gap-1.5">
          <CheckCircle2 size={14} /> Confirm & Continue
        </button>
        <button onClick={onReExtract} className="btn btn-ghost btn-sm gap-1.5 text-base-content/50">
          <RefreshCw size={13} /> Re-extract from a different file
        </button>
      </div>
    </div>
  );
};

export default StepExtractedData;
