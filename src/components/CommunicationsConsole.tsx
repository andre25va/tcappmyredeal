import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Play, ChevronDown, ChevronUp, ExternalLink, Link2, X } from 'lucide-react';

/* ── helpers ─────────────────────────────────────────────────────────── */

const fmtDate = (iso: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
};

const fmtDateTime = (iso: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const date = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${date} ${time}`;
};

const getSupabase = async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase config');
  return createClient(url, key);
};

/* ── types ────────────────────────────────────────────────────────────── */

type TabId = 'voice' | 'callbacks' | 'changes' | 'unidentified';
type TimeFilter = '24h' | '7d' | '30d' | 'all';

interface CommunicationsConsoleProps {
  onSelectDeal?: (dealId: string) => void;
}

/* ── component ───────────────────────────────────────────────────────── */

export const CommunicationsConsole: React.FC<CommunicationsConsoleProps> = ({ onSelectDeal }) => {
  const [activeTab, setActiveTab] = useState<TabId>('voice');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('7d');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data
  const [voiceUpdates, setVoiceUpdates] = useState<any[]>([]);
  const [callbacks, setCallbacks] = useState<any[]>([]);
  const [changeReqs, setChangeReqs] = useState<any[]>([]);
  const [unidentified, setUnidentified] = useState<any[]>([]);

  // UI
  const [expandedSummary, setExpandedSummary] = useState<Record<string, boolean>>({});
  const [expandedTranscript, setExpandedTranscript] = useState<Record<string, boolean>>({});
  const [linkingCallId, setLinkingCallId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [contactSearch, setContactSearch] = useState('');

  const timeFilterCutoff = useCallback(() => {
    if (timeFilter === 'all') return null;
    const now = new Date();
    if (timeFilter === '24h') now.setHours(now.getHours() - 24);
    else if (timeFilter === '7d') now.setDate(now.getDate() - 7);
    else if (timeFilter === '30d') now.setDate(now.getDate() - 30);
    return now.toISOString();
  }, [timeFilter]);

  const loadData = useCallback(async () => {
    try {
      const sb = await getSupabase();
      const cutoff = timeFilterCutoff();

      // Voice Updates
      let vq = sb
        .from('voice_deal_updates')
        .select('*, deals(id, property_address, city, state), caller_contact:caller_contact_id(id, first_name, last_name, phone)')
        .eq('review_status', 'pending')
        .order('created_at', { ascending: false })
        .limit(50);
      if (cutoff) vq = vq.gte('created_at', cutoff);
      const { data: vData } = await vq;
      setVoiceUpdates(vData || []);

      // Callbacks
      let cq = sb
        .from('callback_requests')
        .select('*, deals(id, property_address), contact:contact_id(id, first_name, last_name, phone)')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(50);
      if (cutoff) cq = cq.gte('created_at', cutoff);
      const { data: cData } = await cq;
      setCallbacks(cData || []);

      // Change Requests
      let crq = sb
        .from('change_requests')
        .select('*, deals:deal_id(id, property_address), contact:requested_by_contact_id(id, first_name, last_name)')
        .eq('status', 'pending_review')
        .order('created_at', { ascending: false })
        .limit(50);
      if (cutoff) crq = crq.gte('created_at', cutoff);
      const { data: crData } = await crq;
      setChangeReqs(crData || []);

      // Unidentified Calls
      let uq = sb
        .from('call_log')
        .select('*')
        .is('caller_contact_id', null)
        .order('created_at', { ascending: false })
        .limit(50);
      if (cutoff) uq = uq.gte('created_at', cutoff);
      const { data: uData } = await uq;
      setUnidentified(uData || []);

    } catch (err) {
      console.error('CommunicationsConsole load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [timeFilterCutoff]);

  useEffect(() => {
    setLoading(true);
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  /* ── Action handlers ─────────────────────────────────────────────── */

  const updateVoiceReview = async (id: string, status: string) => {
    try {
      const sb = await getSupabase();
      await sb.from('voice_deal_updates').update({ review_status: status }).eq('id', id);
      loadData();
    } catch (err) { console.error('updateVoiceReview error:', err); }
  };

  const updateCallbackStatus = async (id: string, status: string) => {
    try {
      const sb = await getSupabase();
      const updates: Record<string, unknown> = { status };
      if (status === 'completed') updates.completed_at = new Date().toISOString();
      await sb.from('callback_requests').update(updates).eq('id', id);
      loadData();
    } catch (err) { console.error('updateCallbackStatus error:', err); }
  };

  const updateChangeRequest = async (id: string, status: string) => {
    try {
      const sb = await getSupabase();
      const updates: Record<string, unknown> = { status };
      if (status === 'approved' || status === 'rejected') updates.reviewed_at = new Date().toISOString();
      await sb.from('change_requests').update(updates).eq('id', id);
      loadData();
    } catch (err) { console.error('updateChangeRequest error:', err); }
  };

  const loadContacts = async () => {
    try {
      const sb = await getSupabase();
      const { data } = await sb.from('contacts').select('id, first_name, last_name, phone').order('first_name').limit(200);
      setContacts(data || []);
    } catch { /* silent */ }
  };

  const linkCallToContact = async (callId: string, contactId: string) => {
    try {
      const sb = await getSupabase();
      await sb.from('call_log').update({ caller_contact_id: contactId }).eq('id', callId);
      setLinkingCallId(null);
      setContactSearch('');
      loadData();
    } catch (err) { console.error('linkCallToContact error:', err); }
  };

  const dismissCall = async (callId: string) => {
    try {
      const sb = await getSupabase();
      await sb.from('call_log').update({ caller_contact_id: 'dismissed' }).eq('id', callId);
      loadData();
    } catch (err) { console.error('dismissCall error:', err); }
  };

  /* ── Tab definitions ─────────────────────────────────────────────── */

  const tabs: { id: TabId; label: string; icon: string; count: number }[] = [
    { id: 'voice', label: 'Voice Updates', icon: '🎙️', count: voiceUpdates.length },
    { id: 'callbacks', label: 'Callbacks', icon: '☎️', count: callbacks.length },
    { id: 'changes', label: 'Changes', icon: '⚡', count: changeReqs.length },
    { id: 'unidentified', label: 'Unidentified', icon: '❓', count: unidentified.length },
  ];

  const contactName = (c: any) => c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown' : 'Unknown';

  const toggleMap = (map: Record<string, boolean>, id: string) => ({ ...map, [id]: !map[id] });

  /* ── Render helpers ──────────────────────────────────────────────── */

  const renderVoiceTab = () => {
    if (voiceUpdates.length === 0) return <div className="flex flex-col items-center justify-center py-16 text-base-content/40"><span className="text-4xl mb-2">🎙️</span><p className="text-sm">No pending voice updates</p></div>;
    return (
      <div className="flex flex-col gap-3">
        {voiceUpdates.map((v: any) => (
          <div key={v.id} className="bg-white rounded-xl border border-base-300 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-base-content">{contactName(v.caller_contact)}</span>
                  {v.caller_contact?.phone && <span className="text-xs text-base-content/50">{v.caller_contact.phone}</span>}
                  <span className="badge badge-warning badge-xs">pending</span>
                </div>
                {v.deals && (
                  <button
                    onClick={() => onSelectDeal?.(v.deals.id)}
                    className="text-xs text-primary hover:underline flex items-center gap-1 mt-1"
                  >
                    <ExternalLink size={11} />
                    {v.deals.property_address}{v.deals.city ? `, ${v.deals.city}` : ''}{v.deals.state ? `, ${v.deals.state}` : ''}
                  </button>
                )}
                <p className="text-xs text-base-content/50 mt-1">{fmtDateTime(v.created_at)}</p>
              </div>
            </div>

            {/* AI Summary (collapsible) */}
            {v.ai_summary && (
              <div className="mt-3">
                <button onClick={() => setExpandedSummary(s => toggleMap(s, v.id))} className="flex items-center gap-1 text-xs font-medium text-base-content/60 hover:text-base-content">
                  {expandedSummary[v.id] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  AI Summary
                </button>
                {expandedSummary[v.id] && <p className="text-xs text-base-content/70 mt-1 bg-base-200 rounded-lg p-2">{v.ai_summary}</p>}
              </div>
            )}

            {/* Transcript (collapsible) */}
            {v.transcript && (
              <div className="mt-2">
                <button onClick={() => setExpandedTranscript(s => toggleMap(s, v.id))} className="flex items-center gap-1 text-xs font-medium text-base-content/60 hover:text-base-content">
                  {expandedTranscript[v.id] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  Transcript
                </button>
                {expandedTranscript[v.id] && <p className="text-xs text-base-content/70 mt-1 bg-base-200 rounded-lg p-2 whitespace-pre-wrap">{v.transcript}</p>}
              </div>
            )}

            {/* Audio */}
            {v.recording_url && (
              <div className="mt-3">
                <audio controls src={`${v.recording_url}.mp3`} className="w-full h-8" />
              </div>
            )}

            {/* Suggested Actions */}
            {v.suggested_actions && Array.isArray(v.suggested_actions) && v.suggested_actions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {v.suggested_actions.map((a: any, i: number) => (
                  <span key={i} className="badge badge-outline badge-sm">{a.description || a.type || String(a)}</span>
                ))}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-base-200">
              <button onClick={() => updateVoiceReview(v.id, 'reviewed')} className="btn btn-success btn-xs rounded-xl gap-1">✅ Mark Reviewed</button>
              <button onClick={() => updateVoiceReview(v.id, 'dismissed')} className="btn btn-ghost btn-xs rounded-xl gap-1 text-base-content/50">🗑️ Dismiss</button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderCallbacksTab = () => {
    if (callbacks.length === 0) return <div className="flex flex-col items-center justify-center py-16 text-base-content/40"><span className="text-4xl mb-2">☎️</span><p className="text-sm">No open callback requests</p></div>;
    const priorityColors: Record<string, string> = { high: 'badge-error', urgent: 'badge-error', medium: 'badge-warning', normal: 'badge-warning', low: 'badge-success' };
    return (
      <div className="flex flex-col gap-3">
        {callbacks.map((cb: any) => (
          <div key={cb.id} className="bg-white rounded-xl border border-base-300 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-base-content">{contactName(cb.contact)}</span>
                  {cb.contact?.phone && <span className="text-xs text-base-content/50">{cb.contact.phone}</span>}
                  <span className={`badge badge-xs ${priorityColors[cb.priority] || 'badge-ghost'}`}>{cb.priority}</span>
                </div>
                {cb.reason && <p className="text-xs text-base-content/70 mt-1">{cb.reason}</p>}
                {cb.preferred_time && <p className="text-xs text-base-content/50 mt-0.5">Preferred: {cb.preferred_time}</p>}
                {cb.deals && (
                  <button onClick={() => onSelectDeal?.(cb.deals.id)} className="text-xs text-primary hover:underline flex items-center gap-1 mt-1">
                    <ExternalLink size={11} />{cb.deals.property_address}
                  </button>
                )}
                <p className="text-xs text-base-content/50 mt-1">{fmtDateTime(cb.created_at)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-base-200">
              <button onClick={() => updateCallbackStatus(cb.id, 'completed')} className="btn btn-success btn-xs rounded-xl gap-1">✅ Complete</button>
              <button onClick={() => updateCallbackStatus(cb.id, 'dismissed')} className="btn btn-ghost btn-xs rounded-xl gap-1 text-base-content/50">🗑️ Dismiss</button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderChangesTab = () => {
    if (changeReqs.length === 0) return <div className="flex flex-col items-center justify-center py-16 text-base-content/40"><span className="text-4xl mb-2">⚡</span><p className="text-sm">No pending change requests</p></div>;
    const impactColors: Record<string, string> = { critical: 'badge-error', high: 'badge-warning text-orange-700 bg-orange-100 border-orange-200', medium: 'badge-warning', low: 'badge-success' };
    return (
      <div className="flex flex-col gap-3">
        {changeReqs.map((cr: any) => (
          <div key={cr.id} className="bg-white rounded-xl border border-base-300 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {cr.deals && (
                  <button onClick={() => onSelectDeal?.(cr.deals.id)} className="text-sm font-semibold text-primary hover:underline flex items-center gap-1">
                    <ExternalLink size={11} />{cr.deals.property_address}
                  </button>
                )}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {cr.contact && <span className="text-xs text-base-content/60">Requested by: {contactName(cr.contact)}</span>}
                  <span className="badge badge-outline badge-xs">{(cr.change_type || '').replace(/_/g, ' ')}</span>
                  <span className={`badge badge-xs ${impactColors[cr.impact_level] || 'badge-ghost'}`}>{cr.impact_level}</span>
                </div>
                {cr.requested_change_text && <p className="text-xs text-base-content/70 mt-2">{cr.requested_change_text}</p>}
                {cr.ai_structured_payload && (
                  <div className="text-xs text-base-content/50 mt-1 bg-base-200 rounded-lg p-2">
                    <pre className="whitespace-pre-wrap">{JSON.stringify(cr.ai_structured_payload, null, 2)}</pre>
                  </div>
                )}
                <p className="text-xs text-base-content/50 mt-1">{fmtDateTime(cr.created_at)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-base-200">
              <button onClick={() => updateChangeRequest(cr.id, 'approved')} className="btn btn-success btn-xs rounded-xl gap-1">✅ Approve</button>
              <button onClick={() => updateChangeRequest(cr.id, 'rejected')} className="btn btn-error btn-xs rounded-xl gap-1">❌ Reject</button>
              <button onClick={() => updateChangeRequest(cr.id, 'needs_clarification')} className="btn btn-ghost btn-xs rounded-xl gap-1">💬 Clarification</button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderUnidentifiedTab = () => {
    if (unidentified.length === 0) return <div className="flex flex-col items-center justify-center py-16 text-base-content/40"><span className="text-4xl mb-2">❓</span><p className="text-sm">No unidentified callers</p></div>;
    const filteredContacts = contacts.filter(c => {
      const term = contactSearch.toLowerCase();
      const name = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase();
      return name.includes(term) || (c.phone || '').includes(term);
    });
    return (
      <div className="flex flex-col gap-3">
        {unidentified.map((call: any) => (
          <div key={call.id} className="bg-white rounded-xl border border-base-300 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="font-semibold text-sm text-base-content">{call.from_phone || call.phone_e164 || 'Unknown'}</span>
                <p className="text-xs text-base-content/50 mt-1">{fmtDateTime(call.created_at)}</p>
                {call.duration_seconds != null && <p className="text-xs text-base-content/50">Duration: {Math.floor(call.duration_seconds / 60)}m {call.duration_seconds % 60}s</p>}
              </div>
            </div>

            {/* Link to Contact dropdown */}
            {linkingCallId === call.id ? (
              <div className="mt-3 bg-base-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold">Link to Contact</span>
                  <button onClick={() => { setLinkingCallId(null); setContactSearch(''); }} className="btn btn-ghost btn-xs btn-square"><X size={12} /></button>
                </div>
                <input
                  type="text"
                  placeholder="Search contacts..."
                  className="input input-bordered input-xs w-full mb-2"
                  value={contactSearch}
                  onChange={e => setContactSearch(e.target.value)}
                />
                <div className="max-h-32 overflow-y-auto flex flex-col gap-1">
                  {filteredContacts.slice(0, 20).map(c => (
                    <button
                      key={c.id}
                      onClick={() => linkCallToContact(call.id, c.id)}
                      className="text-left text-xs px-2 py-1.5 rounded hover:bg-base-300 flex items-center justify-between"
                    >
                      <span>{c.first_name} {c.last_name}</span>
                      <span className="text-base-content/40">{c.phone}</span>
                    </button>
                  ))}
                  {filteredContacts.length === 0 && <p className="text-xs text-base-content/40 text-center py-2">No matching contacts</p>}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-base-200">
                <button onClick={() => { setLinkingCallId(call.id); loadContacts(); }} className="btn btn-primary btn-xs rounded-xl gap-1"><Link2 size={11} /> Link to Contact</button>
                <button onClick={() => dismissCall(call.id)} className="btn btn-ghost btn-xs rounded-xl gap-1 text-base-content/50">🗑️ Dismiss</button>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  /* ── Main render ─────────────────────────────────────────────────── */

  return (
    <div className="flex flex-col h-full bg-base-100">
      {/* Header */}
      <div className="flex-none px-4 py-3 border-b border-base-300 bg-white flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-base-content flex items-center gap-2">📞 Communications Console</h1>
        <div className="flex items-center gap-2">
          <select
            className="select select-bordered select-xs"
            value={timeFilter}
            onChange={e => setTimeFilter(e.target.value as TimeFilter)}
          >
            <option value="24h">Last 24h</option>
            <option value="7d">Last 7d</option>
            <option value="30d">Last 30d</option>
            <option value="all">All</option>
          </select>
          <button onClick={handleRefresh} className={`btn btn-ghost btn-xs btn-square ${refreshing ? 'animate-spin' : ''}`} title="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex-none border-b border-base-300 bg-base-200 flex items-center overflow-x-auto scrollbar-none px-2">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-base-content/60 hover:text-base-content'
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
            {t.count > 0 && (
              <span className={`badge badge-xs ${activeTab === t.id ? 'badge-primary' : 'bg-base-content/10 text-base-content/60'}`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="loading loading-spinner loading-md text-primary" />
          </div>
        ) : (
          <>
            {activeTab === 'voice' && renderVoiceTab()}
            {activeTab === 'callbacks' && renderCallbacksTab()}
            {activeTab === 'changes' && renderChangesTab()}
            {activeTab === 'unidentified' && renderUnidentifiedTab()}
          </>
        )}
      </div>
    </div>
  );
};
