import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle2, AlertCircle, RefreshCw, Search, ChevronRight, ChevronDown } from 'lucide-react';
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
  hint?: string;
}

interface StepExtractedDataProps {
  dealId?: string;
  extractedData: Record<string, unknown> | null;
  onConfirm: (verifiedData: Record<string, unknown>) => void;
  onEdit: () => void;
  onReExtract: () => void;
}

// --- Field Definitions ---
// Sections: Property | Transaction | Financing | Key Dates | Inspection | Appraisal | Title & HOA | Home Warranty | Parties
const FIELD_DEFS: FieldDef[] = [

  // ── Property ──────────────────────────────────────────────────────────────
  { key: 'address',             label: 'Street Address',      type: 'text',    section: 'Property' },
  { key: 'city',                label: 'City',                type: 'text',    section: 'Property' },
  { key: 'state',               label: 'State',               type: 'text',    section: 'Property' },
  { key: 'zipCode',             label: 'ZIP Code',            type: 'text',    section: 'Property' },
  { key: 'propertyType',        label: 'Property Type',       type: 'select',  section: 'Property',
    options: ['Single Family', 'Condo', 'Townhouse', 'Multi-Family', 'Land', 'Commercial', 'Other'] },
  { key: 'mlsNumber',           label: 'MLS Number',          type: 'text',    section: 'Property' },
  { key: 'mlsBoard',            label: 'MLS Board',           type: 'text',    section: 'Property' },
  { key: 'legalDescription',    label: 'Legal Description',   type: 'text',    section: 'Property' },

  // ── Transaction ───────────────────────────────────────────────────────────
  { key: 'transactionType',       label: 'Transaction Type',        type: 'select',  section: 'Transaction',
    options: ['buyer', 'seller', 'both'] },
  { key: 'contractPrice',          label: 'Sale / Contract Price',   type: 'money',   section: 'Transaction' },
  { key: 'earnestMoney',          label: 'Earnest Money',           type: 'money',   section: 'Transaction' },
  { key: 'earnestMoneyHolder',    label: 'Earnest Money Holder',    type: 'text',    section: 'Transaction' },
  { key: 'additionalEarnestMoney',label: 'Additional Earnest Money',type: 'money',   section: 'Transaction' },
  { key: 'sellerCredit',          label: 'Seller Credit / Concessions', type: 'money', section: 'Transaction',
    hint: 'Price concessions — separate from closing cost contribution' },
  { key: 'sellerPaidClosingCosts',label: 'Seller Paid Closing Costs', type: 'money', section: 'Transaction',
    hint: 'Amount seller contributes toward buyer closing costs' },
  { key: 'repairsNotToExceed',    label: 'Repairs Not to Exceed',   type: 'money',   section: 'Transaction' },
  { key: 'downPaymentAmount',     label: 'Down Payment',            type: 'money',   section: 'Transaction' },
  { key: 'downPaymentPercent',    label: 'Down Payment %',          type: 'number',  section: 'Transaction' },
  { key: 'commissionReceived',    label: 'Commission Received',     type: 'money',   section: 'Transaction' },
  { key: 'buyerAgentCommission',  label: 'Buyer Agent Commission',  type: 'text',    section: 'Transaction' },
  { key: 'listingAgentCommission',label: 'Listing Agent Commission',type: 'text',    section: 'Transaction' },

  // ── Financing ─────────────────────────────────────────────────────────────
  { key: 'loanType',            label: 'Loan Type',           type: 'select',  section: 'Financing',
    options: ['Conventional', 'FHA', 'VA', 'USDA', 'Cash', 'Other'] },
  { key: 'loanAmount',          label: 'Loan Amount',         type: 'money',   section: 'Financing' },
  { key: 'loanOfficer',         label: 'Loan Officer',        type: 'contact', section: 'Financing' },
  { key: 'loanOfficerCompany',  label: 'Lender Company',      type: 'text',    section: 'Financing' },
  { key: 'loanApplicationDue',  label: 'Loan Application Due',type: 'text',    section: 'Financing',
    hint: 'Date or relative formula, e.g. "5 calendar days after Inspection Period Ends"' },
  { key: 'finalLoanApprovalDue',label: 'Final Loan Approval Due', type: 'text', section: 'Financing',
    hint: 'Date or relative formula, e.g. "5 calendar days before Closing Date"' },

  // ── Key Dates ─────────────────────────────────────────────────────────────
  { key: 'contractDate',        label: 'Effective Date',      type: 'date',    section: 'Key Dates' },
  { key: 'closingDate',         label: 'Closing Date',        type: 'date',    section: 'Key Dates' },
  { key: 'possessionDate',      label: 'Possession Date',     type: 'date',    section: 'Key Dates' },
  { key: 'surveyDeadline',      label: 'Survey Deadline',     type: 'text',    section: 'Key Dates',
    hint: 'Date or relative formula, e.g. "10 calendar days before Closing Date"' },
  { key: 'earnestMoneyDueDate', label: 'Earnest Money Due',   type: 'text',    section: 'Key Dates',
    hint: 'Date or relative formula, e.g. "3 calendar days after Effective Date"' },
  { key: 'additionalEarnestMoneyDue', label: 'Additional EM Due', type: 'text', section: 'Key Dates',
    hint: 'Date or relative formula' },
  { key: 'listingExpirationDate', label: 'Listing Expiration', type: 'date',   section: 'Key Dates' },

  // ── Inspection ────────────────────────────────────────────────────────────
  { key: 'inspectionDate',          label: 'Inspection Period Ends',       type: 'text', section: 'Inspection',
    hint: 'Date or relative formula, e.g. "11 calendar days after Effective Date"' },
  { key: 'buyerInspectionNoticeDue',label: 'Buyer Inspection Notice Due',  type: 'text', section: 'Inspection',
    hint: 'Date or relative formula, e.g. "0 calendar days after Inspection Period Ends"' },
  { key: 'renegotiationPeriod',     label: 'Renegotiation Period',         type: 'text', section: 'Inspection',
    hint: 'e.g. "5 calendar days after Buyer Inspection Notice Due"' },
  { key: 'financeDeadline',         label: 'Finance / Contingency Deadline', type: 'date', section: 'Inspection' },

  // ── Appraisal ─────────────────────────────────────────────────────────────
  { key: 'appraisalDeliveryDate',     label: 'Appraisal Report Delivery',     type: 'text', section: 'Appraisal',
    hint: 'Date or relative formula' },
  { key: 'appraisalDueToSeller',      label: 'Appraisal Report Due to Seller',type: 'text', section: 'Appraisal',
    hint: 'e.g. "5 calendar days after Appraisal Report Delivery Date"' },
  { key: 'appraisalNegotiationPeriod',label: 'Appraisal Negotiation Period',  type: 'text', section: 'Appraisal',
    hint: 'e.g. "5 calendar days after Appraisal Report Due to Seller"' },

  // ── Title & HOA ───────────────────────────────────────────────────────────
  { key: 'titleCommitmentDeliveryDate',label: 'Title Commitment Delivery', type: 'text', section: 'Title & HOA',
    hint: 'Date or relative formula' },
  { key: 'titleObjectionPeriod',       label: 'Title Objection Period',    type: 'text', section: 'Title & HOA',
    hint: 'e.g. "5 calendar days after Title Commitment Delivery Date"' },
  { key: 'hoaDocumentDeliveryDeadline',label: 'HOA Document Delivery',     type: 'text', section: 'Title & HOA',
    hint: 'Date or relative formula' },
  { key: 'buyerHoaReviewDeadline',     label: 'Buyer HOA Review Deadline', type: 'text', section: 'Title & HOA',
    hint: 'e.g. "5 calendar days after HOA Document Delivery Deadline"' },

  // ── Home Warranty ─────────────────────────────────────────────────────────
  { key: 'homeWarrantyPaidBy',  label: 'Home Warranty Paid By',  type: 'text',   section: 'Home Warranty',
    hint: 'e.g. BUYER, SELLER, BUYER waives, N/A' },
  { key: 'homeWarrantyAmount',  label: 'Home Warranty Amount',   type: 'money',  section: 'Home Warranty' },
  { key: 'homeWarrantyCompany', label: 'Home Warranty Company',  type: 'text',   section: 'Home Warranty' },

  // ── Parties ───────────────────────────────────────────────────────────────
  { key: 'buyerAgentName',      label: "Buyer's Agent",       type: 'contact', section: 'Parties' },
  { key: 'sellerAgentName',     label: "Seller's Agent",      type: 'contact', section: 'Parties' },
  { key: 'titleCompany',        label: 'Title Company',       type: 'contact', section: 'Parties' },
];

const SECTIONS = [
  'Property',
  'Transaction',
  'Financing',
  'Key Dates',
  'Inspection',
  'Appraisal',
  'Title & HOA',
  'Home Warranty',
  'Parties',
];

// --- Formula pattern detection ---
const FORMULA_PATTERN = /\d+\s+(calendar|business)?\s*days?\s+(after|before|from)/i;
const FORMULA_PHRASES = [
  'after effective date',
  'before closing',
  'after inspection',
  'business days',
  'after closing',
  'before effective date',
  'after contract date',
];

function isFormulaValue(val: string): boolean {
  if (!val) return false;
  if (FORMULA_PATTERN.test(val)) return true;
  const lower = val.toLowerCase();
  return FORMULA_PHRASES.some(phrase => lower.includes(phrase));
}

function isDateValue(val: string): boolean {
  if (!val) return false;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return true;
  // MM/DD/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(val)) return true;
  return false;
}

function isPlainNumber(val: string): boolean {
  if (!val) return false;
  return /^\d+(\.\d+)?$/.test(val.trim());
}

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

// --- Tier classification helpers ---
type Tier = 1 | 2 | 3;

function getFieldTier(field: FieldDef, extractedData: Record<string, unknown> | null): Tier {
  const raw = extractedData?.[field.key];
  const wasFound = raw !== null && raw !== undefined && raw !== '';
  if (!wasFound) return 1;
  if (!!field.hint) return 2;
  return 3;
}

// --- Main Component ---
const StepExtractedData: React.FC<StepExtractedDataProps> = ({
  dealId,
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

  // Capture original AI-extracted values once (for correction tracking)
  const initialValuesRef = React.useRef<Record<string, string>>(values);

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

  // Per-field confidence scores from AI
  const fieldScoreMap = React.useMemo<Record<string, number>>(() => {
    const raw = (extractedData as any)?.fieldScores;
    if (!Array.isArray(raw)) return {};
    const map: Record<string, number> = {};
    raw.forEach((item: { field: string; score: number }) => {
      if (item?.field) map[item.field] = item.score;
    });
    return map;
  }, [extractedData]);

  const foundCount = FIELD_DEFS.filter(({ key }) => {
    const raw = extractedData?.[key];
    return raw !== null && raw !== undefined && raw !== '';
  }).length;

  const reviewCount = FIELD_DEFS.filter(({ key, hint }) => {
    const raw = extractedData?.[key];
    const wasFound = raw !== null && raw !== undefined && raw !== '';
    return wasFound && !!hint;
  }).length;

  // --- Accordion state ---
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    SECTIONS.forEach(section => {
      const fields = FIELD_DEFS.filter(f => f.section === section);
      const hasAttention = fields.some(f => {
        const raw = extractedData?.[f.key];
        const wasFound = raw !== null && raw !== undefined && raw !== '';
        const isTier1 = !wasFound;
        const isTier2 = wasFound && !!f.hint;
        return isTier1 || isTier2;
      });
      init[section] = hasAttention;
    });
    return init;
  });

  const toggleSection = (section: string) =>
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));

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
    // Save AI corrections in background if dealId provided
    if (dealId) {
      const corrections = FIELD_DEFS
        .filter(({ key }) => {
          const aiVal = initialValuesRef.current[key] ?? '';
          const userVal = values[key] ?? '';
          return aiVal !== userVal;
        })
        .map(({ key }) => ({
          deal_id: dealId,
          field_key: key,
          ai_value: initialValuesRef.current[key] || null,
          corrected_value: values[key] || null,
        }));
      if (corrections.length > 0) {
        supabase.from('extraction_corrections').insert(corrections).then(() => {});
      }
    }
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
        {reviewCount > 0 && (
          <><span className="text-amber-600 font-medium">{reviewCount} formula fields</span> need review. </>
        )}
        <span className="text-red-400 font-medium">{FIELD_DEFS.length - foundCount} not found</span> — fill in or leave blank.
      </p>

      {/* Sectioned Table */}
      <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1 -mr-1">
        {SECTIONS.map(section => {
          const allFields = FIELD_DEFS.filter(f => f.section === section);

          // Only render section if at least one field was found OR it's a primary section
          const primarySections = ['Property', 'Transaction', 'Financing', 'Key Dates', 'Parties'];
          const sectionHasData = allFields.some(f => {
            const raw = extractedData?.[f.key];
            return raw !== null && raw !== undefined && raw !== '';
          });
          if (!primarySections.includes(section) && !sectionHasData) return null;

          // Classify fields into tiers
          const tier1Fields = allFields.filter(f => getFieldTier(f, extractedData) === 1);
          const tier2Fields = allFields.filter(f => getFieldTier(f, extractedData) === 2);
          const tier3Fields = allFields.filter(f => getFieldTier(f, extractedData) === 3);

          const tier1Count = tier1Fields.length;
          const tier2Count = tier2Fields.length;

          // Ordered fields: tier1 first, then tier2, then tier3
          const orderedFields = [...tier1Fields, ...tier2Fields, ...tier3Fields];

          const isOpen = openSections[section] ?? true;

          return (
            <div key={section} className="rounded-xl border border-base-300 overflow-hidden">
              {/* Section Header — clickable toggle */}
              <button
                onClick={() => toggleSection(section)}
                className="w-full bg-base-200/60 px-3 py-1.5 border-b border-base-300 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-base-content/50 uppercase tracking-wide">{section}</p>
                  {tier1Count > 0 && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px] font-semibold">
                      🔴 {tier1Count} missing
                    </span>
                  )}
                  {tier2Count > 0 && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600 text-[10px] font-semibold">
                      🟡 {tier2Count} review
                    </span>
                  )}
                  {tier1Count === 0 && tier2Count === 0 && (
                    <span className="text-[10px] text-green-600 font-medium">✅ {allFields.length} verified</span>
                  )}
                </div>
                {/* Chevron */}
                <ChevronDown size={14} className={`text-base-content/40 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Section Fields — hidden when collapsed */}
              {isOpen && (
                <div className="divide-y divide-base-200">
                  {orderedFields.map(field => {
                    const originalRaw = extractedData?.[field.key];
                    const wasFound = originalRaw !== null && originalRaw !== undefined && originalRaw !== '';
                    const currentVal = values[field.key] ?? '';
                    const tier = getFieldTier(field, extractedData);

                    // Determine row background
                    const rowBg =
                      tier === 1 ? 'bg-red-50/60 dark:bg-red-900/10' :
                      tier === 2 ? 'bg-amber-50/40 dark:bg-amber-900/10' :
                      '';

                    // Formula pill logic: only for tier 2 (hint fields) that have a value
                    const showFormulaPill =
                      tier === 2 &&
                      wasFound &&
                      currentVal &&
                      isFormulaValue(currentVal) &&
                      !isDateValue(currentVal) &&
                      !isPlainNumber(currentVal);

                    return (
                      <div
                        key={field.key}
                        className={`flex items-start gap-3 px-3 py-2 ${rowBg}`}
                      >
                        {/* Label */}
                        <div className="w-40 flex-none pt-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-base-content/60 leading-tight">
                              {field.label}
                            </span>
                            {!wasFound && (
                              <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-none" title="Not found in contract" />
                            )}
                            {wasFound && fieldScoreMap[field.key] !== undefined && (() => {
                              const s = fieldScoreMap[field.key];
                              const color = s >= 0.8 ? 'bg-green-400' : s >= 0.5 ? 'bg-amber-400' : 'bg-red-400';
                              const label = s >= 0.8 ? 'High confidence' : s >= 0.5 ? 'Medium confidence — review' : 'Low confidence — verify manually';
                              const pct = Math.round(s * 100);
                              return (
                                <span
                                  className={`w-1.5 h-1.5 rounded-full flex-none ${color}`}
                                  title={`${label} (${pct}%)`}
                                />
                              );
                            })()}
                          </div>
                          {field.hint && (
                            <p className="text-[10px] text-base-content/35 leading-tight mt-0.5">{field.hint}</p>
                          )}
                        </div>

                        {/* Input */}
                        <div className="flex-1 min-w-0">
                          {/* Formula pill — rendered above input for tier 2 formula values */}
                          {showFormulaPill && (
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium italic border border-amber-200">
                                📐 {currentVal}
                              </span>
                              <span className="text-[10px] text-base-content/40">AI extracted — edit below to override</span>
                            </div>
                          )}

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
              )}
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
