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
// Maps extraction field keys → deal field paths for comparison

export const FIELD_DEAL_MAP: { key: string; label: string; getDealVal: (d: Deal) => string }[] = [
  { key: 'contractPrice',          label: 'Purchase Price',        getDealVal: d => (d as any).purchasePrice    ? `$${Number((d as any).purchasePrice).toLocaleString()}`    : '' },
  { key: 'purchasePrice',         label: 'Purchase Price (alt)',  getDealVal: d => (d as any).purchasePrice    ? `$${Number((d as any).purchasePrice).toLocaleString()}`    : '' },
  { key: 'listPrice',             label: 'List Price',            getDealVal: d => d.listPrice        ? `$${Number(d.listPrice).toLocaleString()}`        : '' },
  { key: 'contractDate',          label: 'Contract Date',         getDealVal: d => d.contractDate     || '' },
  { key: 'closingDate',           label: 'Closing Date',          getDealVal: d => d.closingDate      || '' },
  { key: 'earnestMoney',          label: 'Earnest Money',         getDealVal: d => (d as any).earnestMoney ? `$${Number((d as any).earnestMoney).toLocaleString()}` : '' },
  { key: 'earnestMoneyDueDate',   label: 'EM Due Date',           getDealVal: d => (d as any).earnestMoneyDueDate || '' },
  { key: 'loanType',              label: 'Loan Type',             getDealVal: d => (d as any).loanType || '' },
  { key: 'loanAmount',            label: 'Loan Amount',           getDealVal: d => (d as any).loanAmount ? `$${Number((d as any).loanAmount).toLocaleString()}` : '' },
  { key: 'downPaymentAmount',     label: 'Down Payment',          getDealVal: d => (d as any).downPayment ? `$${Number((d as any).downPayment).toLocaleString()}` : '' },
  { key: 'inspectionDate',        label: 'Inspection Date',       getDealVal: d => (d as any).inspectionDate || '' },
  { key: 'financeDeadline',       label: 'Finance Deadline',      getDealVal: d => (d as any).financeDeadline || '' },
  { key: 'possessionDate',        label: 'Possession Date',       getDealVal: d => (d as any).possessionDate || '' },
  { key: 'buyerNames',            label: 'Buyer Name(s)',         getDealVal: d => (d as any).buyerName || '' },
  { key: 'sellerNames',           label: 'Seller Name(s)',        getDealVal: d => (d as any).sellerName || '' },
  { key: 'titleCompany',          label: 'Title Company',         getDealVal: d => (d as any).titleCompanyName || '' },
  { key: 'loanOfficer',           label: 'Lender / Loan Officer', getDealVal: d => (d as any).loanOfficerName || '' },
  { key: 'asIsSale',              label: 'As-Is Sale',            getDealVal: d => (d as any).asIsSale !== undefined ? String((d as any).asIsSale) : '' },
  { key: 'inspectionWaived',      label: 'Inspection Waived',     getDealVal: d => (d as any).inspectionWaived !== undefined ? String((d as any).inspectionWaived) : '' },
  { key: 'homeWarranty',          label: 'Home Warranty',         getDealVal: d => (d as any).homeWarranty !== undefined ? String((d as any).homeWarranty) : '' },
  { key: 'commissionAmount',      label: 'Commission Amount',     getDealVal: d => (d as any).commissionAmount ? `$${Number((d as any).commissionAmount).toLocaleString()}` : '' },
  { key: 'buyerAgentCommission',  label: 'Buyer Agent Commission',  getDealVal: d => (d as any).buyerAgentCommission  || '' },
  { key: 'listingAgentCommission',label: 'Listing Agent Commission', getDealVal: d => (d as any).listingAgentCommission || '' },
  { key: 'downPaymentPercent',    label: 'Down Payment %',          getDealVal: d => (d as any).downPaymentPercent || '' },
  { key: 'sellerCredit',          label: 'Seller Credit',           getDealVal: d => (d as any).sellerCredit ? `$${Number((d as any).sellerCredit).toLocaleString()}` : '' },
  { key: 'additionalSellerCosts', label: "Add'l Seller Costs",      getDealVal: d => (d as any).additionalSellerCosts ? `$${Number((d as any).additionalSellerCosts).toLocaleString()}` : '' },
];

// ─── Value Formatting ──────────────────────────────────────────────────────────

/** Format a raw extracted value for display */
export function fmtExtracted(key: string, val: string): string {
  const moneyKeys = ['contractPrice', 'purchasePrice', 'listPrice', 'earnestMoney', 'loanAmount', 'downPaymentAmount', 'commissionAmount', 'sellerCredit', 'additionalSellerCosts'];
  if (moneyKeys.includes(key) && val && !val.startsWith('$')) {
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
  const moneyKeys = ['contractPrice', 'purchasePrice', 'listPrice', 'earnestMoney', 'loanAmount', 'downPaymentAmount', 'commissionAmount', 'sellerCredit', 'additionalSellerCosts'];
  if (moneyKeys.includes(key)) {
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
  const moneyKeys = ['purchasePrice', 'listPrice', 'earnestMoney', 'loanAmount', 'commissionAmount', 'sellerCredit'];
  result.fields.forEach(f => {
    if (!checked[f.key]) return;
    const val = f.value;
    if (!val) return;
    if (boolKeys.includes(f.key)) {
      updates[f.key] = val === 'true' || val === 'yes' || val === '1';
    } else if (f.key === 'contractPrice') {
      // AI extraction returns 'contractPrice'; map it to 'purchasePrice' used by the form/panel
      const n = parseFloat(val.replace(/[$,]/g, ''));
      updates['purchasePrice'] = isNaN(n) ? undefined : n;
    } else if (moneyKeys.includes(f.key)) {
      const n = parseFloat(val.replace(/[$,]/g, ''));
      updates[f.key] = isNaN(n) ? undefined : n;
    } else if (f.key === 'downPaymentAmount') {
      const n = parseFloat(val.replace(/[$,]/g, ''));
      updates['downPayment'] = isNaN(n) ? undefined : n;
    } else if (f.key === 'buyerNames') {
      updates['buyerName'] = val;
    } else if (f.key === 'sellerNames') {
      updates['sellerName'] = val;
    } else if (f.key === 'titleCompany') {
      updates['titleCompanyName'] = val;
    } else if (f.key === 'loanOfficer') {
      updates['loanOfficerName'] = val;
    } else if (f.key === 'buyerAgentCommission') {
      updates['buyerAgentCommission'] = val;
    } else if (f.key === 'listingAgentCommission') {
      updates['listingAgentCommission'] = val;
    } else if (f.key === 'downPaymentPercent') {
      updates['downPaymentPercent'] = val;
    } else if (f.key === 'sellerCredit') {
      const n = parseFloat(val.replace(/[$,]/g, ''));
      updates['sellerCredit'] = isNaN(n) ? undefined : n;
    } else if (f.key === 'additionalSellerCosts') {
      const n = parseFloat(val.replace(/[$,]/g, ''));
      updates['additionalSellerCosts'] = isNaN(n) ? undefined : n;
    } else {
      updates[f.key] = val;
    }
  });
  return updates as Partial<Deal>;
}
