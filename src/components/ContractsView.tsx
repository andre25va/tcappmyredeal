import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileSignature, Search, FileText, ExternalLink,
  ChevronRight, MapPin, AlertCircle, Hash, PenLine,
  RefreshCw, Clock, CheckCircle2, XCircle, Send,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Deal } from '../types';

interface ContractsViewProps {
  deals: Deal[];
  onGoToAmendments?: (dealId: string) => void;
}

interface ContractForm {
  id: string;
  mls_board: string;
  state_code: string | null;
  form_name: string;
  form_slug: string;
  tc_forms_path: string | null;
  active: boolean;
}

interface ContractSubmission {
  id: string;
  deal_id: string;
  contract_form_id: string;
  status: 'draft' | 'submitted' | 'sent_for_signature' | 'signed' | 'voided';
  docusign_status: string | null;
  pdf_url: string | null;
  submitted_data: Record<string, any> | null;
  created_at: string;
  sent_at: string | null;
  signed_at: string | null;
  contract_forms?: { form_name: string; form_slug: string };
}

interface DealSubmissionCount {
  deal_id: string;
  count: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft:              { label: 'Draft',              color: 'badge-ghost',   icon: <Clock size={10} /> },
  submitted:          { label: 'Submitted',           color: 'badge-info',    icon: <Send size={10} /> },
  sent_for_signature: { label: 'Awaiting Signatures', color: 'badge-warning', icon: <PenLine size={10} /> },
  signed:             { label: 'Signed',              color: 'badge-success', icon: <CheckCircle2 size={10} /> },
  voided:             { label: 'Voided',              color: 'badge-error',   icon: <XCircle size={10} /> },
};

const TC_FORMS_BASE = 'https://tc-redeal-forms.vercel.app';

export const ContractsView: React.FC<ContractsViewProps> = ({ deals, onGoToAmendments }) => {
  const [search, setSearch]                 = useState('');
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);

  const filteredDeals = useMemo(() =>
    deals.filter(d =>
      d.milestone !== 'archived' &&
      (!search ||
        d.propertyAddress?.toLowerCase().includes(search.toLowerCase()) ||
        d.agentName?.toLowerCase().includes(search.toLowerCase()))
    )
  , [deals, search]);

  const selectedDeal = deals.find(d => d.id === selectedDealId) ?? null;

  const visibleDealIds = useMemo(() => filteredDeals.map(d => d.id), [filteredDeals]);

  const { data: submissionCounts = [] } = useQuery<DealSubmissionCount[]>({
    queryKey: ['contract-submission-counts', visibleDealIds],
    queryFn: async () => {
      if (!visibleDealIds.length) return [];
      const { data } = await supabase
        .from('contract_submissions')
        .select('deal_id')
        .in('deal_id', visibleDealIds);
      if (!data) return [];
      const counts: Record<string, number> = {};
      data.forEach(row => { counts[row.deal_id] = (counts[row.deal_id] || 0) + 1; });
      return Object.entries(counts).map(([deal_id, count]) => ({ deal_id, count }));
    },
    enabled: visibleDealIds.length > 0,
  });

  const countMap = useMemo(() => {
    const m: Record<string, number> = {};
    submissionCounts.forEach(sc => { m[sc.deal_id] = sc.count; });
    return m;
  }, [submissionCounts]);

  const { data: mlsMemberships = [] } = useQuery({
    queryKey: ['agent-mls-memberships', selectedDeal?.agentId],
    queryFn: async () => {
      if (!selectedDeal?.agentId) return [];
      const { data } = await supabase
        .from('contact_mls_memberships')
        .select('mls_board, board_name, state_code')
        .eq('contact_id', selectedDeal.agentId);
      return (data || []) as { mls_board: string; board_name: string; state_code: string }[];
    },
    enabled: !!selectedDeal?.agentId,
  });

  const agentBoards = useMemo(
    () => [...new Set(mlsMemberships.map(m => m.mls_board || m.board_name).filter(Boolean))],
    [mlsMemberships]
  );

  const { data: contractForms = [] } = useQuery<ContractForm[]>({
    queryKey: ['contract-forms', agentBoards],
    queryFn: async () => {
      if (!agentBoards.length) return [];
      const { data } = await supabase
        .from('contract_forms')
        .select('*')
        .in('mls_board', agentBoards)
        .eq('active', true);
      return (data || []) as ContractForm[];
    },
    enabled: agentBoards.length > 0,
  });

  const {
    data: submissions = [],
    isLoading: submissionsLoading,
    refetch: refetchSubmissions,
  } = useQuery<ContractSubmission[]>({
    queryKey: ['contract-submissions', selectedDealId],
    queryFn: async () => {
      if (!selectedDealId) return [];
      const { data } = await supabase
        .from('contract_submissions')
        .select('*, contract_forms(form_name, form_slug)')
        .eq('deal_id', selectedDealId)
        .order('created_at', { ascending: false });
      return (data || []) as ContractSubmission[];
    },
    enabled: !!selectedDealId,
  });

  const buildNewFormUrl = (form: ContractForm) => {
    const params = new URLSearchParams({
      form:    form.form_slug,
      dealId:  selectedDealId || '',
      state:   (selectedDeal as any)?.state || '',
      address: selectedDeal?.propertyAddress || '',
    });
    return `${TC_FORMS_BASE}/contracts/new?${params.toString()}`;
  };

  const buildResumeUrl = (sub: ContractSubmission) => {
    const slug = sub.contract_forms?.form_slug || '';
    const params = new URLSearchParams({
      form:         slug,
      dealId:       sub.deal_id,
      submissionId: sub.id,
      state:        (selectedDeal as any)?.state || '',
      address:      selectedDeal?.propertyAddress || '',
    });
    return `${TC_FORMS_BASE}/contracts/new?${params.toString()}`;
  };

  const getContractUID = (sub: ContractSubmission) =>
    sub.submitted_data?.contractUID || sub.submitted_data?.contract_uid || null;

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

  return (
    <div className="flex h-full overflow-hidden">

      {/* Left: Deal list */}
      <div className="w-72 flex-none border-r border-base-300 flex flex-col bg-base-100">
        <div className="p-3 border-b border-base-300 space-y-2">
          <h2 className="font-bold text-base text-base-content flex items-center gap-2">
            <FileSignature size={16} className="text-primary" />
            Contracts
          </h2>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40" />
            <input
              type="text"
              placeholder="Search deals or agents…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input input-sm input-bordered w-full pl-8 text-xs"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredDeals.length === 0 ? (
            <div className="p-6 text-center text-base-content/40 text-xs">No active deals</div>
          ) : (
            filteredDeals.map(deal => {
              const isSelected  = selectedDealId === deal.id;
              const contractCnt = countMap[deal.id] || 0;
              return (
                <button
                  key={deal.id}
                  onClick={() => setSelectedDealId(deal.id)}
                  className={`w-full text-left px-3 py-2.5 border-b border-base-200 hover:bg-base-200/60 transition-colors ${
                    isSelected ? 'bg-primary/8 border-l-2 border-l-primary' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <MapPin size={12} className="text-base-content/40 mt-0.5 flex-none" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-base-content truncate leading-tight">
                        {deal.propertyAddress || 'No address'}
                      </p>
                      <p className="text-[11px] text-base-content/50 truncate mt-0.5">
                        {deal.agentName || 'No agent'}
                      </p>
                    </div>
                    {contractCnt > 0 && (
                      <span className="badge badge-xs badge-primary flex-none">{contractCnt}</span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right: Contract panel */}
      <div className="flex-1 overflow-y-auto bg-base-50">
        {!selectedDeal ? (
          <div className="flex flex-col items-center justify-center h-full text-base-content/25 gap-3">
            <FileSignature size={52} strokeWidth={1} />
            <p className="text-sm">Select a deal to manage its contracts</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto p-6 space-y-6">

            {/* Deal header */}
            <div className="pb-2 border-b border-base-300">
              <h3 className="font-bold text-lg text-base-content">
                {selectedDeal.propertyAddress || 'No address'}
              </h3>
              <p className="text-sm text-base-content/55 mt-0.5">
                Agent: <span className="font-medium">{selectedDeal.agentName || '\u2014'}</span>
                {agentBoards.length > 0 && (
                  <span className="ml-2 text-base-content/40">&middot; {agentBoards.join(', ')}</span>
                )}
              </p>
            </div>

            {/* Start a contract */}
            <div>
              <h4 className="text-xs font-semibold text-base-content/50 uppercase tracking-widest mb-3">
                Start a Contract
              </h4>

              {selectedDeal.agentId && agentBoards.length === 0 && (
                <div className="alert alert-warning text-sm py-2">
                  <AlertCircle size={15} />
                  <span>No MLS board on file for this agent. Add it in <strong>Contacts</strong> first.</span>
                </div>
              )}

              {agentBoards.length > 0 && contractForms.length === 0 && (
                <div className="alert alert-info text-sm py-2">
                  <AlertCircle size={15} />
                  <span>No contract forms configured for <strong>{agentBoards.join(', ')}</strong> yet.</span>
                </div>
              )}

              <div className="space-y-2 mt-2">
                {contractForms.map((form, idx) => (
                  <a
                    key={form.id}
                    href={buildNewFormUrl(form)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-xl border border-base-300 bg-white hover:border-primary hover:shadow-sm transition-all group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-none">
                      <span className="text-xs font-bold text-primary">#{idx + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-base-content">{form.form_name}</p>
                      <p className="text-xs text-base-content/45">
                        {form.mls_board} &middot; {form.state_code ? `${form.state_code} only` : 'All states'}
                      </p>
                    </div>
                    <span className="flex items-center gap-1 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                      Fill out <ExternalLink size={11} />
                    </span>
                  </a>
                ))}

                <button
                  onClick={() => onGoToAmendments?.(selectedDeal.id)}
                  className="flex items-center gap-3 p-3 rounded-xl border border-base-300 bg-white hover:border-secondary hover:shadow-sm transition-all group w-full text-left"
                >
                  <div className="w-9 h-9 rounded-lg bg-secondary/10 flex items-center justify-center flex-none">
                    <FileText size={16} className="text-secondary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-base-content">Amendment</p>
                    <p className="text-xs text-base-content/45">Modify an existing contract</p>
                  </div>
                  <ChevronRight size={14} className="text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              </div>
            </div>

            {/* Contract history */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold text-base-content/50 uppercase tracking-widest">
                  Contract History
                </h4>
                <button
                  onClick={() => refetchSubmissions()}
                  className="btn btn-ghost btn-xs gap-1 text-base-content/40 hover:text-base-content"
                  title="Refresh"
                >
                  <RefreshCw size={11} />
                </button>
              </div>

              {submissionsLoading ? (
                <div className="flex justify-center py-6">
                  <span className="loading loading-spinner loading-sm text-primary" />
                </div>
              ) : submissions.length === 0 ? (
                <div className="text-center py-8 text-base-content/30 text-xs border border-dashed border-base-300 rounded-xl">
                  No contracts on file for this deal
                </div>
              ) : (
                <div className="space-y-2">
                  {submissions.map(sub => {
                    const cfg     = STATUS_CONFIG[sub.status] ?? { label: sub.status, color: 'badge-ghost', icon: null };
                    const uid     = getContractUID(sub);
                    const isDraft = sub.status === 'draft';
                    return (
                      <div key={sub.id} className="flex items-start gap-3 p-3 rounded-xl border border-base-200 bg-white">
                        <div className="w-9 h-9 rounded-lg bg-base-200 flex items-center justify-center flex-none mt-0.5">
                          <FileText size={14} className="text-base-content/50" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-base-content">
                              {sub.contract_forms?.form_name || 'Contract'}
                            </p>
                            {uid && (
                              <span className="flex items-center gap-0.5 text-[10px] font-mono text-base-content/40 bg-base-200 px-1.5 py-0.5 rounded">
                                <Hash size={9} />
                                {uid}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-base-content/45 mt-0.5">
                            Created {formatDate(sub.created_at)}
                            {sub.sent_at   && ` \u00b7 Sent ${formatDate(sub.sent_at)}`}
                            {sub.signed_at && ` \u00b7 Signed ${formatDate(sub.signed_at)}`}
                          </p>
                          {(sub.buyer_name || sub.seller_name) && (
                            <p className="text-xs text-base-content/50 mt-0.5">
                              {sub.buyer_name && <span>🏠 Buyer: <strong>{sub.buyer_name}</strong></span>}
                              {sub.buyer_name && sub.seller_name && <span className="mx-1">·</span>}
                              {sub.seller_name && <span>Seller: <strong>{sub.seller_name}</strong></span>}
                            </p>
                          )}
                          {sub.contacts && (
                            <p className="text-xs text-base-content/40 mt-0.5">
                              Agent: {sub.contacts.first_name} {sub.contacts.last_name}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-none flex-wrap justify-end">
                          <span className={`badge badge-sm gap-1 ${cfg.color}`}>
                            {cfg.icon}{cfg.label}
                          </span>
                          {isDraft && (
                            <a
                              href={buildResumeUrl(sub)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-xs btn-outline btn-primary gap-1"
                            >
                              <PenLine size={10} />
                              Resume
                            </a>
                          )}
                          {sub.pdf_url && (
                            <a
                              href={sub.pdf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-ghost btn-xs"
                              title="View PDF"
                            >
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
};
