import React, { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Send, Plus, Trash2, Users, ChevronDown, ChevronRight,
  Mail, CheckCircle, XCircle, Eye, Clock, LayoutList, Edit2, X
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Deal } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BlastGroup {
  id: string;
  name: string;
  created_at: string;
  members?: GroupMember[];
}

interface GroupMember {
  id: string;
  group_id: string;
  name: string | null;
  email: string;
}

interface EmailBlast {
  id: string;
  subject: string;
  body_html: string;
  include_confirm: boolean;
  include_decline: boolean;
  blast_type: 'general' | 'deal';
  deal_id: string | null;
  sent_at: string;
  recipient_count?: number;
}

interface BlastRecipient {
  id: string;
  name: string | null;
  email: string;
  sent_at: string | null;
  opened_at: string | null;
  response: 'confirmed' | 'declined' | null;
  responded_at: string | null;
}

interface RecipientRow { name?: string; email: string; }

// ─── Props ───────────────────────────────────────────────────────────────────

interface BroadcastsViewProps {
  deals: Deal[];
  currentUserId?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadge(r: BlastRecipient) {
  if (r.response === 'confirmed') return <span className="badge badge-success badge-sm gap-1"><CheckCircle size={10} />Confirmed</span>;
  if (r.response === 'declined')  return <span className="badge badge-error badge-sm gap-1"><XCircle size={10} />Declined</span>;
  if (r.opened_at)                return <span className="badge badge-info badge-sm gap-1"><Eye size={10} />Opened</span>;
  if (r.sent_at)                  return <span className="badge badge-ghost badge-sm gap-1"><Mail size={10} />Sent</span>;
  return <span className="badge badge-ghost badge-sm gap-1"><Clock size={10} />Pending</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export const BroadcastsView: React.FC<BroadcastsViewProps> = ({ deals, currentUserId }) => {
  const qc = useQueryClient();

  // ── Tab state ────────────────────────────────────────────────────────────────
  const [mainTab, setMainTab] = useState<'compose' | 'history' | 'groups'>('compose');
  const [blastType, setBlastType] = useState<'general' | 'deal'>('general');

  // ── Compose state ────────────────────────────────────────────────────────────
  const [subject, setSubject]             = useState('');
  const [includeConfirm, setIncludeConfirm] = useState(false);
  const [includeDecline, setIncludeDecline] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedDealId, setSelectedDealId]     = useState<string>('');
  const [manualEmails, setManualEmails]  = useState('');
  const [sending, setSending]            = useState(false);
  const [sendResult, setSendResult]      = useState<{ success: boolean; message: string } | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  // ── History state ─────────────────────────────────────────────────────────────
  const [expandedBlastId, setExpandedBlastId] = useState<string | null>(null);

  // ── Groups state ─────────────────────────────────────────────────────────────
  const [newGroupName, setNewGroupName]     = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [newMemberName, setNewMemberName]   = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');

  // ─── Queries ──────────────────────────────────────────────────────────────────

  const { data: groups = [] } = useQuery<BlastGroup[]>({
    queryKey: ['email_blast_groups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_blast_groups')
        .select('*, members:email_blast_group_members(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: blasts = [] } = useQuery<EmailBlast[]>({
    queryKey: ['email_blasts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_blasts')
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    enabled: mainTab === 'history',
  });

  const { data: blastRecipients = [] } = useQuery<BlastRecipient[]>({
    queryKey: ['email_blast_recipients', expandedBlastId],
    queryFn: async () => {
      if (!expandedBlastId) return [];
      const { data, error } = await supabase
        .from('email_blast_recipients')
        .select('*')
        .eq('blast_id', expandedBlastId)
        .order('created_at');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!expandedBlastId,
    refetchInterval: expandedBlastId ? 10000 : false, // live refresh every 10s
  });

  // ─── Mutations ────────────────────────────────────────────────────────────────

  const createGroup = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('email_blast_groups').insert({ name });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email_blast_groups'] });
      setNewGroupName('');
    },
  });

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('email_blast_groups').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email_blast_groups'] }),
  });

  const addMember = useMutation({
    mutationFn: async ({ groupId, name, email }: { groupId: string; name: string; email: string }) => {
      const { error } = await supabase
        .from('email_blast_group_members')
        .insert({ group_id: groupId, name: name || null, email });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email_blast_groups'] });
      setNewMemberName('');
      setNewMemberEmail('');
    },
  });

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from('email_blast_group_members').delete().eq('id', memberId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email_blast_groups'] }),
  });

  // ─── Rich text toolbar ────────────────────────────────────────────────────────

  const execCmd = useCallback((cmd: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
  }, []);

  // ─── Build recipients from selections ────────────────────────────────────────

  const buildRecipients = (): RecipientRow[] => {
    const recipients: RecipientRow[] = [];
    const seen = new Set<string>();

    if (blastType === 'general') {
      // From selected groups
      for (const gid of selectedGroupIds) {
        const group = groups.find(g => g.id === gid);
        for (const m of group?.members ?? []) {
          if (!seen.has(m.email)) {
            seen.add(m.email);
            recipients.push({ name: m.name ?? undefined, email: m.email });
          }
        }
      }
      // From manual emails
      const lines = manualEmails.split(/[\n,;]+/).map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        const emailMatch = line.match(/<?([^\s<>@]+@[^\s<>@]+)>?/);
        if (emailMatch && !seen.has(emailMatch[1])) {
          seen.add(emailMatch[1]);
          // try to extract name: "First Last <email@...>"
          const nameMatch = line.match(/^([^<]+)<[^>]+>/);
          recipients.push({ name: nameMatch?.[1]?.trim() || undefined, email: emailMatch[1] });
        }
      }
    } else {
      // Deal blast — get parties from deal_participants
      // We pass the dealId to the edge function which will resolve participants there
    }

    return recipients;
  };

  // ─── Send ─────────────────────────────────────────────────────────────────────

  const handleSend = async () => {
    const bodyHtml = editorRef.current?.innerHTML ?? '';
    if (!subject.trim()) { setSendResult({ success: false, message: 'Subject is required.' }); return; }
    if (!bodyHtml.trim() || bodyHtml === '<br>') { setSendResult({ success: false, message: 'Message body is required.' }); return; }

    const recipients = buildRecipients();
    if (blastType === 'general' && recipients.length === 0) {
      setSendResult({ success: false, message: 'Add at least one recipient (group or manual email).' });
      return;
    }
    if (blastType === 'deal' && !selectedDealId) {
      setSendResult({ success: false, message: 'Select a deal to send to its parties.' });
      return;
    }

    setSending(true);
    setSendResult(null);
    try {
      const payload: Record<string, unknown> = {
        subject: subject.trim(),
        body_html: bodyHtml,
        include_confirm: includeConfirm,
        include_decline: includeDecline,
        blast_type: blastType,
        sent_by: currentUserId ?? null,
      };

      if (blastType === 'general') {
        payload.recipients = recipients;
      } else {
        payload.deal_id = selectedDealId;
        payload.recipients = []; // edge function resolves deal parties
      }

      const { data, error } = await supabase.functions.invoke('send-group-email', { body: payload });
      if (error) throw error;

      const results: { email: string; success: boolean }[] = data?.results ?? [];
      const successCount = results.filter(r => r.success).length;
      const failCount = results.length - successCount;
      setSendResult({
        success: failCount === 0,
        message: failCount === 0
          ? `✅ Sent to ${successCount} recipient${successCount !== 1 ? 's' : ''}!`
          : `⚠️ Sent to ${successCount}, failed for ${failCount}.`,
      });

      // Reset compose
      setSubject('');
      if (editorRef.current) editorRef.current.innerHTML = '';
      setSelectedGroupIds([]);
      setManualEmails('');
      setIncludeConfirm(false);
      setIncludeDecline(false);
      qc.invalidateQueries({ queryKey: ['email_blasts'] });
    } catch (err: any) {
      setSendResult({ success: false, message: '❌ Send failed: ' + (err.message ?? String(err)) });
    } finally {
      setSending(false);
    }
  };

  // ─── Active deal list (non-archived) ─────────────────────────────────────────
  const activeDeals = deals.filter(d => d.milestone !== 'archived');

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden bg-base-100">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-base-300 flex-none">
        <div>
          <h1 className="text-lg font-bold text-base-content">Broadcasts</h1>
          <p className="text-xs text-base-content/50">Send professional emails to groups or deal parties</p>
        </div>
        <div className="flex gap-1 bg-base-200 rounded-lg p-1">
          {(['compose', 'history', 'groups'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setMainTab(tab)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all capitalize ${
                mainTab === tab ? 'bg-white shadow text-primary' : 'text-base-content/60 hover:text-base-content'
              }`}
            >
              {tab === 'compose' ? '✏️ Compose' : tab === 'history' ? '📬 History' : '👥 Groups'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">

        {/* ── COMPOSE TAB ─────────────────────────────────────────────────── */}
        {mainTab === 'compose' && (
          <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">

            {/* Blast type toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setBlastType('general')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border transition-all ${
                  blastType === 'general'
                    ? 'bg-primary text-primary-content border-primary'
                    : 'bg-base-100 border-base-300 text-base-content/60 hover:border-primary/50'
                }`}
              >
                📣 General Broadcast
              </button>
              <button
                onClick={() => setBlastType('deal')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border transition-all ${
                  blastType === 'deal'
                    ? 'bg-primary text-primary-content border-primary'
                    : 'bg-base-100 border-base-300 text-base-content/60 hover:border-primary/50'
                }`}
              >
                🏠 Deal Blast
              </button>
            </div>

            {/* Recipients */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-base-content/60 uppercase tracking-wide">To</label>

              {blastType === 'general' ? (
                <>
                  {/* Group pills */}
                  {groups.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {groups.map(g => {
                        const selected = selectedGroupIds.includes(g.id);
                        return (
                          <button
                            key={g.id}
                            onClick={() => setSelectedGroupIds(prev =>
                              selected ? prev.filter(id => id !== g.id) : [...prev, g.id]
                            )}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                              selected
                                ? 'bg-primary text-primary-content border-primary'
                                : 'bg-base-200 border-base-300 text-base-content/70 hover:border-primary/50'
                            }`}
                          >
                            <Users size={11} />
                            {g.name}
                            <span className="opacity-60">({g.members?.length ?? 0})</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {groups.length === 0 && (
                    <p className="text-xs text-base-content/40 italic">No groups yet — create one in the Groups tab, or add emails below.</p>
                  )}
                  {/* Manual emails */}
                  <textarea
                    value={manualEmails}
                    onChange={e => setManualEmails(e.target.value)}
                    placeholder="Or type emails here: john@example.com, Jane Doe <jane@example.com>"
                    className="textarea textarea-bordered w-full text-sm h-20 resize-none"
                  />
                </>
              ) : (
                <select
                  value={selectedDealId}
                  onChange={e => setSelectedDealId(e.target.value)}
                  className="select select-bordered w-full text-sm"
                >
                  <option value="">— Select a deal —</option>
                  {activeDeals.map(d => (
                    <option key={d.id} value={d.id}>{d.propertyAddress}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Subject */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-base-content/60 uppercase tracking-wide">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Email subject..."
                className="input input-bordered w-full text-sm"
              />
            </div>

            {/* Rich text editor */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-base-content/60 uppercase tracking-wide">Message</label>
              <div className="border border-base-300 rounded-lg overflow-hidden">
                {/* Toolbar */}
                <div className="flex items-center gap-0.5 px-2 py-1.5 bg-base-200 border-b border-base-300">
                  {[
                    { cmd: 'bold',          label: <strong>B</strong>,       title: 'Bold' },
                    { cmd: 'italic',         label: <em>I</em>,               title: 'Italic' },
                    { cmd: 'underline',      label: <span className="underline">U</span>, title: 'Underline' },
                  ].map(({ cmd, label, title }) => (
                    <button
                      key={cmd}
                      onMouseDown={e => { e.preventDefault(); execCmd(cmd); }}
                      title={title}
                      className="btn btn-ghost btn-xs w-7 h-7 min-h-0 font-normal"
                    >{label}</button>
                  ))}
                  <div className="w-px h-4 bg-base-300 mx-1" />
                  <button onMouseDown={e => { e.preventDefault(); execCmd('insertUnorderedList'); }} title="Bullet list" className="btn btn-ghost btn-xs w-7 h-7 min-h-0">•–</button>
                  <button onMouseDown={e => { e.preventDefault(); execCmd('insertOrderedList'); }} title="Numbered list" className="btn btn-ghost btn-xs w-7 h-7 min-h-0 text-xs">1.</button>
                  <div className="w-px h-4 bg-base-300 mx-1" />
                  <button
                    onMouseDown={e => {
                      e.preventDefault();
                      const url = window.prompt('Enter URL:');
                      if (url) execCmd('createLink', url);
                    }}
                    title="Insert link"
                    className="btn btn-ghost btn-xs w-7 h-7 min-h-0 text-xs"
                  >🔗</button>
                </div>
                {/* Editable area */}
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  className="min-h-[160px] p-3 text-sm text-base-content outline-none focus:outline-none"
                  style={{ lineHeight: '1.6', color: '#1a1a1a' }}
                  data-placeholder="Write your message here..."
                  onFocus={e => {
                    const el = e.currentTarget;
                    if (!el.innerHTML || el.innerHTML === '') {
                      el.style.color = '#1a1a1a';
                    }
                  }}
                />
              </div>
              <p className="text-[10px] text-base-content/40">Emails are sent with white background + dark text — dark mode protected.</p>
            </div>

            {/* Confirm / Decline toggles */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-base-content/60 uppercase tracking-wide">Include Response Buttons</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-success checkbox-sm"
                    checked={includeConfirm}
                    onChange={e => setIncludeConfirm(e.target.checked)}
                  />
                  <span className="text-sm text-base-content">✅ Confirm button</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-error checkbox-sm"
                    checked={includeDecline}
                    onChange={e => setIncludeDecline(e.target.checked)}
                  />
                  <span className="text-sm text-base-content">❌ Decline button</span>
                </label>
              </div>
              {(includeConfirm || includeDecline) && (
                <p className="text-[11px] text-base-content/50">Recipients will be redirected to myredeal.com after clicking. Their response is logged and shown in History.</p>
              )}
            </div>

            {/* Send result */}
            {sendResult && (
              <div className={`alert ${sendResult.success ? 'alert-success' : 'alert-error'} text-sm py-2`}>
                {sendResult.message}
              </div>
            )}

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={sending}
              className="btn btn-primary w-full gap-2"
            >
              {sending ? <span className="loading loading-spinner loading-sm" /> : <Send size={16} />}
              {sending ? 'Sending...' : 'Send Broadcast'}
            </button>
          </div>
        )}

        {/* ── HISTORY TAB ─────────────────────────────────────────────────── */}
        {mainTab === 'history' && (
          <div className="max-w-3xl mx-auto px-6 py-6 space-y-3">
            {blasts.length === 0 && (
              <div className="text-center py-16 text-base-content/30">
                <LayoutList size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No broadcasts sent yet</p>
              </div>
            )}
            {blasts.map(blast => (
              <div key={blast.id} className="border border-base-300 rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-base-50 transition-colors"
                  onClick={() => {
                    setExpandedBlastId(expandedBlastId === blast.id ? null : blast.id);
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-base-content truncate">{blast.subject}</p>
                    <p className="text-xs text-base-content/50">
                      {blast.blast_type === 'deal' ? '🏠 Deal blast' : '📣 General'} ·{' '}
                      {new Date(blast.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-none">
                    {blast.include_confirm && <span className="badge badge-success badge-xs">Confirm</span>}
                    {blast.include_decline && <span className="badge badge-error badge-xs">Decline</span>}
                    {expandedBlastId === blast.id ? <ChevronDown size={16} className="text-base-content/40" /> : <ChevronRight size={16} className="text-base-content/40" />}
                  </div>
                </button>

                {expandedBlastId === blast.id && (
                  <div className="border-t border-base-300 px-4 py-3">
                    {blastRecipients.length === 0 ? (
                      <p className="text-xs text-base-content/40 text-center py-4">No recipients found.</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-base-200">
                            <th className="text-left text-xs font-semibold text-base-content/50 pb-2">Name</th>
                            <th className="text-left text-xs font-semibold text-base-content/50 pb-2">Email</th>
                            <th className="text-left text-xs font-semibold text-base-content/50 pb-2">Status</th>
                            <th className="text-left text-xs font-semibold text-base-content/50 pb-2">Responded</th>
                          </tr>
                        </thead>
                        <tbody>
                          {blastRecipients.map(r => (
                            <tr key={r.id} className="border-b border-base-100 last:border-0">
                              <td className="py-2 pr-4 text-base-content">{r.name ?? '—'}</td>
                              <td className="py-2 pr-4 text-base-content/70 text-xs">{r.email}</td>
                              <td className="py-2 pr-4">{statusBadge(r)}</td>
                              <td className="py-2 text-xs text-base-content/40">
                                {r.responded_at ? new Date(r.responded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {/* Summary bar */}
                    {blastRecipients.length > 0 && (
                      <div className="flex gap-4 mt-3 pt-3 border-t border-base-200 text-xs text-base-content/50">
                        <span>📬 {blastRecipients.filter(r => r.sent_at).length} sent</span>
                        <span>👁 {blastRecipients.filter(r => r.opened_at).length} opened</span>
                        <span>✅ {blastRecipients.filter(r => r.response === 'confirmed').length} confirmed</span>
                        <span>❌ {blastRecipients.filter(r => r.response === 'declined').length} declined</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── GROUPS TAB ──────────────────────────────────────────────────── */}
        {mainTab === 'groups' && (
          <div className="max-w-2xl mx-auto px-6 py-6 space-y-4">

            {/* Create group */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newGroupName.trim()) createGroup.mutate(newGroupName.trim()); }}
                placeholder="New group name (e.g. My Agent Network)..."
                className="input input-bordered flex-1 text-sm"
              />
              <button
                onClick={() => { if (newGroupName.trim()) createGroup.mutate(newGroupName.trim()); }}
                disabled={!newGroupName.trim() || createGroup.isPending}
                className="btn btn-primary gap-1"
              >
                <Plus size={16} /> Create
              </button>
            </div>

            {groups.length === 0 && (
              <div className="text-center py-12 text-base-content/30">
                <Users size={36} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No groups yet. Create one above.</p>
              </div>
            )}

            {groups.map(group => (
              <div key={group.id} className="border border-base-300 rounded-lg overflow-hidden">
                {/* Group header */}
                <div className="flex items-center gap-2 px-4 py-3 bg-base-200">
                  <Users size={15} className="text-base-content/50" />
                  <span className="font-semibold text-sm text-base-content flex-1">{group.name}</span>
                  <span className="text-xs text-base-content/40">{group.members?.length ?? 0} member{group.members?.length !== 1 ? 's' : ''}</span>
                  <button
                    onClick={() => setEditingGroupId(editingGroupId === group.id ? null : group.id)}
                    className="btn btn-ghost btn-xs gap-1"
                  >
                    <Edit2 size={12} /> {editingGroupId === group.id ? 'Done' : 'Edit'}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete group "${group.name}"?`)) deleteGroup.mutate(group.id);
                    }}
                    className="btn btn-ghost btn-xs text-error"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* Members list */}
                <div className="divide-y divide-base-200">
                  {(group.members ?? []).map(m => (
                    <div key={m.id} className="flex items-center gap-2 px-4 py-2">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-base-content">{m.name ?? m.email}</span>
                        {m.name && <span className="text-xs text-base-content/50 ml-2">{m.email}</span>}
                      </div>
                      {editingGroupId === group.id && (
                        <button
                          onClick={() => removeMember.mutate(m.id)}
                          className="btn btn-ghost btn-xs text-error"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                  {(group.members?.length ?? 0) === 0 && (
                    <p className="text-xs text-base-content/40 px-4 py-2 italic">No members yet.</p>
                  )}
                </div>

                {/* Add member form */}
                {editingGroupId === group.id && (
                  <div className="flex gap-2 px-4 py-3 border-t border-base-300 bg-base-50">
                    <input
                      type="text"
                      value={newMemberName}
                      onChange={e => setNewMemberName(e.target.value)}
                      placeholder="Name (optional)"
                      className="input input-bordered input-sm flex-1 text-sm"
                    />
                    <input
                      type="email"
                      value={newMemberEmail}
                      onChange={e => setNewMemberEmail(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && newMemberEmail.trim()) {
                          addMember.mutate({ groupId: group.id, name: newMemberName, email: newMemberEmail.trim() });
                        }
                      }}
                      placeholder="email@example.com *"
                      className="input input-bordered input-sm flex-1 text-sm"
                    />
                    <button
                      onClick={() => {
                        if (newMemberEmail.trim()) {
                          addMember.mutate({ groupId: group.id, name: newMemberName, email: newMemberEmail.trim() });
                        }
                      }}
                      disabled={!newMemberEmail.trim() || addMember.isPending}
                      className="btn btn-primary btn-sm gap-1"
                    >
                      <Plus size={13} /> Add
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
