import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Plus, FileText, X, ChevronDown, Info } from 'lucide-react';
import { Deal, DocumentRequest, DocRequestType, DocRequestStatus } from '../types';
import { docTypeConfig, generateId, formatDateTime, propertyTypeLabel } from '../utils/helpers';

interface Props { deal: Deal; onUpdate: (d: Deal) => void; }

const STATUS_STYLES: Record<DocRequestStatus, { badge: string; label: string; icon: React.ReactNode }> = {
  pending: { badge: 'bg-amber-500 text-white border-0', label: 'Pending', icon: <AlertTriangle size={12} /> },
  in_progress: { badge: 'badge-info', label: 'In Progress', icon: <Clock size={12} /> },
  confirmed: { badge: 'badge-success', label: 'Confirmed', icon: <CheckCircle2 size={12} /> },
};

const ALL_DOC_TYPES: DocRequestType[] = [
  'price_amendment', 'mf_addendum', 'closing_date_extension',
  'inspection_addendum', 'repair_addendum', 'hoa_addendum', 'lead_paint_addendum', 'custom',
];

interface ConfirmModalProps {
  doc: DocumentRequest;
  onConfirm: (staffName: string, notes: string) => void;
  onClose: () => void;
}
const ConfirmModal: React.FC<ConfirmModalProps> = ({ doc, onConfirm, onClose }) => {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  return (
    <div className="fixed inset-0 bg-base-100/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-base-200 rounded-2xl border border-base-300 shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 size={18} className="text-success" />
          <h3 className="font-bold text-base-content">Confirm Document Completed</h3>
        </div>
        <p className="text-sm text-base-content/70 mb-4">Confirming <strong>{doc.label}</strong> — this will clear the amber alert.</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-base-content/50 mb-1 block">Your Name *</label>
            <input className="input input-bordered input-sm w-full" value={name} onChange={e => setName(e.target.value)} placeholder="Staff member name" />
          </div>
          <div>
            <label className="text-xs text-base-content/50 mb-1 block">Notes (optional)</label>
            <textarea className="textarea textarea-bordered w-full text-sm" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Sent to DocuSign, signed by all parties..." />
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>
          <button onClick={() => name.trim() && onConfirm(name.trim(), notes)} className="btn btn-success btn-sm gap-1.5" disabled={!name.trim()}>
            <CheckCircle2 size={13} /> Confirm Completed
          </button>
        </div>
      </div>
    </div>
  );
};

interface RequestModalProps {
  isMF: boolean;
  onSubmit: (type: DocRequestType, notes: string, requestedBy: string, customLabel?: string) => void;
  onClose: () => void;
}
const RequestModal: React.FC<RequestModalProps> = ({ isMF, onSubmit, onClose }) => {
  const [type, setType] = useState<DocRequestType>('price_amendment');
  const [notes, setNotes] = useState('');
  const [by, setBy] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const config = docTypeConfig[type];
  return (
    <div className="fixed inset-0 bg-base-100/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-base-200 rounded-2xl border border-base-300 shadow-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-warning" />
            <h3 className="font-bold text-base-content">Request Document / Amendment</h3>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-xs btn-square"><X size={14} /></button>
        </div>

        {isMF && (
          <div className="alert alert-warning mb-4 py-2 text-sm gap-2">
            <Info size={14} /> Multi-family property detected — Multi-Family Addendum is required.
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs text-base-content/50 mb-1 block">Document Type *</label>
            <select className="select select-bordered select-sm w-full" value={type} onChange={e => setType(e.target.value as DocRequestType)}>
              {ALL_DOC_TYPES.map(t => <option key={t} value={t}>{docTypeConfig[t].label}</option>)}
            </select>
            <p className="text-xs text-base-content/50 mt-1">{config.description}</p>
          </div>
          {type === 'custom' && (
            <div>
              <label className="text-xs text-base-content/50 mb-1 block">Custom Label *</label>
              <input className="input input-bordered input-sm w-full" value={customLabel} onChange={e => setCustomLabel(e.target.value)} placeholder="e.g. Survey Addendum" />
            </div>
          )}
          <div>
            <label className="text-xs text-base-content/50 mb-1 block">Requested By *</label>
            <input className="input input-bordered input-sm w-full" value={by} onChange={e => setBy(e.target.value)} placeholder="e.g. Agent, Buyer, Lender..." />
          </div>
          <div>
            <label className="text-xs text-base-content/50 mb-1 block">Notes / Details</label>
            <textarea className="textarea textarea-bordered w-full text-sm" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Describe the change or reason..." />
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>
          <button
            onClick={() => by.trim() && onSubmit(type, notes, by.trim(), customLabel)}
            className="btn btn-warning btn-sm gap-1.5"
            disabled={!by.trim() || (type === 'custom' && !customLabel.trim())}
          >
            <AlertTriangle size={13} /> Create Alert
          </button>
        </div>
      </div>
    </div>
  );
};

export const WorkspaceDocuments: React.FC<Props> = ({ deal, onUpdate }) => {
  const [showRequest, setShowRequest] = useState(false);
  const [confirmDoc, setConfirmDoc] = useState<DocumentRequest | null>(null);

  const isMF = deal.propertyType === 'multi-family';
  const pending = deal.documentRequests.filter(d => d.status !== 'confirmed');
  const confirmed = deal.documentRequests.filter(d => d.status === 'confirmed');

  const handleRequest = (type: DocRequestType, notes: string, requestedBy: string, customLabel?: string) => {
    const config = docTypeConfig[type];
    const label = type === 'custom' && customLabel ? customLabel : config.label;
    const doc: DocumentRequest = {
      id: generateId(), type, label,
      description: notes || config.description,
      requestedAt: new Date().toISOString(),
      requestedBy, status: 'pending', urgency: config.urgency, notes,
    };
    onUpdate({
      ...deal,
      documentRequests: [...deal.documentRequests, doc],
      activityLog: [{ id: generateId(), timestamp: new Date().toISOString(), action: `📋 Document requested: ${label}`, detail: `Requested by ${requestedBy}. ${notes}`, user: requestedBy, type: 'document_requested' }, ...deal.activityLog],
      updatedAt: new Date().toISOString(),
    });
    setShowRequest(false);
  };

  const handleMarkInProgress = (id: string) => {
    onUpdate({ ...deal, documentRequests: deal.documentRequests.map(d => d.id === id ? { ...d, status: 'in_progress' } : d), updatedAt: new Date().toISOString() });
  };

  const handleConfirm = (id: string, staffName: string, notes: string) => {
    const doc = deal.documentRequests.find(d => d.id === id);
    onUpdate({
      ...deal,
      documentRequests: deal.documentRequests.map(d => d.id === id ? { ...d, status: 'confirmed', confirmedBy: staffName, confirmedAt: new Date().toISOString(), notes: notes || d.notes } : d),
      activityLog: [{ id: generateId(), timestamp: new Date().toISOString(), action: `✅ Document confirmed: ${doc?.label}`, detail: `Confirmed by ${staffName}. ${notes}`, user: staffName, type: 'document_confirmed' }, ...deal.activityLog],
      updatedAt: new Date().toISOString(),
    });
    setConfirmDoc(null);
  };

  const remove = (id: string) => onUpdate({ ...deal, documentRequests: deal.documentRequests.filter(d => d.id !== id), updatedAt: new Date().toISOString() });

  return (
    <div className="p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-sm text-base-content">Document Requests & Amendments</h3>
          <p className="text-xs text-base-content/50">Track required forms. Amber alerts stay active until confirmed.</p>
        </div>
        <button onClick={() => setShowRequest(true)} className="btn btn-warning btn-sm gap-1.5">
          <Plus size={13} /> Request Document
        </button>
      </div>

      {/* Multi-family banner */}
      {isMF && (
        <div className="flex items-center gap-3 p-3 bg-warning/10 border border-warning/30 rounded-xl">
          <AlertTriangle size={16} className="text-warning flex-none" />
          <div>
            <p className="text-sm font-semibold text-warning">Multi-Family Property Detected</p>
            <p className="text-xs text-base-content/60">A <strong>Multi-Family Addendum</strong> is required for this transaction. Verify it is on file.</p>
          </div>
        </div>
      )}

      {/* Pending / In-Progress alerts */}
      {pending.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-base-content/50 uppercase tracking-wide flex items-center gap-1.5">
            <AlertTriangle size={11} className="text-amber-500" /> Pending Alerts ({pending.length})
          </p>
          {pending.map(doc => (
            <div
              key={doc.id}
              className={`rounded-xl border p-4 ${
                doc.status === 'pending'
                  ? 'bg-amber-500/15 border-amber-500/50'
                  : 'bg-info/10 border-info/30'
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className={`p-1.5 rounded-lg ${doc.status === 'pending' ? 'bg-amber-500' : 'bg-info/20'}`}>
                    <FileText size={14} className={doc.status === 'pending' ? 'text-white' : 'text-info'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-base-content">{doc.label}</span>
                      <span className={`badge badge-xs ${STATUS_STYLES[doc.status].badge} gap-0.5`}>
                        {STATUS_STYLES[doc.status].icon} {STATUS_STYLES[doc.status].label}
                      </span>
                      {doc.urgency === 'high' && <span className="badge badge-error badge-xs">High Priority</span>}
                    </div>
                    <p className="text-xs text-base-content/60 mt-0.5">{doc.description}</p>
                  </div>
                </div>
                <button onClick={() => remove(doc.id)} className="btn btn-ghost btn-xs btn-square opacity-30 hover:opacity-100 flex-none"><X size={12} /></button>
              </div>

              <div className="flex items-center gap-2 text-xs text-base-content/50 mb-3">
                <span>Requested by <strong>{doc.requestedBy}</strong></span>
                <span>·</span>
                <span>{formatDateTime(doc.requestedAt)}</span>
              </div>

              <div className="flex gap-2">
                {doc.status === 'pending' && (
                  <button onClick={() => handleMarkInProgress(doc.id)} className="btn btn-info btn-xs gap-1">
                    <Clock size={11} /> Mark In Progress
                  </button>
                )}
                <button onClick={() => setConfirmDoc(doc)} className="btn btn-success btn-xs gap-1">
                  <CheckCircle2 size={11} /> Confirm Completed
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No pending */}
      {pending.length === 0 && (
        <div className="flex flex-col items-center py-8 gap-2 text-base-content/30">
          <CheckCircle2 size={28} className="text-success opacity-40" />
          <p className="text-sm">All documents are confirmed — no pending alerts.</p>
        </div>
      )}

      {/* Confirmed */}
      {confirmed.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-base-content/50 uppercase tracking-wide flex items-center gap-1.5">
            <CheckCircle2 size={11} className="text-success" /> Confirmed ({confirmed.length})
          </p>
          {confirmed.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 p-3 bg-base-200 rounded-xl border border-base-300 opacity-70">
              <CheckCircle2 size={15} className="text-success flex-none" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-base-content">{doc.label}</p>
                <p className="text-xs text-base-content/50">Confirmed by {doc.confirmedBy} · {doc.confirmedAt ? formatDateTime(doc.confirmedAt) : ''}</p>
              </div>
              <span className="badge badge-success badge-xs">Confirmed</span>
            </div>
          ))}
        </div>
      )}

      {showRequest && <RequestModal isMF={isMF} onSubmit={handleRequest} onClose={() => setShowRequest(false)} />}
      {confirmDoc && <ConfirmModal doc={confirmDoc} onConfirm={(name, notes) => handleConfirm(confirmDoc.id, name, notes)} onClose={() => setConfirmDoc(null)} />}
    </div>
  );
};
