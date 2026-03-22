import React, { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList, Plus, Send, CheckCircle, XCircle, Clock,
  FileText, RotateCcw, ChevronDown, ChevronRight, Mail, User, Edit3, Eye, ExternalLink,
} from 'lucide-react';
import type {
  Deal, DealParticipant,
  RequestRecord, RequestEvent, RequestDocument,
  RequestType, RequestStatus, RequestEventType,
} from '../types';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

// ── Local types ────────────────────────────────────────────────────────────────
interface InboundMessage {
  id: string;
  requestId: string | null;
  fromEmail: string;
  subject: string;
  bodyText: string;
  receivedAt: string;
  classification: string;
}

// ── Request type configuration ─────────────────────────────────────────────────
const REQUEST_TYPES: {
  type: RequestType;
  label: string;
  description: string;
  expectedResponseType: 'document_or_reply' | 'email_reply';
  defaultSide?: string;
  defaultRole?: string;
}[] = [
  {
    type: 'earnest_money_receipt',
    label: 'Earnest Money Receipt',
    description: 'Request confirmation that earnest money has been received',
    expectedResponseType: 'document_or_reply',
    defaultRole: 'title_officer',
  },
  {
    type: 'inspection_complete',
    label: 'Inspection Complete',
    description: 'Confirm inspection is complete and get estimated report timing',
    expectedResponseType: 'email_reply',
    defaultRole: 'inspector',
  },
  {
    type: 'repair_request',
    label: 'Repair Request',
    description: 'Request or confirm repair agreement from seller side',
    expectedResponseType: 'document_or_reply',
    defaultSide: 'listing',
    defaultRole: 'lead_agent',
  },
  {
    type: 'seller_credit_change',
    label: 'Seller Credit Change',
    description: 'Request seller credit modification confirmation in writing',
    expectedResponseType: 'email_reply',
    defaultSide: 'listing',
    defaultRole: 'lead_agent',
  },
];

// ── Status display config ──────────────────────────────────────────────────────
const STATUS_CONFIG: Record<RequestStatus, { label: string; badge: string }> = {
  draft:             { label: 'Draft',             badge: 'bg-gray-100 text-gray-500 border-gray-200' },
  sent:              { label: 'Sent',              badge: 'bg-blue-50 text-blue-600 border-blue-200' },
  waiting:           { label: 'Waiting',           badge: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  reply_received:    { label: 'Reply Received',    badge: 'bg-orange-50 text-orange-700 border-orange-200' },
  document_received: { label: 'Document Received', badge: 'bg-purple-50 text-purple-700 border-purple-200' },
  under_review:      { label: 'Under Review',      badge: 'bg-violet-50 text-violet-700 border-violet-200' },
  accepted:          { label: 'Accepted',          badge: 'bg-green-50 text-green-700 border-green-200' },
  rejected:          { label: 'Rejected',          badge: 'bg-red-50 text-red-600 border-red-200' },
  needs_follow_up:   { label: 'Needs Follow-Up',   badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  completed:         { label: 'Completed',         badge: 'bg-green-50 text-green-700 border-green-200' },
  overdue:           { label: 'Overdue',           badge: 'bg-red-50 text-red-700 border-red-200' },
  cancelled:         { label: 'Cancelled',         badge: 'bg-gray-100 text-gray-400 border-gray-200' },
};

const CLASSIFICATION_BADGE: Record<string, string> = {
  confirmation_reply: 'bg-green-50 text-green-700 border-green-200',
  document_received:  'bg-purple-50 text-purple-700 border-purple-200',
  needs_follow_up:    'bg-amber-50 text-amber-700 border-amber-200',
  out_of_office:      'bg-gray-100 text-gray-500 border-gray-200',
  unrelated:          'bg-gray-100 text-gray-400 border-gray-200',
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function shortToken(id: string): string {
  return `[REQ-${id.replace(/-/g, '').substring(0, 8).toUpperCase()}]`;
}

function suggestRecipient(participants: DealParticipant[], requestType: RequestType): DealParticipant | null {
  const config = REQUEST_TYPES.find(t => t.type === requestType);
  if (!config) return null;
  const match = participants.find(p => {
    const sideMatch = !config.defaultSide || p.side === config.defaultSide;
    const roleMatch = !config.defaultRole || p.dealRole === config.defaultRole;
    return sideMatch && roleMatch && p.contactEmail;
  });
  return match ?? participants.find(p => p.contactEmail) ?? null;
}

function getDefaultEmailContent(
  requestType: RequestType,
  recipientName: string,
  address: string,
  senderName: string,
  token: string
): { subject: string; body: string } {
  const addr = address || 'the property';
  const recip = recipientName || 'there';
  const subjects: Record<RequestType, string> = {
    earnest_money_receipt: `EMD Receipt Needed ${token} - ${addr}`,
    inspection_complete:   `Inspection Confirmation ${token} - ${addr}`,
    repair_request:        `Repair Request ${token} - ${addr}`,
    seller_credit_change:  `Seller Credit Change ${token} - ${addr}`,
  };
  const bodies: Record<RequestType, string> = {
    earnest_money_receipt:
      `Hi ${recip},\n\nI wanted to follow up on the earnest money deposit for ${addr}. Could you please confirm receipt and provide documentation when available?\n\nThank you,\n${senderName}`,
    inspection_complete:
      `Hi ${recip},\n\nCould you please confirm the inspection for ${addr} has been completed and provide an estimated report delivery time?\n\nThank you,\n${senderName}`,
    repair_request:
      `Hi ${recip},\n\nWe are following up on the repair request for ${addr}. Please review and confirm your client's agreement.\n\nThank you,\n${senderName}`,
    seller_credit_change:
      `Hi ${recip},\n\nWe need to confirm the seller credit change for ${addr}. Please confirm the agreed-upon credit amount in writing.\n\nThank you,\n${senderName}`,
  };
  return { subject: subjects[requestType], body: bodies[requestType] };
}

function mapRow(r: any): RequestRecord {
  return {
    id: r.id,
    dealId: r.deal_id,
    requestType: r.request_type as RequestType,
    status: r.status as RequestStatus,
    requestedFromContactId: r.requested_from_contact_id,
    requestedFromName: r.requested_from_name,
    requestedFromEmail: r.requested_from_email,
    outboundMessageId: r.outbound_message_id,
    taskId: r.task_id,
    subjectToken: r.subject_token,
    notes: r.notes,
    requiresReview: r.requires_review,
    expectedResponseType: r.expected_response_type,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    events: (r.request_events || []).map((e: any): RequestEvent => ({
      id: e.id,
      requestId: e.request_id,
      eventType: e.event_type as RequestEventType,
      description: e.description,
      actor: e.actor,
      metadata: e.metadata,
      createdAt: e.created_at,
    })),
    documents: (r.request_documents || []).map((d: any): RequestDocument => ({
      id: d.id,
      requestId: d.request_id,
      fileName: d.file_name,
      fileUrl: d.file_url,
      storagePath: d.storage_path,
      reviewStatus: d.review_status,
      reviewedBy: d.reviewed_by,
      reviewedAt: d.reviewed_at,
      notes: d.notes,
      source: d.source,
      gmailMessageId: d.gmail_message_id,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    })),
  };
}

// ── Main Component ─────────────────────────────────────────────────────────────
interface Props {
  deal: Deal;
}

export const WorkspaceRequests: React.FC<Props> = ({ deal }) => {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  // New request form state
  const [newType, setNewType] = useState<RequestType>('earnest_money_receipt');
  const [newRecipientId, setNewRecipientId] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [draftSubject, setDraftSubject] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const [creating, setCreating] = useState(false);

  // Inline send state (per-card)
  const [sendingId, setSendingId] = useState<string | null>(null);

  // Inline edit state for draft cards: requestId -> { to, subject, body }
  const [inlineEdits, setInlineEdits] = useState<Record<string, { to: string; subject: string; body: string }>>({});

  // Inbound messages per request (for review cards)
  const [inboundMessages, setInboundMessages] = useState<Record<string, InboundMessage[]>>({});
  const [loadingMessages, setLoadingMessages] = useState<Record<string, boolean>>({});

  // Doc preview state: docId → { url, filename } once fetched
  const [docPreviews, setDocPreviews] = useState<Record<string, { url: string; filename: string }>>({});
  const [fetchingDocIds, setFetchingDocIds] = useState<Set<string>>(new Set());

  const participants = deal.participants ?? [];

  // ── Load requests ────────────────────────────────────────────────────────────
  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('requests')
        .select('*, request_events(*), request_documents(*)')
        .eq('deal_id', deal.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRequests((data || []).map(mapRow));
    } catch (err) {
      console.error('Failed to load requests:', err);
    } finally {
      setLoading(false);
    }
  }, [deal.id]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  // ── Fetch & store Gmail attachment in Supabase Storage ────────────────────
  const loadDocPreview = useCallback(async (docId: string) => {
    if (fetchingDocIds.has(docId) || docPreviews[docId]) return;
    setFetchingDocIds(prev => new Set(prev).add(docId));
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const { supabase } = await import('../lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || anonKey;

      const res = await fetch(`${supabaseUrl}/functions/v1/fetch-attachment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ documentId: docId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Failed to fetch attachment');
      }

      const data = await res.json();
      setDocPreviews(prev => ({ ...prev, [docId]: { url: data.url, filename: data.filename } }));
    } catch (err: any) {
      console.error('loadDocPreview error:', err);
      alert(`Could not load preview: ${err.message}`);
    } finally {
      setFetchingDocIds(prev => { const s = new Set(prev); s.delete(docId); return s; });
    }
  }, [fetchingDocIds, docPreviews]);

  // ── Load inbound messages for a request ─────────────────────────────────────
  const loadInboundMessages = useCallback(async (requestId: string) => {
    if (inboundMessages[requestId] !== undefined || loadingMessages[requestId]) return;
    setLoadingMessages(prev => ({ ...prev, [requestId]: true }));
    try {
      const { data, error } = await supabase
        .from('inbound_messages')
        .select('id, request_id, from_email, subject, body_text, received_at, classification')
        .eq('request_id', requestId)
        .order('received_at', { ascending: false });
      if (error) throw error;
      setInboundMessages(prev => ({
        ...prev,
        [requestId]: (data || []).map((m: any): InboundMessage => ({
          id: m.id,
          requestId: m.request_id,
          fromEmail: m.from_email,
          subject: m.subject,
          bodyText: m.body_text,
          receivedAt: m.received_at,
          classification: m.classification,
        })),
      }));
    } catch (err) {
      console.error('Failed to load inbound messages:', err);
    } finally {
      setLoadingMessages(prev => ({ ...prev, [requestId]: false }));
    }
  }, [inboundMessages, loadingMessages]);

  // ── Rebuild inline email when type or recipient changes ─────────────────────
  useEffect(() => {
    const participant = participants.find(p => p.id === newRecipientId);
    const token = '[REQ-????????]';
    const content = getDefaultEmailContent(
      newType,
      participant?.contactName || '',
      deal.propertyAddress,
      profile?.name || 'TC',
      token,
    );
    setDraftTo(participant?.contactEmail || '');
    setDraftSubject(content.subject);
    setDraftBody(content.body);
  }, [newType, newRecipientId, participants, deal.propertyAddress, profile?.name]);

  // ── Add event helper ─────────────────────────────────────────────────────────
  const addEvent = async (requestId: string, eventType: RequestEventType, description?: string) => {
    await supabase.from('request_events').insert({
      request_id: requestId,
      event_type: eventType,
      description,
      actor: profile?.name || 'Staff',
    });
  };

  // ── Update status ────────────────────────────────────────────────────────────
  const updateStatus = async (requestId: string, status: RequestStatus, eventDesc?: string) => {
    await supabase
      .from('requests')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', requestId);
    await addEvent(requestId, 'status_changed', eventDesc || `Status changed to ${status}`);
    await loadRequests();
  };

  // ── Toggle expansion + fetch inbound messages for review cards ──────────────
  const handleToggle = (req: RequestRecord) => {
    const newId = expandedId === req.id ? null : req.id;
    setExpandedId(newId);

    if (newId) {
      const needsReview = ['reply_received', 'document_received', 'under_review'].includes(req.status);
      if (needsReview) {
        loadInboundMessages(req.id);
      }
      if (req.status === 'draft' && !inlineEdits[req.id]) {
        const content = getDefaultEmailContent(
          req.requestType,
          req.requestedFromName || '',
          deal.propertyAddress,
          profile?.name || 'TC',
          req.subjectToken || '',
        );
        setInlineEdits(prev => ({
          ...prev,
          [req.id]: {
            to: req.requestedFromEmail || '',
            subject: content.subject,
            body: content.body,
          },
        }));
      }
    }
  };

  // ── Create request (draft only) ────────────────────────────────────────────
  const handleCreateDraft = async () => {
    setCreating(true);
    try {
      const participant = participants.find(p => p.id === newRecipientId);
      const typeConfig = REQUEST_TYPES.find(t => t.type === newType)!;
      const tempId = crypto.randomUUID();
      const token = shortToken(tempId);

      const { data, error } = await supabase.from('requests').insert({
        id: tempId,
        deal_id: deal.id,
        request_type: newType,
        status: 'draft',
        requested_from_contact_id: participant?.contactId || null,
        requested_from_name: participant?.contactName || null,
        requested_from_email: participant?.contactEmail || null,
        subject_token: token,
        notes: newNotes || null,
        requires_review: true,
        expected_response_type: typeConfig.expectedResponseType,
        created_by: profile?.name || 'Staff',
      }).select().single();

      if (error) throw error;
      await addEvent(data.id, 'created', `Request created by ${profile?.name || 'Staff'}`);

      const realSubject = draftSubject.replace('[REQ-????????]', token);
      const realBody = draftBody.replace('[REQ-????????]', token);
      setInlineEdits(prev => ({
        ...prev,
        [data.id]: { to: draftTo, subject: realSubject, body: realBody },
      }));

      setShowNewModal(false);
      resetNewForm();
      await loadRequests();
      setExpandedId(data.id);
    } catch (err) {
      console.error('Failed to create request:', err);
    } finally {
      setCreating(false);
    }
  };

  // ── Create + send immediately ─────────────────────────────────────────────────
  const handleCreateAndSend = async () => {
    setCreating(true);
    try {
      const participant = participants.find(p => p.id === newRecipientId);
      const typeConfig = REQUEST_TYPES.find(t => t.type === newType)!;
      const tempId = crypto.randomUUID();
      const token = shortToken(tempId);
      const realSubject = draftSubject.replace('[REQ-????????]', token);
      const realBody = draftBody.replace('[REQ-????????]', token);

      const { data, error } = await supabase.from('requests').insert({
        id: tempId,
        deal_id: deal.id,
        request_type: newType,
        status: 'draft',
        requested_from_contact_id: participant?.contactId || null,
        requested_from_name: participant?.contactName || null,
        requested_from_email: draftTo || participant?.contactEmail || null,
        subject_token: token,
        notes: newNotes || null,
        requires_review: true,
        expected_response_type: typeConfig.expectedResponseType,
        created_by: profile?.name || 'Staff',
      }).select().single();

      if (error) throw error;
      await addEvent(data.id, 'created', `Request created by ${profile?.name || 'Staff'}`);
      setShowNewModal(false);
      resetNewForm();
      await loadRequests();
      await sendEmail(data.id, draftTo, realSubject, realBody);
    } catch (err) {
      console.error('Failed to create and send request:', err);
    } finally {
      setCreating(false);
    }
  };

  // ── Core send email ────────────────────────────────────────────────────────────
  const sendEmail = async (requestId: string, to: string, subject: string, body: string) => {
    setSendingId(requestId);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const bodyHtml = body.split('\n').map(line =>
        line.trim() ? `<p style="margin:0 0 8px 0;">${line}</p>` : '<br/>'
      ).join('');

      const resp = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          to: [to], cc: [], bcc: [], subject, bodyHtml,
          dealId: deal.id, emailType: 'deal',
          sentBy: profile?.name || 'Staff', requestId,
        }),
      });

      if (!resp.ok) throw new Error('Email send failed');
      const result = await resp.json();

      await supabase.from('requests').update({
        status: 'waiting',
        outbound_message_id: result.logId || null,
        updated_at: new Date().toISOString(),
      }).eq('id', requestId);

      await addEvent(requestId, 'sent', `Email sent to ${to} by ${profile?.name || 'Staff'}`);
      await loadRequests();
    } catch (err) {
      console.error('Send email error:', err);
    } finally {
      setSendingId(null);
    }
  };

  const handleInlineSend = async (request: RequestRecord) => {
    const edit = inlineEdits[request.id];
    if (!edit) return;
    await sendEmail(request.id, edit.to, edit.subject, edit.body);
  };

  const handleAccept = async (request: RequestRecord) => {
    await supabase.from('requests').update({
      status: 'accepted', reviewed_by: profile?.name || 'Staff',
      reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', request.id);
    await addEvent(request.id, 'accepted', `Accepted by ${profile?.name || 'Staff'}`);
    await loadRequests();
  };

  const handleReject = async (request: RequestRecord) => {
    await supabase.from('requests').update({
      status: 'rejected', reviewed_by: profile?.name || 'Staff',
      reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', request.id);
    await addEvent(request.id, 'rejected', `Rejected by ${profile?.name || 'Staff'}`);
    await loadRequests();
  };

  const handleMarkReceived = async (request: RequestRecord) => {
    const newStatus: RequestStatus =
      request.expectedResponseType === 'email_reply' ? 'reply_received' : 'document_received';
    await supabase.from('requests').update({
      status: newStatus, updated_at: new Date().toISOString(),
    }).eq('id', request.id);
    await addEvent(
      request.id,
      request.expectedResponseType === 'email_reply' ? 'reply_received' : 'document_received',
      `Marked received by ${profile?.name || 'Staff'}`
    );
    await loadRequests();
  };

  const resetNewForm = () => {
    setNewType('earnest_money_receipt');
    setNewRecipientId('');
    setNewNotes('');
  };

  const getTypeLabel = (type: RequestType) => REQUEST_TYPES.find(t => t.type === type)?.label || type;
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const activeRequests = requests.filter(r =>
    !['completed', 'cancelled', 'accepted', 'rejected'].includes(r.status)
  );
  const closedRequests = requests.filter(r =>
    ['completed', 'cancelled', 'accepted', 'rejected'].includes(r.status)
  );
  const recipientOptions = participants.filter(p => p.contactEmail || p.contactName);

  const handleOpenNewModal = () => {
    resetNewForm();
    const suggested = suggestRecipient(participants, 'earnest_money_receipt');
    setNewRecipientId(suggested?.id || '');
    setShowNewModal(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="loading loading-spinner loading-md text-primary" />
        <span className="ml-3 text-sm text-base-content/60">Loading requests…</span>
      </div>
    );
  }

  const renderCards = (list: RequestRecord[]) => list.map(req => (
    <RequestCard
      key={req.id}
      request={req}
      expanded={expandedId === req.id}
      onToggle={() => handleToggle(req)}
      onMarkReceived={() => handleMarkReceived(req)}
      onAccept={() => handleAccept(req)}
      onReject={() => handleReject(req)}
      onUpdateStatus={(s) => updateStatus(req.id, s)}
      onInlineSend={() => handleInlineSend(req)}
      inlineEdit={inlineEdits[req.id]}
      onInlineEditChange={(field, value) =>
        setInlineEdits(prev => ({ ...prev, [req.id]: { ...prev[req.id], [field]: value } }))
      }
      sending={sendingId === req.id}
      inboundMessages={inboundMessages[req.id] || []}
      loadingMessages={!!loadingMessages[req.id]}
      getTypeLabel={getTypeLabel}
      fmtDate={fmtDate}
    />
  ));

  return (
    <div className="p-4 space-y-4 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList size={18} className="text-primary" />
          <h2 className="font-bold text-base text-base-content">Requests</h2>
          {requests.length > 0 && <span className="badge badge-ghost badge-sm">{requests.length}</span>}
        </div>
        <button className="btn btn-primary btn-sm gap-1.5" onClick={handleOpenNewModal}>
          <Plus size={14} /> New Request
        </button>
      </div>

      {requests.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-base-300 rounded-xl">
          <ClipboardList size={40} className="text-base-content/20 mb-3" />
          <p className="font-semibold text-base-content/50">No requests yet</p>
          <p className="text-sm text-base-content/40 mt-1 max-w-xs">
            Track earnest money receipts, inspections, repair confirmations, and seller credit changes.
          </p>
          <button className="btn btn-primary btn-sm mt-4 gap-1.5" onClick={handleOpenNewModal}>
            <Plus size={14} /> Create First Request
          </button>
        </div>
      )}

      {activeRequests.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-base-content/40 uppercase tracking-wide">Active ({activeRequests.length})</p>
          {renderCards(activeRequests)}
        </div>
      )}

      {closedRequests.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-base-content/40 uppercase tracking-wide">Closed ({closedRequests.length})</p>
          {renderCards(closedRequests)}
        </div>
      )}

      {/* New Request Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={() => setShowNewModal(false)}>
          <div className="bg-base-100 rounded-xl shadow-xl w-full max-w-xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="p-5 pb-3 border-b border-base-200">
              <h3 className="font-bold text-base flex items-center gap-2">
                <ClipboardList size={16} className="text-primary" /> New Request
              </h3>
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-2 block">Request Type</label>
                <div className="space-y-2">
                  {REQUEST_TYPES.map(t => (
                    <label key={t.type} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      newType === t.type ? 'border-primary bg-primary/5' : 'border-base-300 hover:border-primary/40'
                    }`}>
                      <input type="radio" className="radio radio-primary radio-sm mt-0.5 flex-none" checked={newType === t.type}
                        onChange={() => { setNewType(t.type); const s = suggestRecipient(participants, t.type); setNewRecipientId(s?.id || ''); }} />
                      <div>
                        <p className="text-sm font-semibold">{t.label}</p>
                        <p className="text-xs text-base-content/50">{t.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-1.5 block">Send To</label>
                {recipientOptions.length === 0 ? (
                  <p className="text-sm text-base-content/40 italic">No contacts with email found on this deal</p>
                ) : (
                  <select className="select select-bordered select-sm w-full" value={newRecipientId} onChange={e => setNewRecipientId(e.target.value)}>
                    <option value="">— Select recipient —</option>
                    {recipientOptions.map(p => (
                      <option key={p.id} value={p.id}>{p.contactName}{p.contactEmail ? ` (${p.contactEmail})` : ''} — {p.dealRole}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="border border-base-300 rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-base-200/60 border-b border-base-300">
                  <Mail size={13} className="text-primary" />
                  <span className="text-xs font-semibold text-base-content/60 uppercase tracking-wide">Email Draft</span>
                  <Edit3 size={11} className="text-base-content/30 ml-auto" />
                  <span className="text-xs text-base-content/30">Editable</span>
                </div>
                <div className="p-3 space-y-2.5 bg-white">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-base-content/40 w-12 flex-none font-medium">To</span>
                    <input type="email" className="input input-bordered input-xs flex-1 font-mono" value={draftTo} onChange={e => setDraftTo(e.target.value)} placeholder="recipient@email.com" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-base-content/40 w-12 flex-none font-medium">Subject</span>
                    <input type="text" className="input input-bordered input-xs flex-1" value={draftSubject} onChange={e => setDraftSubject(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <span className="text-xs text-base-content/40 w-12 flex-none font-medium pt-1">Body</span>
                    <textarea className="textarea textarea-bordered textarea-xs flex-1 font-mono text-xs leading-relaxed" rows={7} value={draftBody} onChange={e => setDraftBody(e.target.value)} />
                  </div>
                  <p className="text-[10px] text-base-content/30 pl-14">Reply token will be inserted into subject automatically on send.</p>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-1.5 block">Internal Notes (optional)</label>
                <textarea className="textarea textarea-bordered textarea-sm w-full" rows={2} placeholder="Add any internal context or instructions…" value={newNotes} onChange={e => setNewNotes(e.target.value)} />
              </div>
            </div>
            <div className="p-4 border-t border-base-200 flex gap-2 justify-end">
              <button className="btn btn-sm btn-ghost" onClick={() => setShowNewModal(false)}>Cancel</button>
              <button className="btn btn-sm btn-outline gap-1.5" onClick={handleCreateDraft} disabled={creating}>
                {creating ? <span className="loading loading-spinner loading-xs" /> : <FileText size={13} />} Save Draft
              </button>
              <button className="btn btn-sm btn-primary gap-1.5" onClick={handleCreateAndSend} disabled={creating || !draftTo.trim()}>
                {creating ? <span className="loading loading-spinner loading-xs" /> : <Send size={13} />} Create &amp; Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Request Card ──────────────────────────────────────────────────────────────────
interface RequestCardProps {
  request: RequestRecord;
  expanded: boolean;
  onToggle: () => void;
  onMarkReceived: () => void;
  onAccept: () => void;
  onReject: () => void;
  onUpdateStatus: (s: RequestStatus) => void;
  onInlineSend: () => void;
  inlineEdit?: { to: string; subject: string; body: string };
  onInlineEditChange: (field: 'to' | 'subject' | 'body', value: string) => void;
  sending: boolean;
  inboundMessages: InboundMessage[];
  loadingMessages: boolean;
  getTypeLabel: (t: RequestType) => string;
  fmtDate: (iso: string) => string;
}

const RequestCard: React.FC<RequestCardProps> = ({
  request, expanded, onToggle, onMarkReceived,
  onAccept, onReject, onInlineSend, inlineEdit,
  onInlineEditChange, sending, inboundMessages, loadingMessages,
  getTypeLabel, fmtDate,
}) => {
  const statusCfg = STATUS_CONFIG[request.status] ?? { label: request.status, badge: 'badge-ghost' };
  const isClosed = ['completed', 'cancelled', 'accepted', 'rejected'].includes(request.status);
  const isDraft = request.status === 'draft';
  const isWaiting = request.status === 'waiting';
  const needsReview = ['reply_received', 'document_received', 'under_review'].includes(request.status);

  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  return (
    <div className={`border rounded-lg overflow-hidden transition-colors ${
      needsReview && !isClosed ? 'border-orange-200 bg-orange-50/20' :
      isClosed ? 'border-base-200 bg-base-50' : 'border-base-300 bg-white'
    }`}>
      {/* Card header */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-base-100 transition-colors" onClick={onToggle}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-base-content">{getTypeLabel(request.requestType)}</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${statusCfg.badge}`}>
              {statusCfg.label}
            </span>
            {needsReview && !isClosed && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium bg-orange-50 text-orange-700 border-orange-200">
                <Eye size={10} /> Review needed
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <User size={11} className="text-base-content/30 flex-none" />
            <span className="text-xs text-base-content/55">
              {request.requestedFromName || 'No recipient set'}
              {request.requestedFromEmail && <span className="text-base-content/35"> · {request.requestedFromEmail}</span>}
            </span>
          </div>
        </div>
        <div className="flex-none flex items-center gap-2">
          <span className="text-xs text-base-content/35">{fmtDate(request.createdAt)}</span>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </div>

      {/* Quick action bar (collapsed) */}
      {!expanded && (
        <div className="px-4 pb-3 flex items-center gap-2 flex-wrap border-t border-base-100">
          {isDraft && (
            <button className="btn btn-xs btn-primary gap-1" onClick={e => { e.stopPropagation(); onToggle(); }}>
              <Edit3 size={11} /> Edit &amp; Send
            </button>
          )}
          {isWaiting && (
            <>
              <button className="btn btn-xs btn-outline gap-1" onClick={e => { e.stopPropagation(); onMarkReceived(); }}>
                <CheckCircle size={11} /> Mark Received
              </button>
              <button className="btn btn-xs btn-ghost gap-1 text-base-content/50" onClick={e => { e.stopPropagation(); onToggle(); }}>
                <RotateCcw size={11} /> Resend
              </button>
            </>
          )}
          {needsReview && !isClosed && (
            <button className="btn btn-xs btn-warning gap-1" onClick={e => { e.stopPropagation(); onToggle(); }}>
              <Eye size={11} /> Review Reply
            </button>
          )}
          {request.status === 'needs_follow_up' && (
            <button className="btn btn-xs btn-warning gap-1" onClick={e => { e.stopPropagation(); onToggle(); }}>
              <Send size={11} /> Send Follow-Up
            </button>
          )}
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-base-200 bg-base-50 space-y-3 pb-1">

          {/* Inbound Email Viewer */}
          {needsReview && (
            <div className="mx-4 mt-3">
              <p className="text-xs font-semibold text-base-content/40 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Mail size={11} /> Received Reply
              </p>
              {loadingMessages ? (
                <div className="flex items-center gap-2 py-4">
                  <span className="loading loading-spinner loading-xs text-primary" />
                  <span className="text-xs text-base-content/40">Loading email…</span>
                </div>
              ) : inboundMessages.length === 0 ? (
                <div className="border border-dashed border-base-300 rounded-lg p-4 text-center">
                  <p className="text-xs text-base-content/40">No linked email reply found.</p>
                  <p className="text-xs text-base-content/30 mt-0.5">The inbound processor may still be matching it, or it was marked manually.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {inboundMessages.map(msg => (
                    <div key={msg.id} className="border border-base-300 rounded-lg overflow-hidden bg-white shadow-sm">
                      <div className="px-3 py-2 bg-base-100 border-b border-base-200 flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-base-content truncate">{msg.subject}</p>
                          <p className="text-xs text-base-content/50 mt-0.5">From: <span className="font-medium">{msg.fromEmail}</span></p>
                        </div>
                        <div className="flex-none flex flex-col items-end gap-1">
                          <span className="text-[10px] text-base-content/35 whitespace-nowrap">{fmtDateTime(msg.receivedAt)}</span>
                          {msg.classification && (
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                              CLASSIFICATION_BADGE[msg.classification] || 'bg-gray-100 text-gray-500 border-gray-200'
                            }`}>
                              {msg.classification.replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="px-3 py-3 max-h-48 overflow-y-auto">
                        <p className="text-xs text-base-content/70 whitespace-pre-wrap leading-relaxed">
                          {msg.bodyText || '(No message body)'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Documents */}
          {(request.documents?.length ?? 0) > 0 && (
            <div className="mx-4">
              <p className="text-xs font-semibold text-base-content/40 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <FileText size={11} /> Documents ({request.documents!.length})
              </p>
              <div className="space-y-2">
                {request.documents!.map(doc => {
                  const preview = docPreviews[doc.id];
                  const isFetching = fetchingDocIds.has(doc.id);
                  const isPdf = (doc.fileName || '').toLowerCase().endsWith('.pdf') ||
                    (preview?.filename || '').toLowerCase().endsWith('.pdf');

                  return (
                    <div key={doc.id} className="border border-base-200 rounded-lg overflow-hidden bg-white">
                      {/* Doc row */}
                      <div className="flex items-center gap-2 px-3 py-2">
                        <FileText size={13} className="text-primary flex-none" />
                        <span className="text-xs text-base-content/70 flex-1 truncate">{doc.fileName || 'Document'}</span>
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          doc.reviewStatus === 'accepted' ? 'bg-green-50 text-green-600' :
                          doc.reviewStatus === 'rejected' ? 'bg-red-50 text-red-600' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {doc.reviewStatus}
                        </span>

                        {/* If we already have a URL, show View + Preview toggle */}
                        {(doc.fileUrl || preview) ? (
                          <div className="flex items-center gap-1">
                            <a href={doc.fileUrl || preview!.url} target="_blank" rel="noopener noreferrer"
                              className="btn btn-xs btn-ghost gap-1 text-primary" onClick={e => e.stopPropagation()}>
                              <ExternalLink size={11} /> Open
                            </a>
                            {isPdf && (
                              <button
                                className="btn btn-xs btn-ghost gap-1 text-primary"
                                onClick={e => {
                                  e.stopPropagation();
                                  // Toggle preview: if already showing, remove it; otherwise keep
                                  if (preview) {
                                    setDocPreviews(prev => { const n = { ...prev }; delete n[doc.id]; return n; });
                                  } else {
                                    loadDocPreview(doc.id);
                                  }
                                }}
                              >
                                {preview ? 'Hide' : 'Preview'}
                              </button>
                            )}
                          </div>
                        ) : doc.gmailMessageId ? (
                          /* Not yet fetched - show Load Preview button */
                          <button
                            className="btn btn-xs btn-primary gap-1"
                            disabled={isFetching}
                            onClick={e => { e.stopPropagation(); loadDocPreview(doc.id); }}
                          >
                            {isFetching ? (
                              <span className="loading loading-spinner loading-xs" />
                            ) : (
                              <><FileText size={11} /> Preview</>
                            )}
                          </button>
                        ) : null}
                      </div>

                      {/* Inline PDF preview panel */}
                      {preview && isPdf && (
                        <div className="border-t border-base-200 bg-gray-50">
                          <iframe
                            src={preview.url}
                            className="w-full rounded-b-lg"
                            style={{ height: '480px', border: 'none' }}
                            title={preview.filename}
                          />
                        </div>
                      )}

                      {/* Image preview for non-PDF */}
                      {preview && !isPdf && (
                        <div className="border-t border-base-200 bg-gray-50 p-2">
                          <img
                            src={preview.url}
                            alt={preview.filename}
                            className="max-w-full rounded"
                            style={{ maxHeight: '480px', objectFit: 'contain' }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Accept / Reject */}
          {needsReview && !isClosed && (
            <div className="mx-4 flex gap-2">
              <button className="btn btn-sm btn-success gap-1.5" onClick={e => { e.stopPropagation(); onAccept(); }}>
                <CheckCircle size={13} /> Accept
              </button>
              <button className="btn btn-sm btn-error btn-outline gap-1.5" onClick={e => { e.stopPropagation(); onReject(); }}>
                <XCircle size={13} /> Reject
              </button>
            </div>
          )}

          {/* Inline Email Draft */}
          {(isDraft || request.status === 'needs_follow_up' || isWaiting) && inlineEdit && (
            <div className="mx-4 border border-base-300 rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-base-200/60 border-b border-base-300">
                <Mail size={13} className="text-primary" />
                <span className="text-xs font-semibold text-base-content/60 uppercase tracking-wide">
                  {isWaiting ? 'Resend Email' : 'Email Draft'}
                </span>
                <span className="ml-auto text-[10px] text-base-content/30 flex items-center gap-1">
                  <Edit3 size={10} /> Edit before sending
                </span>
              </div>
              <div className="p-3 space-y-2 bg-white">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-base-content/40 w-14 flex-none font-medium">To</span>
                  <input type="email" className="input input-bordered input-xs flex-1 font-mono"
                    value={inlineEdit.to} onChange={e => onInlineEditChange('to', e.target.value)} onClick={e => e.stopPropagation()} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-base-content/40 w-14 flex-none font-medium">Subject</span>
                  <input type="text" className="input input-bordered input-xs flex-1"
                    value={inlineEdit.subject} onChange={e => onInlineEditChange('subject', e.target.value)} onClick={e => e.stopPropagation()} />
                </div>
                <div className="flex gap-2">
                  <span className="text-xs text-base-content/40 w-14 flex-none font-medium pt-1">Body</span>
                  <textarea className="textarea textarea-bordered textarea-xs flex-1 font-mono text-xs leading-relaxed" rows={7}
                    value={inlineEdit.body} onChange={e => onInlineEditChange('body', e.target.value)} onClick={e => e.stopPropagation()} />
                </div>
              </div>
              <div className="px-3 py-2.5 bg-base-100 border-t border-base-200 flex justify-between items-center">
                {request.subjectToken && <span className="text-[10px] text-base-content/35 font-mono">{request.subjectToken}</span>}
                <button className="btn btn-xs btn-primary gap-1 ml-auto"
                  onClick={e => { e.stopPropagation(); onInlineSend(); }} disabled={sending || !inlineEdit.to.trim()}>
                  {sending ? <span className="loading loading-spinner loading-xs" /> : <Send size={11} />}
                  {isWaiting ? 'Resend' : 'Send Email'}
                </button>
              </div>
            </div>
          )}

          {/* Token + notes + history */}
          <div className="px-4 pb-3 space-y-3">
            {!isDraft && request.subjectToken && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-base-content/40">Reply token:</span>
                <code className="text-xs bg-white border border-base-200 px-2 py-0.5 rounded font-mono">{request.subjectToken}</code>
              </div>
            )}
            {request.notes && (
              <div>
                <p className="text-xs font-semibold text-base-content/40 mb-1">Internal Notes</p>
                <p className="text-xs text-base-content/65">{request.notes}</p>
              </div>
            )}
            {(request.events?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-semibold text-base-content/40 mb-1">History</p>
                <div className="space-y-1.5">
                  {[...(request.events || [])]
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map(ev => (
                      <div key={ev.id} className="flex items-start gap-2 text-xs">
                        <Clock size={10} className="text-base-content/25 mt-0.5 flex-none" />
                        <span className="text-base-content/55 flex-1">
                          {ev.description || ev.eventType}
                          {ev.actor && <span className="text-base-content/35"> · {ev.actor}</span>}
                        </span>
                        <span className="text-base-content/30 flex-none">
                          {new Date(ev.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
            {(request.events?.length ?? 0) === 0 && !request.notes && (request.documents?.length ?? 0) === 0 && !isDraft && (
              <p className="text-xs text-base-content/30 italic">No history yet</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
