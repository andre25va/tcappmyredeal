import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  RefreshCw, ChevronDown, ChevronUp, Phone, CheckCircle,
  Mic, Clock, AlertTriangle, Play
} from 'lucide-react';
import { CallButton } from './CallButton';
import { Deal } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { EmptyState } from './ui/EmptyState';
import { Button } from "./ui/Button";
import { useCallLogs, useInvalidateCallLogs } from '../hooks/useCallLogs';
import { useVoiceDealUpdates, useInvalidateVoiceDealUpdates } from '../hooks/useVoiceDealUpdates';
import { useCommunicationEvents } from '../hooks/useCommunicationEvents';
import { useChangeRequests, useInvalidateChangeRequests } from '../hooks/useChangeRequests';

/* ── helpers ─────────────────────────────────────────────────────────── */

const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  const date = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${date} ${time}`;
};

const fmtDuration = (seconds: number | null | undefined) => {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

const channelIcon: Record<string, string> = { voice: '🎙️', sms: '📱', email: '📧', whatsapp: '📱' };

type ChannelFilter = 'all' | 'voice' | 'sms' | 'email';
type Section = 'calls' | 'timeline';

/* ── component ───────────────────────────────────────────────────────── */

interface WorkspaceVoiceProps {
  deal: Deal;
  onUpdate: (deal: Deal) => void;
  onCallStarted?: (callData: {
    contactName: string;
    contactPhone: string;
    callSid?: string;
    startedAt: string;
    dealId?: string;
  }) => void;
}

const WorkspaceVoice: React.FC<WorkspaceVoiceProps> = ({ deal, onCallStarted }) => {
  const { profile } = useAuth();
  const [activeSection, setActiveSection] = useState<Section>('calls');
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [refreshing, setRefreshing] = useState(false);

  // UI state
  const [expandedTranscript, setExpandedTranscript] = useState<Record<string, boolean>>({});
  const [markingReviewed, setMarkingReviewed] = useState<Record<string, boolean>>({});

  const invalidateCallLogs = useInvalidateCallLogs();
  const invalidateVoiceDealUpdates = useInvalidateVoiceDealUpdates();
  const invalidateChangeRequests = useInvalidateChangeRequests();

  const { data: callLogs = [], isLoading: clLoading } = useCallLogs(deal.id);
  const { data: voiceUpdates = [], isLoading: vuLoading } = useVoiceDealUpdates(deal.id);
  const { data: events = [], isLoading: evLoading } = useCommunicationEvents(deal.id);
  const { data: changeReqs = [], isLoading: crLoading } = useChangeRequests(deal.id);

  const loading = clLoading || vuLoading || evLoading || crLoading;

  const handleRefresh = () => {
    invalidateCallLogs(deal.id);
    invalidateVoiceDealUpdates(deal.id);
    invalidateChangeRequests(deal.id);
  };

  const markReviewed = async (vuId: string) => {
    setMarkingReviewed(s => ({ ...s, [vuId]: true }));
    try {
      await supabase
        .from('voice_deal_updates')
        .update({
          review_status: 'reviewed',
          reviewed_by: profile?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', vuId);
      invalidateVoiceDealUpdates(deal.id);
    } catch (err) {
      console.error('markReviewed error:', err);
    } finally {
      setMarkingReviewed(s => ({ ...s, [vuId]: false }));
    }
  };

  const updateChangeRequest = async (id: string, status: string) => {
    try {
      const updates: Record<string, unknown> = { status };
      if (status === 'approved' || status === 'rejected') updates.reviewed_at = new Date().toISOString();
      await supabase.from('change_requests').update(updates).eq('id', id);
      invalidateChangeRequests(deal.id);
    } catch (err) { console.error('updateChangeRequest error:', err); }
  };

  const contactName = (c: any) =>
    c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown' : 'Unknown';

  // Match call_log to voice_deal_update by call_sid
  const vuBySid = new Map<string, any>();
  voiceUpdates.forEach(vu => { if (vu.call_sid) vuBySid.set(vu.call_sid, vu); });

  const filteredEvents = channelFilter === 'all'
    ? events
    : events.filter(e => e.channel === channelFilter);

  const pendingVoiceUpdates = voiceUpdates.filter(vu => vu.review_status === 'pending');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-16">
        <span className="loading loading-spinner loading-md text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-base-100">
      {/* Header */}
      <div className="flex-none px-4 py-3 border-b border-base-300 bg-white flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-base-content flex items-center gap-2">
            📞 Communications
          </h2>
          {pendingVoiceUpdates.length > 0 && (
            <span className="badge badge-warning badge-xs gap-1">
              <AlertTriangle size={9} /> {pendingVoiceUpdates.length} pending review
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeSection === 'timeline' && (
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
          )}
          <button
            onClick={handleRefresh}
            className={`btn btn-ghost btn-xs btn-square ${refreshing ? 'animate-spin' : ''}`}
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex-none flex border-b border-base-300 bg-white px-4 gap-1">
        <button
          onClick={() => setActiveSection('calls')}
          className={`text-xs px-3 py-2 font-medium border-b-2 transition-colors ${
            activeSection === 'calls'
              ? 'border-primary text-primary'
              : 'border-transparent text-base-content/50 hover:text-base-content'
          }`}
        >
          📞 Call Log
          {callLogs.length > 0 && (
            <span className="ml-1 badge badge-xs badge-ghost">{callLogs.length}</span>
          )}
        </button>
        <button
          onClick={() => setActiveSection('timeline')}
          className={`text-xs px-3 py-2 font-medium border-b-2 transition-colors ${
            activeSection === 'timeline'
              ? 'border-primary text-primary'
              : 'border-transparent text-base-content/50 hover:text-base-content'
          }`}
        >
          📋 Timeline
          {events.length > 0 && (
            <span className="ml-1 badge badge-xs badge-ghost">{events.length}</span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">

        {/* ── CALL LOG SECTION ── */}
        {activeSection === 'calls' && (
          <>
            {/* Pending Change Requests */}
            {changeReqs.length > 0 && (
              <div className="mb-4">
                <h3 className="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-2">
                  Pending Change Requests
                </h3>
                <div className="flex flex-col gap-2">
                  {changeReqs.map(cr => (
                    <div key={cr.id} className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="badge badge-warning badge-xs">
                          ⚡ {(cr.change_type || '').replace(/_/g, ' ')}
                        </span>
                        <span className={`badge badge-xs ${
                          cr.impact_level === 'critical' ? 'badge-error' :
                          cr.impact_level === 'high' ? 'badge-warning' : 'badge-ghost'
                        }`}>{cr.impact_level}</span>
                        {cr.contact && (
                          <span className="text-xs text-base-content/60">by {contactName(cr.contact)}</span>
                        )}
                      </div>
                      {cr.requested_change_text && (
                        <p className="text-xs text-base-content/70 mt-1">{cr.requested_change_text}</p>
                      )}
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

            {/* Call Logs */}
            {callLogs.length === 0 ? (
              <EmptyState
                icon={<Mic size={40} className="opacity-30" />}
                title="No calls recorded yet"
                message="Calls made through this deal will appear here with AI summaries"
              />
            ) : (
              <div className="flex flex-col gap-3">
                <h3 className="text-xs font-semibold text-base-content/50 uppercase tracking-wide">
                  Call History · {callLogs.length} call{callLogs.length !== 1 ? 's' : ''}
                </h3>
                {callLogs.map(call => {
                  const vu = call.call_sid ? vuBySid.get(call.call_sid) : null;
                  const isExpanded = expandedTranscript[call.id];
                  const isReviewed = vu?.review_status === 'reviewed';
                  const isPending = vu?.review_status === 'pending';
                  const dur = fmtDuration(call.duration);

                  return (
                    <div
                      key={call.id}
                      className={`bg-white rounded-xl border p-3 shadow-sm ${
                        isPending ? 'border-amber-300' : 'border-base-300'
                      }`}
                    >
                      {/* Call header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <span className="text-lg flex-none mt-0.5">🎙️</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {call.direction === 'inbound' ? (
                                <span className="badge badge-xs bg-green-100 text-green-700 border-green-200">↙ inbound</span>
                              ) : (
                                <span className="badge badge-xs bg-blue-100 text-blue-700 border-blue-200">↗ outbound</span>
                              )}
                              {call.contact && (
                                <span className="text-xs font-medium text-base-content">
                                  {contactName(call.contact)}
                                </span>
                              )}
                              {call.contact?.phone && (
                                <CallButton
                                  phoneNumber={call.contact.phone}
                                  contactName={contactName(call.contact)}
                                  contactId={call.contact.id}
                                  dealId={deal.id}
                                  size="sm"
                                  variant="icon"
                                  onCallStarted={(callId) => onCallStarted?.({
                                    contactName: contactName(call.contact),
                                    contactPhone: call.contact.phone,
                                    callSid: callId,
                                    startedAt: new Date().toISOString(),
                                    dealId: deal.id,
                                  })}
                                />
                              )}
                              {dur && (
                                <span className="flex items-center gap-1 text-xs text-base-content/50">
                                  <Clock size={10} /> {dur}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-base-content/40 mt-0.5">
                              {call.started_at ? fmtDateTime(call.started_at) : fmtDateTime(call.created_at)}
                            </p>
                          </div>
                        </div>

                        {/* Review status */}
                        <div className="flex-none">
                          {isReviewed ? (
                            <span className="flex items-center gap-1 text-xs text-success font-medium">
                              <CheckCircle size={12} /> Reviewed
                            </span>
                          ) : isPending ? (
                            <button
                              onClick={() => markReviewed(vu.id)}
                              disabled={markingReviewed[vu.id]}
                              className="btn btn-xs btn-warning rounded-xl gap-1"
                            >
                              {markingReviewed[vu.id] ? (
                                <span className="loading loading-spinner loading-xs" />
                              ) : (
                                <CheckCircle size={11} />
                              )}
                              Mark Reviewed
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {/* AI Summary */}
                      {call.ai_summary && (
                        <div className="mt-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                          <p className="text-xs font-semibold text-blue-700 mb-0.5">✨ AI Summary</p>
                          <p className="text-xs text-blue-800">{call.ai_summary}</p>
                        </div>
                      )}

                      {/* Suggested Actions from voice_deal_update */}
                      {vu?.suggested_actions && Array.isArray(vu.suggested_actions) && vu.suggested_actions.length > 0 && (
                        <div className="mt-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                          <p className="text-xs font-semibold text-amber-700 mb-1">📋 Suggested Actions</p>
                          <ul className="flex flex-col gap-0.5">
                            {vu.suggested_actions.map((action: string, i: number) => (
                              <li key={i} className="text-xs text-amber-800 flex items-start gap-1">
                                <span className="mt-0.5">•</span> {action}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Audio player */}
                      {call.recording_url && (
                        <div className="mt-2">
                          <p className="text-xs text-base-content/50 mb-1 flex items-center gap-1">
                            <Play size={10} /> Recording
                          </p>
                          <audio controls src={call.recording_url} className="w-full h-8" />
                        </div>
                      )}

                      {/* Transcript expand/collapse */}
                      {call.transcript && (
                        <div className="mt-2">
                          <button
                            onClick={() => setExpandedTranscript(s => ({ ...s, [call.id]: !s[call.id] }))}
                            className="flex items-center gap-1 text-xs font-medium text-base-content/50 hover:text-base-content transition-colors"
                          >
                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            {isExpanded ? 'Hide' : 'Show'} Transcript
                          </button>
                          {isExpanded && (
                            <pre className="text-xs text-base-content/60 mt-2 bg-base-200 rounded-lg p-3 whitespace-pre-wrap font-sans leading-relaxed max-h-64 overflow-y-auto">
                              {call.transcript}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── TIMELINE SECTION ── */}
        {activeSection === 'timeline' && (
          <>
            {filteredEvents.length === 0 ? (
              <EmptyState
                icon={<span className="text-4xl">📋</span>}
                title="No communications recorded for this deal yet"
              />
            ) : (
              <div className="flex flex-col gap-3">
                {filteredEvents.map(ev => {
                  const icon = channelIcon[ev.channel] || '📞';
                  const isExpanded = expandedTranscript[`ev-${ev.id}`];

                  return (
                    <div key={ev.id} className="bg-white rounded-xl border border-base-300 p-3 shadow-sm">
                      <div className="flex items-start gap-3">
                        <span className="text-lg flex-none mt-0.5">{icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {ev.direction === 'inbound' ? (
                              <span className="badge badge-xs bg-green-100 text-green-700 border-green-200">↙ inbound</span>
                            ) : (
                              <span className="badge badge-xs bg-blue-100 text-blue-700 border-blue-200">↗ outbound</span>
                            )}
                            {ev.contact && (
                              <span className="text-xs font-medium text-base-content">{contactName(ev.contact)}</span>
                            )}
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
                                onClick={() => setExpandedTranscript(s => ({ ...s, [`ev-${ev.id}`]: !s[`ev-${ev.id}`] }))}
                                className="flex items-center gap-1 text-xs font-medium text-base-content/50 hover:text-base-content"
                              >
                                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                Transcript
                              </button>
                              {isExpanded && (
                                <pre className="text-xs text-base-content/60 mt-1 bg-base-200 rounded-lg p-2 whitespace-pre-wrap font-sans max-h-48 overflow-y-auto">
                                  {ev.transcript}
                                </pre>
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

export default WorkspaceVoice;
