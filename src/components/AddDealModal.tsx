import React, { useState } from 'react';
import { X, Building2, AlertTriangle, ShoppingCart, Tag } from 'lucide-react';
import { Deal, PropertyType, DealStatus, TransactionSide, DocumentRequest, ActivityEntry, ComplianceTemplate, DirectoryContact, DDMasterItem } from '../types';
import { generateId, propertyTypeLabel, statusLabel, docTypeConfig } from '../utils/helpers';

interface Props {
  onAdd: (deal: Deal) => void;
  onClose: () => void;
  complianceTemplates?: ComplianceTemplate[];
  agentClients?: DirectoryContact[];
  ddMasterItems?: DDMasterItem[];
}

const PROP_TYPES: PropertyType[] = ['single-family', 'multi-family', 'condo', 'townhouse', 'land', 'commercial'];
const STATUSES: DealStatus[] = ['contract', 'due-diligence', 'clear-to-close'];

// Fallback DD items used only if master list is empty/unavailable
const fallbackDD = () => [
  { id: generateId(), title: 'Review executed purchase agreement', completed: false },
  { id: generateId(), title: 'Order title search', completed: false },
  { id: generateId(), title: 'Confirm earnest money deposit received', completed: false },
  { id: generateId(), title: 'Schedule home inspection', completed: false },
  { id: generateId(), title: 'Request seller disclosures', completed: false },
  { id: generateId(), title: 'Verify lender pre-approval letter', completed: false },
];
const defaultComp = () => [
  { id: generateId(), title: 'MLS data verified and entered', completed: false },
  { id: generateId(), title: 'Signed agency disclosure on file', completed: false },
  { id: generateId(), title: 'Buyer representation agreement on file', completed: false },
  { id: generateId(), title: 'All offer documents uploaded to broker platform', completed: false },
];

export const AddDealModal: React.FC<Props> = ({ onAdd, onClose, complianceTemplates, agentClients, ddMasterItems }) => {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    address: '', city: '', state: '', zipCode: '',
    mlsNumber: '', listPrice: '', contractPrice: '',
    propertyType: 'single-family' as PropertyType,
    status: 'contract' as DealStatus,
    transactionSide: 'buyer' as TransactionSide,
    contractDate: today, closingDate: '',
    agentName: '', notes: '',
    agentClientId: '',
  });
  const [error, setError] = useState('');

  const f = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [field]: e.target.value }));

  const handleSubmit = () => {
    if (!form.address.trim() || !form.city.trim() || !form.agentName.trim() || !form.closingDate) {
      setError('Address, city, agent name, and closing date are required.');
      return;
    }
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

    const initLog: ActivityEntry[] = [
      { id: generateId(), timestamp: new Date().toISOString(), action: 'Deal created', detail: `${form.address}, ${form.city} ${form.state} — Agent: ${form.agentName}`, user: 'TC Staff', type: 'deal_created' },
      ...(isMF ? [{ id: generateId(), timestamp: new Date().toISOString(), action: 'Multi-Family Addendum auto-flagged', detail: 'System detected multi-family property and created required document alert.', user: 'System', type: 'document_requested' as const }] : []),
    ];

    const deal: Deal = {
      id: generateId(),
      address: form.address.trim(), city: form.city.trim(),
      state: form.state.trim().toUpperCase(), zipCode: form.zipCode.trim(),
      mlsNumber: form.mlsNumber.trim() || `MLS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      listPrice: parseFloat(form.listPrice) || 0,
      contractPrice: parseFloat(form.contractPrice) || parseFloat(form.listPrice) || 0,
      propertyType: form.propertyType, status: form.status, transactionSide: form.transactionSide,
      contractDate: form.contractDate, closingDate: form.closingDate,
      agentId: generateId(), agentName: form.agentName.trim(),
      agentClientId: form.agentClientId || undefined,
      contacts: [], notes: form.notes,
      dueDiligenceChecklist: (ddMasterItems && ddMasterItems.length > 0)
        ? ddMasterItems.map(m => ({ id: generateId(), title: m.title, completed: false }))
        : fallbackDD(),
      complianceChecklist: (() => {
        if (form.agentClientId && complianceTemplates) {
          const tpl = complianceTemplates.find(t => (t.agentClientIds ?? (t.agentClientId ? [t.agentClientId] : [])).includes(form.agentClientId!));
          if (tpl && tpl.items.length > 0) {
            return tpl.items.map(item => ({
              id: generateId(),
              title: item.title,
              completed: false,
              required: item.required,
            }));
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

  const isMF = form.propertyType === 'multi-family';

  return (
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
              <p className="text-xs text-base-content/50">Create a new transaction file</p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm btn-square"><X size={16} /></button>
        </div>

        {/* Form */}
        <div className="overflow-y-auto flex-1 p-5">
          {error && <div className="alert alert-error mb-4 text-sm py-2">{error}</div>}
          {isMF && (
            <div className="alert alert-warning mb-4 py-2 text-sm gap-2">
              <AlertTriangle size={14} /> Multi-Family selected — a Multi-Family Addendum alert will be auto-created.
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Property Info */}
            <div className="col-span-2">
              <p className="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-2">Property</p>
            </div>
            <div className="col-span-2"><label className="text-xs text-base-content/50 mb-1 block">Street Address *</label>
              <input className="input input-bordered input-sm w-full" value={form.address} onChange={f('address')} placeholder="123 Main St" /></div>
            <div><label className="text-xs text-base-content/50 mb-1 block">City *</label>
              <input className="input input-bordered input-sm w-full" value={form.city} onChange={f('city')} placeholder="City" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-xs text-base-content/50 mb-1 block">State</label>
                <input className="input input-bordered input-sm w-full" value={form.state} onChange={f('state')} placeholder="FL" maxLength={2} /></div>
              <div><label className="text-xs text-base-content/50 mb-1 block">ZIP</label>
                <input className="input input-bordered input-sm w-full" value={form.zipCode} onChange={f('zipCode')} placeholder="33101" /></div>
            </div>
            <div><label className="text-xs text-base-content/50 mb-1 block">Property Type</label>
              <select className="select select-bordered select-sm w-full" value={form.propertyType} onChange={f('propertyType')}>
                {PROP_TYPES.map(p => <option key={p} value={p}>{propertyTypeLabel(p)}</option>)}
              </select></div>
            <div><label className="text-xs text-base-content/50 mb-1 block">MLS Number</label>
              <input className="input input-bordered input-sm w-full" value={form.mlsNumber} onChange={f('mlsNumber')} placeholder="MLS-XXXXXXX" /></div>

            {/* Transaction Side */}
            <div className="col-span-2 pt-2">
              <p className="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-2">Transaction Side</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm(p => ({ ...p, transactionSide: 'buyer' }))}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 font-semibold text-sm transition-all ${
                    form.transactionSide === 'buyer'
                      ? 'bg-blue-500 border-blue-500 text-white'
                      : 'bg-blue-50 border-blue-200 text-blue-600 hover:border-blue-400'
                  }`}
                >
                  <ShoppingCart size={15} /> Buyer Side
                </button>
                <button
                  type="button"
                  onClick={() => setForm(p => ({ ...p, transactionSide: 'seller' }))}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 font-semibold text-sm transition-all ${
                    form.transactionSide === 'seller'
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'bg-green-50 border-green-200 text-green-600 hover:border-green-400'
                  }`}
                >
                  <Tag size={15} /> Seller Side
                </button>
              </div>
            </div>

            {/* Transaction */}
            <div className="col-span-2 pt-2">
              <p className="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-2">Transaction</p>
            </div>
            <div><label className="text-xs text-base-content/50 mb-1 block">List Price</label>
              <input className="input input-bordered input-sm w-full" value={form.listPrice} onChange={f('listPrice')} placeholder="550000" /></div>
            <div><label className="text-xs text-base-content/50 mb-1 block">Contract Price</label>
              <input className="input input-bordered input-sm w-full" value={form.contractPrice} onChange={f('contractPrice')} placeholder="540000" /></div>
            <div><label className="text-xs text-base-content/50 mb-1 block">Status</label>
              <select className="select select-bordered select-sm w-full" value={form.status} onChange={f('status')}>
                {STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
              </select></div>

            {/* Agent Client selector */}
            {agentClients && agentClients.length > 0 && (
              <div className="col-span-2">
                <label className="text-xs text-base-content/50 mb-1 block">Agent Client (optional)</label>
                <select
                  className="select select-bordered select-sm w-full"
                  value={form.agentClientId}
                  onChange={e => setForm(p => ({ ...p, agentClientId: e.target.value }))}
                >
                  <option value="">-- Select Agent Client --</option>
                  {agentClients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ''}</option>
                  ))}
                </select>
                {form.agentClientId && complianceTemplates && (() => {
                  const tpl = complianceTemplates.find(t => (t.agentClientIds ?? (t.agentClientId ? [t.agentClientId] : [])).includes(form.agentClientId!));
                  return tpl ? (
                    <p className="text-xs text-green-600 mt-1">✓ {tpl.items.length} compliance items will be loaded from this client's template</p>
                  ) : (
                    <p className="text-xs text-gray-400 mt-1">No compliance template set up for this client yet</p>
                  );
                })()}
              </div>
            )}

            <div><label className="text-xs text-base-content/50 mb-1 block">Agent Name *</label>
              <input className="input input-bordered input-sm w-full" value={form.agentName} onChange={f('agentName')} placeholder="Agent full name" /></div>
            <div><label className="text-xs text-base-content/50 mb-1 block">Contract Date</label>
              <input type="date" className="input input-bordered input-sm w-full" value={form.contractDate} onChange={f('contractDate')} /></div>
            <div><label className="text-xs text-base-content/50 mb-1 block">Closing Date *</label>
              <input type="date" className="input input-bordered input-sm w-full" value={form.closingDate} onChange={f('closingDate')} /></div>
            <div className="col-span-2"><label className="text-xs text-base-content/50 mb-1 block">Internal Notes</label>
              <textarea className="textarea textarea-bordered w-full text-sm" rows={2} value={form.notes} onChange={f('notes')} placeholder="Any notes..." /></div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 justify-end p-4 border-t border-base-300 flex-none">
          <button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>
          <button onClick={handleSubmit} className="btn btn-primary btn-sm gap-1.5">
            <Building2 size={13} /> Create Deal
          </button>
        </div>
      </div>
    </div>
  );
};
