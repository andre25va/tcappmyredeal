import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { initPageTracking, PAGE_IDS, logErrorWithPage } from '../utils/pageTracking';
import { PageIdBadge } from './PageIdBadge';
import {
  X, Building2, AlertTriangle, ShoppingCart, Tag, Home, Building, Landmark, TreePine, Store, MapPin,
  ChevronRight, ChevronLeft, Sparkles, CheckCircle2, Info, Loader2, User, Mail, Phone, AlertCircle, FileText, Upload, Plus, Send, Building2 as BuildingIcon,
} from 'lucide-react';
import { Deal, PropertyType, DealStatus, TransactionType, DocumentRequest, ActivityEntry, ComplianceTemplate, ContactRecord, DDMasterItem, ChecklistItem, ContactMlsMembership } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { generateId, propertyTypeLabel, docTypeConfig, calcCommissionAmount, calcCommissionPct, calculateDownPayment } from '../utils/helpers';
import { MLS_BY_STATE } from '../utils/mlsData';
import { saveDealParticipant, saveSingleDeal } from '../utils/supabaseDb';
import { buildMissingTitleCompanyTasks } from '../utils/taskTemplates';
import ContractReferencePanel from './ContractReferencePanel';
import StepExtractedData from './StepExtractedData';
import StepDealContacts, { WizardParticipant } from './StepDealContacts';
import ContactModal, { SavedContact } from './ContactModal';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { Button } from './ui/Button';

interface Props {
  onAdd: (deal: Deal) => void;
  onClose: () => void;
  complianceTemplates?: ComplianceTemplate[];
  agentClients?: ContactRecord[];    // contacts with isClient === true
  ddMasterItems?: DDMasterItem[];
}


const PROP_TYPES: { type: PropertyType; label: string; icon: React.ReactNode }[] = [
  { type: 'single-family', label: 'Single Family', icon: <Home size={22} /> },
  { type: 'multi-family', label: 'Multi-Family', icon: <Building size={22} /> },
  { type: 'duplex', label: 'Duplex', icon: <Building2 size={22} /> },
  { type: 'condo', label: 'Condo', icon: <Landmark size={22} /> },
  { type: 'townhouse', label: 'Townhouse', icon: <Building size={22} /> },
  { type: 'land', label: 'Land', icon: <TreePine size={22} /> },
  { type: 'commercial', label: 'Commercial', icon: <Store size={22} /> },
];

const fallbackDD = (): ChecklistItem[] => [
  { id: generateId(), title: 'Review executed purchase agreement', completed: false },
  { id: generateId(), title: 'Order title search', completed: false },
  { id: generateId(), title: 'Confirm earnest money deposit received', completed: false },
  { id: generateId(), title: 'Schedule home inspection', completed: false },
  { id: generateId(), title: 'Request seller disclosures', completed: false },
  { id: generateId(), title: 'Verify lender pre-approval letter', completed: false },
  { id: generateId(), title: 'Confirm home warranty ordered and coverage details', completed: false },
];
const defaultComp = (): ChecklistItem[] => [
  { id: generateId(), title: 'MLS data verified and entered', completed: false },
  { id: generateId(), title: 'Signed agency disclosure on file', completed: false },
  { id: generateId(), title: 'Buyer representation agreement on file', completed: false },
  { id: generateId(), title: 'All offer documents uploaded to broker platform', completed: false },
  { id: generateId(), title: 'Home warranty confirmation on file (if applicable)', completed: false },
];

interface Suggestion {
  field: string;
  issue: string;
  suggestion: string;
  severity: 'info' | 'warning' | 'error';
}

interface AIReview {
  suggestions: Suggestion[];
  summary: string;
  readyToCreate: boolean;
}

const TOTAL_STEPS = 10;

const formatDisplayDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
};

const calcDate = (baseDateStr: string, days: number): string => {
  if (!baseDateStr) return '';
  const d = new Date(baseDateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

// ─── Verification Card ─────────────────────────────────────────────────────────────────────────────
interface VerifyCardProps {
  contact: ContactRecord;
  label: string;
  extraNote?: React.ReactNode;
}
const VerifyCard: React.FC<VerifyCardProps> = ({ contact, label, extraNote }) => (
  <div className="mt-3 p-3 rounded-xl border-2 border-primary/30 bg-primary/5 space-y-2">
    <div className="flex items-center gap-2 mb-1">
      <CheckCircle2 size={14} className="text-primary" />
      <span className="text-xs font-semibold text-primary uppercase tracking-wide">{label}</span>
    </div>
    <div className="flex items-center gap-2 text-sm text-base-content">
      <User size={13} className="text-base-content/40 flex-none" />
      <span className="font-semibold">{contact.fullName}</span>
    </div>
    {contact.company && (
      <div className="flex items-center gap-2 text-sm text-base-content/70">
        <Building2 size={13} className="text-base-content/40 flex-none" />
        <span>{contact.company}</span>
      </div>
    )}
    {contact.email && (
      <div className="flex items-center gap-2 text-sm text-base-content/70">
        <Mail size={13} className="text-base-content/40 flex-none" />
        <span>{contact.email}</span>
      </div>
    )}
    {contact.phone && (
      <div className="flex items-center gap-2 text-sm text-base-content/70">
        <Phone size={13} className="text-base-content/40 flex-none" />
        <span>{contact.phone}</span>
      </div>
    )}
    {!contact.company && !contact.email && !contact.phone && (
      <span className="text-xs text-base-content/40 italic">No additional details on file</span>
    )}
    {extraNote && <div className="pt-1 border-t border-primary/20">{extraNote}</div>}
  </div>
);

// ─── Disambiguation Modal ──────────────────────────────────────────────────────────────────────────────────
interface DisambigModalProps {
  candidates: ContactRecord[];
  title: string;
  onSelect: (c: ContactRecord) => void;
  onCancel: () => void;
}
const DisambigModal: React.FC<DisambigModalProps> = ({ candidates, title, onSelect, onCancel }) => (
  <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
    <div className="bg-base-200 rounded-2xl border border-base-300 shadow-2xl w-full max-w-md">
      <div className="flex items-center justify-between p-4 border-b border-base-300">
        <div className="flex items-center gap-2">
          <AlertCircle size={18} className="text-warning" />
          <h3 className="font-bold text-base-content">{title}</h3>
        </div>
        <Button variant="ghost" square onClick={onCancel}><X size={14} /></Button>
      </div>
      <div className="p-4">
        <p className="text-sm text-base-content/60 mb-4">
          There are <span className="font-semibold text-base-content">{candidates.length} contacts</span> with this name. Please select the correct one:
        </p>
        <div className="space-y-3">
          {candidates.map(c => (
            <button
              key={c.id}
              onClick={() => onSelect(c)}
              className="w-full text-left p-3 rounded-xl border-2 border-base-300 bg-base-100 hover:border-primary hover:bg-primary/5 transition-all group"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-none">
                  <User size={13} className="text-primary" />
                </div>
                <span className="font-semibold text-base-content group-hover:text-primary">{c.fullName}</span>
              </div>
              <div className="pl-9 space-y-0.5">
                {c.company && (
                  <div className="flex items-center gap-1.5 text-xs text-base-content/60">
                    <Building2 size={11} className="flex-none" />
                    <span>{c.company}</span>
                  </div>
                )}
                {c.email && (
                  <div className="flex items-center gap-1.5 text-xs text-base-content/60">
                    <Mail size={11} className="flex-none" />
                    <span>{c.email}</span>
                  </div>
                )}
                {c.phone && (
                  <div className="flex items-center gap-1.5 text-xs text-base-content/60">
                    <Phone size={11} className="flex-none" />
                    <span>{c.phone}</span>
                  </div>
                )}
                {!c.company && !c.email && !c.phone && (
                  <span className="text-xs text-base-content/40 italic">No additional details on file</span>
                )}
              </div>
            </button>
          ))}
        </div>
        <Button variant="ghost" className="w-full mt-3" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  </div>
);

// ─── Main Wizard ──────────────────────────────────────────────────────────────────────────────────────────────
export const GuidedDealWizard: React.FC<Props> = ({ onAdd, onClose, complianceTemplates, agentClients, ddMasterItems }) => {
  const today = new Date().toISOString().slice(0, 10);
  const [step, setStep] = useState(1);
  const { primaryOrgId, profile } = useAuth();
  const [form, setForm] = useState({
    address: '', city: '', state: '', zipCode: '',
    secondaryAddress: '',
    duplexAddressCount: '' as '' | '1' | '2',
    propertyType: 'single-family' as PropertyType,
    transactionType: 'buyer' as TransactionType,
    mlsNumber: '', mlsBoard: '', isHeartlandMls: false, listPrice: '', purchasePrice: '',
    contractDate: today, closingDate: '',
    agentClientId: '',
    specialNotes: '',
    loanType: '' as '' | 'conventional' | 'fha' | 'va' | 'usda' | 'cash' | 'other',
    loanAmount: '', downPaymentAmount: '', downPaymentPercent: '', extractedDpPct: '',
    earnestMoney: '', earnestMoneyDueDate: '', sellerConcessions: '', sellerCredit: '', additionalSellerCosts: '',
    asIsSale: false, inspectionWaived: false,
    homeWarranty: false, homeWarrantyCompany: '',
    inspectionDate: '', financeDeadline: '', titleDate: '', possessionDate: '', possessionAtClosing: false,
    buyerNames: '', sellerNames: '', titleCompany: '', loanOfficer: '',
    buyerAgentName: '', sellerAgentName: '',
    commissionAmount: '', clientAgentCommissionPct: '', tcFee: '',
    titleContactId: '', titleContactEmail: '', introEmailSubject: '', introEmailBody: '', emHeldWith: '', titleSide: '' as 'buy' | 'sell' | '', titleCompanySide: '' as 'buy' | 'sell' | 'both' | '',
    legalDescription: '',
    hasCounterOffer: false,
  });
  const [error, setError] = useState('');
  const [aiReview, setAiReview] = useState<AIReview | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractionBanner, setExtractionBanner] = useState<{ count: number; fileName: string } | null>(null);
  const [showExtractedTable, setShowExtractedTable] = useState(false);
  const [extractedRawData, setExtractedRawData] = useState<Record<string, any> | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [contractObjectUrl, setContractObjectUrl] = useState<string | null>(null);
  const [showPdfPanel, setShowPdfPanel] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [disambigClientCandidates, setDisambigClientCandidates] = useState<ContactRecord[] | null>(null);
  const [splitDone, setSplitDone] = useState(false);
  const [mlsFetching, setMlsFetching] = useState(false);
  const [mlsFetchStatus, setMlsFetchStatus] = useState<'' | 'found' | 'not_found'>('');
  // 'pdf' = auto-detected from contract PDF, 'mls' = confirmed/updated from MLS fetch
  const [mlsBoardDetectedSource, setMlsBoardDetectedSource] = useState<'pdf' | 'mls' | null>(null);
  const [mlsPropertyData, setMlsPropertyData] = useState<{
    mlsNumber?: string;
    mlsBoardName?: string;
    propertyType?: string;
    listPrice?: number;
    bedrooms?: number;
    bathrooms?: number;
    sqftLiving?: number;
    yearBuilt?: number;
    listingStatus?: string;
    daysOnMarket?: number;
    listingAgentName?: string;
    listingOfficeName?: string;
    subdivision?: string;
    hoaFee?: number;
    garage?: string;
    pool?: boolean;
  } | null>(null);

  // Title & Escrow step state
  const [titleSearch, setTitleSearch] = useState('');
  const [titleDropdownOpen, setTitleDropdownOpen] = useState(false);
  const [allContacts, setAllContacts] = useState<ContactRecord[]>([]);
  const [titleContactsLoaded, setTitleContactsLoaded] = useState(false);
  const [wizardParticipants, setWizardParticipants] = useState<WizardParticipant[]>([]);
  const [showTitleContactModal, setShowTitleContactModal] = useState(false);
  const [titleParticipantFallback, setTitleParticipantFallback] = useState<{ fullName: string; company?: string; email?: string } | null>(null);
  const [sendingIntroEmail, setSendingIntroEmail] = useState(false);
  const [introEmailSent, setIntroEmailSent] = useState(false);
  // Pre-generate deal ID so Step 8 intro email can be linked to the deal before it's created
  const [preDealId] = useState<string>(() => generateId());
  const [introEmailSkipped, setIntroEmailSkipped] = useState(false);
  const titleSearchRef = useRef<HTMLDivElement>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [mlsMismatchWarning, setMlsMismatchWarning] = useState<{
    selectedMls: string;
    agentMlsMemberships: ContactMlsMembership[];
    agentName: string;
  } | null>(null);
  const clientSearchRef = useRef<HTMLDivElement>(null);

  const f = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [field]: e.target.value }));

  // Auto-calculate down payment fields when contract price or loan amount changes (form-level helper)
  const calcFormDownPayment = (newForm: typeof form) => {
    const contractPrice = parseFloat(newForm.purchasePrice) || 0;
    const loanAmount = parseFloat(newForm.loanAmount) || 0;
    const percent = parseFloat(newForm.downPaymentPercent) || 0;
    const earnestMoney = newForm.isHeartlandMls ? (parseFloat(newForm.earnestMoney) || 0) : 0;
    
    if (contractPrice > 0 && loanAmount > 0) {
      // Primary path: contract price + loan known → derive gap
      const totalGap = contractPrice - loanAmount;
      const downPaymentAmount = newForm.isHeartlandMls
        ? Math.max(0, totalGap - earnestMoney)
        : totalGap;
      const downPaymentPercent = ((totalGap / contractPrice) * 100).toFixed(1);
      return { downPaymentAmount: downPaymentAmount.toString(), downPaymentPercent };
    }

    if (loanAmount > 0 && percent > 0) {
      // Fallback: loan + % known → derive contract price, then cash-at-close
      // Formula: contractPrice = loan / (1 - %/100)
      const derivedPrice = loanAmount / (1 - percent / 100);
      const totalDown = derivedPrice * (percent / 100);
      const downPaymentAmount = Math.max(0, totalDown - earnestMoney);
      return {
        purchasePrice: derivedPrice.toFixed(2),
        downPaymentAmount: downPaymentAmount.toFixed(0),
        downPaymentPercent: percent.toFixed(1),
      };
    }

    return null;
  };

  // Enhanced handler for fields that should trigger down payment recalculation
  const fWithRecalc = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const newForm = { ...form, [field]: e.target.value };
    const recalc = calcFormDownPayment(newForm);
    if (recalc) {
      setForm(p => ({ ...p, ...newForm, ...recalc }));
    } else {
      setForm(p => ({ ...p, [field]: e.target.value }));
    }
  };

  const handlePropertyTypeChange = (type: PropertyType) => {
    setForm(p => ({
      ...p,
      propertyType: type,
      duplexAddressCount: '',
      secondaryAddress: '',
    }));
  };

  // Detect dual-number address pattern: "2121/2123 Askew Ave" or "2121-2123 Askew Ave"
  const dualAddressMatch = form.address.trim().match(/^(\d+)[\/\-](\d+)\s+(.+)$/);

  const handleSplitAddress = () => {
    if (!dualAddressMatch) return;
    const [, num1, num2, street] = dualAddressMatch;
    setForm(p => ({
      ...p,
      address: `${num1} ${street}`,
      secondaryAddress: `${num2} ${street}`,
      propertyType: 'duplex',
      duplexAddressCount: '2',
    }));
    setSplitDone(true);
  };

  const isHeartlandAgent = (contact?: ContactRecord) =>
    contact?.mlsMemberships?.some(m =>
      /heartland/i.test(m.mlsName || '') || /heartland/i.test(m.boardName || '')
    ) ?? false;

  // Close client dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (clientSearchRef.current && !clientSearchRef.current.contains(e.target as Node)) {
        setClientDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Auto-populate wizard contacts when reaching step 3 (contacts hub)
  useEffect(() => {
    if (step === 3 && wizardParticipants.length === 0) {
      const parts: WizardParticipant[] = [];
      const parseNames = (str: string, role: WizardParticipant['role'], side: WizardParticipant['side']) => {
        str.split(/[&,]|\band\b/i).map((n: string) => n.trim()).filter(Boolean).forEach((name: string) => {
          const nameParts = name.split(' ');
          parts.push({ tempId: generateId(), firstName: nameParts[0], lastName: nameParts.slice(1).join(' '), email: '', phone: '', role, side, isExtracted: true });
        });
      };
      if (form.buyerNames)     parseNames(form.buyerNames, 'buyer', 'buyer');
      if (form.sellerNames)    parseNames(form.sellerNames, 'seller', 'seller');
      if (form.buyerAgentName) {
        const np = form.buyerAgentName.split(' ');
        parts.push({ tempId: generateId(), firstName: np[0], lastName: np.slice(1).join(' '), email: '', phone: '', role: 'lead_agent', side: 'buyer', isExtracted: true });
      }
      if (form.sellerAgentName) {
        const np = form.sellerAgentName.split(' ');
        parts.push({ tempId: generateId(), firstName: np[0], lastName: np.slice(1).join(' '), email: '', phone: '', role: 'lead_agent', side: 'seller', isExtracted: true });
      }
      if (form.loanOfficer) {
        // loanOfficer may be "Jane Smith – First Bank", extract just the name part
        const namePart = form.loanOfficer.split(/[-–,]|\s+(at|of)\s+/i)[0].trim();
        const np = namePart.split(' ');
        if (np[0]) parts.push({ tempId: generateId(), firstName: np[0], lastName: np.slice(1).join(' '), email: '', phone: '', role: 'lender', side: 'buyer', isExtracted: true });
      }
      if (form.titleCompany) {
        // titleCompany = EM holder extracted from contract → seller-side title by default.
        // Respect titleCompanySide if TC already manually set it in Step 9.
        const titleSide: WizardParticipant['side'] =
          form.titleCompanySide === 'buy' ? 'buyer' :
          form.titleCompanySide === 'both' ? 'both' :
          'seller'; // default: EM holder is always seller-side
        parts.push({ tempId: generateId(), firstName: form.titleCompany, lastName: '', email: '', phone: '', role: 'title_officer', side: titleSide, isExtracted: true });
      }
      if (parts.length > 0) setWizardParticipants(parts);
    }
  }, [step]);

  // Load all contacts when step 3 is reached (needed for title officer search in step 9)
  useEffect(() => {
    if (step === 3 && !titleContactsLoaded) {
      supabase
        .from('contacts')
        .select('*')
        .in('contact_type', ['title', 'escrow'])
        .is('deleted_at', null)
        .order('full_name')
        .then(({ data }) => {
          if (data) {
            const mapped = data.map((c: any) => ({
              id: c.id, fullName: c.full_name || '', company: c.company || '',
              email: c.email || '', phone: c.phone || '', role: c.contact_type || '',
            } as unknown as ContactRecord));
            setAllContacts(mapped);
            // If a title contact is already linked (re-entering wizard), replace placeholder with real contact
            if (form.titleContactId) {
              const tc = data.find((c: any) => c.id === form.titleContactId);
              if (tc) {
                const nameParts = (tc.full_name || '').split(' ');
                setWizardParticipants(prev => {
                  // Remove any existing title_officer placeholder, add real contact
                  const withoutTitle = prev.filter(p => p.role !== 'title_officer');
                  return [...withoutTitle, {
                    tempId: generateId(),
                    firstName: nameParts[0] || tc.full_name || '',
                    lastName: nameParts.slice(1).join(' '),
                    email: tc.email || '',
                    phone: tc.phone || '',
                    role: 'title_officer',
                    side: 'both',
                    contactId: tc.id,
                    isExtracted: true,
                  }];
                });
              }
            }
          }
          setTitleContactsLoaded(true);
        });
    }
  }, [step, titleContactsLoaded]);

  // Close title dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (titleSearchRef.current && !titleSearchRef.current.contains(e.target as Node)) {
        setTitleDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Revoke object URL on change to avoid memory leaks
  useEffect(() => {
    return () => { if (contractObjectUrl) URL.revokeObjectURL(contractObjectUrl); };
  }, [contractObjectUrl]);

  const handleTitleContactModalSaved = (saved: SavedContact) => {
    const newContact = {
      id: saved.id, fullName: saved.fullName,
      company: saved.company || '', email: saved.email || '', phone: saved.phone || '',
      role: 'title',
    } as unknown as ContactRecord;
    setAllContacts(prev => [...prev, newContact]);
    const addr = [form.address, form.city, form.state].filter(Boolean).join(', ');
    setForm(p => ({
      ...p,
      titleContactId: saved.id,
      titleContactEmail: saved.email || '',
      introEmailSubject: `${addr} – Introduction from TC Team`,
      emHeldWith: saved.company || p.emHeldWith || '',
      introEmailBody: resolveIntroBody(`Hi ${saved.fullName},\n\nI'm reaching out to introduce myself as the transaction coordinator for the following file:\n\nProperty: {{address}}, {{city}}, {{state}}\n\nRepresenting Agent: {{agentName}}\nPhone: {{agentPhone}}\nEmail: {{agentEmail}}\nLender / Loan Officer: {{loanOfficer}}\nEM Held With: {{emHeldWith}}\n\nI'll be your main point of contact throughout this transaction. Please don't hesitate to reach out with any questions or documents needed.\n\nLooking forward to working together!\n\n{{tcTeamSignature}}`, { emHeldWith: saved.company || form.emHeldWith || '', loanOfficer: form.loanOfficer }),
    }));
    setShowTitleContactModal(false);
    setIntroEmailSent(false);
  };

  // Resolve merge tags eagerly so the textarea preview shows real values
  const resolveIntroBody = (rawBody: string, overrides?: { emHeldWith?: string; loanOfficer?: string }): string => {
    const ac = agentClients?.find(c => c.id === form.agentClientId);
    const tcTeamSig = ac?.fullName ? `TC Team for ${ac.fullName}` : 'TC Team';
    return rawBody
      .replace(/\{\{address\}\}/g, form.address || '')
      .replace(/\{\{city\}\}/g, form.city || '')
      .replace(/\{\{state\}\}/g, form.state || '')
      .replace(/\{\{agentName\}\}/g, ac?.fullName || '')
      .replace(/\{\{agentPhone\}\}/g, (ac as any)?.phone || '')
      .replace(/\{\{agentEmail\}\}/g, (ac as any)?.email || '')
      .replace(/\{\{loanOfficer\}\}/g, overrides?.loanOfficer ?? form.loanOfficer ?? '')
      .replace(/\{\{emHeldWith\}\}/g, overrides?.emHeldWith ?? form.emHeldWith ?? '')
      .replace(/\{\{tcTeamSignature\}\}/g, tcTeamSig);
  };

  const handleSendIntroEmail = async () => {
    if (!form.titleContactEmail || !form.introEmailSubject) return;
    setSendingIntroEmail(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      // Body is already resolved (resolveIntroBody called at selection time)
      // Re-resolve as safety net in case agent client was changed after contact picked
      const ac = agentClients?.find(c => c.id === form.agentClientId);
      const tcTeamSig = ac?.fullName ? `TC Team for ${ac.fullName}` : 'TC Team';
      const resolvedBody = form.introEmailBody
        .replace(/\{\{address\}\}/g, form.address || '')
        .replace(/\{\{city\}\}/g, form.city || '')
        .replace(/\{\{state\}\}/g, form.state || '')
        .replace(/\{\{agentName\}\}/g, ac?.fullName || '')
        .replace(/\{\{agentPhone\}\}/g, (ac as any)?.phone || '')
        .replace(/\{\{agentEmail\}\}/g, (ac as any)?.email || '')
        .replace(/\{\{loanOfficer\}\}/g, form.loanOfficer || '')
        .replace(/\{\{emHeldWith\}\}/g, form.emHeldWith || '')
        .replace(/\{\{tcTeamSignature\}\}/g, tcTeamSig);
      const bodyLines = resolvedBody.split('\n');
      const bodyHtml = '<p>' + bodyLines.map(l => l.trim() === '' ? '</p><p>' : l).join('<br/>') + '</p>';
      const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseAnonKey}` },
        body: JSON.stringify({
          to: [form.titleContactEmail],
          cc: ac?.email ? [(ac as any).email] : [],
          subject: form.introEmailSubject,
          bodyHtml,
          sentBy: 'TC Team',
          dealId: preDealId,
          emailType: 'deal',
          templateName: 'intro',
        }),
      });
      if (!res.ok) throw new Error('Send failed');
      setIntroEmailSent(true);
    } catch (err: any) {
      alert('Email failed: ' + (err.message || err));
    } finally {
      setSendingIntroEmail(false);
    }
  };

  const fetchMlsNumber = async () => {
    if (!form.address.trim() || !form.city.trim()) return;
    setMlsFetching(true);
    setMlsFetchStatus('');
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-mls-number`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          address: form.address.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          zipCode: form.zipCode.trim(),
          ...(form.secondaryAddress?.trim() ? { secondaryAddress: form.secondaryAddress.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (data.found && data.data) {
        const d = data.data;
        if (d.mlsNumber) setForm(p => ({ ...p, mlsNumber: d.mlsNumber }));
        // Auto-select/confirm MLS board from MLS fetch result
        if (d.mlsBoardName) {
          const fetchedBoard = (d.mlsBoardName as string).toLowerCase().trim();
          const stateKey = form.state.toUpperCase();
          const boardsForState = MLS_BY_STATE[stateKey] || [];
          const allBoards = boardsForState.length > 0 ? boardsForState : Object.values(MLS_BY_STATE).flat();
          const matched = allBoards.find(b => {
            const bl = b.toLowerCase();
            return bl.includes(fetchedBoard) || fetchedBoard.includes(bl.split(' ')[0]);
          });
          if (matched) {
            setForm(p => ({ ...p, mlsBoard: matched, isHeartlandMls: /heartland/i.test(matched) }));
            setMlsBoardDetectedSource('mls');
          }
        }
        setMlsPropertyData(d);
        setMlsFetchStatus('found');
      } else {
        setMlsFetchStatus('not_found');
      }
    } catch {
      setMlsFetchStatus('not_found');
    } finally {
      setMlsFetching(false);
    }
  };

  const checkMlsMismatch = (agentId: string, mlsBoard: string) => {
    if (!agentId || !mlsBoard || mlsBoard === 'Other') return;
    const agent = agentClients?.find(c => c.id === agentId);
    if (!agent) return;
    const memberships = agent.mlsMemberships || [];
    const hasMatch = memberships.some(m => {
      const name = (m.mlsName || '').toLowerCase();
      const board = (m.boardName || '').toLowerCase();
      const selected = mlsBoard.toLowerCase();
      return name.includes(selected) || selected.includes(name) ||
             board.includes(selected) || selected.includes(board);
    });
    if (!hasMatch) {
      setMlsMismatchWarning({ selectedMls: mlsBoard, agentMlsMemberships: memberships, agentName: agent.fullName });
    }
  };

  const selectAgentClient = (id: string) => {
    setClientDropdownOpen(false);
    const chosen = agentClients?.find(c => c.id === id);
    if (!chosen) return;
    const sameName = agentClients?.filter(
      c => c.fullName.trim().toLowerCase() === chosen.fullName.trim().toLowerCase()
    ) ?? [];
    if (sameName.length > 1) {
      setDisambigClientCandidates(sameName);
    } else {
      setForm(p => ({ ...p, agentClientId: id }));
      setClientSearch('');
      if (form.mlsBoard) checkMlsMismatch(id, form.mlsBoard);
    }
  };

  const handleClientSelect = (selectedId: string) => {
    if (!selectedId) { setForm(p => ({ ...p, agentClientId: '' })); return; }
    const chosen = agentClients?.find(c => c.id === selectedId);
    if (!chosen) return;
    const sameName = agentClients?.filter(
      c => c.fullName.trim().toLowerCase() === chosen.fullName.trim().toLowerCase()
    ) ?? [];
    if (sameName.length > 1) {
      setDisambigClientCandidates(sameName);
    } else {
      setForm(p => ({ ...p, agentClientId: selectedId }));
    }
  };

  const handleClientDisambigSelect = (c: ContactRecord) => {
    setForm(p => ({ ...p, agentClientId: c.id }));
    setDisambigClientCandidates(null);
  };

  const isDuplex = form.propertyType === 'duplex';
  const hasTwoAddresses = isDuplex && form.duplexAddressCount === '2';

  const canAdvance = (): boolean => {
    switch (step) {
      case 1: return !!(form.address.trim() && form.city.trim() && form.mlsBoard);
      case 2: return true; // AI Review step — always allow advance
      case 3: return true; // Deal Contacts — always allow advance (contacts optional)
      case 4: return isDuplex ? form.duplexAddressCount !== '' : true;
      case 5: return true;
      case 6: return true;
      case 7: return !!form.closingDate;
      case 8: return !!form.agentClientId;
      case 9: return true;
      default: return true;
    }
  };

  const handleNext = () => {
    setError('');
    if (!canAdvance()) {
      if (step === 1) setError('Address, city, and MLS Board are required.');
      if (step === 4) setError('Please select whether this duplex has 1 or 2 addresses.');
      if (step === 7) setError('Closing date is required.');
      if (step === 8) setError('Please select a client to continue.');
      return;
    }
    if (step === 10) runAIReview();
    // When advancing from step 1: go to AI Review if extraction exists, else skip to Property Type
    if (step === 1) {
      setStep(extractedRawData ? 2 : 3);
      return;
    }
    if (step < TOTAL_STEPS) setStep(step + 1);
  };

  const handleBack = () => {
    setError('');
    if (step > 1) setStep(step - 1);
  };

  const handleFileExtract = async (file: File) => {
    if (extracting) return;
    setContractFile(file); // preserve file for post-create upload
    setContractObjectUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file); });
    setExtracting(true);
    setExtractionBanner(null);
    setError('');
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => { const r = reader.result as string; resolve(r.split(',')[1]); };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch('/api/ai?action=extract-deal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileBase64: base64, fileName: file.name }),
      });
      if (!res.ok) throw new Error('Extraction failed');
      const d = await res.json();
      setForm(p => {
        const updated = {
          ...p,
          address: d.address || p.address,
          city: d.city || p.city,
          state: d.state || p.state,
          zipCode: d.zipCode || p.zipCode,
          listPrice: d.listPrice || p.listPrice,
          purchasePrice: d.purchasePrice || d.contractPrice || p.purchasePrice,
          mlsNumber: d.mlsNumber || p.mlsNumber,
          contractDate: d.contractDate || p.contractDate,
          closingDate: d.closingDate || p.closingDate,
          inspectionDate: d.inspectionDate || p.inspectionDate,
          financeDeadline: d.financeDeadline || p.financeDeadline,
          possessionDate: d.possessionDate || p.possessionDate,
          earnestMoney: d.earnestMoney || p.earnestMoney,
          earnestMoneyDueDate: d.earnestMoneyDueDate || p.earnestMoneyDueDate,
          sellerConcessions: d.sellerConcessions || p.sellerConcessions,
          sellerCredit: d.sellerCredit || p.sellerCredit || '',
          additionalSellerCosts: d.additionalSellerCosts || p.additionalSellerCosts || '',
          buyerAgentName: (d.buyerAgentName as string) || p.buyerAgentName || '',
          sellerAgentName: (d.sellerAgentName as string) || p.sellerAgentName || '',
          loanType: d.loanType || p.loanType,
          loanAmount: d.loanAmount || p.loanAmount,
          downPaymentAmount: d.downPaymentAmount || p.downPaymentAmount,
          buyerNames: d.buyerNames || p.buyerNames,
          sellerNames: d.sellerNames || p.sellerNames,
          titleCompany: d.titleCompany || p.titleCompany,
          emHeldWith: d.emHeldWith || p.emHeldWith,
          loanOfficer: d.loanOfficer || p.loanOfficer,
          // buyerAgentCommission comes from AI extraction (e.g. "3%" or "4950").
          // Map it to the correct form fields based on whether it's % or dollar amount.
          commissionAmount: (() => {
            const raw = d.buyerAgentCommission || d.commissionAmount;
            if (!raw) return p.commissionAmount;
            if (String(raw).includes('%')) return p.commissionAmount; // % form — no $ yet
            return String(raw);
          })(),
          clientAgentCommissionPct: (() => {
            const stripFmt = (v: string) => parseFloat((v || '').replace(/[$,]/g, ''));
            const agentComm = d.buyerAgentCommission;
            // If AI returns a % (e.g. "3%"), use it directly
            if (agentComm && String(agentComm).includes('%')) {
              return parseFloat(String(agentComm)).toFixed(2);
            }
            // Otherwise derive % from dollar amount ÷ price
            const commAmt = stripFmt(agentComm || d.commissionAmount || p.commissionAmount || '0');
            const price = stripFmt(d.contractPrice || d.purchasePrice || p.purchasePrice || '0');
            if (commAmt && price) return (calcCommissionPct(price, commAmt)).toFixed(2);
            return p.clientAgentCommissionPct;
          })(),
          transactionType: (d.transactionType as any) || p.transactionType,
          propertyType: (d.propertyType as any) || p.propertyType,
          asIsSale: d.asIsSale ?? p.asIsSale,
          inspectionWaived: d.inspectionWaived ?? p.inspectionWaived,
          homeWarranty: d.homeWarranty ?? p.homeWarranty,
          homeWarrantyCompany: d.homeWarrantyCompany || p.homeWarrantyCompany,
          legalDescription: d.legalDescription || p.legalDescription,
        };
        // Auto-calculate down payment from extracted contract price + loan amount.
        // The recalc handlers (fWithRecalc) only fire on manual field changes, so we
        // must compute this here too — otherwise extracted data leaves down payment at 0.
        const cp = parseFloat(updated.purchasePrice) || 0;
        const la = parseFloat(updated.loanAmount) || 0;
        if (cp > 0 && la > 0) {
          const totalGap = cp - la;  // full spread (includes EM for Heartland deals)
          const em = updated.isHeartlandMls ? (parseFloat(updated.earnestMoney) || 0) : 0;
          // For Heartland: show cash-at-closing only (EM handled separately); others: full gap
          updated.downPaymentAmount = updated.isHeartlandMls
            ? Math.max(0, totalGap - em).toString()
            : totalGap.toString();
          // For Heartland: use extracted % from line 330 (what agent wrote); normalize decimal (.03→3)
          // For non-Heartland (or if not extracted): derive from price/loan math
          if (updated.isHeartlandMls && d.downPaymentPercent) {
            let rawPct = parseFloat(d.downPaymentPercent as string);
            if (rawPct > 0 && rawPct < 1) rawPct = rawPct * 100; // .03 → 3
            updated.downPaymentPercent = rawPct.toFixed(1);
          } else {
            updated.downPaymentPercent = cp > 0 ? ((totalGap / cp) * 100).toFixed(1) : '';
          }
          // Always store AI-extracted DP% (from LTV line 330) separately so recalc never overwrites it.
          // The panel uses this for independent "Should Be" calculations.
          if (d.downPaymentPercent) {
            let rawExtracted = parseFloat(d.downPaymentPercent as string);
            if (rawExtracted > 0 && rawExtracted < 1) rawExtracted = rawExtracted * 100;
            updated.extractedDpPct = rawExtracted.toFixed(1);
          }
        }
        return updated;
      });
      // Auto-detect MLS board from extracted mlsBoardName + state
      if (d.mlsBoardName) {
        const extractedBoard = (d.mlsBoardName as string).toLowerCase().trim();
        const stateKey = (d.state || '').toUpperCase();
        const boardsForState = MLS_BY_STATE[stateKey] || [];
        // Find best match: prefer boards in the form's state, fallback to all states
        const allBoards = boardsForState.length > 0 ? boardsForState : Object.values(MLS_BY_STATE).flat();
        const matched = allBoards.find(b => {
          const bl = b.toLowerCase();
          return bl.includes(extractedBoard) || extractedBoard.includes(bl.split(' ')[0]);
        }) || boardsForState.find(b => b.toLowerCase().includes('heartland') && extractedBoard.includes('heartland'));
        if (matched) {
          setForm(p => ({ ...p, mlsBoard: matched, isHeartlandMls: /heartland/i.test(matched) }));
          setMlsBoardDetectedSource('pdf');
        }
      }
      setExtractionBanner({ count: d.extractedFields?.length || 0, fileName: file.name });
      setExtractedRawData(d);
      setShowExtractedTable(false);
      setStep(2); // advance to AI Review step
    } catch (err: any) {
      setError('Could not extract from document — please fill in manually.');
    } finally {
      setExtracting(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileExtract(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileExtract(file);
  };

  const runAIReview = async () => {
    setAiLoading(true);
    setAiError('');
    setAiReview(null);
    try {
      const res = await fetch('/api/ai?action=guided-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealData: { ...form } }),
      });
      if (!res.ok) throw new Error('AI review failed');
      const data: AIReview = await res.json();
      setAiReview(data);
    } catch (err: any) {
      setAiError(err.message || 'Failed to get AI review');
    } finally {
      setAiLoading(false);
    }
  };

  const handleCreate = async () => {
    setIsCreating(true);
    const isMF = form.propertyType === 'multi-family';

    const autoDocRequests: DocumentRequest[] = isMF ? [{
      id: generateId(),
      type: 'mf_addendum',
      label: docTypeConfig.mf_addendum.label,
      description: '⚠️ Auto-detected: Multi-family property. This addendum is required.',
      requestedAt: new Date().toISOString(),
      requestedBy: 'System Auto-Detect',
      status: 'pending',
      urgency: 'high',
    }] : [];

    const addressDisplay = hasTwoAddresses && form.secondaryAddress.trim()
      ? `${form.address} & ${form.secondaryAddress}, ${form.city} ${form.state}`
      : `${form.address}, ${form.city} ${form.state}`;

    const initLog: ActivityEntry[] = [
      { id: generateId(), timestamp: new Date().toISOString(), action: 'Deal created', detail: addressDisplay, user: profile?.name || 'TC Staff', type: 'deal_created' },
      ...(isMF ? [{ id: generateId(), timestamp: new Date().toISOString(), action: 'Multi-Family Addendum auto-flagged', detail: 'System detected multi-family property and created required document alert.', user: 'System', type: 'document_requested' as const }] : []),
      ...(hasTwoAddresses && form.secondaryAddress.trim() ? [{ id: generateId(), timestamp: new Date().toISOString(), action: 'Duplex — dual address recorded', detail: `Unit A: ${form.address} | Unit B: ${form.secondaryAddress}`, user: 'System', type: 'deal_created' as const }] : []),
    ];

    // Find the selected agent client to populate agent fields
    const agentClient = agentClients?.find(c => c.id === form.agentClientId);

    const deal: Deal = {
      id: preDealId,
      propertyAddress: form.address.trim(),
      secondaryAddress: hasTwoAddresses && form.secondaryAddress.trim() ? form.secondaryAddress.trim() : undefined,
      city: form.city.trim(),
      state: form.state.trim().toUpperCase(),
      zipCode: form.zipCode.trim(),
      mlsNumber: form.mlsNumber.trim(),
      isHeartlandMls: form.isHeartlandMls,
      listPrice: parseFloat(form.listPrice) || 0,
      contractPrice: parseFloat(form.purchasePrice) || parseFloat(form.listPrice) || 0,
      propertyType: form.propertyType,
      status: 'contract' as DealStatus,
      transactionType: form.transactionType as TransactionType,
      contractDate: form.contractDate,
      closingDate: form.closingDate,
      agentId: agentClient?.id ?? '',
      agentName: agentClient?.fullName || '',
      agentClientId: form.agentClientId || undefined,
      // Set buyer/seller agent based on transaction type
      buyerAgent: form.transactionType === 'buyer' && agentClient ? {
        name: agentClient.fullName,
        phone: agentClient.phone || '',
        email: agentClient.email || '',
        isOurClient: true,
        company: (agentClient as any).company || (agentClient as any).organizationName || '',
      } : undefined,
      sellerAgent: form.transactionType === 'seller' && agentClient ? {
        name: agentClient.fullName,
        phone: agentClient.phone || '',
        email: agentClient.email || '',
        isOurClient: true,
        company: (agentClient as any).company || (agentClient as any).organizationName || '',
      } : undefined,
      contacts: (() => {
        const result: any[] = [];
        // Add agent client to contacts
        if (agentClient) {
          result.push({
            id: agentClient.id,
            directoryId: agentClient.id,
            name: agentClient.fullName || '',
            email: agentClient.email || '',
            phone: agentClient.phone || '',
            role: 'agent' as any,
            company: (agentClient as any).company || '',
            inNotificationList: true,
            side: form.transactionType === 'buyer' ? 'buy' : 'sell',
          });
        }
        // Add title contact
        if (form.titleContactId) {
          const tc = allContacts.find(c => c.id === form.titleContactId);
          if (tc) {
            result.push({
              id: tc.id,
              directoryId: tc.id,
              name: (tc as any).fullName || '',
              email: (tc as any).email || '',
              phone: (tc as any).phone || '',
              role: ((tc as any).role || 'title') as any,
              company: (tc as any).company || '',
              inNotificationList: false,
              side: form.titleSide || (form.transactionType === 'buyer' ? 'buy' : 'sell'),
            });
          }
        }
        return result;
      })(),
      notes: form.specialNotes.trim(),
      loanType: form.loanType || undefined,
      loanAmount: parseFloat(form.loanAmount) || undefined,
      downPayment: parseFloat(form.downPaymentAmount) || undefined,
      earnestMoney: parseFloat(form.earnestMoney) || undefined,
      earnestMoneyDueDate: form.earnestMoneyDueDate || undefined,
      sellerConcessions: parseFloat(form.sellerConcessions) || undefined,
      clientAgentCommission: parseFloat(form.commissionAmount) || undefined,
      clientAgentCommissionPct: parseFloat(form.clientAgentCommissionPct) || undefined,
      asIsSale: form.asIsSale,
      inspectionWaived: form.inspectionWaived,
      homeWarranty: form.homeWarranty,
      homeWarrantyCompany: form.homeWarrantyCompany || undefined,
      possessionDate: form.possessionAtClosing ? (form.closingDate || undefined) : (form.possessionDate || undefined),
      titleDate: form.titleDate || undefined,
      buyerName: form.buyerNames || undefined,
      sellerName: form.sellerNames || undefined,
      titleCompanyName: form.titleCompany || undefined,
      titleCompanySide: (form.titleCompanySide === 'both' ? 'both' : form.titleCompanySide === 'sell' ? 'seller' : 'buyer') as 'buyer' | 'seller' | 'both',
      emHeldWith: form.emHeldWith || undefined,
      loanOfficerName: form.loanOfficer || undefined,
      buyerAgentName: form.buyerAgentName || undefined,
      sellerAgentName: form.sellerAgentName || undefined,
      legalDescription: form.legalDescription.trim() || undefined,
      hasCounterOffer: form.hasCounterOffer || undefined,
      dueDiligenceChecklist: (ddMasterItems && ddMasterItems.length > 0)
        ? ddMasterItems.map(m => ({ id: generateId(), title: m.title, completed: false }))
        : fallbackDD(),
      complianceChecklist: (() => {
        if (form.agentClientId && complianceTemplates) {
          const tpl = complianceTemplates.find(t => (t.agentClientIds ?? (t.agentClientId ? [t.agentClientId] : [])).includes(form.agentClientId!));
          if (tpl && tpl.items.length > 0) {
            return tpl.items.map((item: any) => ({ id: generateId(), title: item.title, completed: false, required: item.required }));
          }
        }
        return defaultComp();
      })(),
      documentRequests: autoDocRequests,
      reminders: [],
      activityLog: initLog,
      milestone: 'contract-received' as const,
      tasks: [
        ...buildMissingTitleCompanyTasks(form.titleCompany),
        ...(form.hasCounterOffer ? [{
          id: generateId(),
          title: 'Review counter offer — contract numbers may have changed',
          dueDate: today,
          priority: 'high' as const,
          category: 'Negotiations',
          milestone: 'contract-received' as const,
          autoGenerated: true,
        }] : []),
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      orgId: primaryOrgId() ?? undefined,
    };
    // ── Save deal to DB FIRST so FK constraints are satisfied ──────────────────
    try {
      await saveSingleDeal(deal, profile?.id);
    } catch (saveErr: any) {
      console.error('[GuidedDealWizard] Failed to save deal to DB:', saveErr);
      setError(`Failed to create deal: ${saveErr.message}`);
      setIsCreating(false);
      return;
    }

    // ── Upload purchase contract (deal now exists in DB) ────────────────────────
    let contractUploadSuccess = true;
    if (contractFile) {
      try {
        const safeName = contractFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `deals/${deal.id}/purchase-contract/${safeName}`;
        console.log('[GuidedDealWizard] Starting contract upload to:', path);
        
        const { error: upErr } = await supabase.storage
          .from('deal-documents')
          .upload(path, contractFile, { contentType: contractFile.type, upsert: false });
        
        if (upErr) {
          console.error('[GuidedDealWizard] Storage upload error:', upErr);
          contractUploadSuccess = false;
          setError(`Failed to upload contract to storage: ${upErr.message}`);
        } else {
          console.log('[GuidedDealWizard] File uploaded successfully, now inserting document record...');
          const { error: dbErr } = await supabase.from('deal_documents').insert({
            deal_id: deal.id,
            file_name: contractFile.name,
            storage_path: path,
            file_size_bytes: contractFile.size,
            category: 'purchase_contract',
            source: 'upload',
            is_source_of_truth: true,
            is_protected: true,
            uploaded_by: profile?.name || 'TC Staff',
            created_at: new Date().toISOString(),
            // Persist AI extraction results so Changes Timeline is populated from day 1
            extraction_data: extractedRawData ?? undefined,
          });
          
          if (dbErr) {
            console.error('[GuidedDealWizard] Failed to insert document record:', dbErr);
            contractUploadSuccess = false;
            setError(`Contract uploaded but failed to save reference to database: ${dbErr.message}`);
          } else {
            console.log('[GuidedDealWizard] Contract file saved successfully as source of truth');
          }
        }
      } catch (docErr: any) {
        console.error('[GuidedDealWizard] Failed to upload contract file:', docErr);
        contractUploadSuccess = false;
        setError(`Error uploading contract: ${docErr.message}`);
      }
      
      if (!contractUploadSuccess) {
        setIsCreating(false);
        return;
      }
    }

    // Persist participants BEFORE opening workspace — prevents race condition duplicates
    try {
      // Helper: find existing contact by name OR create new one (prevents duplicate contacts).
      // Uses .limit(1) instead of .maybeSingle() to gracefully handle pre-existing duplicates
      // (maybeSingle throws when multiple rows match, causing false misses and new contact creation).
      const findOrCreateContact = async (fullName: string, orgId: string | null) => {
        const parts = fullName.trim().split(' ');
        const firstName = parts[0];
        const lastName = parts.slice(1).join(' ') || null;
        // Check if contact already exists with this name (org-scoped, picks oldest match)
        // Handle null last_name and null org_id correctly — .ilike('last_name', '') never matches IS NULL
        let q = supabase.from('contacts').select('id').ilike('first_name', firstName);
        if (lastName) {
          q = q.ilike('last_name', lastName);
        } else {
          q = q.or('last_name.is.null,last_name.eq.');
        }
        if (orgId) {
          q = q.eq('org_id', orgId);
        } else {
          q = q.is('org_id', null);
        }
        const { data: existingList } = await q.order('created_at', { ascending: true }).limit(1);
        if (existingList && existingList.length > 0) return existingList[0].id;
        // Create new contact
        const { data: created } = await supabase.from('contacts').insert({
          first_name: firstName,
          last_name: lastName,
          full_name: fullName.trim(),
          contact_type: 'client',
          org_id: orgId ?? null,
        }).select('id').single();
        return created?.id ?? null;
      };

      // Helper: insert deal_participant only if not already present (prevents duplicate rows)
      const safeAddParticipant = async (params: Parameters<typeof saveDealParticipant>[0]) => {
        const { data: existing } = await supabase
          .from('deal_participants')
          .select('id')
          .eq('deal_id', params.dealId)
          .eq('contact_id', params.contactId)
          .eq('deal_role', params.dealRole)
          .maybeSingle();
        if (existing) return; // already exists — skip
        await saveDealParticipant(params);
      };

      // Save agent (lead_agent)
      if (agentClient) {
        await safeAddParticipant({
          dealId: deal.id,
          contactId: agentClient.id,
          side: form.transactionType === 'buyer' ? 'buyer' : 'listing',
          dealRole: 'lead_agent',
          isPrimary: true,
          isClientSide: true,
        });
      }

      // Save title contact from Step 9 (Title & Escrow) if set and not already in wizardParticipants
      if (form.titleContactId) {
        await safeAddParticipant({
          dealId: deal.id,
          contactId: form.titleContactId,
          side: form.titleSide === 'buy' ? 'buyer' : form.titleSide === 'sell' ? 'listing' : (form.transactionType === 'buyer' ? 'buyer' : 'listing'),
          dealRole: 'title_officer',
          isPrimary: false,
          isClientSide: false,
        });
      }

      // Save all contacts confirmed in Step 3 (Deal Contacts hub)
      for (const p of wizardParticipants) {
        const fullName = [p.firstName, p.lastName].filter(Boolean).join(' ').trim();
        if (!fullName) continue;

        // Get or create the contact record
        let contactId = p.contactId ?? null;
        if (!contactId) {
          contactId = await findOrCreateContact(fullName, deal.orgId ?? null);
          // Update contact with email/phone if provided
          if (contactId && (p.email || p.phone)) {
            await supabase.from('contacts').update({
              ...(p.email ? { email: p.email } : {}),
              ...(p.phone ? { phone: p.phone } : {}),
            }).eq('id', contactId).is('email', p.email ? null : undefined);
          }
        }
        if (!contactId) continue;

        // Map wizard side → DB side
        const mapSide = (side: 'buyer' | 'seller' | 'both', role: typeof p.role): string => {
          if (side === 'both') return 'both';
          if (side === 'buyer') return 'buyer';
          // Sell side: agent roles → 'listing', others → 'seller'
          return (role === 'lead_agent' || role === 'co_agent') ? 'listing' : 'seller';
        };

        await safeAddParticipant({
          dealId:       deal.id,
          contactId,
          side:         mapSide(p.side, p.role) as any,
          dealRole:     p.role,
          isPrimary:    false,
          isClientSide: (form.transactionType === 'buyer' && p.side === 'buyer') ||
                        (form.transactionType === 'seller' && p.side === 'seller'),
          isExtracted:  p.isExtracted,
        });
      }
    } catch (err) {
      console.error('[GuidedDealWizard] Failed to save deal participants:', err);
    }

    onAdd(deal);
    setIsCreating(false);
  };

  const stepTitles = ['', 'Property Address', 'AI Review', 'Deal Contacts', 'Property Type', 'Transaction Side', 'Financials', 'Key Dates', 'Our Client', 'Title & Escrow', 'AI Review'];
  const isMF = form.propertyType === 'multi-family';
  const severityConfig = {
    info: { bg: 'bg-blue-50 border-blue-200', icon: <Info size={16} className="text-blue-500" />, text: 'text-blue-700' },
    warning: { bg: 'bg-yellow-50 border-yellow-200', icon: <AlertTriangle size={16} className="text-yellow-500" />, text: 'text-yellow-700' },
    error: { bg: 'bg-red-50 border-red-200', icon: <AlertTriangle size={16} className="text-red-500" />, text: 'text-red-700' },
  };

  const selectedClient = agentClients?.find(c => c.id === form.agentClientId) ?? null;

  return (
    <>
      <style>{`
        input[type=number].no-spinner::-webkit-inner-spin-button,
        input[type=number].no-spinner::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number].no-spinner { -moz-appearance: textfield; }
      `}</style>

      {/* Page ID Badge — shows current wizard step for debugging */}
      <PageIdBadge
        pageId={PAGE_IDS[`WIZARD_STEP_${step}` as keyof typeof PAGE_IDS] || `wizard-step-${step}`}
        context={`step ${step} of 9`}
      />

      {disambigClientCandidates && (
        <DisambigModal
          candidates={disambigClientCandidates}
          title="Multiple Clients Found"
          onSelect={handleClientDisambigSelect}
          onCancel={() => { setDisambigClientCandidates(null); setForm(p => ({ ...p, agentClientId: '' })); }}
        />
      )}

      {/* MLS Mismatch Warning Popup */}
      {mlsMismatchWarning && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setMlsMismatchWarning(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-amber-50 border-b border-amber-200 px-5 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-none">
                <AlertTriangle size={20} className="text-amber-600" />
              </div>
              <div>
                <p className="font-bold text-gray-900">MLS Mismatch Detected</p>
                <p className="text-xs text-amber-700 mt-0.5">Please verify MLS information for <span className="font-semibold">{mlsMismatchWarning.agentName}</span></p>
              </div>
              <Button variant="ghost" size="xs" square className="ml-auto" onClick={() => setMlsMismatchWarning(null)}><X size={14} /></Button>
            </div>
            {/* Body */}
            <div className="px-5 py-4 space-y-4">
              {/* Selected MLS */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">MLS Board You Selected</p>
                <div className="flex items-center gap-2.5 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                  <Building2 size={14} className="text-amber-600 flex-none" />
                  <span className="text-sm font-semibold text-amber-900">{mlsMismatchWarning.selectedMls}</span>
                </div>
              </div>
              {/* Agent memberships */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">
                  MLS Memberships on {mlsMismatchWarning.agentName}'s Profile
                </p>
                {mlsMismatchWarning.agentMlsMemberships.length === 0 ? (
                  <div className="px-3 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-400 text-center">
                    No MLS memberships on file for this agent
                  </div>
                ) : (
                  <div className="space-y-2">
                    {mlsMismatchWarning.agentMlsMemberships.map((m, i) => (
                      <div key={i} className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
                        <p className="text-sm font-semibold text-blue-900">{m.mlsName}</p>
                        {m.boardName && <p className="text-xs text-gray-500 mt-0.5">{m.boardName}</p>}
                        {m.mlsMemberNumber && <p className="text-xs text-blue-600 mt-0.5">Member # {m.mlsMemberNumber}</p>}
                        <span className={`badge badge-xs mt-1 ${m.status === 'active' ? 'badge-success' : 'badge-warning'}`}>{m.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-400">
                The selected MLS board doesn't appear to match this agent's memberships. You can proceed anyway or update the agent's profile in Contacts.
              </p>
            </div>
            {/* Footer */}
            <div className="px-5 pb-4 flex gap-2">
              <button onClick={() => setMlsMismatchWarning(null)} className="btn btn-warning btn-sm flex-1 gap-1.5">
                <AlertTriangle size={13} /> Proceed Anyway
              </button>
              <button
                onClick={() => setMlsMismatchWarning(null)}
                className="btn btn-ghost btn-sm flex-1"
              >
                Go Back &amp; Fix
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`fixed inset-0 bg-base-100/60 backdrop-blur-sm z-50 flex items-center justify-center ${showPdfPanel ? 'p-0' : 'p-4'}`}>
        <div className={`bg-base-200 border border-base-300 shadow-2xl flex flex-col ${showPdfPanel ? 'w-full h-screen rounded-none' : 'rounded-2xl w-full max-w-2xl max-h-[90vh]'}`}>

          <div className="flex items-center justify-between p-5 border-b border-base-300 flex-none">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
                <Building2 size={16} className="text-primary" />
              </div>
              <div>
                <h2 className="font-bold text-base-content">Add New Deal</h2>
                <p className="text-xs text-base-content/50">Step {step} of {TOTAL_STEPS} — {stepTitles[step]}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {contractFile && contractObjectUrl && (
                <button
                  onClick={() => setShowPdfPanel(v => !v)}
                  className="text-xs text-green-700 font-semibold border border-green-300 bg-white hover:bg-green-100 rounded px-2 py-1 transition-colors"
                >
                  {showPdfPanel ? 'Hide PDF' : 'View PDF'}
                </button>
              )}
              <Button variant="ghost" square onClick={onClose}><X size={16} /></Button>
            </div>
          </div>

          <div className="px-5 pt-4 pb-2 flex-none">
            <div className="flex items-center gap-0">
              {Array.from({ length: TOTAL_STEPS }, (_, i) => {
                const s = i + 1;
                const isCompleted = s < step;
                const isCurrent = s === step;
                return (
                  <React.Fragment key={s}>
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors flex-none ${
                        isCompleted ? 'bg-primary text-primary-content' :
                        isCurrent ? 'bg-primary/20 text-primary border-2 border-primary' :
                        'bg-base-300 text-base-content/40'
                      }`}
                    >
                      {isCompleted ? <CheckCircle2 size={14} /> : s}
                    </div>
                    {s < TOTAL_STEPS && (
                      <div className={`flex-1 h-0.5 mx-1 rounded ${isCompleted ? 'bg-primary' : 'bg-base-300'}`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          <div className={`flex-1 overflow-hidden min-h-0 flex ${showPdfPanel ? 'flex-row-reverse' : 'flex-col'}`}>
          <div className={showPdfPanel ? 'w-1/2 flex-none overflow-y-auto p-5 border-l border-base-300' : 'flex-1 overflow-y-auto min-h-0 p-5'}>
            {error && <div className="alert alert-error mb-4 text-sm py-2">{error}</div>}

            {step === 1 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin size={18} className="text-primary" />
                  <h3 className="text-lg font-bold text-base-content">Where is the property?</h3>
                </div>

                {/* ── Agent Client search-dropdown ── */}
                <div>
                  <label className="text-xs text-base-content/50 mb-1 block flex items-center gap-1">
                    <User size={11} /> Agent Client <span className="text-red-400 ml-0.5">*</span>
                  </label>
                  {form.agentClientId ? (() => {
                    const ac = agentClients?.find(c => c.id === form.agentClientId);
                    if (!ac) return null;
                    // Compare selected agent name against contract-extracted agent name
                    const buyerAgentName = extractedRawData?.buyerAgentName as string | null | undefined;
                    const sellerAgentName = extractedRawData?.sellerAgentName as string | null | undefined;
                    const hasContractAgents = !!(buyerAgentName || sellerAgentName);
                    const acNameLower = ac.fullName.trim().toLowerCase();
                    let matchRole: 'buyer' | 'seller' | null = null;
                    if (hasContractAgents) {
                      if (buyerAgentName && acNameLower === buyerAgentName.trim().toLowerCase()) matchRole = 'buyer';
                      else if (sellerAgentName && acNameLower === sellerAgentName.trim().toLowerCase()) matchRole = 'seller';
                    }
                    const nameMatch = hasContractAgents ? (matchRole !== null) : null;
                    return (
                      <div className="flex items-center gap-3 px-3 py-2.5 bg-primary/5 border border-primary/30 rounded-xl">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-none">
                          {ac.fullName.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold text-base-content truncate">{ac.fullName}</p>
                            {nameMatch === true && matchRole && (
                              <span title={`Name matches contract ${matchRole === 'buyer' ? "buyer's" : "seller's"} agent`}
                                className="flex-none w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                                <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                                  <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </span>
                            )}
                            {nameMatch === false && (
                              <span title={`Not found in contract agents`}
                                className="flex-none w-4 h-4 rounded-full bg-amber-400 flex items-center justify-center text-white font-bold" style={{ fontSize: 9, lineHeight: 1 }}>
                                !
                              </span>
                            )}
                          </div>
                          {nameMatch === true && matchRole && (
                            <p className="text-xs text-green-600 font-medium mt-0.5">{matchRole === 'buyer' ? "Buyer's Agent" : "Seller's Agent"} on contract</p>
                          )}
                          {!nameMatch && ac.company && <p className="text-xs text-base-content/50 truncate">{ac.company}</p>}
                          {nameMatch === false && (
                            <p className="text-xs text-amber-600 mt-0.5">
                              Contract: {[buyerAgentName && `Buyer — ${buyerAgentName}`, sellerAgentName && `Seller — ${sellerAgentName}`].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => { setForm(p => ({ ...p, agentClientId: '' })); setClientSearch(''); }}
                          className="btn btn-ghost btn-xs btn-square"
                        ><X size={12} /></button>
                      </div>
                    );
                  })() : (
                    <div className="relative" ref={clientSearchRef}>
                      <input
                        className="input input-bordered w-full pr-8"
                        placeholder="Search agent clients..."
                        value={clientSearch}
                        onChange={e => { setClientSearch(e.target.value); setClientDropdownOpen(true); }}
                        onFocus={() => setClientDropdownOpen(true)}
                      />
                      {clientDropdownOpen && (
                        <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-base-100 border border-base-300 rounded-xl shadow-xl overflow-hidden max-h-52 overflow-y-auto">
                          {(() => {
                            const filtered = (agentClients || []).filter(c =>
                              !clientSearch.trim() ||
                              c.fullName.toLowerCase().includes(clientSearch.toLowerCase()) ||
                              (c.company || '').toLowerCase().includes(clientSearch.toLowerCase())
                            );
                            if (filtered.length === 0) return (
                              <div className="px-4 py-3 text-sm text-base-content/40 text-center">
                                No agent clients found
                              </div>
                            );
                            return filtered.map(c => (
                              <button
                                key={c.id}
                                type="button"
                                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-primary/5 transition-colors text-left border-b border-base-200 last:border-0"
                                onClick={() => selectAgentClient(c.id)}
                              >
                                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-none">
                                  {c.fullName.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-base-content truncate">{c.fullName}</p>
                                  {c.company && <p className="text-xs text-base-content/40 truncate">{c.company}</p>}
                                </div>
                              </button>
                            ));
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Extracted agent name reference fields ── */}
                {extractedRawData && (
                  <div className="mt-2 rounded-lg border border-base-300 bg-base-200/50 px-3 py-2 space-y-1">
                    <p className="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-1">From Contract</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-base-content/50 w-28 flex-none">Buyer Agent:</span>
                      <span className="text-xs font-medium text-base-content">
                        {(extractedRawData.buyerAgentName as string) || <span className="text-base-content/30 italic">Not found</span>}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-base-content/50 w-28 flex-none">Seller Agent:</span>
                      <span className="text-xs font-medium text-base-content">
                        {(extractedRawData.sellerAgentName as string) || <span className="text-base-content/30 italic">Not found</span>}
                      </span>
                    </div>
                    {mlsPropertyData?.listingAgentName && (
                      <div className="flex items-center gap-2 pt-1 border-t border-base-300 mt-1">
                        <span className="text-xs text-base-content/50 w-28 flex-none">MLS Listing Agent:</span>
                        <span className="text-xs font-medium text-base-content">{mlsPropertyData.listingAgentName}</span>
                      </div>
                    )}
                  </div>
                )}

                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                    dragOver ? 'border-primary bg-primary/10' : 'border-base-300 bg-base-100 hover:border-primary/50 hover:bg-primary/5'
                  }`}
                >
                  <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileChange} />
                  {extracting ? (
                    <div className="flex items-center justify-center gap-2 py-1">
                      <Loader2 size={16} className="animate-spin text-primary" />
                      <span className="text-sm text-primary font-medium">Extracting deal data...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2 py-1">
                      <Upload size={15} className="text-base-content/40" />
                      <span className="text-sm text-base-content/60">
                        <span className="font-semibold text-primary">Drop a contract / agreement</span>{' '}or click to upload
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-base-content/30">
                  <div className="flex-1 h-px bg-base-300" />
                  <span>or enter manually</span>
                  <div className="flex-1 h-px bg-base-300" />
                </div>
                <div>
                  <label className="text-xs text-base-content/50 mb-1 block">Street Address *</label>
                  <input className="input input-bordered w-full no-spinner" value={form.address} onChange={f('address')} placeholder="123 Main St" autoFocus />
                  {dualAddressMatch && !splitDone && (
                    <div className="mt-2 flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                      <Building2 size={14} className="text-amber-600 shrink-0" />
                      <span className="text-xs text-amber-700 flex-1">Dual address detected — this looks like a duplex.</span>
                      <button
                        type="button"
                        onClick={handleSplitAddress}
                        className="btn btn-xs bg-amber-500 hover:bg-amber-600 text-white border-0 gap-1"
                      >
                        <Building2 size={12} /> Split Address
                      </button>
                    </div>
                  )}
                  {splitDone && (
                    <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                      <div className="flex items-center gap-2 mb-1">
                        <Building2 size={14} className="text-amber-600 shrink-0" />
                        <span className="text-xs font-semibold text-amber-700">Duplex — two addresses</span>
                        <button
                          type="button"
                          onClick={() => { setSplitDone(false); setForm(p => ({ ...p, propertyType: 'single-family', duplexAddressCount: '', secondaryAddress: '' })); }}
                          className="ml-auto text-xs text-amber-500 hover:text-amber-700 underline"
                        >Undo</button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-amber-700 mb-1 block">Unit A</label>
                          <input
                            className="input input-bordered input-sm w-full"
                            value={form.address}
                            onChange={f('address')}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-amber-700 mb-1 block">Unit B</label>
                          <input
                            className="input input-bordered input-sm w-full"
                            value={form.secondaryAddress}
                            onChange={f('secondaryAddress')}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">City *</label>
                    <input className="input input-bordered w-full no-spinner" value={form.city} onChange={f('city')} placeholder="Enter city" />
                  </div>
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">State</label>
                    <input className="input input-bordered w-full no-spinner" value={form.state} onChange={f('state')} placeholder="ST" maxLength={2} />
                  </div>
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">ZIP</label>
                    <input className="input input-bordered w-full no-spinner" value={form.zipCode} onChange={f('zipCode')} placeholder="00000" />
                  </div>
                </div>
                {/* MLS Board + MLS Number */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">MLS Board *</label>
                    {form.state && MLS_BY_STATE[form.state.toUpperCase()] ? (
                      <select
                        className="select select-bordered w-full"
                        value={form.mlsBoard}
                        onChange={e => {
                          const val = e.target.value;
                          setForm(p => ({ ...p, mlsBoard: val, isHeartlandMls: /heartland/i.test(val) }));
                          setMlsBoardDetectedSource(null); // TC overrode manually
                          if (form.agentClientId) checkMlsMismatch(form.agentClientId, val);
                        }}
                      >
                        <option value="">— Select MLS Board —</option>
                        {MLS_BY_STATE[form.state.toUpperCase()].map(mls => (
                          <option key={mls} value={mls}>{mls}</option>
                        ))}
                        <option value="Other">Other</option>
                      </select>
                    ) : (
                      <input
                        className="input input-bordered w-full no-spinner"
                        value={form.mlsBoard}
                        onChange={e => {
                          const val = e.target.value;
                          setForm(p => ({ ...p, mlsBoard: val, isHeartlandMls: /heartland/i.test(val) }));
                          if (form.agentClientId && val.length > 3) checkMlsMismatch(form.agentClientId, val);
                        }}
                        placeholder="Enter MLS board name"
                      />
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">MLS Number</label>
                    <div className="flex gap-2 items-center">
                      <input
                        className="input input-bordered w-full no-spinner"
                        value={form.mlsNumber}
                        onChange={e => {
                          setMlsFetchStatus('');
                          setForm(p => ({ ...p, mlsNumber: e.target.value }));
                        }}
                        placeholder="000000"
                      />
                      <button
                        type="button"
                        className="btn btn-sm btn-outline whitespace-nowrap flex-shrink-0"
                        disabled={mlsFetching || !form.address.trim() || !form.city.trim()}
                        onClick={fetchMlsNumber}
                        title={!form.address.trim() || !form.city.trim() ? 'Enter address first' : 'Search for MLS # using AI'}
                      >
                        {mlsFetching ? (
                          <span className="loading loading-spinner loading-xs" />
                        ) : mlsFetchStatus === 'found' && form.mlsNumber ? (
                          <span className="text-success">✓ Found</span>
                        ) : mlsFetchStatus === 'found' && !form.mlsNumber ? (
                          <span className="text-warning">Found, no MLS#</span>
                        ) : mlsFetchStatus === 'not_found' ? (
                          <span className="text-error">Not found</span>
                        ) : (
                          'Fetch MLS #'
                        )}
                      </button>
                    </div>
                    {mlsFetchStatus === 'not_found' && (
                      <p className="text-xs text-error mt-1">Couldn't find it — enter manually</p>
                    )}
                    {mlsFetchStatus === 'found' && form.secondaryAddress?.trim() && (
                      <p className="text-xs text-success mt-1">Searched both unit addresses</p>
                    )}
                  </div>
                </div>
                {mlsBoardDetectedSource && form.mlsBoard && (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium ${mlsBoardDetectedSource === 'mls' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
                    {mlsBoardDetectedSource === 'mls' ? (
                      <><span>✓</span><span>MLS board confirmed from listing data</span></>
                    ) : (
                      <><span>✦</span><span>Auto-detected from contract — verify if needed</span></>
                    )}
                  </div>
                )}
                {form.isHeartlandMls && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                    <span className="text-xs text-amber-700 font-medium">Heartland MLS detected — earnest money rule will apply in Financials</span>
                  </div>
                )}
                {/* Legal Description */}
                <div>
                  <label className="text-xs text-base-content/50 mb-1 block">Legal Description</label>
                  <textarea
                    className="textarea textarea-bordered w-full text-sm resize-none"
                    rows={3}
                    value={form.legalDescription}
                    onChange={e => setForm(p => ({ ...p, legalDescription: e.target.value }))}
                    placeholder="e.g. Lot 14, Block 3, Sunset Ridge Subdivision, Johnson County, MO"
                  />
                  <p className="text-xs text-base-content/40 mt-0.5">Extracted from contract automatically when uploaded — verify against title commitment</p>
                </div>

                {/* Counter Offer */}
                <div>
                  <label className="text-xs text-base-content/50 mb-2 block font-medium">Was there a counter offer?</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setForm(p => ({ ...p, hasCounterOffer: true }))}
                      className={`flex-1 py-2 rounded-xl border-2 font-medium text-sm transition-all ${
                        form.hasCounterOffer === true
                          ? 'bg-amber-500 border-amber-500 text-white'
                          : 'bg-base-100 border-base-300 text-base-content/70 hover:border-amber-400'
                      }`}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm(p => ({ ...p, hasCounterOffer: false }))}
                      className={`flex-1 py-2 rounded-xl border-2 font-medium text-sm transition-all ${
                        form.hasCounterOffer === false
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'bg-base-100 border-base-300 text-base-content/70 hover:border-primary/40'
                      }`}
                    >
                      No
                    </button>
                  </div>
                  {form.hasCounterOffer && (
                    <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                      <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                      <span className="text-xs text-amber-700 font-medium">A task will be created to review counter offer numbers</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === 2 && (
              <StepExtractedData
                extractedData={extractedRawData}
                onConfirm={() => setStep(3)}
                onEdit={() => setStep(3)}
                onReExtract={() => setStep(1)}
              />
            )}

            {step === 3 && (
              <StepDealContacts
                participants={wizardParticipants}
                onChange={setWizardParticipants}
                transactionType={form.transactionType as 'buyer' | 'seller'}
                orgId={undefined}
                allContacts={allContacts}
              />
            )}

            {step === 4 && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-base-content">What type of property?</h3>
                {/* MLS Property Data Card */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-base-content/50 uppercase tracking-wide">System Found</label>
                  
                  {/* Disclaimer */}
                  <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
                    <AlertTriangle size={13} className="mt-0.5 flex-none" />
                    <span>This information is sourced from public MLS listings and may not be accurate or up to date. Always verify with official sources before use.</span>
                  </div>

                  {mlsPropertyData ? (
                    <div className="rounded-xl border border-info/30 bg-info/5 p-4 space-y-3">
                      {/* Status + Type row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {mlsPropertyData.listingStatus && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            mlsPropertyData.listingStatus === 'Active' ? 'bg-green-100 text-green-700' :
                            mlsPropertyData.listingStatus === 'Pending' ? 'bg-amber-100 text-amber-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>{mlsPropertyData.listingStatus}</span>
                        )}
                        {mlsPropertyData.propertyType && (
                          <span className="text-sm font-semibold text-base-content">{mlsPropertyData.propertyType}</span>
                        )}
                        {mlsPropertyData.daysOnMarket != null && (
                          <span className="text-xs text-base-content/50 ml-auto">DOM: {mlsPropertyData.daysOnMarket} days</span>
                        )}
                      </div>

                      {/* MLS Number */}
                      {mlsPropertyData.mlsNumber && (
                        <div className="text-xs text-base-content/50">MLS #: <span className="font-mono font-semibold text-base-content">{mlsPropertyData.mlsNumber}</span></div>
                      )}

                      {/* Price */}
                      {mlsPropertyData.listPrice != null && (
                        <div className="text-xl font-bold text-base-content">
                          ${mlsPropertyData.listPrice.toLocaleString()}
                        </div>
                      )}

                      {/* Beds / Baths / Sqft / Year */}
                      <div className="flex flex-wrap gap-3 text-sm text-base-content/70">
                        {mlsPropertyData.bedrooms != null && <span><span className="font-semibold text-base-content">{mlsPropertyData.bedrooms}</span> bed</span>}
                        {mlsPropertyData.bathrooms != null && <span><span className="font-semibold text-base-content">{mlsPropertyData.bathrooms}</span> bath</span>}
                        {mlsPropertyData.sqftLiving != null && <span><span className="font-semibold text-base-content">{mlsPropertyData.sqftLiving.toLocaleString()}</span> sqft</span>}
                        {mlsPropertyData.yearBuilt != null && <span>Built <span className="font-semibold text-base-content">{mlsPropertyData.yearBuilt}</span></span>}
                      </div>

                      {/* Subdivision / HOA / Garage / Pool */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-base-content/60">
                        {mlsPropertyData.subdivision && <span>📍 {mlsPropertyData.subdivision}</span>}
                        {mlsPropertyData.hoaFee != null && <span>HOA: ${mlsPropertyData.hoaFee}/mo</span>}
                        {mlsPropertyData.garage && <span>🚗 {mlsPropertyData.garage}</span>}
                        {mlsPropertyData.pool === true && <span>🏊 Pool</span>}
                      </div>

                      {/* Listing Agent / Office */}
                      {(mlsPropertyData.listingAgentName || mlsPropertyData.listingOfficeName) && (
                        <div className="pt-2 border-t border-info/20 text-xs text-base-content/50">
                          {mlsPropertyData.listingAgentName && <span>Agent: <span className="text-base-content/70 font-medium">{mlsPropertyData.listingAgentName}</span></span>}
                          {mlsPropertyData.listingAgentName && mlsPropertyData.listingOfficeName && <span className="mx-2">·</span>}
                          {mlsPropertyData.listingOfficeName && <span>Office: <span className="text-base-content/70 font-medium">{mlsPropertyData.listingOfficeName}</span></span>}
                        </div>
                      )}
                    </div>
                  ) : mlsFetchStatus === 'not_found' ? (
                    <div className="px-4 py-2.5 rounded-lg border bg-base-200 border-base-300 text-sm text-base-content/40 italic">
                      No active listing found
                    </div>
                  ) : (
                    <div className="px-4 py-2.5 rounded-lg border bg-base-200 border-base-300 text-sm text-base-content/40 italic">
                      Run MLS lookup on Step 1 to populate
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {PROP_TYPES.map(pt => (
                    <button
                      key={pt.type}
                      onClick={() => handlePropertyTypeChange(pt.type)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 font-semibold text-sm transition-all ${
                        form.propertyType === pt.type
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'bg-base-100 border-base-300 text-base-content/70 hover:border-primary/40'
                      }`}
                    >
                      {pt.icon}
                      <span>{pt.label}</span>
                    </button>
                  ))}
                </div>

                {isMF && (
                  <div className="alert alert-warning py-2 text-sm gap-2">
                    <AlertTriangle size={14} /> Multi-Family selected — a Multi-Family Addendum alert will be auto-created.
                  </div>
                )}

                {isDuplex && (
                  <div className="space-y-4 pt-3 border-t border-base-300">
                    <div>
                      <p className="text-sm font-semibold text-base-content mb-3">
                        Does this duplex have <span className="text-primary">1 address</span> or <span className="text-primary">2 addresses</span>?
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => setForm(p => ({ ...p, duplexAddressCount: '1', secondaryAddress: '' }))}
                          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-semibold text-sm transition-all ${
                            form.duplexAddressCount === '1'
                              ? 'bg-primary/10 border-primary text-primary'
                              : 'bg-base-100 border-base-300 text-base-content/70 hover:border-primary/40'
                          }`}
                        >
                          <Home size={16} />
                          1 Address
                        </button>
                        <button
                          onClick={() => setForm(p => ({ ...p, duplexAddressCount: '2' }))}
                          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-semibold text-sm transition-all ${
                            form.duplexAddressCount === '2'
                              ? 'bg-primary/10 border-primary text-primary'
                              : 'bg-base-100 border-base-300 text-base-content/70 hover:border-primary/40'
                          }`}
                        >
                          <Building2 size={16} />
                          2 Addresses
                        </button>
                      </div>
                    </div>

                    {hasTwoAddresses && (
                      <div className="space-y-3 p-4 bg-base-100 rounded-xl border border-base-300">
                        <p className="text-xs font-semibold text-base-content/50 uppercase tracking-wide">Unit Addresses</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-base-content/50 mb-1 block">Unit A — Primary</label>
                            <input className="input input-bordered input-sm w-full" value={form.address} onChange={f('address')} placeholder="123 Main St" />
                          </div>
                          <div>
                            <label className="text-xs text-base-content/50 mb-1 block">Unit B — Second</label>
                            <input className="input input-bordered input-sm w-full" value={form.secondaryAddress} onChange={f('secondaryAddress')} placeholder="125 Main St" autoFocus />
                          </div>
                        </div>
                        <p className="text-xs text-base-content/40">
                          Usually just the house number changes — e.g. 2121 and 2123 Askew Ave. Both addresses will be used when matching emails to this deal.
                        </p>
                      </div>
                    )}

                    {form.duplexAddressCount === '1' && (
                      <div className="p-3 bg-base-100 rounded-xl border border-base-300">
                        <p className="text-xs text-base-content/50">
                          Using <span className="font-semibold text-base-content">{form.address || 'the address from Step 1'}</span> as the single duplex address.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-base-content">Which side of the transaction?</h3>
                <div className="flex gap-4">
                  <button
                    onClick={() => setForm(p => ({ ...p, transactionType: 'buyer' }))}
                    className={`flex-1 flex flex-col items-center gap-3 p-6 rounded-xl border-2 font-semibold transition-all ${
                      form.transactionType === 'buyer'
                        ? 'bg-blue-500 border-blue-500 text-white'
                        : 'bg-blue-50 border-blue-200 text-blue-600 hover:border-blue-400'
                    }`}
                  >
                    <ShoppingCart size={28} />
                    <span className="text-lg">Buyer Side</span>
                  </button>
                  <button
                    onClick={() => setForm(p => ({ ...p, transactionType: 'seller' }))}
                    className={`flex-1 flex flex-col items-center gap-3 p-6 rounded-xl border-2 font-semibold transition-all ${
                      form.transactionType === 'seller'
                        ? 'bg-green-500 border-green-500 text-white'
                        : 'bg-green-50 border-green-200 text-green-600 hover:border-green-400'
                    }`}
                  >
                    <Tag size={28} />
                    <span className="text-lg">Seller Side</span>
                  </button>
                </div>
              </div>
            )}

            {step === 6 && (
              <div style={form.isHeartlandMls ? {display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1.5rem',alignItems:'start'} : {}}>
              <div className="space-y-5">
                <h3 className="text-lg font-bold text-base-content">Financial Details</h3>
                {(form.mlsBoard || form.mlsNumber) && (
                  <div className="flex items-center gap-3 px-3 py-2 bg-base-200 rounded-lg text-xs text-base-content/60">
                    {form.mlsBoard && <span><span className="font-medium text-base-content/80">MLS Board:</span> {form.mlsBoard}</span>}
                    {form.mlsNumber && <span><span className="font-medium text-base-content/80">MLS #:</span> {form.mlsNumber}</span>}
                    {form.isHeartlandMls && <span className="ml-auto text-amber-600 font-medium">Heartland MLS rule active</span>}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">List Price</label>
                    <input className="input input-bordered w-full no-spinner" value={form.listPrice} onChange={f('listPrice')} placeholder="550000" type="number" />
                  </div>
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">Contract Price</label>
                    <input className="input input-bordered w-full no-spinner" value={form.purchasePrice} onChange={fWithRecalc('purchasePrice')} placeholder="540000" type="number" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-base-content/50 mb-2 block">Loan Type</label>
                  <div className="flex flex-wrap gap-2">
                    {(['conventional','fha','va','usda','cash','other'] as const).map(lt => (
                      <button
                        key={lt}
                        type="button"
                        onClick={() => setForm(p => ({ ...p, loanType: p.loanType === lt ? '' : lt }))}
                        className={`btn btn-sm rounded-full font-medium ${form.loanType === lt ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
                      >
                        {lt === 'fha' ? 'FHA' : lt === 'va' ? 'VA' : lt === 'usda' ? 'USDA' : lt.charAt(0).toUpperCase() + lt.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                {form.loanType && form.loanType !== 'cash' && (
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-base-content/50 mb-1 block">Loan Amount</label>
                      <input className="input input-bordered w-full no-spinner" value={form.loanAmount} onChange={fWithRecalc('loanAmount')} placeholder="0" type="number" />
                    </div>
                    <div>
                      <label className="text-xs text-base-content/50 mb-1 block">
                        Down Payment ${form.isHeartlandMls ? <span className="text-amber-600"> (excl. EM)</span> : null}
                      </label>
                      <input className="input input-bordered w-full no-spinner" value={form.downPaymentAmount}
                        onChange={e => {
                          const amt = e.target.value;
                          const price = parseFloat(form.purchasePrice) || parseFloat(form.listPrice) || 0;
                          const em = form.isHeartlandMls ? (parseFloat(form.earnestMoney) || 0) : 0;
                          const total = (parseFloat(amt) || 0) + em;
                          const pct = price > 0 && amt ? ((total / price) * 100).toFixed(1) : '';
                          setForm(p => ({ ...p, downPaymentAmount: amt, downPaymentPercent: pct }));
                        }}
                        placeholder="0" type="number" />
                    </div>
                    <div>
                      <label className="text-xs text-base-content/50 mb-1 block">
                        Down Payment %{form.isHeartlandMls ? <span className="text-amber-600"> (incl. EM)</span> : null}
                      </label>
                      <input className="input input-bordered w-full no-spinner" value={form.downPaymentPercent}
                        onChange={e => {
                          const pct = e.target.value;
                          const price = parseFloat(form.purchasePrice) || parseFloat(form.listPrice) || 0;
                          const loan = parseFloat(form.loanAmount) || 0;
                          const em = form.isHeartlandMls ? (parseFloat(form.earnestMoney) || 0) : 0;
                          if (price > 0 && pct) {
                            // Contract price known: amount = price × %
                            const totalAmt = calcCommissionAmount(price, parseFloat(pct));
                            const amt = Math.max(0, totalAmt - em).toFixed(0);
                            setForm(p => ({ ...p, downPaymentPercent: pct, downPaymentAmount: amt }));
                          } else if (loan > 0 && pct) {
                            // No contract price: derive it from loan / (1 - %)
                            const derivedPrice = loan / (1 - parseFloat(pct) / 100);
                            const totalDown = derivedPrice * (parseFloat(pct) / 100);
                            const amt = Math.max(0, totalDown - em).toFixed(0);
                            setForm(p => ({ ...p, downPaymentPercent: pct, downPaymentAmount: amt, purchasePrice: derivedPrice.toFixed(2) }));
                          } else {
                            setForm(p => ({ ...p, downPaymentPercent: pct, downPaymentAmount: '' }));
                          }
                        }}
                        placeholder="0" type="number" step="0.1" />
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">Earnest Money $</label>
                    <input className="input input-bordered w-full no-spinner" value={form.earnestMoney}
                      onChange={e => {
                        const em = e.target.value;
                        if (form.isHeartlandMls) {
                          const price = parseFloat(form.purchasePrice) || parseFloat(form.listPrice) || 0;
                          const dp = parseFloat(form.downPaymentAmount) || 0;
                          const total = dp + (parseFloat(em) || 0);
                          const pct = price > 0 && (dp || parseFloat(em)) ? ((total / price) * 100).toFixed(1) : form.downPaymentPercent;
                          setForm(p => ({ ...p, earnestMoney: em, downPaymentPercent: pct }));
                        } else {
                          setForm(p => ({ ...p, earnestMoney: em }));
                        }
                      }}
                      placeholder="0" type="number" />
                    <p className="text-xs text-base-content/40 mt-1">EM due date set in Key Dates step</p>
                  </div>
                </div>
                {form.isHeartlandMls && form.downPaymentAmount && form.earnestMoney && (() => {
                  const dp = parseFloat(form.downPaymentAmount) || 0;
                  const em = parseFloat(form.earnestMoney) || 0;
                  const total = dp + em;
                  const price = parseFloat(form.purchasePrice) || parseFloat(form.listPrice) || 0;
                  const pct = price > 0 ? ((total / price) * 100).toFixed(1) : null;
                  return (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm flex items-center gap-3 flex-wrap">
                      <span className="text-amber-700 font-semibold">Heartland MLS — Effective Down Payment:</span>
                      <span className="text-amber-800 font-bold">${total.toLocaleString()}</span>
                      {pct && <span className="text-amber-700">({pct}% of purchase price)</span>}
                      <span className="text-amber-600 text-xs ml-auto">${dp.toLocaleString()} down + ${em.toLocaleString()} EM</span>
                    </div>
                  );
                })()}


                {/* Client Agent Commission */}
                <div className="border-t border-base-300 pt-4">
                  <p className="text-xs text-base-content/50 font-semibold uppercase mb-3">Client Agent Commission</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-base-content/40 mb-1 block">Commission $</label>
                      <div className="join w-full">
                        <span className="join-item bg-base-200 border border-base-300 px-3 flex items-center text-sm font-medium">$</span>
                        <input className="input input-bordered join-item w-full no-spinner" value={form.commissionAmount}
                          onChange={e => {
                            const raw = e.target.value.replace(/[^0-9.]/g, '');
                            const price = parseFloat(form.purchasePrice) || parseFloat(form.listPrice) || 0;
                            const pct = price > 0 && raw ? (calcCommissionPct(price, parseFloat(raw))).toFixed(1) : '';
                            setForm(p => ({ ...p, commissionAmount: raw, clientAgentCommissionPct: pct }));
                          }}
                          onBlur={e => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) setForm(p => ({ ...p, commissionAmount: val.toFixed(2) }));
                          }}
                          placeholder="0.00" type="text" inputMode="decimal" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-base-content/40 mb-1 block">Commission % of Purchase Price</label>
                      <div className="join w-full">
                        <input className="input input-bordered join-item w-full no-spinner" value={form.clientAgentCommissionPct}
                          onChange={e => {
                            const raw = e.target.value.replace(/[^0-9.]/g, '');
                            const price = parseFloat(form.purchasePrice) || parseFloat(form.listPrice) || 0;
                            const amt = price > 0 && raw ? calcCommissionAmount(price, parseFloat(raw)).toFixed(2) : '';
                            setForm(p => ({ ...p, clientAgentCommissionPct: raw, commissionAmount: amt }));
                          }}
                          onBlur={e => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) setForm(p => ({ ...p, clientAgentCommissionPct: val.toFixed(1) }));
                          }}
                          placeholder="0.0" type="text" inputMode="decimal" />
                        <span className="join-item bg-base-200 border border-base-300 px-3 flex items-center text-sm font-medium">%</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-base-300 pt-4">
                  <p className="text-xs text-base-content/50 font-semibold uppercase mb-3">Contract Conditions</p>
                  <div className="space-y-2">
                    {([
                      { key: 'asIsSale', label: 'As-Is Sale' },
                      { key: 'inspectionWaived', label: 'Inspection Waived' },
                    ] as const).map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-3 cursor-pointer py-1">
                        <input type="checkbox" className="toggle toggle-primary toggle-sm"
                          checked={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.checked }))} />
                        <span className="text-sm">{label}</span>
                      </label>
                    ))}
                    <label className="flex items-center gap-3 cursor-pointer py-1">
                      <input type="checkbox" className="toggle toggle-primary toggle-sm"
                        checked={form.homeWarranty} onChange={e => setForm(p => ({ ...p, homeWarranty: e.target.checked }))} />
                      <span className="text-sm">Home Warranty</span>
                    </label>
                    {form.homeWarranty && (
                      <input className="input input-bordered w-full input-sm mt-1" value={form.homeWarrantyCompany}
                        onChange={f('homeWarrantyCompany')} placeholder="Warranty company name" />
                    )}
                  </div>
                </div>
              </div>
              {/* Heartland Contract Reference Panel */}
                {form.isHeartlandMls && (
                  <ContractReferencePanel
                    contractPrice={form.purchasePrice}
                    listPrice={form.listPrice}
                    loanAmount={form.loanAmount}
                    earnestMoney={form.earnestMoney}
                    downPaymentAmount={form.downPaymentAmount}
                    downPaymentPercent={form.extractedDpPct || form.downPaymentPercent}
                    loanType={form.loanType}
                    clientAgentCommission={form.commissionAmount}
                    clientAgentCommissionPct={form.clientAgentCommissionPct}
                    sellerConcessions={form.sellerConcessions}
                    sellerCredit={form.sellerCredit || ''}
                    additionalSellerCosts={form.additionalSellerCosts || ''}
                  />
                )}
              </div>
            )}

            {step === 7 && (() => {
              const presetBtn = (label: string, field: keyof typeof form, days: number) => (
                <button key={label} type="button"
                  className={`btn btn-xs ${form[field] === calcDate(form.contractDate, days) ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
                  onClick={() => setForm(p => ({ ...p, [field]: calcDate(p.contractDate, days) }))}
                  disabled={!form.contractDate}
                >{label}</button>
              );
              const dateRow = (
                field: keyof typeof form,
                label: string,
                presets: { label: string; days: number }[],
              ) => (
                <div className="space-y-1">
                  <label className="text-xs text-base-content/50 font-semibold block">{label}</label>
                  <div className="flex flex-wrap gap-1 mb-1">
                    {presets.map(p => presetBtn(p.label, field, p.days))}
                  </div>
                  <input type="date" className="input input-bordered w-full input-sm"
                    value={form[field] as string}
                    onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                  />
                  {(form[field] as string) && <p className="text-xs text-base-content/40">{formatDisplayDate(form[field] as string)}</p>}
                </div>
              );
              return (
                <div className="space-y-5">
                  <h3 className="text-lg font-bold text-base-content">Key Dates</h3>
                  {/* Contract + Closing side by side — anchor dates */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-base-content/50 font-semibold block mb-1">Contract Date</label>
                      <input type="date" className="input input-bordered w-full input-sm" value={form.contractDate}
                        onChange={e => {
                          const cd = e.target.value;
                          setForm(p => ({
                            ...p, contractDate: cd,
                            possessionDate: p.possessionAtClosing ? p.closingDate : p.possessionDate,
                          }));
                        }} />
                      {form.contractDate && <p className="text-xs text-base-content/40 mt-1">{formatDisplayDate(form.contractDate)}</p>}
                    </div>
                    <div>
                      <label className="text-xs text-base-content/50 font-semibold block mb-1">Closing Date *</label>
                      <input type="date" className="input input-bordered w-full input-sm" value={form.closingDate}
                        onChange={e => {
                          const cd = e.target.value;
                          setForm(p => ({
                            ...p, closingDate: cd,
                            possessionDate: p.possessionAtClosing ? cd : p.possessionDate,
                          }));
                        }} />
                      {form.closingDate && <p className="text-xs text-base-content/40 mt-1">{formatDisplayDate(form.closingDate)}</p>}
                    </div>
                  </div>
                  <p className="text-xs text-base-content/40 -mt-2">All calculated dates are counted from Contract Date</p>

                  {/* EM Date */}
                  {dateRow('earnestMoneyDueDate', 'EM Due Date', [
                    { label: '1d', days: 1 }, { label: '3d', days: 3 }, { label: '5d', days: 5 }, { label: '7d', days: 7 },
                  ])}

                  {/* Inspection */}
                  {dateRow('inspectionDate', 'Inspection Date', [
                    { label: '7d', days: 7 }, { label: '10d', days: 10 }, { label: '14d', days: 14 },
                  ])}

                  {/* Loan Commitment */}
                  {form.loanType && form.loanType !== 'cash' && dateRow('financeDeadline', 'Finance Deadline', [
                    { label: '21d', days: 21 }, { label: '30d', days: 30 },
                  ])}

                  {/* Title Date */}
                  {dateRow('titleDate', 'Title / Clear to Close', [
                    { label: '14d', days: 14 }, { label: '21d', days: 21 }, { label: '30d', days: 30 },
                  ])}

                  {/* Possession Date — manual or At Closing */}
                  <div className="space-y-1">
                    <label className="text-xs text-base-content/50 font-semibold block">Possession Date</label>
                    <div className="flex gap-2 mb-1">
                      <button type="button"
                        className={`btn btn-xs ${form.possessionAtClosing ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
                        onClick={() => setForm(p => ({ ...p, possessionAtClosing: !p.possessionAtClosing, possessionDate: !p.possessionAtClosing ? p.closingDate : p.possessionDate }))}
                      >At Closing</button>
                    </div>
                    <input type="date" className="input input-bordered w-full input-sm"
                      value={form.possessionAtClosing ? form.closingDate : form.possessionDate}
                      disabled={form.possessionAtClosing}
                      onChange={e => setForm(p => ({ ...p, possessionDate: e.target.value }))}
                    />
                    {(form.possessionAtClosing ? form.closingDate : form.possessionDate) &&
                      <p className="text-xs text-base-content/40">{form.possessionAtClosing ? 'Same as closing date' : formatDisplayDate(form.possessionDate)}</p>}
                  </div>
                </div>
              );
            })()}

            {step === 8 && (
              <div className="space-y-5">
                <h3 className="text-lg font-bold text-base-content">Our Client &amp; Parties</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">Buyer Name(s)</label>
                    <input className="input input-bordered w-full no-spinner" value={form.buyerNames} onChange={f('buyerNames')} placeholder="John &amp; Jane Doe" />
                  </div>
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">Seller Name(s)</label>
                    <input className="input input-bordered w-full no-spinner" value={form.sellerNames} onChange={f('sellerNames')} placeholder="Bob Smith" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">EM Held With</label>
                    <input className="input input-bordered w-full no-spinner" value={form.titleCompany} onChange={e => setForm(p => ({ ...p, titleCompany: e.target.value, emHeldWith: e.target.value }))} placeholder="ABC Title Co." />
                    {form.titleCompany && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="text-xs text-base-content/50">Side:</span>
                        <div className="join">
                          {(['buy', 'sell', 'both'] as const).map(s => {
                            const effective = form.titleCompanySide || (form.transactionType === 'buyer' ? 'buy' : 'sell');
                            return (
                              <button
                                key={s}
                                type="button"
                                className={`join-item btn btn-xs ${effective === s ? 'btn-primary' : 'btn-outline'}`}
                                onClick={() => setForm(p => ({ ...p, titleCompanySide: s }))}
                              >{s === 'buy' ? 'Buy' : s === 'sell' ? 'Sell' : 'Both'}</button>
                            );
                          })}
                        </div>
                        {!form.titleCompanySide && <span className="text-xs text-base-content/40 italic">auto</span>}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">Lender / Loan Officer</label>
                    <input className="input input-bordered w-full no-spinner" value={form.loanOfficer} onChange={f('loanOfficer')} placeholder="Jane Smith – First Bank" />
                  </div>
                </div>
                <div className="border-t border-base-300 pt-4">
                  <p className="text-xs text-base-content/50 font-semibold uppercase mb-3">Agent Client</p>
                </div>
                <div>
                  {selectedClient ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 px-3 py-2.5 bg-green-50 border border-green-200 rounded-xl">
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-xs font-bold text-green-700 flex-none">
                          {selectedClient.fullName.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-base-content truncate">{selectedClient.fullName}</p>
                          {selectedClient.company && <p className="text-xs text-base-content/50 truncate">{selectedClient.company}</p>}
                        </div>
                        <CheckCircle2 size={16} className="text-green-500 flex-none" />
                      </div>
                      {(() => {
                        if (!complianceTemplates) return null;
                        const tpl = complianceTemplates.find(t =>
                          (t.agentClientIds ?? (t.agentClientId ? [t.agentClientId] : [])).includes(selectedClient.id)
                        );
                        return tpl
                          ? <p className="text-xs text-green-600 pl-1">✓ {tpl.items.length} compliance items will be loaded from this client's template</p>
                          : null;
                      })()}
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl border border-dashed border-amber-300 bg-amber-50 text-sm text-amber-700 text-center">
                      No agent client selected — go back to Step 1 to choose one.
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs text-base-content/50 mb-1 flex items-center gap-1">
                    <FileText size={12} /> Special Notes
                    <span className="text-base-content/30 ml-1">(optional)</span>
                  </label>
                  <textarea
                    className={`textarea textarea-bordered w-full text-sm resize-none transition-all duration-300 ${
                      form.specialNotes.trim()
                        ? 'border-red-500 shadow-[0_0_12px_2px_rgba(239,68,68,0.4)]'
                        : ''
                    }`}
                    rows={4}
                    value={form.specialNotes}
                    onChange={e => setForm(p => ({ ...p, specialNotes: e.target.value }))}
                    placeholder="Any special instructions for this transaction that the TC team should know about..."
                  />
                  <p className="text-xs text-base-content/30 mt-1">These notes will be visible on the deal and help guide your TC team.</p>
                </div>
              </div>
            )}

            {/* ── Step 9: Title & Escrow ── */}
            {step === 9 && (() => {
              const selectedTitleContact =
                allContacts.find(c => c.id === form.titleContactId) ??
                (form.titleContactEmail && titleParticipantFallback ? titleParticipantFallback as any : null);
              const filteredContacts = allContacts.filter(c =>
                !titleSearch.trim() ||
                c.fullName.toLowerCase().includes(titleSearch.toLowerCase()) ||
                (c.company || '').toLowerCase().includes(titleSearch.toLowerCase())
              );
              return (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <BuildingIcon size={18} className="text-primary" />
                    <h3 className="text-lg font-bold text-base-content">Title &amp; Escrow</h3>
                  </div>
                  <p className="text-sm text-base-content/60">Select the title or escrow company for this deal. You can also send them an intro email right now.</p>

                  {/* Title contacts added in Step 3 — shown as quick-select cards */}
                  {(() => {
                    const titleParts = wizardParticipants.filter(p => p.role === 'title_officer' && !selectedTitleContact);
                    if (titleParts.length === 0) return null;
                    return (
                      <div className="space-y-2">
                        <p className="text-xs text-base-content/50 font-semibold uppercase tracking-wide">From Step 3</p>
                        {titleParts.map(p => {
                          const fullName = [p.firstName, p.lastName].filter(Boolean).join(' ');
                          const initials = fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                          const addr = [form.address, form.city, form.state].filter(Boolean).join(', ');
                          return (
                            <button
                              key={p.tempId}
                              type="button"
                              className="w-full flex items-center gap-3 px-3 py-2.5 bg-base-100 border border-base-300 rounded-xl hover:border-primary/40 hover:bg-primary/5 transition-colors text-left"
                              onClick={() => {
                                const contactInDb = p.contactId ? allContacts.find(c => c.id === p.contactId) : null;
                                if (contactInDb) {
                                  setForm(prev => ({
                                    ...prev,
                                    titleContactId: p.contactId!,
                                    titleContactEmail: contactInDb.email || '',
                                    introEmailSubject: `${addr} – Introduction from TC Team`,
                                    emHeldWith: contactInDb.company || prev.emHeldWith || '',
                                    introEmailBody: resolveIntroBody(`Hi ${contactInDb.fullName},\n\nI'm reaching out to introduce myself as the transaction coordinator for the following file:\n\nProperty: {{address}}, {{city}}, {{state}}\n\nRepresenting Agent: {{agentName}}\nPhone: {{agentPhone}}\nEmail: {{agentEmail}}\nLender / Loan Officer: {{loanOfficer}}\nEM Held With: {{emHeldWith}}\n\nI'll be your main point of contact throughout this transaction. Please don't hesitate to reach out with any questions or documents needed.\n\nLooking forward to working together!\n\n{{tcTeamSignature}}`, { emHeldWith: contactInDb.company || prev.emHeldWith || '', loanOfficer: prev.loanOfficer }),
                                  }));
                                } else {
                                  // Participant not yet in allContacts (e.g. AI-extracted, no contactId)
                                  setTitleParticipantFallback({ fullName, company: p.company, email: p.email });
                                  setForm(prev => ({
                                    ...prev,
                                    titleContactId: '',
                                    titleContactEmail: p.email || '',
                                    introEmailSubject: `${addr} – Introduction from TC Team`,
                                    emHeldWith: p.company || prev.emHeldWith || '',
                                    introEmailBody: resolveIntroBody(`Hi ${fullName},\n\nI'm reaching out to introduce myself as the transaction coordinator for the following file:\n\nProperty: {{address}}, {{city}}, {{state}}\n\nRepresenting Agent: {{agentName}}\nPhone: {{agentPhone}}\nEmail: {{agentEmail}}\nLender / Loan Officer: {{loanOfficer}}\nEM Held With: {{emHeldWith}}\n\nI'll be your main point of contact throughout this transaction. Please don't hesitate to reach out with any questions or documents needed.\n\nLooking forward to working together!\n\n{{tcTeamSignature}}`, { emHeldWith: p.company || prev.emHeldWith || '', loanOfficer: prev.loanOfficer }),
                                  }));
                                }
                                setIntroEmailSent(false);
                              }}
                            >
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-none">{initials}</div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-base-content truncate">{fullName}</p>
                                {p.company && <p className="text-xs text-base-content/40 truncate">{p.company}</p>}
                                {p.email && <p className="text-xs text-base-content/40 truncate">{p.email}</p>}
                              </div>
                            </button>
                          );
                        })}
                        <div className="flex items-center gap-2 pt-1">
                          <div className="flex-1 border-t border-base-200" />
                          <span className="text-xs text-base-content/30">or search all contacts</span>
                          <div className="flex-1 border-t border-base-200" />
                        </div>
                      </div>
                    );
                  })()}

                  {/* Side selector — auto-matches transaction side from step 3 */}
                  {(() => {
                    const effectiveSide = form.titleSide || (form.transactionType === 'buyer' ? 'buy' : 'sell');
                    return (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-base-content/70">Assign to:</span>
                        <div className="join">
                          <button
                            type="button"
                            className={`join-item btn btn-sm ${effectiveSide === 'buy' ? 'btn-primary' : 'btn-outline'}`}
                            onClick={() => setForm(p => ({ ...p, titleSide: 'buy' }))}
                          >Buy Side</button>
                          <button
                            type="button"
                            className={`join-item btn btn-sm ${effectiveSide === 'sell' ? 'btn-primary' : 'btn-outline'}`}
                            onClick={() => setForm(p => ({ ...p, titleSide: 'sell' }))}
                          >Sell Side</button>
                        </div>
                        {!form.titleSide && (
                          <span className="text-xs text-base-content/40 italic">auto-matched from transaction side</span>
                        )}
                      </div>
                    );
                  })()}

                  {/* Contact search / selected card */}
                  {selectedTitleContact ? (
                    <div className="flex items-center gap-3 px-3 py-2.5 bg-primary/5 border border-primary/30 rounded-xl">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-none">
                        {selectedTitleContact.fullName.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-base-content truncate">{selectedTitleContact.fullName}</p>
                        {selectedTitleContact.company && <p className="text-xs text-base-content/50 truncate">{selectedTitleContact.company}</p>}
                        {selectedTitleContact.email && <p className="text-xs text-base-content/40 truncate">{selectedTitleContact.email}</p>}
                      </div>
                      <Button variant="ghost" size="xs" square type="button" onClick={() => { setForm(p => ({ ...p, titleContactId: '', titleContactEmail: '', introEmailSubject: '', introEmailBody: '', emHeldWith: '' })); setIntroEmailSent(false); setTitleParticipantFallback(null); }}><X size={12} /></Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative" ref={titleSearchRef}>
                        <input
                          className="input input-bordered w-full"
                          placeholder="Search by name or company..."
                          value={titleSearch}
                          onChange={e => { setTitleSearch(e.target.value); setTitleDropdownOpen(true); }}
                          onFocus={() => setTitleDropdownOpen(true)}
                        />
                        {titleDropdownOpen && (
                          <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-base-100 border border-base-300 rounded-xl shadow-xl overflow-hidden max-h-52 overflow-y-auto">
                            {!titleContactsLoaded ? (
                              <div className="px-4 py-3 text-sm text-base-content/40 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading...</div>
                            ) : filteredContacts.length === 0 ? (
                              <div className="px-4 py-3 text-sm text-base-content/40 text-center">No contacts found</div>
                            ) : filteredContacts.map(c => (
                              <button
                                key={c.id}
                                type="button"
                                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-primary/5 transition-colors text-left border-b border-base-200 last:border-0"
                                onClick={() => {
                                  const addr = [form.address, form.city, form.state].filter(Boolean).join(', ');
                                  setForm(p => ({
                                    ...p,
                                    titleContactId: c.id,
                                    titleContactEmail: c.email || '',
                                    introEmailSubject: `${addr} – Introduction from TC Team`,
                                    emHeldWith: c.company || form.emHeldWith || '',
                                    introEmailBody: resolveIntroBody(`Hi ${c.fullName},\n\nI'm reaching out to introduce myself as the transaction coordinator for the following file:\n\nProperty: {{address}}, {{city}}, {{state}}\n\nRepresenting Agent: {{agentName}}\nPhone: {{agentPhone}}\nEmail: {{agentEmail}}\nLender / Loan Officer: {{loanOfficer}}\nEM Held With: {{emHeldWith}}\n\nI'll be your main point of contact throughout this transaction. Please don't hesitate to reach out with any questions or documents needed.\n\nLooking forward to working together!\n\n{{tcTeamSignature}}`, { emHeldWith: c.company || form.emHeldWith || '', loanOfficer: form.loanOfficer }),
                                  }));
                                  setTitleDropdownOpen(false);
                                  setTitleSearch('');
                                  setIntroEmailSent(false);
                                }}
                              >
                                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-none">
                                  {c.fullName.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-base-content truncate">{c.fullName}</p>
                                  {c.company && <p className="text-xs text-base-content/40 truncate">{c.company}</p>}
                                  {c.email && <p className="text-xs text-base-content/40 truncate">{c.email}</p>}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm gap-1.5 w-full"
                        onClick={() => { setShowTitleContactModal(true); setTitleDropdownOpen(false); }}
                      >
                        <Plus size={13} /> Create New Contact
                      </button>
                    </div>
                  )}

                  {/* Intro email compose — shows when contact with email is selected */}
                  {selectedTitleContact && (
                    <div className="border-t border-base-300 pt-4 space-y-3">
                      <p className="text-xs text-base-content/50 font-semibold uppercase">Intro Email</p>
                      {introEmailSkipped ? (
                        <div className="flex items-center gap-2 p-3 bg-base-200 border border-base-300 rounded-xl text-base-content/50 text-sm">
                          <CheckCircle2 size={15} /> Intro email skipped
                        </div>
                      ) : introEmailSent ? (
                        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
                          <CheckCircle2 size={15} /> Intro email sent to {selectedTitleContact.email || selectedTitleContact.fullName}
                        </div>
                      ) : (
                        <>
                          {/* To / CC recipients display */}
                          <div className="space-y-1 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-base-content/50 w-6 shrink-0">To:</span>
                              <span className="badge badge-ghost text-xs">{selectedTitleContact.fullName}{selectedTitleContact.email ? ` <${selectedTitleContact.email}>` : ''}</span>
                            </div>
                            {(() => { const ac = agentClients?.find(c => c.id === form.agentClientId); return ac?.email ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-base-content/50 w-6 shrink-0">CC:</span>
                                <span className="badge badge-ghost text-xs">{ac.fullName}{ac.email ? ` <${ac.email}>` : ''}</span>
                              </div>
                            ) : null; })()}
                          </div>
                          <div>
                            <label className="text-xs text-base-content/50 mb-1 block">Subject</label>
                            <input className="input input-bordered w-full input-sm" value={form.introEmailSubject} onChange={e => setForm(p => ({ ...p, introEmailSubject: e.target.value }))} />
                          </div>
                          <div>
                            <label className="text-xs text-base-content/50 mb-1 block">Message</label>
                            <textarea className="textarea textarea-bordered w-full text-sm resize-none" rows={8} value={form.introEmailBody} onChange={e => setForm(p => ({ ...p, introEmailBody: e.target.value }))} />
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="btn btn-primary btn-sm flex-1 gap-1.5"
                              disabled={!form.titleContactEmail || sendingIntroEmail}
                              onClick={handleSendIntroEmail}
                            >
                              {sendingIntroEmail ? <><Loader2 size={13} className="animate-spin" /> Sending...</> : <><Send size={13} /> Send Intro Email</>}
                            </button>
                            <Button variant="ghost" type="button" onClick={() => setIntroEmailSkipped(true)}>Skip</Button>
                          </div>
                          {!form.titleContactEmail && (
                            <p className="text-xs text-amber-500 flex items-center gap-1"><AlertCircle size={11} /> No email on file — add one to this contact to send.</p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

              );
            })()}

            {/* ContactModal — create new title contact from Step 9 */}
            <ContactModal
              isOpen={showTitleContactModal}
              contact={null}
              defaultRole="title_officer"
              allContacts={allContacts}
              onClose={() => setShowTitleContactModal(false)}
              onSaved={handleTitleContactModalSaved}
            />

            {step === 10 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles size={18} className="text-primary" />
                  <h3 className="text-lg font-bold text-base-content">AI Review</h3>
                </div>
                {aiLoading && (
                  <LoadingSpinner label="AI is reviewing your deal data..." />
                )}
                {aiError && (
                  <div className="alert alert-error text-sm py-2 mb-3">
                    {aiError}
                    <Button variant="ghost" size="xs" onClick={runAIReview}>Retry</Button>
                  </div>
                )}
                {aiReview && (
                  <>
                    <div className="bg-base-100 rounded-lg p-3 border border-base-300">
                      <p className="text-sm text-base-content">{aiReview.summary}</p>
                    </div>
                    {aiReview.suggestions.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-base-content/60 uppercase">Suggestions</p>
                        {aiReview.suggestions.map((s, i) => {
                          const cfg = severityConfig[s.severity];
                          return (
                            <div key={i} className={`flex items-start gap-2.5 p-3 rounded-lg border ${cfg.bg}`}>
                              <div className="flex-none mt-0.5">{cfg.icon}</div>
                              <div>
                                <p className={`text-sm font-semibold ${cfg.text}`}>{s.field}</p>
                                <p className={`text-xs ${cfg.text} opacity-80`}>{s.issue}</p>
                                <p className="text-xs text-base-content/60 mt-1">💡 {s.suggestion}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <CheckCircle2 size={16} className="text-green-500" />
                        <p className="text-sm text-green-700 font-medium">Everything looks good! No issues found.</p>
                      </div>
                    )}
                  </>
                )}
                {!aiLoading && !aiReview && !aiError && (
                  <div className="text-center py-8 text-base-content/40 text-sm">
                    <p>AI review will run automatically...</p>
                  </div>
                )}
                <div className="bg-base-100 rounded-lg p-4 border border-base-300 space-y-2">
                  <p className="text-xs font-semibold text-base-content/50 uppercase mb-2">Deal Summary</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <span className="text-base-content/50">Address:</span>
                    <span className="font-medium">{form.address}, {form.city} {form.state} {form.zipCode}</span>
                    {hasTwoAddresses && form.secondaryAddress && (
                      <>
                        <span className="text-base-content/50">Second Unit:</span>
                        <span className="font-medium">{form.secondaryAddress}</span>
                      </>
                    )}
                    <span className="text-base-content/50">Type:</span>
                    <span className="font-medium">{propertyTypeLabel(form.propertyType)}{isDuplex ? ` (${form.duplexAddressCount === '2' ? '2 addresses' : '1 address'})` : ''}</span>
                    <span className="text-base-content/50">Side:</span>
                    <span className="font-medium capitalize">{form.transactionType}</span>
                    {form.mlsNumber && <><span className="text-base-content/50">MLS#:</span><span className="font-medium">{form.mlsNumber}</span></>}
                    {form.listPrice && <><span className="text-base-content/50">List Price:</span><span className="font-medium">${Number(form.listPrice).toLocaleString()}</span></>}
                    {form.purchasePrice && <><span className="text-base-content/50">Contract Price:</span><span className="font-medium">${Number(form.purchasePrice).toLocaleString()}</span></>}
                    <span className="text-base-content/50">Contract Date:</span>
                    <span className="font-medium">{formatDisplayDate(form.contractDate)}</span>
                    <span className="text-base-content/50">Closing Date:</span>
                    <span className="font-medium">{formatDisplayDate(form.closingDate)}</span>
                    {selectedClient && (
                      <><span className="text-base-content/50">Our Client:</span><span className="font-medium">{selectedClient.fullName}{selectedClient.company ? ` — ${selectedClient.company}` : ''}</span></>
                    )}
                    {form.buyerNames && <><span className="text-base-content/50">Buyer(s):</span><span className="font-medium">{form.buyerNames}</span></>}
                    {form.sellerNames && <><span className="text-base-content/50">Seller(s):</span><span className="font-medium">{form.sellerNames}</span></>}
                    {form.loanType && <><span className="text-base-content/50">Loan Type:</span><span className="font-medium capitalize">{form.loanType}</span></>}
                    {form.earnestMoney && <><span className="text-base-content/50">Earnest Money:</span><span className="font-medium">${Number(form.earnestMoney).toLocaleString()}</span></>}
                    {form.earnestMoney && form.downPaymentAmount && form.isHeartlandMls && (() => {
                      const total = (parseFloat(form.downPaymentAmount) || 0) + (parseFloat(form.earnestMoney) || 0);
                      return <><span className="text-base-content/50 text-amber-600 font-semibold">Total Down (incl. EM):</span><span className="font-bold text-amber-700">${total.toLocaleString()}</span></>;
                    })()}
                    {form.earnestMoneyDueDate && <><span className="text-base-content/50">EM Due:</span><span className="font-medium">{formatDisplayDate(form.earnestMoneyDueDate)}</span></>}
                    {form.inspectionDate && <><span className="text-base-content/50">Inspection:</span><span className="font-medium">{formatDisplayDate(form.inspectionDate)}</span></>}
                    {form.financeDeadline && <><span className="text-base-content/50">Loan Commit:</span><span className="font-medium">{formatDisplayDate(form.financeDeadline)}</span></>}
                    {form.titleDate && <><span className="text-base-content/50">Title / CTC:</span><span className="font-medium">{formatDisplayDate(form.titleDate)}</span></>}
                    {(form.possessionDate || form.possessionAtClosing) && <><span className="text-base-content/50">Possession:</span><span className="font-medium">{form.possessionAtClosing ? 'At Closing' : formatDisplayDate(form.possessionDate)}</span></>}
                    {(form.asIsSale || form.inspectionWaived || form.homeWarranty) && (
                      <><span className="text-base-content/50">Conditions:</span><span className="font-medium">{[form.asIsSale && 'As-Is', form.inspectionWaived && 'Insp. Waived', form.homeWarranty && 'Home Warranty'].filter(Boolean).join(' · ')}</span></>
                    )}
                  </div>
                  {form.specialNotes.trim() && (
                    <div className="pt-3 border-t border-base-300">
                      <p className="text-xs font-semibold text-base-content/50 uppercase mb-1 flex items-center gap-1">
                        <FileText size={11} /> Special Notes
                      </p>
                      <p className="text-sm text-base-content/70 whitespace-pre-wrap">{form.specialNotes.trim()}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          {showPdfPanel && contractObjectUrl && (
            <div className="flex-1 bg-gray-900 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700 flex-none">
                <span className="text-xs text-gray-300 font-medium truncate">{contractFile?.name ?? 'Contract'}</span>
                <button
                  onClick={() => setShowPdfPanel(false)}
                  className="text-gray-400 hover:text-white flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-gray-700 transition-colors flex-none"
                >
                  <X size={12} /> Close PDF
                </button>
              </div>
              <iframe src={contractObjectUrl} className="flex-1 w-full border-0" title="Contract Preview" />
            </div>
          )}
          </div>

          <div className="flex items-center justify-between p-4 border-t border-base-300 flex-none">
            <button onClick={step === 1 ? onClose : handleBack} className="btn btn-ghost btn-sm gap-1">
              {step === 1 ? 'Cancel' : <><ChevronLeft size={14} /> Back</>}
            </button>
            <div className="flex gap-2">
              {step < TOTAL_STEPS && (
                <button onClick={handleNext} className="btn btn-primary btn-sm gap-1">
                  Next <ChevronRight size={14} />
                </button>
              )}
              {step === TOTAL_STEPS && (
                <button onClick={handleCreate} className="btn btn-primary btn-sm gap-1.5" disabled={aiLoading || isCreating}>
                  {isCreating ? <><span className="loading loading-spinner loading-xs"/>{contractFile ? 'Uploading contract…' : 'Creating…'}</> : <><Building2 size={13} /> Create Deal</>}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
