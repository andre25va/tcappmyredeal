import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle2, AlertCircle, RefreshCw, Search, ChevronRight, ChevronDown, Info } from 'lucide-react';
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

interface ExtractedCheckbox {
  label: string;
  checked: boolean;
  section: string;
}

interface ContractDetectionInfo {
  startPage: number;
  endPage: number;
  totalPages: number;
  formName: string;
  mlsBoard: string | null;
  state: string | null;
  cached: boolean;
  patternId: string | null;
}

interface StepExtractedDataProps {
  dealId?: string;
  extractedData: Record<string, unknown> | null;
  contractDetection?: ContractDetectionInfo | null;
  onConfirm: (verifiedData: Record<string, unknown>) => void;
  onEdit: () => void;
  onReExtract: () => void;
  onJumpToPage?: (page: number) => void;
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
  { key: 'saleContingency',       label: 'Sale Contingency',        type: 'select',  section: 'Transaction',  options: ['IS Contingent', 'NOT Contingent'],
    hint: "\"true\" if contract IS contingent on sale/closing of Buyer's property (line 290)" },
  { key: 'contractPrice',          label: 'Sale / Contract Price',   type: 'money',   section: 'Transaction' },
  { key: 'earnestMoney',          label: 'Earnest Money',           type: 'money',   section: 'Transaction' },
  { key: 'earnestMoneyHolder',    label: 'Earnest Money Holder',    type: 'text',    section: 'Transaction' },
  { key: 'earnestMoneyForm',      label: 'EM Payment Form',         type: 'text',    section: 'Transaction',
    hint: 'How earnest money is delivered — check, electronic/ACH, wire, or other' },
  { key: 'earnestMoneyRefundable', label: 'EM Refundable',          type: 'select',  section: 'Transaction',
    options: ['Refundable', 'Non-refundable'],
    hint: 'Whether earnest money is refundable or non-refundable (L181)' },
  { key: 'additionalEarnestMoney',label: 'Additional Earnest Money',type: 'money',   section: 'Transaction' },
  { key: 'additionalEarnestRefundable', label: 'Additional EM Refundable', type: 'select', section: 'Transaction',
    options: ['Refundable', 'Non-refundable'],
    hint: 'Whether additional earnest money is refundable or non-refundable (L191)' },
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
  { key: 'saleType',            label: 'Sale Type',           type: 'select',  section: 'Financing',  options: ['Cash', 'Financed'],
    hint: '"true" if "THIS IS A CASH SALE" checkbox is checked (line 296)' },
  { key: 'loanType',            label: 'Loan Type',           type: 'select',  section: 'Financing',
    options: ['Conventional', 'FHA', 'VA', 'USDA', 'Cash', 'Other'] },
  { key: 'loanAmount',          label: 'Loan Amount',         type: 'money',   section: 'Financing' },
  { key: 'loanOfficer',         label: 'Loan Officer',        type: 'contact', section: 'Financing' },
  { key: 'loanOfficerCompany',  label: 'Lender Company',      type: 'text',    section: 'Financing' },
  { key: 'loanApplicationDue',  label: 'Loan Application Due',type: 'text',    section: 'Financing',
    hint: 'Date or relative formula, e.g. "5 calendar days after Inspection Period Ends"' },
  { key: 'finalLoanApprovalDue',label: 'Final Loan Approval Due', type: 'text', section: 'Financing',
    hint: 'Date or relative formula, e.g. "5 calendar days before Closing Date"' },
  { key: 'loanOccupancyType',     label: 'Occupancy Type',          type: 'select',  section: 'Financing',
    options: ['owner-occupied', 'investment'] },
  { key: 'interestRateType',      label: 'Interest Rate Type',      type: 'select',  section: 'Financing',
    options: ['Fixed Rate', 'Adjustable Rate', 'Interest Only', 'Other'] },
  { key: 'amortizationPeriodYears', label: 'Amortization Period (yrs)', type: 'text', section: 'Financing' },

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
  { key: 'warrantyArranger',    label: 'Warranty Arranged By',   type: 'text',   section: 'Home Warranty',
    hint: '"Licensee assisting SELLER" or "Licensee assisting BUYER" (line 91)' },
  { key: 'homeWarrantyPaidBy',  label: 'Home Warranty Paid By',  type: 'text',   section: 'Home Warranty',
    hint: 'e.g. BUYER, SELLER, BUYER waives, N/A' },
  { key: 'homeWarrantyAmount',  label: 'Home Warranty Amount',   type: 'money',  section: 'Home Warranty' },
  { key: 'homeWarrantyCompany', label: 'Home Warranty Company',  type: 'text',   section: 'Home Warranty' },

  // ── Parties ───────────────────────────────────────────────────────────────
  { key: 'buyerNames',          label: 'Buyer Name(s)',        type: 'text',    section: 'Parties',
    hint: 'Exactly as listed on contract — Trusts, LLCs, and multi-buyer names flagged for review' },
  { key: 'sellerNames',         label: 'Seller Name(s)',       type: 'text',    section: 'Parties',
    hint: 'Exactly as listed on contract — Trusts, LLCs, and multi-seller names flagged for review' },
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

// --- Sprint 9: Name auto-flag rule ---
// Any name field whose value contains Trust / LLC / "and" / "&" or is >30 chars
// gets forced to amber confidence regardless of AI score.
const NAME_FIELDS = new Set(['buyerNames', 'sellerNames', 'buyerAgentName', 'sellerAgentName']);

function shouldFlagName(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return false;
  const v = value.trim();
  if (v.length > 30) return true;
  const lower = v.toLowerCase();
  // word-boundary checks for common complex-name patterns
  if (/\btrust\b/i.test(v)) return true;
  if (/\bllc\b/i.test(v)) return true;
  if (/\binc\b/i.test(v)) return true;
  if (/\bcorp\b/i.test(v)) return true;
  if (/\b(and|&)\b/i.test(lower)) return true;
  return false;
}

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

// --- Source Badge ---
function SourceBadge({ fieldKey, fieldSources, onJumpToPage }: {
  fieldKey: string;
  fieldSources: Record<string, { page: number; line?: number; text: string }>;
  onJumpToPage?: (page: number) => void;
}) {
  const source = fieldSources[fieldKey];
  const [open, setOpen] = React.useState(false);
  if (!source) return null;
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        className="text-primary/40 hover:text-primary transition-colors"
        title="View contract source"
      >
        <Info size={11} />
      </button>
      {open && (
        <div
          className="absolute z-50 bottom-full left-0 mb-1 w-72 bg-base-100 border border-base-300 rounded-xl shadow-xl p-3 text-xs"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-semibold text-primary text-[11px]">
              📄 Page {source.page}{source.line ? ` · Line ${source.line}` : ''}
            </span>
            <div className="flex items-center gap-2">
              {onJumpToPage && (
                <button
                  type="button"
                  onClick={() => { onJumpToPage(source.page); setOpen(false); }}
                  className="text-primary text-[11px] underline hover:no-underline"
                >
                  Jump →
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-base-content/30 hover:text-base-content text-[11px]"
              >
                ✕
              </button>
            </div>
          </div>
          <p className="text-base-content/60 italic leading-relaxed text-[11px] break-words">
            "{source.text}"
          </p>
        </div>
      )}
    </span>
  );
}

const StepExtractedData: React.FC<StepExtractedDataProps> = ({
  dealId,
  extractedData,
  contractDetection,
  onConfirm,
  onEdit,
  onReExtract,
  onJumpToPage,
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

  // Field source map — page/line/text for each extracted field (for ⓘ badges)
  const fieldSources: Record<string, { page: number; line?: number; text: string }> = React.useMemo(() => {
    const raw = (extractedData as any)?.fieldSources;
    if (!raw) return {};
    // Handle both array format (new) and object format (legacy)
    if (Array.isArray(raw)) {
      return Object.fromEntries(
        (raw as Array<{ field: string; page: number; line?: number | null; text: string }>)
          .map(s => [s.field, { page: s.page, line: s.line ?? undefined, text: s.text }])
      );
    }
    return raw as Record<string, { page: number; line?: number; text: string }>;
  },
    [extractedData]
  );

  // Group fields by page number from fieldSources (or by section as fallback)
  const pageGroups = React.useMemo(() => {
    try {
      const hasSources = fieldSources && Object.values(fieldSources).some((s: any) => s?.page);
      if (hasSources) {
        const groups: Record<string, { label: string; fields: FieldDef[] }> = {};
        FIELD_DEFS.forEach(field => {
          const src = (fieldSources as any)[field.key];
          const pageKey = src?.page ? String(src.page) : '0';
          const label = src?.page ? `Page ${src.page}` : 'Other Fields';
          if (!groups[pageKey]) groups[pageKey] = { label, fields: [] };
          groups[pageKey].fields.push(field);
        });
        return Object.entries(groups)
          .sort(([a], [b]) => {
            const numA = parseInt(a, 10); const numB = parseInt(b, 10);
            if (numA === 0) return 1; if (numB === 0) return -1;
            return numA - numB;
          })
          .map(([pageKey, group]) => ({ key: pageKey, ...group }));
      }
    } catch (e) {
      // fallthrough to section-based grouping
    }
    // Fallback: group by section
    return SECTIONS.map(section => ({
      key: section,
      label: section,
      fields: FIELD_DEFS.filter(f => f.section === section),
    }));
  }, [fieldSources]);

  const setValue = (key: string, val: string) =>
    setValues(prev => ({ ...prev, [key]: val }));

  const [cdOverride, setCdOverride] = React.useState(false);
  const [cdStart, setCdStart] = React.useState('');
  const [cdEnd, setCdEnd] = React.useState('');
  const [cdConfirming, setCdConfirming] = React.useState(false);

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

  // --- Accordion state — all collapsed by default, TC expands page by page ---
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

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
          form_slug: contractDetection?.formName && contractDetection.formName !== 'Unknown'
            ? contractDetection.formName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
            : null,
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


      {/* Contract page detection banner */}
      {contractDetection && (
        <div className="flex flex-col gap-2 px-3 py-2 rounded-lg text-xs font-medium border bg-indigo-50 border-indigo-200 text-indigo-800">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span>📄</span>
              <span>
                <strong>
                  {contractDetection.cached ? 'Known contract — ' : 'Contract detected — '}
                </strong>
                pages {contractDetection.startPage}–{contractDetection.endPage} of {contractDetection.totalPages}
                {contractDetection.formName && contractDetection.formName !== 'Unknown' && (
                  <span className="text-indigo-600"> · {contractDetection.formName}</span>
                )}
              </span>
            </div>
            {!cdOverride && contractDetection.patternId && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={async () => {
                    if (!contractDetection.patternId) return;
                    setCdConfirming(true);
                    try {
                      await fetch('/api/ai?action=confirm-contract-pages', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ patternId: contractDetection.patternId, confirmed: true }),
                      });
                    } finally {
                      setCdConfirming(false);
                    }
                  }}
                  disabled={cdConfirming}
                  className="px-2 py-0.5 rounded bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-semibold disabled:opacity-50"
                >
                  {cdConfirming ? '...' : '✓ Correct'}
                </button>
                <button
                  onClick={() => {
                    setCdStart(String(contractDetection.startPage));
                    setCdEnd(String(contractDetection.endPage));
                    setCdOverride(true);
                  }}
                  className="px-2 py-0.5 rounded bg-white border border-indigo-300 hover:bg-indigo-50 text-indigo-700 font-semibold"
                >
                  Override
                </button>
              </div>
            )}
          </div>

          {cdOverride && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-indigo-700">Pages:</span>
              <input
                type="number"
                min={1}
                max={contractDetection.totalPages}
                value={cdStart}
                onChange={e => setCdStart(e.target.value)}
                className="w-16 px-1 py-0.5 border border-indigo-300 rounded text-center text-indigo-900 bg-white"
                placeholder="Start"
              />
              <span>–</span>
              <input
                type="number"
                min={1}
                max={contractDetection.totalPages}
                value={cdEnd}
                onChange={e => setCdEnd(e.target.value)}
                className="w-16 px-1 py-0.5 border border-indigo-300 rounded text-center text-indigo-900 bg-white"
                placeholder="End"
              />
              <span className="text-indigo-500">of {contractDetection.totalPages}</span>
              <button
                onClick={async () => {
                  if (!contractDetection.patternId) return;
                  setCdConfirming(true);
                  try {
                    await fetch('/api/ai?action=confirm-contract-pages', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        patternId: contractDetection.patternId,
                        confirmed: false,
                        startPage: Number(cdStart),
                        endPage: Number(cdEnd),
                      }),
                    });
                    setCdOverride(false);
                  } finally {
                    setCdConfirming(false);
                  }
                }}
                disabled={cdConfirming || !cdStart || !cdEnd}
                className="px-2 py-0.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 font-semibold disabled:opacity-50"
              >
                {cdConfirming ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => setCdOverride(false)}
                className="px-2 py-0.5 rounded bg-white border border-indigo-300 text-indigo-600 hover:bg-indigo-50"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Template-assisted / Vision-only banner */}
      {(() => {
        const templateUsed = (extractedData as any)?.templateUsed;
        return (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border ${
            templateUsed
              ? 'bg-blue-50 border-blue-200 text-blue-700'
              : 'bg-base-200 border-base-300 text-base-content/50'
          }`}>
            {templateUsed ? (
              <>
                <span>🧠</span>
                <span><strong>Template-assisted extraction</strong> — blank reference form used to improve field accuracy</span>
              </>
            ) : (
              <>
                <span>👁️</span>
                <span><strong>Vision only</strong> — no blank template found for this MLS (upload one in Settings → MLS Directory to improve accuracy)</span>
              </>
            )}
          </div>
        );
      })()}

      {/* ── Coverage bar ── */}
      {(() => {
        const total      = FIELD_DEFS.length;
        const filled     = foundCount;
        const missing    = total - filled;
        const pctFilled  = Math.round((filled  / total) * 100);
        const pctReview  = Math.round((reviewCount / total) * 100);
        const pctMissing = 100 - pctFilled;

        return (
          <div className="space-y-1.5">
            {/* Bar */}
            <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-base-300">
              <div
                className="bg-green-500 transition-all"
                style={{ width: `${Math.max(pctFilled - pctReview, 0)}%` }}
              />
              {reviewCount > 0 && (
                <div
                  className="bg-amber-400 transition-all"
                  style={{ width: `${pctReview}%` }}
                />
              )}
              {missing > 0 && (
                <div
                  className="bg-red-400/60 transition-all"
                  style={{ width: `${pctMissing}%` }}
                />
              )}
            </div>

            {/* Labels */}
            <div className="flex items-center gap-3 flex-wrap text-xs text-base-content/60">
              <span>
                <span className="font-semibold text-green-600">{filled}</span>
                <span className="text-base-content/40"> / {total} fields extracted</span>
              </span>
              {reviewCount > 0 && (
                <span className="text-amber-500 font-medium">
                  {reviewCount} formula — review
                </span>
              )}
              {missing > 0 && (
                <span className="text-red-400 font-medium">
                  {missing} not found — fill in manually
                </span>
              )}
              <span className="ml-auto font-mono font-bold text-base-content/50">
                {pctFilled}%
              </span>
            </div>
          </div>
        );
      })()}

      {/* Sectioned Table */}
      <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1 -mr-1">
        {(Array.isArray(pageGroups) ? pageGroups : []).map(group => {
          const allFields = (group?.fields) || [];

          // Skip empty groups (no data and not a primary group)
          const primaryLabels = ['Property', 'Transaction', 'Financing', 'Key Dates', 'Parties', 'Page 1', 'Page 2'];
          const groupHasData = allFields.some(f => {
            const raw = extractedData?.[f.key];
            return raw !== null && raw !== undefined && raw !== '';
          });
          if (!primaryLabels.includes(group.label) && !groupHasData) return null;

          // Classify fields into tiers
          const tier1Fields = allFields.filter(f => getFieldTier(f, extractedData) === 1);
          const tier2Fields = allFields.filter(f => getFieldTier(f, extractedData) === 2);
          const tier3Fields = allFields.filter(f => getFieldTier(f, extractedData) === 3);

          const tier1Count = tier1Fields.length;
          const tier2Count = tier2Fields.length;

          // Ordered fields: tier1 first, then tier2, then tier3
          const orderedFields = [...tier1Fields, ...tier2Fields, ...tier3Fields];

          const isOpen = openSections[group.key] ?? false;

          return (
            <div key={group.key} className="rounded-xl border border-base-300 overflow-hidden">
              {/* Page Header — clickable toggle */}
              <button
                onClick={() => toggleSection(group.key)}
                className="w-full bg-base-200/60 px-3 py-1.5 border-b border-base-300 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-base-content/50 uppercase tracking-wide">{group.label}</p>
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
                    <span className="text-[10px] text-green-600 font-medium">✅ {orderedFields.filter(f => {const r=extractedData?.[f.key]; return r!==null&&r!==undefined&&r!=='';}).length}/{allFields.length} found</span>
                  )}
                </div>
                {/* Chevron */}
                <ChevronDown size={14} className={`text-base-content/40 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Fields — hidden when collapsed */}
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

                    // Confidence left border — colored stripe on the left edge of each row
                    const fieldScore = fieldScoreMap[field.key];
                    // Sprint 9: name auto-flag — force amber if complex name pattern detected
                    const isNameFlagged = NAME_FIELDS.has(field.key) && wasFound && shouldFlagName(currentVal);
                    const confidenceBorder =
                      !wasFound                ? 'border-l-4 border-red-300' :
                      isNameFlagged            ? 'border-l-4 border-amber-400' :
                      fieldScore === undefined  ? 'border-l-4 border-transparent' :
                      fieldScore >= 0.8         ? 'border-l-4 border-green-400' :
                      fieldScore >= 0.5         ? 'border-l-4 border-amber-400' :
                                                  'border-l-4 border-red-400';

                    return (
                      <div
                        key={field.key}
                        className={`flex items-start gap-3 px-3 py-2 ${rowBg} ${confidenceBorder}`}
                      >
                        {/* Label */}
                        <div className="w-40 flex-none pt-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-base-content/60 leading-tight">
                              {field.label}
                            </span>
                            {!wasFound && (
                              <span className="w-2 h-2 rounded-full bg-red-400 flex-none" title="Not found in contract" />
                            )}
                            {wasFound && (() => {
                              // Sprint 9: name-flagged fields always show amber dot with special label
                              if (isNameFlagged) {
                                return (
                                  <span
                                    className="w-2 h-2 rounded-full flex-none bg-amber-400"
                                    title="Complex name detected — verify carefully"
                                  />
                                );
                              }
                              if (fieldScoreMap[field.key] === undefined) return null;
                              const s = fieldScoreMap[field.key];
                              const color = s >= 0.8 ? 'bg-green-400' : s >= 0.5 ? 'bg-amber-400' : 'bg-red-400';
                              const label = s >= 0.8 ? 'High confidence' : s >= 0.5 ? 'Medium confidence — review' : 'Low confidence — verify manually';
                              const pct = Math.round(s * 100);
                              return (
                                <span
                                  className={`w-2 h-2 rounded-full flex-none ${color}`}
                                  title={`${label} (${pct}%)`}
                                />
                              );
                            })()}
                            <SourceBadge fieldKey={field.key} fieldSources={fieldSources} onJumpToPage={onJumpToPage} />
                          </div>
                          {field.hint && (
                            <p className="text-[10px] text-base-content/35 leading-tight mt-0.5">{field.hint}</p>
                          )}
                          <p className="text-[9px] text-base-content/25 uppercase tracking-wide mt-0.5">{field.section}</p>
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
                              {currentVal && (
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-base-content/40 pointer-events-none">$</span>
                              )}
                              <input
                                type="number"
                                value={currentVal}
                                onChange={e => setValue(field.key, e.target.value)}
                                className={`input input-sm input-bordered w-full text-sm ${currentVal ? 'pl-6' : ''}`}
                                min="0"
                                step="0.01"
                                placeholder={!wasFound ? 'Not found — type to fill in' : '0.00'}
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
                            <>
                              <input
                                type="text"
                                value={currentVal}
                                onChange={e => setValue(field.key, e.target.value)}
                                className="input input-sm input-bordered w-full text-sm"
                                placeholder={!wasFound ? 'Not found — type to fill in' : ''}
                              />
                              {/* Sprint 9: name auto-flag warning */}
                              {isNameFlagged && (
                                <p className="mt-1 flex items-center gap-1 text-[10px] text-amber-600 font-medium">
                                  <span>⚠</span>
                                  <span>
                                    {/\b(trust|llc|inc|corp)\b/i.test(currentVal as string)
                                      ? 'Entity name — confirm vesting & title requirements'
                                      : /\b(and|&)\b/i.test(currentVal as string)
                                      ? 'Multiple parties — confirm all names are correct'
                                      : 'Long name — verify spelling and completeness'}
                                  </span>
                                </p>
                              )}
                            </>
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
        {/* ── Checkboxes discovered in contract ─────────────────────────── */}
        {(() => {
          const checkboxes: ExtractedCheckbox[] = (extractedData as any)?.allCheckboxes || [];
          if (checkboxes.length === 0) return null;
          // Group by section
          const groups: Record<string, ExtractedCheckbox[]> = {};
          checkboxes.forEach(cb => {
            const key = cb.section || 'Other';
            if (!groups[key]) groups[key] = [];
            groups[key].push(cb);
          });
          const checkedCount = checkboxes.filter(cb => cb.checked).length;
          return (
            <div className="rounded-xl border border-base-300 overflow-hidden">
              <div className="bg-base-200/60 px-3 py-1.5 border-b border-base-300 flex items-center gap-2">
                <p className="text-xs font-semibold text-base-content/50 uppercase tracking-wide">Checkboxes &amp; Options</p>
                <span className="text-[10px] text-base-content/40">{checkedCount} of {checkboxes.length} checked</span>
              </div>
              <div className="divide-y divide-base-200">
                {Object.entries(groups).map(([groupName, items]) => (
                  <div key={groupName} className="px-3 py-2">
                    <p className="text-[10px] font-semibold text-base-content/40 uppercase tracking-wide mb-1.5">{groupName}</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      {items.map((cb, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <span className={`text-sm flex-none ${cb.checked ? 'text-green-600' : 'text-base-content/25'}`}>
                            {cb.checked ? '☑' : '☐'}
                          </span>
                          <span className={`text-xs leading-tight ${cb.checked ? 'text-base-content font-medium' : 'text-base-content/40'}`}>
                            {cb.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
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
