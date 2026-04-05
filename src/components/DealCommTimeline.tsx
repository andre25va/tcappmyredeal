import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { RefreshCw, ChevronDown, ChevronUp, Phone } from 'lucide-react';
import { CallButton } from './CallButton';
import { Deal } from '../types';
import { EmptyState } from './ui/EmptyState';
import { Button } from "./ui/Button";
import { useChangeRequests, useInvalidateChangeRequests } from '../hooks/useChangeRequests';
import { useVoiceDealUpdates, useInvalidateVoiceDealUpdates } from '../hooks/useVoiceDealUpdates';
import { useCommunicationEvents, useInvalidateCommunicationEvents } from '../hooks/useCommunicationEvents';

/* ── helpers ─────────────────────────────────────────────────────────── */

const fmtDateTime = (iso: string) => {
    const d = new Date(iso);
  const date = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${date} ${time}`;
};


const channelIcon: Record<string, string> = { voice: '🎙️', sms: '📱', email: '📧', whatsapp: '📱' };

type ChannelFilter = 'all' | 'voice' | 'sms' | 'email';

/* ── component ───────────────────────────────────────────────────────── */

interface DealCommTimelineProps {
  deal: Deal;
  onUpdate: (deal: Deal) => void;
  onCallStarted?: (callData: { contactName: string; contactPhone: string; callSid?: string; startedAt: string; dealId?: string }) => void;
}

export const DealCommTimeline: React.FC<DealCommTimelineProps> = ({ deal, onCallStarted }) => {
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [expandedTranscript, setExpandedTranscript] = useState<Record<string, boolean>>({});

  const invalidateChangeRequests = useInvalidateChangeRequests();
  const invalidateVoiceDealUpdates = useInvalidateVoiceDealUpdates();
  const invalidateCommunicationEvents = useInvalidateCommunicationEvents();

  const { data: events = [], isLoading: evLoading } = useCommunicationEvents(deal.id);
  const { data: changeReqs = [], isLoading: crLoading } = useChangeRequests(deal.id);
  const { data: voiceUpdates = [], isLoading: vuLoading } = useVoiceDealUpdates(deal.id);

  const loading = evLoading || crLoading || vuLoading;

  const handleRefresh = () => {
    invalidateChangeRequests(deal.id);
    invalidateVoiceDealUpdates(deal.id);
    invalidateCommunicationEvents(deal.id);
  };

  const updateChangeRequest = async (id: string, status: string) => {
    try {
      const sb = supabase;
      const updates: Record<string, unknown> = { status };
      if (status === 'approved' || status === 'rejected') updates.reviewed_at = new Date().toISOString();
      await sb.from('change_requests').update(updates).eq('id', id);
      invalidateChangeRequests(deal.id);
    } catch (err) { console.error('updateChangeRequest error:', err); }
  };

  const contactName = (c: any) => c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown' : 'Unknown';

  const filteredEvents = channelFilter === 'all'
    ? events
    : events.filter(e => e.channel === channelFilter);

  // Build a map of voice_deal_updates by id for quick lookup
  const vuMap = new Map<string, any>();
  voiceUpdates.forEach(vu => vuMap.set(vu.id, vu));

  return (
    <div className="flex flex-col h-full bg-base-100">
      {/* Header */}
      <div className="flex-none px-4 py-3 border-b border-base-300 bg-white flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-base-content flex items-center gap-2">📞 Communications Timeline</h2>
        <div className="flex items-center gap-2">
          <select
            className="select select-bordered select-xs"
            value={channelFilter}
            onChange={e => setChannelFilter(e.target.value as ChannelFilter)}
          >
            <option value="all">All</option>
            <option value="voice">Voice</option>
            <option value="sms">SMS</option>
            <option value="email">Email</option>
          </select>
          <button onClick={handleRefresh} className={`btn btn-ghost btn-xs btn-square ${refreshing ? 'animate-spin' : ''}`} title="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="loading loading-spinner loading-md text-primary" />
          </div>
        ) : (
          <>
            {/* Pending Change Requests at top */}
            {changeReqs.length > 0 && (
              <div className="mb-4">
                <h3 className="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-2">Pending Change Requests</h3>
                <div className="flex flex-col gap-2">
                  {changeReqs.map(cr => (
                    <div key={cr.id} className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="badge badge-warning badge-xs">⚡ {(cr.change_type || '').replace(/_/g, ' ')}</span>
                        <span className={`badge badge-xs ${cr.impact_level === 'critical' ? 'badge-error' : cr.impact_level === 'high' ? 'badge-warning' : 'badge-ghost'}`}>{cr.impact_level}</span>
                        {cr.contact && <span className="text-xs text-base-content/60">by {contactName(cr.contact)}</span>}
                      </div>
                      {cr.requested_change_text && <p className="text-xs text-base-content/70 mt-1">{cr.requested_change_text}</p>}
                      <p className="text-xs text-base-content/40 mt-1">{fmtDateTime(cr.created_at)}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Button variant="success" size="xs" className="rounded-xl" onClick={() => updateChangeRequest(cr.id, 'approved')}>✅ Approve</Button>
                        <Button variant="error" size="xs" className="rounded-xl" onClick={() => updateChangeRequest(cr.id, 'rejected')}>❌ Reject</Button>
                        <Button variant="ghost" size="xs" className="rounded-xl" onClick={() => updateChangeRequest(cr.id, 'needs_clarification')}>💬 Clarify</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timeline */}
            {filteredEvents.length === 0 && changeReqs.length === 0 ? (
              <EmptyState
                icon={<span className="text-4xl">📞</span>}
                title="No communications recorded for this deal yet"
              />
            ) : filteredEvents.length === 0 ? null : (
              <div className="flex flex-col gap-3">
                {filteredEvents.map(ev => {
                  const icon = channelIcon[ev.channel] || '📞';
                  const dirBadge = ev.direction === 'inbound'
                    ? <span className="badge badge-xs bg-green-100 text-green-700 border-green-200">↙ inbound</span>
                    : <span className="badge badge-xs bg-blue-100 text-blue-700 border-blue-200">↗ outbound</span>;

                  return (
                    <div key={ev.id} className="bg-white rounded-xl border border-base-300 p-3 shadow-sm">
                      <div className="flex items-start gap-3">
                        <span className="text-lg flex-none mt-0.5">{icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {dirBadge}
                            {ev.contact && <span className="text-xs font-medium text-base-content">{contactName(ev.contact)}</span>}
                          {ev.contact?.phone && (
                            <CallButton
                              phoneNumber={ev.contact.phone}
                              contactName={contactName(ev.contact)}
                              contactId={ev.contact.id}
                              dealId={deal.id}
                              size="sm"
                              variant="icon"
                              onCallStarted={(callId) => onCallStarted?.({
                                contactName: contactName(ev.contact),
                                contactPhone: ev.contact.phone,
                                callSid: callId,
                                startedAt: new Date().toISOString(),
                                dealId: deal.id,
                              })}
                            />
                          )}
                            <span className="text-xs text-base-content/40">{fmtDateTime(ev.created_at)}</span>
                          </div>
                          {ev.summary && <p className="text-xs text-base-content/70 mt-1">{ev.summary}</p>}

                          {/* Voice: audio + transcript */}
                          {ev.channel === 'voice' && ev.recording_url && (
                            <div className="mt-2">
                              <audio controls src={`${ev.recording_url}.mp3`} className="w-full h-8" />
                            </div>
                          )}
                          {ev.channel === 'voice' && ev.transcript && (
                            <div className="mt-1">
                              <button
                                onClick={() => setExpandedTranscript(s => ({ ...s, [ev.id]: !s[ev.id] }))}
                                className="flex items-center gap-1 text-xs font-medium text-base-content/50 hover:text-base-content"
                              >
                                {expandedTranscript[ev.id] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                Transcript
                              </button>
                              {expandedTranscript[ev.id] && (
                                <p className="text-xs text-base-content/60 mt-1 bg-base-200 rounded-lg p-2 whitespace-pre-wrap">{ev.transcript}</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
