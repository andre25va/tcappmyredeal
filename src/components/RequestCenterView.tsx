import React, { useState, useEffect } from 'react';
import { ClipboardList, Filter, RefreshCw, ChevronRight } from 'lucide-react';
import { RequestRecord, RequestStatus, RequestType } from '../types';
import { supabase } from '../lib/supabase';
import { EmptyState } from './ui/EmptyState';

// ── Display maps ───────────────────────────────────────────────────────────────
const STATUS_BADGE: Record<string, string> = {
  draft:             'bg-gray-100 text-gray-500 border-gray-200',
  sent:              'bg-blue-50 text-blue-600 border-blue-200',
  waiting:           'bg-yellow-50 text-yellow-700 border-yellow-200',
  reply_received:    'bg-orange-50 text-orange-700 border-orange-200',
  document_received: 'bg-purple-50 text-purple-700 border-purple-200',
  under_review:      'bg-violet-50 text-violet-700 border-violet-200',
  accepted:          'bg-green-50 text-green-700 border-green-200',
  rejected:          'bg-red-50 text-red-600 border-red-200',
  needs_follow_up:   'bg-amber-50 text-amber-700 border-amber-200',
  completed:         'bg-green-50 text-green-700 border-green-200',
  overdue:           'bg-red-50 text-red-700 border-red-200',
  cancelled:         'bg-gray-100 text-gray-400 border-gray-200',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', sent: 'Sent', waiting: 'Waiting',
  reply_received: 'Reply Received', document_received: 'Document Received',
  under_review: 'Under Review', accepted: 'Accepted', rejected: 'Rejected',
  needs_follow_up: 'Needs Follow-Up', completed: 'Completed',
  overdue: 'Overdue', cancelled: 'Cancelled',
};

const TYPE_LABELS: Record<string, string> = {
  earnest_money_receipt: 'EMD Receipt',
  inspection_complete:   'Inspection',
  repair_request:        'Repair Request',
  seller_credit_change:  'Seller Credit',
};

// ── Extended row with joined deal fields ──────────────────────────────────────
interface RequestRow extends RequestRecord {
  dealPipelineStage?: string;
}

// ── Component ──────────────────────────────────────────────────────────────────
interface Props {
  onSelectDeal?: (dealId: string) => void;
  onSelectDealWithTab?: (dealId: string, tab: string) => void;
}

export const RequestCenterView: React.FC<Props> = ({ onSelectDeal, onSelectDealWithTab }) => {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const loadRequests = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('requests')
        .select('*, deals(property_address, pipeline_stage, closing_date)')
        .order('created_at', { ascending: false });

      if (statusFilter === 'active') {
        query = query.not('status', 'in', '(completed,cancelled,accepted,rejected)');
      } else if (statusFilter === 'overdue') {
        query = query.eq('status', 'overdue');
      } else if (statusFilter === 'needs_review') {
        query = query.in('status', ['reply_received', 'document_received', 'under_review']);
      } else if (statusFilter === 'closed') {
        query = query.in('status', ['completed', 'accepted', 'rejected', 'cancelled']);
      } else if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (typeFilter !== 'all') {
        query = query.eq('request_type', typeFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      setRequests((data || []).map((r: any): RequestRow => ({
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
        dealAddress: r.deals?.property_address || '—',
        dealPipelineStage: r.deals?.pipeline_stage,
        dueBy: r.due_by ?? null,
        nudgeCount: r.nudge_count ?? 0,
        waitingOn: r.waiting_on ?? null,
        receivedAt: r.received_at ?? null,
      })));
    } catch (err) {
      console.error('Failed to load requests:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRequests(); }, [statusFilter, typeFilter]);

  const needsReviewCount = requests.filter(r =>
    ['reply_received', 'document_received', 'under_review'].includes(r.status)
  ).length;

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-none bg-white border-b border-base-300 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ClipboardList size={20} className="text-primary" />
            <div>
              <h1 className="font-bold text-lg text-base-content">Request Center</h1>
              <p className="text-xs text-base-content/50">
                Track document and reply requests across all deals
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {needsReviewCount > 0 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-semibold bg-amber-50 text-amber-700 border-amber-200">
                {needsReviewCount} need review
              </span>
            )}
            <button
              className="btn btn-sm btn-ghost btn-square"
              onClick={loadRequests}
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Filter size={13} className="text-base-content/35" />
            <span className="text-xs text-base-content/45">Status:</span>
          </div>
          {[
            { value: 'active',       label: 'Active' },
            { value: 'overdue',      label: '🔴 Overdue' },
            { value: 'needs_review', label: 'Needs Review' },
            { value: 'closed',       label: 'Closed' },
            { value: 'all',          label: 'All' },
          ].map(f => (
            <button
              key={f.value}
              className={`btn btn-xs ${statusFilter === f.value ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
          <div className="w-px h-4 bg-base-300 mx-1" />
          <select
            className="select select-bordered select-xs"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
          >
            <option value="all">All Types</option>
            <option value="earnest_money_receipt">EMD Receipt</option>
            <option value="inspection_complete">Inspection</option>
            <option value="repair_request">Repair Request</option>
            <option value="seller_credit_change">Seller Credit</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="loading loading-spinner text-primary" />
            <span className="ml-3 text-sm text-base-content/60">Loading requests…</span>
          </div>
        ) : requests.length === 0 ? (
          <EmptyState
            icon={<ClipboardList size={48} />}
            title="No requests found"
            message="Create requests from within a deal's Requests tab"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm w-full">
              <thead>
                <tr className="text-xs text-base-content/45 border-b border-base-200">
                  <th className="font-semibold">Deal</th>
                  <th className="font-semibold">Type</th>
                  <th className="font-semibold">Recipient</th>
                  <th className="font-semibold">Status</th>
                  <th className="font-semibold">Due / Party</th>
                  <th className="font-semibold">Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {requests.map(req => (
                  <tr
                    key={req.id}
                    className={`cursor-pointer transition-colors border-b border-base-100 ${
                      req.status === 'overdue' ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-base-100'
                    }`}
                    onClick={() => onSelectDealWithTab?.(req.dealId, 'requests')}
                  >
                    <td className="font-medium text-sm text-base-content">
                      {req.dealAddress}
                    </td>
                    <td>
                      <span className="text-xs text-base-content/65">
                        {TYPE_LABELS[req.requestType] || req.requestType}
                      </span>
                    </td>
                    <td>
                      <div className="text-xs">
                        <p className="font-medium text-base-content/75">
                          {req.requestedFromName || '—'}
                        </p>
                        {req.requestedFromEmail && (
                          <p className="text-base-content/40 text-[11px]">
                            {req.requestedFromEmail}
                          </p>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${STATUS_BADGE[req.status] || 'bg-gray-100 text-gray-500'}`}>
                        {STATUS_LABELS[req.status] || req.status}
                      </span>
                    </td>
                    <td>
                      <div className="text-xs space-y-0.5">
                        {(req as any).dueBy && !(req as any).receivedAt && (
                          <p className={`font-medium ${req.status === 'overdue' ? 'text-red-600' : 'text-base-content/55'}`}>
                            Due {fmtDate((req as any).dueBy)}
                          </p>
                        )}
                        {(req as any).receivedAt && (
                          <p className="text-green-600 font-medium">✓ Received</p>
                        )}
                        {(req as any).waitingOn && (
                          <p className="text-base-content/40">
                            Waiting: {(req as any).waitingOn}
                          </p>
                        )}
                        {(req as any).nudgeCount > 0 && (
                          <p className="text-amber-600">{(req as any).nudgeCount}× nudged</p>
                        )}
                      </div>
                    </td>
                    <td className="text-xs text-base-content/45">
                      {fmtDate(req.createdAt)}
                    </td>
                    <td>
                      <ChevronRight size={14} className="text-base-content/25" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
