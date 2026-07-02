import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle2, AlertCircle, RefreshCw, Search, ChevronRight, ChevronDown, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { validateContract, buildViolationEmailBody, type ValidationViolation } from '../utils/contractValidation';

// --- Types ---
interface ContactSuggestion {
  id: string;
  full_name: string;
  contact_type: string;
}

type FieldType = 'text' | 'date' | 'money' | 'number' | 'select' | 'contact' | 'checkbox';

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  section: string;
  subSection?: string;
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
  mlsBoard?: string;
  orgId?: string;
  propertyAddress?: string;
}

// --- Field Definitions ---
// Sections: Property | Transaction | Financing | Key Dates | Inspection | Appraisal | Title & HOA | Home Warranty | Parties
const FIELD_DEFS: FieldDef[] = [

  // ═══════════════════════════════════════════════════════════════════════════
  // PARTIES & PROPERTY
  // ═══════════════════════════════════════════════════════════════════════════
  { key: 'buyerNames',     label: 'Buyer Name(s)',              type: 'text',   section: 'Parties & Property', subSection: 'Buyers',
    hint: 'Exactly as listed on contract — Trusts, LLCs, and multi-buyer names flagged for review' },
  { key: 'buyer_name_1',   label: 'Buyer 1 Full Name',          type: 'text',   section: 'Parties & Property', subSection: 'Buyers' },
  { key: 'buyer_name_2',   label: 'Buyer 2 Full Name',          type: 'text',   section: 'Parties & Property', subSection: 'Buyers' },
  { key: 'sellerNames',    label: 'Seller Name(s)',              type: 'text',   section: 'Parties & Property', subSection: 'Sellers',
    hint: 'Exactly as listed on contract — Trusts, LLCs, and multi-seller names flagged for review' },
  { key: 'seller_name_1',  label: 'Seller 1 Full Name',         type: 'text',   section: 'Parties & Property', subSection: 'Sellers' },
  { key: 'seller_name_2',  label: 'Seller 2 Full Name',         type: 'text',   section: 'Parties & Property', subSection: 'Sellers' },
  { key: 'address',        label: 'Street Address',             type: 'text',   section: 'Parties & Property', subSection: 'Property' },
  { key: 'city',           label: 'City',                       type: 'text',   section: 'Parties & Property', subSection: 'Property' },
  { key: 'state',          label: 'State',                      type: 'text',   section: 'Parties & Property', subSection: 'Property' },
  { key: 'zipCode',        label: 'ZIP Code',                   type: 'text',   section: 'Parties & Property', subSection: 'Property' },
  { key: 'county',         label: 'County',                     type: 'text',   section: 'Parties & Property', subSection: 'Property' },
  { key: 'propertyType',   label: 'Property Type',              type: 'select', section: 'Parties & Property', subSection: 'Property',
    options: ['Single Family', 'Condo', 'Townhouse', 'Multi-Family', 'Land', 'Commercial', 'Other'] },
  { key: 'mlsNumber',      label: 'MLS Number',                 type: 'text',   section: 'Parties & Property', subSection: 'Property' },
  { key: 'mlsBoard',       label: 'MLS Board',                  type: 'text',   section: 'Parties & Property', subSection: 'Property' },
  { key: 'legalDescription', label: 'Legal Description',        type: 'text',   section: 'Parties & Property', subSection: 'Property' },

  // ═══════════════════════════════════════════════════════════════════════════
  // PURCHASE PRICE & EARNEST MONEY
  // ═══════════════════════════════════════════════════════════════════════════
  { key: 'contractPrice',         label: 'Sale / Contract Price',      type: 'money',  section: 'Purchase Price & Earnest Money', subSection: 'Purchase Price' },
  { key: 'purchase_price',        label: 'Purchase Price',             type: 'money',  section: 'Purchase Price & Earnest Money', subSection: 'Purchase Price' },
  { key: 'sellerCredit',          label: 'Seller Credit / Concessions',type: 'money',  section: 'Purchase Price & Earnest Money', subSection: 'Purchase Price',
    hint: 'Price concessions — separate from closing cost contribution' },
  { key: 'sellerPaidClosingCosts',label: 'Seller Paid Closing Costs',  type: 'money',  section: 'Purchase Price & Earnest Money', subSection: 'Purchase Price',
    hint: 'Amount seller contributes toward buyer closing costs' },
  { key: 'downPaymentAmount',     label: 'Down Payment',               type: 'money',  section: 'Purchase Price & Earnest Money', subSection: 'Purchase Price' },
  { key: 'downPaymentPercent',    label: 'Down Payment %',             type: 'number', section: 'Purchase Price & Earnest Money', subSection: 'Purchase Price' },
  { key: 'repairsNotToExceed',    label: 'Repairs Not to Exceed',      type: 'money',  section: 'Purchase Price & Earnest Money', subSection: 'Purchase Price' },

  // Earnest Money
  { key: 'earnestMoney',          label: 'Earnest Money',              type: 'money',  section: 'Purchase Price & Earnest Money', subSection: 'Earnest Money' },
  { key: 'earnest_money_amount',  label: 'Earnest Money Amount',       type: 'money',  section: 'Purchase Price & Earnest Money', subSection: 'Earnest Money' },
  { key: 'earnestMoneyHolder',    label: 'Earnest Money Holder',       type: 'text',   section: 'Purchase Price & Earnest Money', subSection: 'Earnest Money' },
  { key: 'earnest_deposited_with',label: 'Earnest Deposited With',     type: 'text',   section: 'Purchase Price & Earnest Money', subSection: 'Earnest Money' },
  { key: 'earnestMoneyForm',      label: 'EM Payment Form (legacy)',   type: 'text',   section: 'Purchase Price & Earnest Money', subSection: 'Earnest Money',
    hint: 'How earnest money is delivered — check, electronic/ACH, wire, or other' },
  { key: 'em_payment_check',      label: 'EM Payment: Check',          type: 'checkbox', section: 'Purchase Price & Earnest Money', subSection: 'Earnest Money' },
  { key: 'em_payment_eft',        label: 'EM Payment: Electronic/ACH', type: 'checkbox', section: 'Purchase Price & Earnest Money', subSection: 'Earnest Money' },
  { key: 'em_payment_other',      label: 'EM Payment: Other',          type: 'checkbox', section: 'Purchase Price & Earnest Money', subSection: 'Earnest Money' },
  { key: 'earnestMoneyRefundable',label: 'EM Refundable (legacy)',     type: 'select', section: 'Purchase Price & Earnest Money', subSection: 'Earnest Money',
    options: ['Refundable', 'Non-refundable'],
    hint: 'Whether earnest money is refundable or non-refundable (L181)' },
  { key: 'earnest_refundable_check',    label: 'EM is Refundable',     type: 'checkbox', section: 'Purchase Price & Earnest Money', subSection: 'Earnest Money' },
  { key: 'earnest_nonrefundable_check', label: 'EM is Non-Refundable', type: 'checkbox', section: 'Purchase Price & Earnest Money', subSection: 'Earnest Money' },

  // Additional Earnest Money
  { key: 'additionalEarnestMoney',        label: 'Additional Earnest Money',      type: 'money',    section: 'Purchase Price & Earnest Money', subSection: 'Additional Earnest Money' },
  { key: 'additional_em_amount',          label: 'Additional EM Amount',          type: 'money',    section: 'Purchase Price & Earnest Money', subSection: 'Additional Earnest Money' },
  { key: 'additional_em_deposited_with',  label: 'Additional EM Deposited With',  type: 'text',     section: 'Purchase Price & Earnest Money', subSection: 'Additional Earnest Money' },
  { key: 'additional_em_payment_check',   label: 'Add. EM Payment: Check',        type: 'checkbox', section: 'Purchase Price & Earnest Money', subSection: 'Additional Earnest Money' },
  { key: 'additional_em_payment_eft',     label: 'Add. EM Payment: Electronic/ACH', type: 'checkbox', section: 'Purchase Price & Earnest Money', subSection: 'Additional Earnest Money' },
  { key: 'additional_em_payment_other',   label: 'Add. EM Payment: Other',        type: 'checkbox', section: 'Purchase Price & Earnest Money', subSection: 'Additional Earnest Money' },
  { key: 'additionalEarnestRefundable',   label: 'Additional EM Refundable (legacy)', type: 'select', section: 'Purchase Price & Earnest Money', subSection: 'Additional Earnest Money',
    options: ['Refundable', 'Non-refundable'],
    hint: 'Whether additional earnest money is refundable or non-refundable (L191)' },
  { key: 'additional_em_refundable_check',    label: 'Add. EM is Refundable',     type: 'checkbox', section: 'Purchase Price & Earnest Money', subSection: 'Additional Earnest Money' },
  { key: 'additional_em_nonrefundable_check', label: 'Add. EM is Non-Refundable', type: 'checkbox', section: 'Purchase Price & Earnest Money', subSection: 'Additional Earnest Money' },

  // ═══════════════════════════════════════════════════════════════════════════
  // HOME WARRANTY
  // ═══════════════════════════════════════════════════════════════════════════
  { key: 'warranty_waive_check',          label: 'Buyer Waives Warranty',        type: 'checkbox', section: 'Home Warranty' },
  { key: 'warranty_seller_check',         label: 'Warranty Paid By: Seller',     type: 'checkbox', section: 'Home Warranty' },
  { key: 'warranty_buyer_check',          label: 'Warranty Paid By: Buyer',      type: 'checkbox', section: 'Home Warranty' },
  { key: 'warrantyArranger',              label: 'Warranty Arranged By (legacy)', type: 'text',    section: 'Home Warranty',
    hint: '"Licensee assisting SELLER" or "Licensee assisting BUYER" (line 91)' },
  { key: 'warranty_arranger_seller_check',label: 'Warranty Arranger: Seller Licensee', type: 'checkbox', section: 'Home Warranty' },
  { key: 'warranty_arranger_buyer_check', label: 'Warranty Arranger: Buyer Licensee',  type: 'checkbox', section: 'Home Warranty' },
  { key: 'homeWarrantyPaidBy',   label: 'Home Warranty Paid By (legacy)', type: 'text',  section: 'Home Warranty',
    hint: 'e.g. BUYER, SELLER, BUYER waives, N/A' },
  { key: 'warranty_cost',        label: 'Warranty Cost',                 type: 'money', section: 'Home Warranty' },
  { key: 'homeWarrantyAmount',   label: 'Home Warranty Amount (legacy)', type: 'money', section: 'Home Warranty' },
  { key: 'warranty_vendor',      label: 'Warranty Company',              type: 'text',  section: 'Home Warranty' },
  { key: 'homeWarrantyCompany',  label: 'Home Warranty Company (legacy)',type: 'text',  section: 'Home Warranty' },

  // ═══════════════════════════════════════════════════════════════════════════
  // LICENSED BROKER DISCLOSURE
  // ═══════════════════════════════════════════════════════════════════════════
  { key: 'broker_seller_licensed_check', label: 'Seller Is a Licensed Broker', type: 'checkbox', section: 'Licensed Broker Disclosure', subSection: 'Seller' },
  { key: 'broker_seller_licensed_mo',    label: 'Seller Licensed: Missouri',   type: 'checkbox', section: 'Licensed Broker Disclosure', subSection: 'Seller' },
  { key: 'broker_seller_licensed_ks',    label: 'Seller Licensed: Kansas',     type: 'checkbox', section: 'Licensed Broker Disclosure', subSection: 'Seller' },
  { key: 'broker_buyer_licensed_check',  label: 'Buyer Is a Licensed Broker',  type: 'checkbox', section: 'Licensed Broker Disclosure', subSection: 'Buyer' },
  { key: 'broker_buyer_licensed_mo',     label: 'Buyer Licensed: Missouri',    type: 'checkbox', section: 'Licensed Broker Disclosure', subSection: 'Buyer' },
  { key: 'broker_buyer_licensed_ks',     label: 'Buyer Licensed: Kansas',      type: 'checkbox', section: 'Licensed Broker Disclosure', subSection: 'Buyer' },
  { key: 'broker_family_relationship_check', label: 'Family/Business Relationship Exists', type: 'checkbox', section: 'Licensed Broker Disclosure' },

  // ═══════════════════════════════════════════════════════════════════════════
  // FINANCING
  // ═══════════════════════════════════════════════════════════════════════════
  { key: 'transactionType',     label: 'Transaction Type', type: 'select', section: 'Financing',
    options: ['buyer', 'seller', 'both'] },
  { key: 'saleType',            label: 'Sale Type (legacy)',  type: 'select', section: 'Financing', options: ['Cash', 'Financed'],
    hint: '"true" if "THIS IS A CASH SALE" checkbox is checked (line 296)' },
  { key: 'financing_conventional_check', label: 'Conventional Loan', type: 'checkbox', section: 'Financing', subSection: 'Loan / Sale Type' },
  { key: 'financing_fha_check',          label: 'FHA Loan',          type: 'checkbox', section: 'Financing', subSection: 'Loan / Sale Type' },
  { key: 'financing_va_check',           label: 'VA Loan',           type: 'checkbox', section: 'Financing', subSection: 'Loan / Sale Type' },
  { key: 'financing_cash_check',         label: 'Cash Sale',         type: 'checkbox', section: 'Financing', subSection: 'Loan / Sale Type' },
  { key: 'financing_other_check',        label: 'Other Financing',   type: 'checkbox', section: 'Financing', subSection: 'Loan / Sale Type' },
  { key: 'financing_assumption_check',   label: 'Loan Assumption',   type: 'checkbox', section: 'Financing', subSection: 'Loan / Sale Type' },
  { key: 'seller_financing_check',       label: 'Seller Financing',  type: 'checkbox', section: 'Financing', subSection: 'Loan / Sale Type' },
  { key: 'loanType',            label: 'Loan Type (legacy)',  type: 'select', section: 'Financing', subSection: 'Loan Details',
    options: ['Conventional', 'FHA', 'VA', 'USDA', 'Cash', 'Other'],
    hint: 'Loan type from pre-approval or financing section (Conventional, FHA, VA, USDA, etc.)' },
  { key: 'loanAmount',          label: 'Loan Amount',         type: 'money',  section: 'Financing', subSection: 'Loan Details' },
  { key: 'loan_occupancy_owner_check',      label: 'Occupancy: Owner-Occupied', type: 'checkbox', section: 'Financing', subSection: 'Loan Details' },
  { key: 'loan_occupancy_investment_check', label: 'Occupancy: Investment',     type: 'checkbox', section: 'Financing', subSection: 'Loan Details' },
  { key: 'loanOccupancyType',   label: 'Occupancy Type (legacy)', type: 'select', section: 'Financing', subSection: 'Loan Details',
    options: ['owner-occupied', 'investment'] },
  { key: 'interest_rate_fixed_check',      label: 'Rate Type: Fixed',     type: 'checkbox', section: 'Financing', subSection: 'Loan Details' },
  { key: 'interest_rate_adjustable_check', label: 'Rate Type: Adjustable',type: 'checkbox', section: 'Financing', subSection: 'Loan Details' },
  { key: 'interestRateType',    label: 'Interest Rate Type (legacy)', type: 'select', section: 'Financing', subSection: 'Loan Details',
    options: ['Fixed Rate', 'Adjustable Rate', 'Interest Only', 'Other'] },
  { key: 'loan_interest_rate',  label: 'Interest Rate (max %)', type: 'text',  section: 'Financing', subSection: 'Loan Details' },
  { key: 'loan_years',          label: 'Loan Term (years)',      type: 'text',  section: 'Financing', subSection: 'Loan Details' },
  { key: 'amortizationPeriodYears', label: 'Amortization Period (yrs) (legacy)', type: 'text', section: 'Financing', subSection: 'Loan Details' },
  { key: 'buyer_preapproval_yes_check', label: 'Buyer IS Pre-Approved',     type: 'checkbox', section: 'Financing', subSection: 'Lender & Pre-Approval' },
  { key: 'buyer_preapproval_no_check',  label: 'Buyer IS NOT Pre-Approved', type: 'checkbox', section: 'Financing', subSection: 'Lender & Pre-Approval' },
  { key: 'lender_name',         label: 'Lender / Loan Officer',  type: 'text',    section: 'Financing', subSection: 'Lender & Pre-Approval' },
  { key: 'lender_company',      label: 'Lender Company',         type: 'text',    section: 'Financing', subSection: 'Lender & Pre-Approval' },
  { key: 'loanOfficer',         label: 'Loan Officer (legacy)',  type: 'contact', section: 'Financing', subSection: 'Lender & Pre-Approval',
    hint: 'Loan officer personal name from pre-approval section (lines ~348-365)' },
  { key: 'loanOfficerCompany',  label: 'Lender Company (legacy)',type: 'text',    section: 'Financing', subSection: 'Lender & Pre-Approval',
    hint: 'Lender company name from "BUYER IS PRE-APPROVED" checkbox section (lines ~348-365), e.g. "Mike Mena Creative Lending"' },
  { key: 'loanApplicationDue',  label: 'Loan Application Due',   type: 'text',    section: 'Financing', subSection: 'Lender & Pre-Approval',
    hint: 'Date or relative formula, e.g. "5 calendar days after Inspection Period Ends"' },
  { key: 'finalLoanApprovalDue',label: 'Final Loan Approval Due',type: 'text',    section: 'Financing', subSection: 'Lender & Pre-Approval',
    hint: 'Date or relative formula, e.g. "5 calendar days before Closing Date"' },

  // ═══════════════════════════════════════════════════════════════════════════
  // KEY DATES
  // ═══════════════════════════════════════════════════════════════════════════
  { key: 'contractDate',        label: 'Effective Date',         type: 'date',  section: 'Key Dates', subSection: 'Closing & Possession' },
  { key: 'contract_date',       label: 'Contract / Effective Date', type: 'date', section: 'Key Dates', subSection: 'Closing & Possession' },
  { key: 'closingDate',         label: 'Closing Date',           type: 'date',  section: 'Key Dates', subSection: 'Closing & Possession' },
  { key: 'closing_date',        label: 'Closing Date',           type: 'date',  section: 'Key Dates', subSection: 'Closing & Possession' },
  { key: 'closing_company',     label: 'Closing Company',        type: 'text',  section: 'Key Dates', subSection: 'Closing & Possession' },
  { key: 'possessionDate',      label: 'Possession Date',        type: 'date',  section: 'Key Dates', subSection: 'Closing & Possession' },
  { key: 'possession_date',     label: 'Possession Date',        type: 'date',  section: 'Key Dates', subSection: 'Closing & Possession' },
  { key: 'possession_at_closing_check', label: 'Possession AT Closing', type: 'checkbox', section: 'Key Dates', subSection: 'Closing & Possession' },
  { key: 'daily_rental_rate',   label: 'Daily Rental Rate',      type: 'money', section: 'Key Dates', subSection: 'Closing & Possession' },
  { key: 'earnestMoneyDueDate', label: 'Earnest Money Due',       type: 'text',  section: 'Key Dates', subSection: 'Earnest Money Deadlines',
    hint: 'Date or relative formula, e.g. "3 calendar days after Effective Date"' },
  { key: 'additionalEarnestMoneyDue', label: 'Additional EM Due', type: 'text', section: 'Key Dates', subSection: 'Earnest Money Deadlines',
    hint: 'Date or relative formula' },
  { key: 'inspectionDate',           label: 'Inspection Period Ends',      type: 'text', section: 'Key Dates', subSection: 'Inspection Deadlines',
    hint: 'Date or relative formula, e.g. "11 calendar days after Effective Date"' },
  { key: 'buyerInspectionNoticeDue', label: 'Buyer Inspection Notice Due', type: 'text', section: 'Key Dates', subSection: 'Inspection Deadlines',
    hint: 'Date or relative formula, e.g. "0 calendar days after Inspection Period Ends"' },
  { key: 'renegotiationPeriod',      label: 'Renegotiation Period',        type: 'text', section: 'Key Dates', subSection: 'Inspection Deadlines',
    hint: 'e.g. "5 calendar days after Buyer Inspection Notice Due"' },
  { key: 'financeDeadline',          label: 'Finance / Contingency Deadline', type: 'date', section: 'Key Dates', subSection: 'Loan Deadlines' },
  { key: 'appraisalDeliveryDate',     label: 'Appraisal Report Delivery',      type: 'text', section: 'Key Dates', subSection: 'Appraisal Deadlines',
    hint: 'Date or relative formula' },
  { key: 'appraisalDueToSeller',      label: 'Appraisal Report Due to Seller', type: 'text', section: 'Key Dates', subSection: 'Appraisal Deadlines',
    hint: 'e.g. "5 calendar days after Appraisal Report Delivery Date"' },
  { key: 'appraisalNegotiationPeriod',label: 'Appraisal Negotiation Period',   type: 'text', section: 'Key Dates', subSection: 'Appraisal Deadlines',
    hint: 'e.g. "5 calendar days after Appraisal Report Due to Seller"' },
  { key: 'surveyDeadline',             label: 'Survey Deadline',              type: 'text', section: 'Key Dates', subSection: 'Title & HOA Deadlines',
    hint: 'Date or relative formula, e.g. "10 calendar days before Closing Date"' },
  { key: 'titleCommitmentDeliveryDate',label: 'Title Commitment Delivery',    type: 'text', section: 'Key Dates', subSection: 'Title & HOA Deadlines',
    hint: 'Date or relative formula' },
  { key: 'titleObjectionPeriod',       label: 'Title Objection Period',       type: 'text', section: 'Key Dates', subSection: 'Title & HOA Deadlines',
    hint: 'e.g. "5 calendar days after Title Commitment Delivery Date"' },
  { key: 'hoaDocumentDeliveryDeadline',label: 'HOA Document Delivery',        type: 'text', section: 'Key Dates', subSection: 'Title & HOA Deadlines',
    hint: 'Date or relative formula' },
  { key: 'buyerHoaReviewDeadline',     label: 'Buyer HOA Review Deadline',    type: 'text', section: 'Key Dates', subSection: 'Title & HOA Deadlines',
    hint: 'e.g. "5 calendar days after HOA Document Delivery Deadline"' },
  { key: 'listingExpirationDate',      label: 'Listing Expiration',           type: 'date', section: 'Key Dates' },

  // ═══════════════════════════════════════════════════════════════════════════
  // INSPECTION & SURVEY
  // ═══════════════════════════════════════════════════════════════════════════
  { key: 'inspection_days',     label: 'Inspection Period (days)', type: 'number',   section: 'Inspection & Survey', subSection: 'Inspection' },
  { key: 'inspection_waived_check', label: 'Inspection Waived',   type: 'checkbox', section: 'Inspection & Survey', subSection: 'Inspection' },
  { key: 'repair_limit',        label: 'Repair Limit ($)',         type: 'money',    section: 'Inspection & Survey', subSection: 'Inspection' },
  { key: 'survey_days',         label: 'Survey Period (days)',     type: 'number',   section: 'Inspection & Survey', subSection: 'Survey' },

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTINGENCIES
  // ═══════════════════════════════════════════════════════════════════════════
  { key: 'saleContingency',         label: 'Sale Contingency (legacy)', type: 'select', section: 'Contingencies',
    options: ['IS Contingent', 'NOT Contingent'],
    hint: '"true" if contract IS contingent on sale/closing of Buyer property (line 290)' },
  { key: 'sale_contingent_check',     label: 'Contract IS Contingent',     type: 'checkbox', section: 'Contingencies' },
  { key: 'sale_not_contingent_check', label: 'Contract is NOT Contingent', type: 'checkbox', section: 'Contingencies' },

  // ═══════════════════════════════════════════════════════════════════════════
  // BROKERAGE RELATIONSHIPS
  // ═══════════════════════════════════════════════════════════════════════════
  { key: 'seller_licensee_seller_agent_check',        label: "Seller Licensee: Seller's Agent",    type: 'checkbox', section: 'Brokerage Relationships', subSection: "Seller's Licensee" },
  { key: 'seller_licensee_transaction_broker_check',  label: 'Seller Licensee: Transaction Broker', type: 'checkbox', section: 'Brokerage Relationships', subSection: "Seller's Licensee" },
  { key: 'listing_broker_name',   label: 'Listing Broker Name',    type: 'text',    section: 'Brokerage Relationships', subSection: "Seller's Licensee" },
  { key: 'buyer_licensee_buyer_agent_check',          label: "Buyer Licensee: Buyer's Agent",      type: 'checkbox', section: 'Brokerage Relationships', subSection: "Buyer's Licensee" },
  { key: 'buyer_licensee_transaction_broker_check',   label: 'Buyer Licensee: Transaction Broker',  type: 'checkbox', section: 'Brokerage Relationships', subSection: "Buyer's Licensee" },
  { key: 'selling_broker_name',   label: 'Selling Broker Name',    type: 'text',    section: 'Brokerage Relationships', subSection: "Buyer's Licensee" },
  { key: 'commissionReceived',    label: 'Commission Received',     type: 'money',   section: 'Brokerage Relationships', subSection: 'Compensation' },
  { key: 'listing_agent_commission', label: 'Listing Agent Commission', type: 'text', section: 'Brokerage Relationships', subSection: 'Compensation' },
  { key: 'buyer_agent_commission',   label: 'Buyer Agent Commission',   type: 'text', section: 'Brokerage Relationships', subSection: 'Compensation' },
  { key: 'buyerAgentCommission',  label: 'Buyer Agent Commission (legacy)',  type: 'text', section: 'Brokerage Relationships', subSection: 'Compensation' },
  { key: 'listingAgentCommission',label: 'Listing Agent Commission (legacy)',type: 'text', section: 'Brokerage Relationships', subSection: 'Compensation' },
  { key: 'buyerAgentName',        label: "Buyer's Agent",          type: 'contact', section: 'Brokerage Relationships', subSection: "Buyer's Licensee" },
  { key: 'sellerAgentName',       label: "Seller's Agent",         type: 'contact', section: 'Brokerage Relationships', subSection: "Seller's Licensee" },
  { key: 'titleCompany',          label: 'Title Company',           type: 'contact', section: 'Brokerage Relationships' },

  // ═══════════════════════════════════════════════════════════════════════════
  // ADDENDA
  // ═══════════════════════════════════════════════════════════════════════════
  { key: 'addendum_sellers_disc_check', label: 'Addendum: Seller Disclosure',    type: 'checkbox', section: 'Addenda' },
  { key: 'addendum_lead_check',         label: 'Addendum: Lead-Based Paint',     type: 'checkbox', section: 'Addenda' },
  { key: 'addendum_contingency_check',  label: 'Addendum: Sale Contingency',     type: 'checkbox', section: 'Addenda' },
  { key: 'addendum_other_1',            label: 'Other Addendum',                 type: 'text',     section: 'Addenda' },

];

const SECTIONS = [
  'Parties & Property',
  'Purchase Price & Earnest Money',
  'Home Warranty',
  'Licensed Broker Disclosure',
  'Financing',
  'Key Dates',
  'Inspection & Survey',
  'Contingencies',
  'Brokerage Relationships',
  'Addenda',
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


// Format a raw numeric string as a comma-separated money value (e.g. "32000" -> "32,000.00")
function formatMoney(raw: string): string {
  if (!raw && raw !== '0') return '';
  const num = parseFloat(raw.replace(/,/g, ''));
  if (isNaN(num)) return raw;
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Strip formatting to get raw numeric string for storage
function stripMoney(formatted: string): string {
  return formatted.replace(/,/g, '');
}

const StepExtractedData: React.FC<StepExtractedDataProps> = ({
  dealId,
  extractedData,
  contractDetection,
  onConfirm,
  onEdit,
  onReExtract,
  onJumpToPage,
  mlsBoard,
  orgId,
  propertyAddress,
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

  // ── Fetch field_coordinates page map for this MLS board ─────────────────
  // Used to assign unextracted fields to their correct page (not "Other Fields")
  const [coordPageMap, setCoordPageMap] = React.useState<Record<string, number>>({});
  React.useEffect(() => {
    if (!mlsBoard) return;
    supabase
      .from('field_coordinates')
      .select('field_key, page_num')
      .eq('mls_board', mlsBoard)
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, number> = {};
        for (const row of data as Array<{ field_key: string; page_num: number }>) {
          if (row.field_key && row.page_num) map[row.field_key] = row.page_num;
        }
        setCoordPageMap(map);
      });
  }, [mlsBoard]);

  // Group fields by page number from fieldSources + coordPageMap fallback (or by section as last resort)
  const pageGroups = React.useMemo(() => {
    try {
      const hasSources = (fieldSources && Object.values(fieldSources).some((s: any) => s?.page))
        || Object.keys(coordPageMap).length > 0;
      if (hasSources) {
        const groups: Record<string, { label: string; fields: FieldDef[] }> = {};
        FIELD_DEFS.forEach(field => {
          const src = (fieldSources as any)[field.key];
          const fallbackPage = coordPageMap[field.key];
          const resolvedPage = src?.page || fallbackPage || 0;
          const pageKey = resolvedPage ? String(resolvedPage) : '0';
          const label = resolvedPage ? `Page ${resolvedPage}` : 'Other Fields';
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
  }, [fieldSources, coordPageMap]);

  const setValue = (key: string, val: string) =>
    setValues(prev => ({ ...prev, [key]: val }));

  const [cdOverride, setCdOverride] = React.useState(false);
  const [cdStart, setCdStart] = React.useState('');
  const [cdEnd, setCdEnd] = React.useState('');
  const [cdConfirming, setCdConfirming] = React.useState(false);
  const [showBlankFormModal, setShowBlankFormModal] = React.useState(false);
  const [blankFormRequestSent, setBlankFormRequestSent] = React.useState(false);
  const [blankFormRequesting, setBlankFormRequesting] = React.useState(false);

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

  // ── Contract validation state ─────────────────────────────────────────────
  const [pendingViolations, setPendingViolations] = React.useState<ValidationViolation[]>([]);
  const [pendingVerifiedData, setPendingVerifiedData] = React.useState<Record<string, unknown> | null>(null);
  const [showValidationModal, setShowValidationModal] = React.useState(false);
  const [creatingTasks, setCreatingTasks] = React.useState(false);

  const toggleSection = (section: string) =>
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));

  const buildVerifiedData = (): Record<string, unknown> => {
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
    return verified;
  };

  const saveCorrections = (verified: Record<string, unknown>) => {
    if (!dealId) return;
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
  };

  const handleConfirm = () => {
    const verified = buildVerifiedData();
    saveCorrections(verified);

    // Run contract validation
    const stringValues: Record<string, string> = {};
    FIELD_DEFS.forEach(({ key }) => { stringValues[key] = values[key] ?? ''; });
    const violations = validateContract(stringValues);

    if (violations.length > 0) {
      setPendingViolations(violations);
      setPendingVerifiedData(verified);
      setShowValidationModal(true);
      return;
    }

    onConfirm(verified);
  };

  const handleContinueWithTasks = async () => {
    if (!pendingVerifiedData) return;
    setCreatingTasks(true);
    try {
      // Create deal tasks for each violation if dealId is available
      if (dealId && pendingViolations.length > 0) {
        await supabase.from('tasks').insert(
          pendingViolations.map(v => ({
            deal_id: dealId,
            org_id: orgId ?? null,
            title: `⚠️ ${v.label} — ${v.message}`,
            category: 'contract_review',
            priority: 'high',
            status: 'pending',
            due_date: new Date().toISOString().slice(0, 10),
          }))
        );
      }
      // Store email draft in sessionStorage for email composer to pick up
      const address = propertyAddress || (pendingVerifiedData.address as string) || 'the property';
      sessionStorage.setItem('contractEmailDraft', JSON.stringify({
        subject: `Action Required — Contract Items Need Attention: ${address}`,
        body: buildViolationEmailBody(address, pendingViolations),
      }));
    } catch (err) {
      console.error('Failed to create validation tasks:', err);
    } finally {
      setCreatingTasks(false);
      setShowValidationModal(false);
      onConfirm(pendingVerifiedData);
      setPendingViolations([]);
      setPendingVerifiedData(null);
    }
  };

  const handleContinueWithoutTasks = () => {
    if (!pendingVerifiedData) return;
    setShowValidationModal(false);
    onConfirm(pendingVerifiedData);
    setPendingViolations([]);
    setPendingVerifiedData(null);
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
    <>
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
                <span><strong>Vision only</strong> — no blank template found for this form. Extraction accuracy is reduced.</span>
                <button
                  onClick={() => setShowBlankFormModal(true)}
                  className="ml-auto shrink-0 px-2 py-0.5 rounded bg-amber-100 hover:bg-amber-200 border border-amber-400 text-amber-800 font-semibold text-xs"
                >
                  Request Blank Form
                </button>
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

          // Always show all sections — missing fields stay in their section, not hidden

          // Classify fields into tiers
          const tier1Fields = allFields.filter(f => getFieldTier(f, extractedData) === 1);
          const tier2Fields = allFields.filter(f => getFieldTier(f, extractedData) === 2);
          const tier3Fields = allFields.filter(f => getFieldTier(f, extractedData) === 3);

          const tier1Count = tier1Fields.length;
          const tier2Count = tier2Fields.length;

          // Ordered fields: tier1 first, then tier2, then tier3
          const orderedFields = [...tier1Fields, ...tier2Fields, ...tier3Fields];

          const isOpen = openSections[group.key] ?? true;

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
                  {orderedFields.map((field, _fieldIdx) => {
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

                    // Sub-section header when subSection changes
                    const prevField = _fieldIdx > 0 ? orderedFields[_fieldIdx - 1] : null;
                    const showSubHeader = !!(field.subSection && field.subSection !== prevField?.subSection);

                    return (
                      <React.Fragment key={field.key}>
                      {showSubHeader && (
                        <div className="px-3 pt-2 pb-1 bg-base-200/30 border-b border-base-200">
                          <p className="text-[10px] font-semibold text-base-content/30 uppercase tracking-wider">{field.subSection}</p>
                        </div>
                      )}
                      <div
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
                              {(currentVal || currentVal === '0') && (
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-base-content/40 pointer-events-none">$</span>
                              )}
                              <input
                                type="text"
                                inputMode="decimal"
                                value={formatMoney(currentVal)}
                                onChange={e => setValue(field.key, stripMoney(e.target.value))}
                                onFocus={e => { e.target.value = stripMoney(e.target.value); }}
                                onBlur={e => { setValue(field.key, stripMoney(e.target.value)); }}
                                className={`input input-sm input-bordered w-full text-sm ${currentVal ? 'pl-6' : ''}`}
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

                          {field.type === 'checkbox' && (
                            <div className="flex items-center gap-3 py-1">
                              <button
                                type="button"
                                onClick={() => setValue(field.key, currentVal === 'true' ? 'false' : 'true')}
                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                                  currentVal === 'true' ? 'bg-primary' : 'bg-base-300'
                                }`}
                              >
                                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                                  currentVal === 'true' ? 'translate-x-4.5' : 'translate-x-0.5'
                                }`} />
                              </button>
                              <span className={`text-xs font-medium ${currentVal === 'true' ? 'text-primary' : 'text-base-content/40'}`}>
                                {currentVal === 'true' ? 'Checked ✓' : currentVal === 'false' ? 'Not checked' : 'Not found'}
                              </span>
                            </div>
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
                      </React.Fragment>
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

      {/* Blank Form Request Modal */}
      {showBlankFormModal && (() => {
        const formSlug = contractDetection?.formName && contractDetection.formName !== 'Unknown'
          ? contractDetection.formName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
          : null;
        const boardLabel = contractDetection?.mlsBoard ?? 'this MLS board';
        const stateLabel = contractDetection?.state ?? '';

        const handleRequestFromAgent = async () => {
          setBlankFormRequesting(true);
          try {
            await supabase.from('blank_form_requests').insert({
              deal_id: dealId ?? null,
              form_slug: formSlug,
              mls_board: contractDetection?.mlsBoard ?? null,
              state: contractDetection?.state ?? null,
              status: 'pending',
            });
            setBlankFormRequestSent(true);
          } catch (err) {
            console.error('Failed to log blank form request', err);
          } finally {
            setBlankFormRequesting(false);
          }
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-base-content">Request a Blank Form</h3>
                  <p className="text-xs text-base-content/60 mt-0.5">
                    {boardLabel}{stateLabel ? ` · ${stateLabel}` : ''}
                    {formSlug ? ` · ${formSlug}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => { setShowBlankFormModal(false); setBlankFormRequestSent(false); }}
                  className="btn btn-ghost btn-xs"
                >✕</button>
              </div>

              <p className="text-sm text-base-content/70">
                To reach <strong>95%+ extraction accuracy</strong> for future deals on this form, we need a <strong>blank copy</strong> of the contract — with no names, prices, or deal data filled in.
              </p>

              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                ⚠️ Never use a filled-in deal contract as a template. Always request the blank version from the agent or broker.
              </div>

              {blankFormRequestSent ? (
                <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-3 text-sm text-green-800 font-medium text-center">
                  ✅ Request logged — follow up with the agent for the blank form.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <button
                    onClick={handleRequestFromAgent}
                    disabled={blankFormRequesting}
                    className="btn btn-warning btn-sm gap-2 justify-start"
                  >
                    📧 {blankFormRequesting ? 'Logging…' : "Log request — I'll follow up with agent"}
                  </button>
                  <a
                    href={`https://tc-redeal-forms.vercel.app/admin${formSlug ? `/forms/${formSlug}/mapper` : ''}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline btn-sm gap-2 justify-start"
                    onClick={() => setShowBlankFormModal(false)}
                  >
                    🗺️ I have it — Open Field Mapper
                  </a>
                </div>
              )}

              <p className="text-xs text-base-content/40 text-center">
                One mapping session (≈30 min) unlocks 95%+ accuracy for every future deal on this form.
              </p>
            </div>
          </div>
        );
      })()}
    </div>

      {/* ── Contract Validation Modal ─────────────────────────────────────── */}
      {showValidationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="bg-amber-100 rounded-full p-2">
                <AlertCircle size={22} className="text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold text-base-content text-base">Contract Issues Found</h3>
                <p className="text-xs text-base-content/50">Review before submitting — you can still continue</p>
              </div>
            </div>

            {/* Violations list */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {pendingViolations.filter(v => v.severity === 'error').map(v => (
                <div key={v.fieldKey} className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <span className="text-red-500 mt-0.5 flex-none">🔴</span>
                  <div>
                    <p className="text-sm font-semibold text-red-800">{v.label}</p>
                    <p className="text-xs text-red-600">{v.message}</p>
                  </div>
                </div>
              ))}
              {pendingViolations.filter(v => v.severity === 'warning').map(v => (
                <div key={v.fieldKey} className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <span className="text-amber-500 mt-0.5 flex-none">🟡</span>
                  <div>
                    <p className="text-sm font-semibold text-amber-800">{v.label}</p>
                    <p className="text-xs text-amber-600">{v.message}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Task info */}
            {dealId && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
                <strong>Auto-create tasks</strong> — clicking "Create Tasks & Continue" will create {pendingViolations.length} deal task{pendingViolations.length !== 1 ? 's' : ''} and prepare an email draft to your client's agent.
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2 pt-1">
              {dealId ? (
                <button
                  onClick={handleContinueWithTasks}
                  disabled={creatingTasks}
                  className="btn btn-warning btn-sm gap-2 w-full"
                >
                  {creatingTasks ? (
                    <><span className="loading loading-spinner loading-xs" /> Creating tasks…</>
                  ) : (
                    <><CheckCircle2 size={14} /> Create {pendingViolations.length} Task{pendingViolations.length !== 1 ? 's' : ''} + Draft Email & Continue</>
                  )}
                </button>
              ) : null}
              <button
                onClick={handleContinueWithoutTasks}
                disabled={creatingTasks}
                className="btn btn-ghost btn-sm gap-2 w-full text-base-content/60"
              >
                Continue Without Creating Tasks
              </button>
              <button
                onClick={() => setShowValidationModal(false)}
                disabled={creatingTasks}
                className="btn btn-outline btn-sm gap-2 w-full"
              >
                ← Go Back & Fix Issues
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default StepExtractedData;
