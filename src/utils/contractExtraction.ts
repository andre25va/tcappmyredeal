/**
 * contractExtraction.ts
 *
 * All contract field mapping, transformation, and normalization logic.
 * Extracted from WorkspaceDocuments.tsx as part of Phase 1 stabilization.
 *
 * This is the single source of truth for how raw AI extraction output
 * maps to deal fields in the database.
 */

import { Deal } from '../types';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ExtractedField {
  key: string;
  label: string;
  value: string;
  confidence?: 'high' | 'medium' | 'low';
  original?: string;
}

export interface ExtractionResult {
  fields: ExtractedField[];
  raw_text_preview?: string;
}

// ─── Document Category Labels ──────────────────────────────────────────────────

export const DOC_TYPE_LABELS: Record<string, string> = {
  purchase_contract: 'Purchase Contract',
  amendment: 'Amendment',
  addendum: 'Addendum',
  other: 'Other',
};

// ─── Field Deal Map ────────────────────────────────────────────────────────────
// Maps extraction field keys → deal field paths for display comparison

export const FIELD_DEAL_MAP: { key: string; label: string; getDealVal: (d: Deal) => string }[] = [
  // Price / Money
  { key: 'contractPrice',             label: 'Contract Price',                getDealVal: d => (d as any).purchasePrice         ? `$${Number((d as any).purchasePrice).toLocaleString()}`         : '' },
  { key: 'purchasePrice',             label: 'Purchase Price (alt)',           getDealVal: d => (d as any).purchasePrice         ? `$${Number((d as any).purchasePrice).toLocaleString()}`         : '' },
  { key: 'listPrice',                 label: 'List Price',                    getDealVal: d => d.listPrice                       ? `$${Number(d.listPrice).toLocaleString()}`                       : '' },
  { key: 'earnestMoney',              label: 'Earnest Money',                 getDealVal: d => (d as any).earnestMoney           ? `$${Number((d as any).earnestMoney).toLocaleString()}`           : '' },
  { key: 'additionalEarnestMoney',    label: 'Additional Earnest Money',      getDealVal: d => (d as any).additionalEarnestMoney ? `$${Number((d as any).additionalEarnestMoney).toLocaleString()}` : '' },
  { key: 'sellerCredit',              label: 'Seller Credit / Concessions',   getDealVal: d => (d as any).sellerCredit           ? `$${Number((d as any).sellerCredit).toLocaleString()}`           : '' },
  { key: 'sellerPaidClosingCosts',    label: 'Seller Paid Closing Costs',     getDealVal: d => (d as any).sellerPaidClosingCosts ? `$${Number((d as any).sellerPaidClosingCosts).toLocaleString()}` : '' },
  { key: 'additionalSellerCosts',     label: "Add'l Seller Costs",            getDealVal: d => (d as any).additionalSellerCosts  ? `$${Number((d as any).additionalSellerCosts).toLocaleString()}`  : '' },
  { key: 'repairsNotToExceed',        label: 'Repairs Not to Exceed',         getDealVal: d => (d as any).repairsNotToExceed     ? `$${Number((d as any).repairsNotToExceed).toLocaleString()}`     : '' },
  { key: 'commissionReceived',        label: 'Commission Received',           getDealVal: d => (d as any).commissionReceived     ? `$${Number((d as any).commissionReceived).toLocaleString()}`     : '' },
  { key: 'loanAmount',                label: 'Loan Amount',                   getDealVal: d => (d as any).loanAmount             ? `$${Number((d as any).loanAmount).toLocaleString()}`             : '' },
  { key: 'downPaymentAmount',         label: 'Down Payment',                  getDealVal: d => (d as any).downPayment            ? `$${Number((d as any).downPayment).toLocaleString()}`            : '' },
  { key: 'homeWarrantyAmount',        label: 'Home Warranty Amount',          getDealVal: d => (d as any).homeWarrantyAmount     ? `$${Number((d as any).homeWarrantyAmount).toLocaleString()}`     : '' },

  // Percentages
  { key: 'downPaymentPercent',        label: 'Down Payment %',                getDealVal: d => (d as any).downPaymentPercent     || '' },
  { key: 'buyerAgentCommission',      label: 'Buyer Agent Commission',        getDealVal: d => (d as any).buyerAgentCommission   || '' },
  { key: 'listingAgentCommission',    label: 'Listing Agent Commission',      getDealVal: d => (d as any).listingAgentCommission || '' },

  // Hard Dates
  { key: 'contractDate',              label: 'Contract / Effective Date',     getDealVal: d => d.contractDate                    || '' },
  { key: 'closingDate',               label: 'Closing Date',                  getDealVal: d => d.closingDate                     || '' },
  { key: 'possessionDate',            label: 'Possession Date',               getDealVal: d => (d as any).possessionDate         || '' },
  { key: 'inspectionDate',            label: 'Inspection Period Ends',        getDealVal: d => (d as any).inspectionDate         || '' },
  { key: 'financeDeadline',           label: 'Finance Deadline',              getDealVal: d => (d as any).financeDeadline        || '' },
  { key: 'appraisalDeliveryDate',     label: 'Appraisal Report Delivery',     getDealVal: d => (d as any).appraisalDeliveryDate  || '' },

  // Relative Date Formulas (stored as text)
  { key: 'earnestMoneyDueDate',       label: 'Earnest Money Due',             getDealVal: d => (d as any).earnestMoneyDueDate        || '' },
  { key: 'additionalEarnestMoneyDue', label: 'Additional EM Due',             getDealVal: d => (d as any).additionalEarnestMoneyDue  || '' },
  { key: 'loanApplicationDue',        label: 'Loan Application Due',          getDealVal: d => (d as any).loanApplicationDue         || '' },
  { key: 'finalLoanApprovalDue',      label: 'Final Loan Approval Due',       getDealVal: d => (d as any).finalLoanApprovalDue       || '' },
  { key: 'buyerInspectionNoticeDue',  label: 'Buyer Inspection Notice Due',   getDealVal: d => (d as any).buyerInspectionNoticeDue   || '' },
  { key: 'renegotiationPeriod',       label: 'Renegotiation Period',          getDealVal: d => (d as any).renegotiationPeriod        || '' },
  { key: 'appraisalDueToSeller',      label: 'Appraisal Due to Seller',       getDealVal: d => (d as any).appraisalDueToSeller       || '' },
  { key: 'appraisalNegotiationPeriod',label: 'Appraisal Negotiation Period',  getDealVal: d => (d as any).appraisalNegotiationPeriod || '' },
  { key: 'titleCommitmentDeliveryDate',label: 'Title Commitment Delivery',    getDealVal: d => (d as any).titleCommitmentDeliveryDate || '' },
  { key: 'titleObjectionPeriod',      label: 'Title Objection Period',        getDealVal: d => (d as any).titleObjectionPeriod        || '' },
  { key: 'surveyDeadline',            label: 'Survey Deadline',               getDealVal: d => (d as any).surveyDeadline              || '' },
  { key: 'hoaDocumentDeliveryDeadline',label: 'HOA Document Delivery',        getDealVal: d => (d as any).hoaDocumentDeliveryDeadline || '' },
  { key: 'buyerHoaReviewDeadline',    label: 'Buyer HOA Review Deadline',     getDealVal: d => (d as any).buyerHoaReviewDeadline      || '' },

  // Loan / Financing
  { key: 'loanType',                  label: 'Loan Type',                     getDealVal: d => (d as any).loanType               || '' },

  // Parties / People
  { key: 'buyerNames',                label: 'Buyer Name(s)',                 getDealVal: d => (d as any).buyerName              || '' },
  { key: 'sellerNames',               label: 'Seller Name(s)',                getDealVal: d => (d as any).sellerName             || '' },
  { key: 'buyerAgentName',            label: 'Buyer Agent Name',              getDealVal: d => (d as any).buyerAgentName         || '' },
  { key: 'sellerAgentName',           label: 'Seller Agent Name',             getDealVal: d => (d as any).sellerAgentName        || '' },
  { key: 'titleCompany',              label: 'Title Company',                 getDealVal: d => (d as any).titleCompanyName        || '' },
  { key: 'loanOfficer',               label: 'Lender / Loan Officer',         getDealVal: d => (d as any).loanOfficerName         || '' },

  // Earnest Money Holder
  { key: 'earnestMoneyHolder',        label: 'Earnest Money Holder',          getDealVal: d => (d as any).earnestMoneyHolder      || '' },

  // Home Warranty
  { key: 'homeWarrantyPaidBy',        label: 'Home Warranty Paid By',         getDealVal: d => (d as any).homeWarrantyPaidBy      || '' },
  { key: 'homeWarrantyCompany',       label: 'Home Warranty Company',         getDealVal: d => (d as any).homeWarrantyCompany     || '' },

  // Legal
  { key: 'legalDescription',          label: 'Legal Description',             getDealVal: d => (d as any).legalDescription        || '' },

  // Booleans
  { key: 'asIsSale',                  label: 'As-Is Sale',                    getDealVal: d => (d as any).asIsSale         !== undefined ? String((d as any).asIsSale)         : '' },
  { key: 'inspectionWaived',          label: 'Inspection Waived',             getDealVal: d => (d as any).inspectionWaived !== undefined ? String((d as any).inspectionWaived) : '' },
  { key: 'homeWarranty',              label: 'Home Warranty Included',        getDealVal: d => (d as any).homeWarranty     !== undefined ? String((d as any).homeWarranty)     : '' },
];

// ─── Value Formatting ──────────────────────────────────────────────────────────

const MONEY_KEYS = [
  'contractPrice', 'purchasePrice', 'listPrice',
  'earnestMoney', 'additionalEarnestMoney',
  'loanAmount', 'downPaymentAmount',
  'sellerCredit', 'sellerPaidClosingCosts', 'additionalSellerCosts',
  'repairsNotToExceed', 'commissionReceived',
  'homeWarrantyAmount',
];

/** Format a raw extracted value for display */
export function fmtExtracted(key: string, val: string): string {
  if (MONEY_KEYS.includes(key) && val && !val.startsWith('$')) {
    const n = parseFloat(val.replace(/[$,]/g, ''));
    if (!isNaN(n)) return `$${n.toLocaleString()}`;
  }
  // Commission fields: keep % as-is, format plain numbers as $
  if ((key === 'buyerAgentCommission' || key === 'listingAgentCommission') && val) {
    if (val.includes('%')) return val;
    const n = parseFloat(val.replace(/[$,]/g, ''));
    if (!isNaN(n)) return `$${n.toLocaleString()}`;
  }
  return val;
}

/** Normalize values for equality comparison */
export function normalizeVal(key: string, val: string): string {
  if (!val) return '';
  if (MONEY_KEYS.includes(key)) {
    const n = parseFloat(val.replace(/[$,]/g, ''));
    return isNaN(n) ? val.toLowerCase().trim() : String(Math.round(n));
  }
  if (key === 'buyerAgentCommission' || key === 'listingAgentCommission') {
    if (val.includes('%')) return val.trim();
    const n = parseFloat(val.replace(/[$,]/g, ''));
    return isNaN(n) ? val.toLowerCase().trim() : String(Math.round(n));
  }
  return val.toLowerCase().trim();
}

// ─── Deal Updates Builder ──────────────────────────────────────────────────────

/** Build deal updates from checked extraction fields */
export function buildDealUpdates(checked: Record<string, boolean>, result: ExtractionResult): Partial<Deal> {
  const updates: any = {};
  const boolKeys = ['asIsSale', 'inspectionWaived', 'homeWarranty'];

  result.fields.forEach(f => {
    if (!checked[f.key]) return;
    const val = f.value;
    if (!val) return;

    if (boolKeys.includes(f.key)) {
      updates[f.key] = val === 'true' || val === 'yes' || val === '1';

    } else if (f.key === 'contractPrice') {
      // AI returns 'contractPrice'; maps to 'purchasePrice' in deal
      const n = parseFloat(val.replace(/[$,]/g, ''));
      updates['purchasePrice'] = isNaN(n) ? undefined : n;

    } else if (MONEY_KEYS.includes(f.key) && f.key !== 'contractPrice') {
      const n = parseFloat(val.replace(/[$,]/g, ''));
      if (f.key === 'downPaymentAmount') {
        updates['downPayment'] = isNaN(n) ? undefined : n;
      } else {
        updates[f.key] = isNaN(n) ? undefined : n;
      }

    } else if (f.key === 'buyerNames') {
      updates['buyerName'] = val;
    } else if (f.key === 'sellerNames') {
      updates['sellerName'] = val;
    } else if (f.key === 'buyerAgentName') {
      updates['buyerAgentName'] = val;
    } else if (f.key === 'sellerAgentName') {
      updates['sellerAgentName'] = val;
    } else if (f.key === 'titleCompany') {
      updates['titleCompanyName'] = val;
    } else if (f.key === 'loanOfficer') {
      updates['loanOfficerName'] = val;

    } else {
      // All other fields (dates, text, relative formulas) stored as-is
      updates[f.key] = val;
    }
  });

  return updates as Partial<Deal>;
}
