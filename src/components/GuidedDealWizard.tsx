import React, { useState } from 'react';
import {
  X, Building2, AlertTriangle, ShoppingCart, Tag, Home, Building, Landmark, TreePine, Store, MapPin,
  ChevronRight, ChevronLeft, Sparkles, CheckCircle2, Info, Loader2, User, Mail, Phone, AlertCircle, FileText, Upload,
} from 'lucide-react';
import { Deal, PropertyType, DealStatus, TransactionType, DocumentRequest, ActivityEntry, ComplianceTemplate, ContactRecord, DDMasterItem, ChecklistItem } from '../types';
import { generateId, propertyTypeLabel, docTypeConfig } from '../utils/helpers';

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

const TOTAL_STEPS = 7;

const formatDisplayDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
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
        <button onClick={onCancel} className="btn btn-ghost btn-sm btn-square"><X size={14} /></button>
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
        <button onClick={onCancel} className="btn btn-ghost btn-sm w-full mt-3">Cancel</button>
      </div>
    </div>
  </div>
);

// ─── Main Wizard ──────────────────────────────────────────────────────────────────────────────────────────────
export const GuidedDealWizard: React.FC<Props> = ({ onAdd, onClose, complianceTemplates, agentClients, ddMasterItems }) => {
  const today = new Date().toISOString().slice(0, 10);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    address: '', city: '', state: '', zipCode: '',
    secondaryAddress: '',
    duplexAddressCount: '' as '' | '1' | '2',
    propertyType: 'single-family' as PropertyType,
    transactionType: 'buyer' as TransactionType,
    mlsNumber: '000000', listPrice: '', contractPrice: '',
    contractDate: today, closingDate: '',
    agentClientId: '',
    specialNotes: '',
    loanType: '' as '' | 'conventional' | 'fha' | 'va' | 'usda' | 'cash' | 'other',
    loanAmount: '', downPaymentAmount: '', downPaymentPercent: '',
    earnestMoney: '', earnestMoneyDueDate: '', sellerConcessions: '',
    asIsSale: false, inspectionWaived: false,
    homeWarranty: false, homeWarrantyCompany: '',
    inspectionDeadline: '', loanCommitmentDate: '', possessionDate: '',
    buyerNames: '', sellerNames: '', titleCompany: '', loanOfficer: '',
    listingCommission: '', buyerCommission: '', tcFee: '',
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
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [disambigClientCandidates, setDisambigClientCandidates] = useState<ContactRecord[] | null>(null);

  const f = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [field]: e.target.value }));

  const handlePropertyTypeChange = (type: PropertyType) => {
    setForm(p => ({
      ...p,
      propertyType: type,
      duplexAddressCount: '',
      secondaryAddress: '',
    }));
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
      case 1: return !!(form.address.trim() && form.city.trim());
      case 2: return isDuplex ? form.duplexAddressCount !== '' : true;
      case 3: return true;
      case 4: return true;
      case 5: return !!form.closingDate;
      case 6: return !!form.agentClientId;
      case 7: return true;
      default: return true;
    }
  };

  const handleNext = () => {
    setError('');
    if (!canAdvance()) {
      if (step === 1) setError('Address and city are required.');
      if (step === 2) setError('Please select whether this duplex has 1 or 2 addresses.');
      if (step === 5) setError('Closing date is required.');
      if (step === 6) setError('Please select a client to continue.');
      return;
    }
    if (step === 6) runAIReview();
    if (step < TOTAL_STEPS) setStep(step + 1);
  };

  const handleBack = () => {
    setError('');
    if (step > 1) setStep(step - 1);
  };

  const handleFileExtract = async (file: File) => {
    if (extracting) return;
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
      setForm(p => ({
        ...p,
        address: d.address || p.address,
        city: d.city || p.city,
        state: d.state || p.state,
        zipCode: d.zipCode || p.zipCode,
        listPrice: d.listPrice || p.listPrice,
        contractPrice: d.contractPrice || p.contractPrice,
        mlsNumber: d.mlsNumber || p.mlsNumber,
        contractDate: d.contractDate || p.contractDate,
        closingDate: d.closingDate || p.closingDate,
        inspectionDeadline: d.inspectionDeadline || p.inspectionDeadline,
        loanCommitmentDate: d.loanCommitmentDate || p.loanCommitmentDate,
        possessionDate: d.possessionDate || p.possessionDate,
        earnestMoney: d.earnestMoney || p.earnestMoney,
        earnestMoneyDueDate: d.earnestMoneyDueDate || p.earnestMoneyDueDate,
        sellerConcessions: d.sellerConcessions || p.sellerConcessions,
        loanType: d.loanType || p.loanType,
        loanAmount: d.loanAmount || p.loanAmount,
        downPaymentAmount: d.downPaymentAmount || p.downPaymentAmount,
        buyerNames: d.buyerNames || p.buyerNames,
        sellerNames: d.sellerNames || p.sellerNames,
        titleCompany: d.titleCompany || p.titleCompany,
        loanOfficer: d.loanOfficer || p.loanOfficer,
        transactionType: (d.transactionType as any) || p.transactionType,
        propertyType: (d.propertyType as any) || p.propertyType,
        asIsSale: d.asIsSale ?? p.asIsSale,
        inspectionWaived: d.inspectionWaived ?? p.inspectionWaived,
        homeWarranty: d.homeWarranty ?? p.homeWarranty,
        homeWarrantyCompany: d.homeWarrantyCompany || p.homeWarrantyCompany,
      }));
      setExtractionBanner({ count: d.extractedFields?.length || 0, fileName: file.name });
      setExtractedRawData(d);
      setShowExtractedTable(false);
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

  const handleCreate = () => {
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
      { id: generateId(), timestamp: new Date().toISOString(), action: 'Deal created', detail: addressDisplay, user: 'TC Staff', type: 'deal_created' },
      ...(isMF ? [{ id: generateId(), timestamp: new Date().toISOString(), action: 'Multi-Family Addendum auto-flagged', detail: 'System detected multi-family property and created required document alert.', user: 'System', type: 'document_requested' as const }] : []),
      ...(hasTwoAddresses && form.secondaryAddress.trim() ? [{ id: generateId(), timestamp: new Date().toISOString(), action: 'Duplex — dual address recorded', detail: `Unit A: ${form.address} | Unit B: ${form.secondaryAddress}`, user: 'System', type: 'deal_created' as const }] : []),
    ];

    // Find the selected agent client to populate agent fields
    const agentClient = agentClients?.find(c => c.id === form.agentClientId);

    const deal: Deal = {
      id: generateId(),
      propertyAddress: form.address.trim(),
      secondaryAddress: hasTwoAddresses && form.secondaryAddress.trim() ? form.secondaryAddress.trim() : undefined,
      city: form.city.trim(),
      state: form.state.trim().toUpperCase(),
      zipCode: form.zipCode.trim(),
      mlsNumber: form.mlsNumber.trim() || '000000',
      listPrice: parseFloat(form.listPrice) || 0,
      contractPrice: parseFloat(form.contractPrice) || parseFloat(form.listPrice) || 0,
      propertyType: form.propertyType,
      status: 'contract' as DealStatus,
      transactionType: form.transactionType as TransactionType,
      contractDate: form.contractDate,
      closingDate: form.closingDate,
      agentId: agentClient?.id || generateId(),
      agentName: agentClient?.fullName || '',
      agentClientId: form.agentClientId || undefined,
      // Set buyer/seller agent based on transaction type
      buyerAgent: form.transactionType === 'buyer' && agentClient ? {
        name: agentClient.fullName,
        phone: agentClient.phone || '',
        email: agentClient.email || '',
        isOurClient: true,
      } : undefined,
      sellerAgent: form.transactionType === 'seller' && agentClient ? {
        name: agentClient.fullName,
        phone: agentClient.phone || '',
        email: agentClient.email || '',
        isOurClient: true,
      } : undefined,
      contacts: [],
      notes: form.specialNotes.trim(),
      loanType: form.loanType || undefined,
      loanAmount: parseFloat(form.loanAmount) || undefined,
      downPayment: parseFloat(form.downPaymentAmount) || undefined,
      earnestMoneyDueDate: form.earnestMoneyDueDate || undefined,
      sellerConcessions: parseFloat(form.sellerConcessions) || undefined,
      asIsSale: form.asIsSale,
      inspectionWaived: form.inspectionWaived,
      homeWarranty: form.homeWarranty,
      homeWarrantyCompany: form.homeWarrantyCompany || undefined,
      possessionDate: form.possessionDate || undefined,
      buyerName: form.buyerNames || undefined,
      sellerName: form.sellerNames || undefined,
      titleCompanyName: form.titleCompany || undefined,
      loanOfficerName: form.loanOfficer || undefined,
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
      tasks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onAdd(deal);
  };

  const stepTitles = ['', 'Property Address', 'Property Type', 'Transaction Side', 'Financials', 'Key Dates', 'Our Client', 'AI Review'];
  const isMF = form.propertyType === 'multi-family';
  const severityConfig = {
    info: { bg: 'bg-blue-50 border-blue-200', icon: <Info size={16} className="text-blue-500" />, text: 'text-blue-700' },
    warning: { bg: 'bg-yellow-50 border-yellow-200', icon: <AlertTriangle size={16} className="text-yellow-500" />, text: 'text-yellow-700' },
    error: { bg: 'bg-red-50 border-red-200', icon: <AlertTriangle size={16} className="text-red-500" />, text: 'text-red-700' },
  };

  const selectedClient = agentClients?.find(c => c.id === form.agentClientId) ?? null;

  return (
    <>
      {disambigClientCandidates && (
        <DisambigModal
          candidates={disambigClientCandidates}
          title="Multiple Clients Found"
          onSelect={handleClientDisambigSelect}
          onCancel={() => { setDisambigClientCandidates(null); setForm(p => ({ ...p, agentClientId: '' })); }}
        />
      )}

      <div className="fixed inset-0 bg-base-100/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-base-200 rounded-2xl border border-base-300 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

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
            <button onClick={onClose} className="btn btn-ghost btn-sm btn-square"><X size={16} /></button>
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

          <div className="overflow-y-auto flex-1 p-5">
            {error && <div className="alert alert-error mb-4 text-sm py-2">{error}</div>}

            {step === 1 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin size={18} className="text-primary" />
                  <h3 className="text-lg font-bold text-base-content">Where is the property?</h3>
                </div>
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
                {extractionBanner && (() => {
                  const FIELD_LABELS: Record<string, string> = {
                    address: 'Street Address', city: 'City', state: 'State', zipCode: 'ZIP',
                    listPrice: 'List Price', contractPrice: 'Contract Price', mlsNumber: 'MLS #',
                    contractDate: 'Contract Date', closingDate: 'Closing Date',
                    inspectionDeadline: 'Inspection Deadline', loanCommitmentDate: 'Loan Commitment Date',
                    possessionDate: 'Possession Date', earnestMoney: 'Earnest Money',
                    earnestMoneyDueDate: 'EM Due Date', sellerConcessions: 'Seller Concessions',
                    loanType: 'Loan Type', loanAmount: 'Loan Amount', downPaymentAmount: 'Down Payment',
                    buyerNames: 'Buyer Name(s)', sellerNames: 'Seller Name(s)',
                    titleCompany: 'Title Company', loanOfficer: 'Loan Officer',
                    transactionType: 'Transaction Type', propertyType: 'Property Type',
                    asIsSale: 'As-Is Sale', inspectionWaived: 'Inspection Waived',
                    homeWarranty: 'Home Warranty', homeWarrantyCompany: 'Warranty Company',
                  };
                  const rows = extractedRawData
                    ? Object.entries(FIELD_LABELS)
                        .map(([key, label]) => ({ label, value: extractedRawData[key] }))
                        .filter(r => r.value !== undefined && r.value !== null && r.value !== '')
                    : [];
                  return (
                    <div className="rounded-lg border border-green-200 bg-green-50 -mt-1 overflow-hidden">
                      <div className="flex items-center justify-between p-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 size={13} className="text-green-500 flex-none" />
                          <span className="text-xs text-green-700 font-medium">
                            {extractionBanner.count} fields extracted from {extractionBanner.fileName}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={e => { e.stopPropagation(); setShowExtractedTable(v => !v); }}
                            className="text-xs text-green-700 font-semibold border border-green-300 bg-white hover:bg-green-100 rounded px-2 py-0.5 transition-colors"
                          >
                            {showExtractedTable ? 'Hide Table' : 'View Table'}
                          </button>
                          <button onClick={e => { e.stopPropagation(); setExtractionBanner(null); setShowExtractedTable(false); }} className="btn btn-ghost btn-xs p-0 min-h-0 h-auto ml-1"><X size={12} /></button>
                        </div>
                      </div>
                      {showExtractedTable && (
                        <div className="border-t border-green-200 bg-white max-h-64 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-green-50 sticky top-0">
                              <tr>
                                <th className="text-left px-3 py-1.5 text-green-800 font-semibold w-2/5">Field</th>
                                <th className="text-left px-3 py-1.5 text-green-800 font-semibold">Extracted Value</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.length === 0 ? (
                                <tr><td colSpan={2} className="px-3 py-3 text-center text-base-content/40">No data extracted</td></tr>
                              ) : rows.map((row, i) => (
                                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-green-50/40'}>
                                  <td className="px-3 py-1.5 text-base-content/60 font-medium">{row.label}</td>
                                  <td className="px-3 py-1.5 text-base-content font-semibold">
                                    {typeof row.value === 'boolean' ? (row.value ? 'Yes' : 'No') : String(row.value)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })()}
                <div className="flex items-center gap-2 text-xs text-base-content/30">
                  <div className="flex-1 h-px bg-base-300" />
                  <span>or enter manually</span>
                  <div className="flex-1 h-px bg-base-300" />
                </div>
                <div>
                  <label className="text-xs text-base-content/50 mb-1 block">Street Address *</label>
                  <input className="input input-bordered w-full" value={form.address} onChange={f('address')} placeholder="123 Main St" autoFocus />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">City *</label>
                    <input className="input input-bordered w-full" value={form.city} onChange={f('city')} placeholder="Enter city" />
                  </div>
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">State</label>
                    <input className="input input-bordered w-full" value={form.state} onChange={f('state')} placeholder="ST" maxLength={2} />
                  </div>
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">ZIP</label>
                    <input className="input input-bordered w-full" value={form.zipCode} onChange={f('zipCode')} placeholder="00000" />
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-base-content">What type of property?</h3>
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
                          💡 Usually just the house number changes — e.g. 123 and 125 Main St. Both addresses will be used when matching emails to this deal.
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

            {step === 3 && (
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

            {step === 4 && (
              <div className="space-y-5">
                <h3 className="text-lg font-bold text-base-content">Financial Details</h3>
                <div>
                  <label className="text-xs text-base-content/50 mb-1 block">MLS Number</label>
                  <input className="input input-bordered w-full" value={form.mlsNumber} onChange={f('mlsNumber')} placeholder="MLS-XXXXXXX" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">List Price</label>
                    <input className="input input-bordered w-full" value={form.listPrice} onChange={f('listPrice')} placeholder="550000" type="number" />
                  </div>
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">Contract Price</label>
                    <input className="input input-bordered w-full" value={form.contractPrice} onChange={f('contractPrice')} placeholder="540000" type="number" />
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
                      <input className="input input-bordered w-full" value={form.loanAmount} onChange={f('loanAmount')} placeholder="0" type="number" />
                    </div>
                    <div>
                      <label className="text-xs text-base-content/50 mb-1 block">Down Payment $</label>
                      <input className="input input-bordered w-full" value={form.downPaymentAmount}
                        onChange={e => {
                          const amt = e.target.value;
                          const price = parseFloat(form.contractPrice) || parseFloat(form.listPrice) || 0;
                          const pct = price > 0 && amt ? ((parseFloat(amt) / price) * 100).toFixed(1) : '';
                          setForm(p => ({ ...p, downPaymentAmount: amt, downPaymentPercent: pct }));
                        }}
                        placeholder="0" type="number" />
                    </div>
                    <div>
                      <label className="text-xs text-base-content/50 mb-1 block">Down Payment %</label>
                      <input className="input input-bordered w-full" value={form.downPaymentPercent}
                        onChange={e => {
                          const pct = e.target.value;
                          const price = parseFloat(form.contractPrice) || parseFloat(form.listPrice) || 0;
                          const amt = price > 0 && pct ? ((parseFloat(pct) / 100) * price).toFixed(0) : '';
                          setForm(p => ({ ...p, downPaymentPercent: pct, downPaymentAmount: amt }));
                        }}
                        placeholder="0" type="number" step="0.1" />
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">Earnest Money $</label>
                    <input className="input input-bordered w-full" value={form.earnestMoney} onChange={f('earnestMoney')} placeholder="0" type="number" />
                  </div>
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">Earnest Money Due</label>
                    <input type="date" className="input input-bordered w-full" value={form.earnestMoneyDueDate} onChange={f('earnestMoneyDueDate')} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-base-content/50 mb-1 block">Seller Concessions $</label>
                  <input className="input input-bordered w-full" value={form.sellerConcessions} onChange={f('sellerConcessions')} placeholder="0" type="number" />
                </div>
                <div className="border-t border-base-300 pt-4">
                  <p className="text-xs text-base-content/50 font-semibold uppercase mb-3">Contract Conditions</p>
                  <div className="space-y-2">
                    {([
                      { key: 'asIsSale', label: 'As-Is Sale' },
                      { key: 'inspectionWaived', label: 'Inspection Waived' },
                    ] as const).map(({ key, label }) => (
                      <label key={key} className="flex items-center justify-between cursor-pointer py-1">
                        <span className="text-sm">{label}</span>
                        <input type="checkbox" className="toggle toggle-primary toggle-sm"
                          checked={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.checked }))} />
                      </label>
                    ))}
                    <label className="flex items-center justify-between cursor-pointer py-1">
                      <span className="text-sm">Home Warranty</span>
                      <input type="checkbox" className="toggle toggle-primary toggle-sm"
                        checked={form.homeWarranty} onChange={e => setForm(p => ({ ...p, homeWarranty: e.target.checked }))} />
                    </label>
                    {form.homeWarranty && (
                      <input className="input input-bordered w-full input-sm mt-1" value={form.homeWarrantyCompany}
                        onChange={f('homeWarrantyCompany')} placeholder="Warranty company name" />
                    )}
                  </div>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-base-content">Key Dates</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">Contract Date</label>
                    <input type="date" className="input input-bordered w-full" value={form.contractDate} onChange={f('contractDate')} />
                    {form.contractDate && <p className="text-xs text-base-content/40 mt-1">{formatDisplayDate(form.contractDate)}</p>}
                  </div>
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">Closing Date *</label>
                    <input type="date" className="input input-bordered w-full" value={form.closingDate} onChange={f('closingDate')} />
                    {form.closingDate && <p className="text-xs text-base-content/40 mt-1">{formatDisplayDate(form.closingDate)}</p>}
                  </div>
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">Inspection Deadline</label>
                    <input type="date" className="input input-bordered w-full" value={form.inspectionDeadline} onChange={f('inspectionDeadline')} />
                    {form.inspectionDeadline && <p className="text-xs text-base-content/40 mt-1">{formatDisplayDate(form.inspectionDeadline)}</p>}
                  </div>
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">Loan Commitment Date</label>
                    <input type="date" className="input input-bordered w-full" value={form.loanCommitmentDate} onChange={f('loanCommitmentDate')} />
                    {form.loanCommitmentDate && <p className="text-xs text-base-content/40 mt-1">{formatDisplayDate(form.loanCommitmentDate)}</p>}
                  </div>
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">Possession Date</label>
                    <input type="date" className="input input-bordered w-full" value={form.possessionDate} onChange={f('possessionDate')} />
                    {form.possessionDate && <p className="text-xs text-base-content/40 mt-1">{formatDisplayDate(form.possessionDate)}</p>}
                  </div>
                </div>
              </div>
            )}

            {step === 6 && (
              <div className="space-y-5">
                <h3 className="text-lg font-bold text-base-content">Our Client &amp; Parties</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">Buyer Name(s)</label>
                    <input className="input input-bordered w-full" value={form.buyerNames} onChange={f('buyerNames')} placeholder="John &amp; Jane Doe" />
                  </div>
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">Seller Name(s)</label>
                    <input className="input input-bordered w-full" value={form.sellerNames} onChange={f('sellerNames')} placeholder="Bob Smith" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">Title Company</label>
                    <input className="input input-bordered w-full" value={form.titleCompany} onChange={f('titleCompany')} placeholder="ABC Title Co." />
                  </div>
                  <div>
                    <label className="text-xs text-base-content/50 mb-1 block">Lender / Loan Officer</label>
                    <input className="input input-bordered w-full" value={form.loanOfficer} onChange={f('loanOfficer')} placeholder="Jane Smith – First Bank" />
                  </div>
                </div>
                <div className="border-t border-base-300 pt-4">
                  <p className="text-xs text-base-content/50 font-semibold uppercase mb-3">Our Client (Required)</p>
                </div>
                <div>
                  <label className="text-xs text-base-content/50 mb-1 block">Our Client *</label>
                  {agentClients && agentClients.length > 0 ? (
                    <>
                      <select
                        className="select select-bordered w-full"
                        value={form.agentClientId}
                        onChange={e => handleClientSelect(e.target.value)}
                      >
                        <option value="">-- Select Client --</option>
                        {agentClients.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.fullName}{c.company ? ` — ${c.company}` : ''}
                          </option>
                        ))}
                      </select>
                      {selectedClient && (
                        <VerifyCard
                          contact={selectedClient}
                          label="Client Confirmed"
                          extraNote={(() => {
                            if (!complianceTemplates) return null;
                            const tpl = complianceTemplates.find(t =>
                              (t.agentClientIds ?? (t.agentClientId ? [t.agentClientId] : [])).includes(selectedClient.id)
                            );
                            return tpl
                              ? <p className="text-xs text-green-600">✓ {tpl.items.length} compliance items will be loaded from this client's template</p>
                              : null;
                          })()}
                        />
                      )}
                    </>
                  ) : (
                    <div className="p-3 rounded-xl border border-dashed border-base-300 text-sm text-base-content/40 text-center">
                      No client contacts found. Mark contacts as "Is Client" in the Contacts Directory first.
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

            {step === 7 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles size={18} className="text-primary" />
                  <h3 className="text-lg font-bold text-base-content">AI Review</h3>
                </div>
                {aiLoading && (
                  <div className="flex flex-col items-center justify-center py-10 gap-3">
                    <Loader2 size={28} className="animate-spin text-primary" />
                    <p className="text-sm text-base-content/60">AI is reviewing your deal data...</p>
                  </div>
                )}
                {aiError && (
                  <div className="alert alert-error text-sm py-2 mb-3">
                    {aiError}
                    <button className="btn btn-ghost btn-xs" onClick={runAIReview}>Retry</button>
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
                    {form.contractPrice && <><span className="text-base-content/50">Contract Price:</span><span className="font-medium">${Number(form.contractPrice).toLocaleString()}</span></>}
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
                    {form.inspectionDeadline && <><span className="text-base-content/50">Inspection Deadline:</span><span className="font-medium">{formatDisplayDate(form.inspectionDeadline)}</span></>}
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
                <button onClick={handleCreate} className="btn btn-primary btn-sm gap-1.5" disabled={aiLoading}>
                  <Building2 size={13} /> Create Deal
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
