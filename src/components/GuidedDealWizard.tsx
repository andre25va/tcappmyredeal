import React, { useState } from 'react';
import {
  X, Building2, AlertTriangle, ShoppingCart, Tag, Home, Building, Landmark, TreePine, Store, MapPin,
  ChevronRight, ChevronLeft, Sparkles, CheckCircle2, Info, Loader2, User, Mail, Phone, AlertCircle,
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

// ─── Verification Card ────────────────────────────────────────────────────────
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

// ─── Disambiguation Modal ─────────────────────────────────────────────────────
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

// ─── Main Wizard ──────────────────────────────────────────────────────────────
export const GuidedDealWizard: React.FC<Props> = ({ onAdd, onClose, complianceTemplates, agentClients, ddMasterItems }) => {
  const today = new Date().toISOString().slice(0, 10);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    address: '', city: '', state: '', zipCode: '',
    secondaryAddress: '',
    propertyType: 'single-family' as PropertyType,
    transactionType: 'buyer' as TransactionType,
    mlsNumber: '', listPrice: '', contractPrice: '',
    contractDate: today, closingDate: '',
    agentClientId: '',    // selected client from agentClients
  });
  const [error, setError] = useState('');
  const [aiReview, setAiReview] = useState<AIReview | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  // Disambiguation state — client only
  const [disambigClientCandidates, setDisambigClientCandidates] = useState<ContactRecord[] | null>(null);

  const f = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [field]: e.target.value }));

  // ── Client selection ─────────────────────────────────────────────────────────
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

  const canAdvance = (): boolean => {
    switch (step) {
      case 1: return !!(form.address.trim() && form.city.trim());
      case 2: return true;
      case 3: return true;
      case 4: return true;
      case 5: return !!form.closingDate;
      case 6: return !!form.agentClientId;  // Our Client is required
      case 7: return true;
      default: return true;
    }
  };

  const handleNext = () => {
    setError('');
    if (!canAdvance()) {
      if (step === 1) setError('Address and city are required.');
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

    const addressDisplay = isDuplex && form.secondaryAddress.trim()
      ? `${form.address} & ${form.secondaryAddress}, ${form.city} ${form.state}`
      : `${form.address}, ${form.city} ${form.state}`;

    const initLog: ActivityEntry[] = [
      { id: generateId(), timestamp: new Date().toISOString(), action: 'Deal created', detail: addressDisplay, user: 'TC Staff', type: 'deal_created' },
      ...(isMF ? [{ id: generateId(), timestamp: new Date().toISOString(), action: 'Multi-Family Addendum auto-flagged', detail: 'System detected multi-family property and created required document alert.', user: 'System', type: 'document_requested' as const }] : []),
      ...(isDuplex && form.secondaryAddress.trim() ? [{ id: generateId(), timestamp: new Date().toISOString(), action: 'Duplex — dual address recorded', detail: `Unit A: ${form.address} | Unit B: ${form.secondaryAddress}`, user: 'System', type: 'deal_created' as const }] : []),
    ];

    const deal: Deal = {
      id: generateId(),
      propertyAddress: form.address.trim(),
      secondaryAddress: isDuplex && form.secondaryAddress.trim() ? form.secondaryAddress.trim() : undefined,
      city: form.city.trim(),
      state: form.state.trim().toUpperCase(),
      zipCode: form.zipCode.trim(),
      mlsNumber: form.mlsNumber.trim() || `MLS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      listPrice: parseFloat(form.listPrice) || 0,
      contractPrice: parseFloat(form.contractPrice) || parseFloat(form.listPrice) || 0,
      propertyType: form.propertyType,
      status: 'contract' as DealStatus,
      transactionType: form.transactionType as TransactionType,
      contractDate: form.contractDate,
      closingDate: form.closingDate,
      agentId: generateId(),
      agentName: '',
      agentClientId: form.agentClientId || undefined,
      contacts: [],
      notes: '',
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
      {/* Client Disambiguation Modal */}
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

          {/* Header */}
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

          {/* Progress Bar */}
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

          {/* Step Content */}
          <div className="overflow-y-auto flex-1 p-5">
            {error && <div className="alert alert-error mb-4 text-sm py-2">{error}</div>}

            {/* Step 1 */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin size={18} className="text-primary" />
                  <h3 className="text-lg font-bold text-base-content">Where is the property?</h3>
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

            {/* Step 2 */}
            {step === 2 && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-base-content">What type of property?</h3>
                <div className="grid grid-cols-4 gap-3">
                  {PROP_TYPES.map(pt => (
                    <button
                      key={pt.type}
                      onClick={() => setForm(p => ({ ...p, propertyType: pt.type }))}
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
                  <div className="space-y-3 pt-2 border-t border-base-300">
                    <div className="flex items-center gap-2">
                      <Building2 size={15} className="text-primary" />
                      <span className="text-sm font-semibold text-base-content">Duplex — Enter Both Unit Addresses</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-base-content/50 mb-1 block">Unit A (Primary Address)</label>
                        <input
                          className="input input-bordered input-sm w-full"
                          value={form.address}
                          onChange={f('address')}
                          placeholder="123 Main St"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-base-content/50 mb-1 block">Unit B (Second Address)</label>
                        <input
                          className="input input-bordered input-sm w-full"
                          value={form.secondaryAddress}
                          onChange={f('secondaryAddress')}
                          placeholder="125 Main St"
                          autoFocus
                        />
                      </div>
                    </div>
                    <p className="text-xs text-base-content/40">Both addresses will be used when matching emails to this deal.</p>
                  </div>
                )}
              </div>
            )}

            {/* Step 3 */}
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

            {/* Step 4 */}
            {step === 4 && (
              <div className="space-y-4">
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
              </div>
            )}

            {/* Step 5 */}
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
                </div>
              </div>
            )}

            {/* Step 6 — Our Client (required) */}
            {step === 6 && (
              <div className="space-y-5">
                <h3 className="text-lg font-bold text-base-content">Our Client</h3>

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
              </div>
            )}

            {/* Step 7: AI Review */}
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
                {/* Summary */}
                <div className="bg-base-100 rounded-lg p-4 border border-base-300 space-y-2">
                  <p className="text-xs font-semibold text-base-content/50 uppercase mb-2">Deal Summary</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <span className="text-base-content/50">Address:</span>
                    <span className="font-medium">{form.address}, {form.city} {form.state} {form.zipCode}</span>
                    {isDuplex && form.secondaryAddress && (
                      <>
                        <span className="text-base-content/50">Second Unit:</span>
                        <span className="font-medium">{form.secondaryAddress}</span>
                      </>
                    )}
                    <span className="text-base-content/50">Type:</span>
                    <span className="font-medium">{propertyTypeLabel(form.propertyType)}</span>
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
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
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
