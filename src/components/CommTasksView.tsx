import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckSquare, Plus, X, Check,
  Clock, AlertTriangle, Search, RefreshCw,
  User, Building2, Send, Edit2, Trash2, ArrowRight, Loader2,
  MessageCircle, Smartphone, AtSign,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { CallButton } from './CallButton';
import { EmptyState } from './ui/EmptyState';
import { LoadingSpinner } from './ui/LoadingSpinner';

// ─── Types ──────────────────────────────────────────────────────────────────

type Channel = 'sms' | 'email' | 'whatsapp';
type Status = 'pending' | 'in_progress' | 'done';
type Priority = 'low' | 'normal' | 'high' | 'urgent';
type Source = 'manual' | 'inbound' | 'auto';

interface CommTask {
  id: string;
  title: string;
  description?: string;
  contact_id?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  deal_id?: string;
  deal_address?: string;
  channel: Channel;
  status: Status;
  priority: Priority;
  message_draft?: string;
  source: Source;
  conversation_id?: string;
  due_date?: string;
  completed_at?: string;
  created_at: string;
}

interface ContactInfo {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  role?: string;
}

interface Deal {
  id: string;
  propertyAddress?: string;
}

interface CallStartedData {
  contactName: string;
  contactPhone: string;
  contactId?: string;
  dealId?: string;
  callSid?: string;
  startedAt: string;
}

interface CommTasksViewProps {
  onOpenInbox?: (channel: Channel, contactPhone?: string, contactEmail?: string) => void;
  onSelectDeal?: (id: string) => void;
  onCallStarted?: (callData: CallStartedData) => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const CHANNEL_COLORS: Record<Channel, string> = {
  sms: 'bg-blue-100 text-blue-700 border-blue-200',
  email: 'bg-purple-100 text-purple-700 border-purple-200',
  whatsapp: 'bg-green-100 text-green-700 border-green-200',
};

const CHANNEL_ICONS: Record<Channel, React.ReactNode> = {
  sms: <Smartphone size={12} />,
  email: <AtSign size={12} />,
  whatsapp: <MessageCircle size={12} />,
};

const CHANNEL_LABELS: Record<Channel, string> = {
  sms: 'SMS',
  email: 'Email',
  whatsapp: 'WhatsApp',
};

const PRIORITY_COLORS: Record<Priority, string> = {
  low: 'text-gray-400',
  normal: 'text-blue-400',
  high: 'text-orange-400',
  urgent: 'text-red-500',
};

const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: '🔥 Urgent',
};

const SOURCE_BADGES: Record<Source, { label: string; color: string }> = {
  manual: { label: 'Manual', color: 'bg-gray-100 text-gray-500' },
  inbound: { label: '📥 Inbound', color: 'bg-amber-100 text-amber-700' },
  auto: { label: '🤖 Auto', color: 'bg-cyan-100 text-cyan-700' },
};

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isDueOverdue(dueDate?: string): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

// ─── Create Task Modal ───────────────────────────────────────────────────────

interface CreateTaskModalProps {
  contacts: ContactInfo[];
  deals: Deal[];
  onSave: (task: Partial<CommTask>) => Promise<void>;
  onClose: () => void;
  prefill?: Partial<CommTask>;
}

function CreateTaskModal({ contacts, deals, onSave, onClose, prefill }: CreateTaskModalProps) {
  const [title, setTitle] = useState(prefill?.title || '');
  const [description, setDescription] = useState(prefill?.description || '');
  const [channel, setChannel] = useState<Channel>(prefill?.channel || 'sms');
  const [priority, setPriority] = useState<Priority>(prefill?.priority || 'normal');
  const [messageDraft, setMessageDraft] = useState(prefill?.message_draft || '');
  const [selectedContact, setSelectedContact] = useState<ContactInfo | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [dueDate, setDueDate] = useState(prefill?.due_date ? new Date(prefill.due_date).toISOString().slice(0, 16) : '');
  const [saving, setSaving] = useState(false);
  const [contactSearch, setContactSearch] = useState('');

  const filteredContacts = contacts.filter(c =>
    contactSearch === '' || c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
    c.phone?.includes(contactSearch) || c.email?.toLowerCase().includes(contactSearch.toLowerCase())
  );

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        channel,
        priority,
        message_draft: messageDraft.trim() || undefined,
        contact_id: selectedContact?.id,
        contact_name: selectedContact?.name,
        contact_phone: selectedContact?.phone,
        contact_email: selectedContact?.email,
        deal_id: selectedDeal?.id,
        deal_address: selectedDeal?.propertyAddress,
        due_date: dueDate ? new Date(dueDate).toISOString() : undefined,
        source: 'manual',
        status: 'pending',
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-base text-gray-900">Create Communication Task</h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm btn-square"><X size={16} /></button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Channel picker */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Channel</label>
            <div className="flex gap-2">
              {(['sms', 'email', 'whatsapp'] as Channel[]).map(ch => (
                <button
                  key={ch}
                  onClick={() => setChannel(ch)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-sm font-medium transition-all ${
                    channel === ch
                      ? ch === 'sms' ? 'bg-blue-600 text-white border-blue-600'
                        : ch === 'email' ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-green-600 text-white border-green-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {CHANNEL_ICONS[ch]}
                  {CHANNEL_LABELS[ch]}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Task Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={`e.g. Follow up with buyer via ${CHANNEL_LABELS[channel]}`}
              className="input input-bordered w-full text-sm"
            />
          </div>

          {/* Contact picker */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Contact</label>
            {selectedContact ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl border border-gray-200">
                <div className="w-7 h-7 bg-primary/10 rounded-full flex items-center justify-center">
                  <User size={13} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{selectedContact.name}</div>
                  <div className="text-xs text-gray-400 truncate">
                    {channel === 'email' ? selectedContact.email : selectedContact.phone}
                  </div>
                </div>
                <button onClick={() => setSelectedContact(null)} className="btn btn-ghost btn-xs btn-square">
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search size={14} className="absolute left-3 top-3 text-gray-400" />
                <input
                  type="text"
                  value={contactSearch}
                  onChange={e => setContactSearch(e.target.value)}
                  placeholder="Search contacts..."
                  className="input input-bordered w-full text-sm pl-9"
                />
                {contactSearch && (
                  <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {filteredContacts.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-400">No contacts found</div>
                    ) : filteredContacts.slice(0, 8).map(c => (
                      <button
                        key={c.id}
                        onClick={() => { setSelectedContact(c); setContactSearch(''); }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 text-left"
                      >
                        <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center flex-none">
                          <User size={11} className="text-primary" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{c.name}</div>
                          <div className="text-xs text-gray-400 truncate">
                            {channel === 'email' ? c.email : c.phone} · {c.role}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Deal picker */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Deal (optional)</label>
            <select
              value={selectedDeal?.id || ''}
              onChange={e => {
                const deal = deals.find(d => d.id === e.target.value) || null;
                setSelectedDeal(deal);
              }}
              className="select select-bordered w-full text-sm"
            >
              <option value="">— No deal —</option>
              {deals.map(d => (
                <option key={d.id} value={d.id}>
                  {d.propertyAddress || `Deal ${d.id.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </div>

          {/* Priority + Due date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Priority</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as Priority)}
                className="select select-bordered w-full text-sm"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">🔥 Urgent</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Due Date</label>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="input input-bordered w-full text-sm"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Notes</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Add any notes about this task..."
              rows={2}
              className="textarea textarea-bordered w-full text-sm resize-none"
            />
          </div>

          {/* Message draft */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Pre-filled Message Draft
            </label>
            <textarea
              value={messageDraft}
              onChange={e => setMessageDraft(e.target.value)}
              placeholder={`Draft your ${CHANNEL_LABELS[channel]} message here — it will auto-fill when you click Send...`}
              rows={3}
              className="textarea textarea-bordered w-full text-sm resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="btn btn-primary btn-sm gap-1.5"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckSquare size={13} />}
            Create Task
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Task Card ───────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: CommTask;
  onStatusChange: (id: string, status: Status) => void;
  onDelete: (id: string) => void;
  onSend: (task: CommTask) => void;
  onSelectDeal?: (id: string) => void;
  onCallStarted?: (callData: CallStartedData) => void;
}

function TaskCard({ task, onStatusChange, onDelete, onSend, onSelectDeal, onCallStarted }: TaskCardProps) {
  const overdue = task.status !== 'done' && isDueOverdue(task.due_date);
  const sourceBadge = SOURCE_BADGES[task.source];

  return (
    <div className={`bg-white rounded-xl border transition-all hover:shadow-md ${
      task.status === 'done' ? 'opacity-60 border-gray-100' :
      overdue ? 'border-red-200 shadow-sm' :
      task.priority === 'urgent' ? 'border-orange-200 shadow-sm' : 'border-gray-200'
    }`}>
      <div className="p-4">
        {/* Top row */}
        <div className="flex items-start gap-3">
          {/* Status checkbox */}
          <button
            onClick={() => onStatusChange(task.id, task.status === 'done' ? 'pending' : 'done')}
            className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-none transition-all ${
              task.status === 'done'
                ? 'bg-green-500 border-green-500'
                : task.status === 'in_progress'
                ? 'bg-blue-500 border-blue-500'
                : 'border-gray-300 hover:border-green-400'
            }`}
          >
            {task.status === 'done' && <Check size={11} className="text-white" />}
            {task.status === 'in_progress' && <div className="w-2 h-2 bg-white rounded-full" />}
          </button>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {/* Channel badge */}
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${CHANNEL_COLORS[task.channel]}`}>
                {CHANNEL_ICONS[task.channel]}
                {CHANNEL_LABELS[task.channel]}
              </span>
              {/* Source badge */}
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${sourceBadge.color}`}>
                {sourceBadge.label}
              </span>
              {/* Priority */}
              {task.priority !== 'normal' && (
                <span className={`text-[10px] font-bold ${PRIORITY_COLORS[task.priority]}`}>
                  {PRIORITY_LABELS[task.priority]}
                </span>
              )}
              {/* Overdue */}
              {overdue && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-red-600">
                  <AlertTriangle size={10} />
                  Overdue
                </span>
              )}
            </div>

            {/* Title */}
            <p className={`text-sm font-semibold text-gray-900 leading-tight ${task.status === 'done' ? 'line-through text-gray-400' : ''}`}>
              {task.title}
            </p>

            {/* Description */}
            {task.description && (
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{task.description}</p>
            )}

            {/* Contact + Deal */}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {task.contact_name && (
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <User size={11} className="text-gray-400" />
                  <span className="font-medium text-gray-700">{task.contact_name}</span>
                  {task.channel === 'sms' || task.channel === 'whatsapp' ? (
                    task.contact_phone && <span className="text-gray-400">{task.contact_phone}</span>
                  ) : (
                    task.contact_email && <span className="text-gray-400">{task.contact_email}</span>
                  )}
                  {task.contact_phone && (
                    <CallButton
                      phoneNumber={task.contact_phone}
                      contactName={task.contact_name}
                      dealId={task.deal_id}
                      size="sm"
                      variant="icon"
                      onCallStarted={(callId) => onCallStarted?.({
                        contactName: task.contact_name!,
                        contactPhone: task.contact_phone!,
                        dealId: task.deal_id,
                        callSid: callId,
                        startedAt: new Date().toISOString(),
                      })}
                    />
                  )}
                </div>
              )}
              {task.deal_address && (
                <button
                  onClick={() => task.deal_id && onSelectDeal?.(task.deal_id)}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Building2 size={11} />
                  <span className="truncate max-w-[140px]">{task.deal_address}</span>
                  <ArrowRight size={10} />
                </button>
              )}
            </div>

            {/* Message draft preview */}
            {task.message_draft && (
              <div className="mt-2 px-2.5 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
                <p className="text-xs text-gray-500 italic line-clamp-2">"{task.message_draft}"</p>
              </div>
            )}
          </div>

          {/* Right side: time + actions */}
          <div className="flex flex-col items-end gap-2 flex-none">
            <span className="text-[10px] text-gray-400">{formatDate(task.created_at)}</span>
            {task.due_date && task.status !== 'done' && (
              <span className={`text-[10px] font-medium flex items-center gap-0.5 ${overdue ? 'text-red-500' : 'text-gray-400'}`}>
                <Clock size={10} />
                {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        {task.status !== 'done' && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-50">
            <button
              onClick={() => onSend(task)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                task.channel === 'sms' ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200' :
                task.channel === 'email' ? 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200' :
                'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
              }`}
            >
              <Send size={11} />
              {task.channel === 'email' ? 'Compose Email' : `Open ${CHANNEL_LABELS[task.channel]}`}
            </button>
            <button
              onClick={() => onStatusChange(task.id, 'in_progress')}
              disabled={task.status === 'in_progress'}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200 disabled:opacity-40"
            >
              <Edit2 size={11} />
              In Progress
            </button>
            <button
              onClick={() => onDelete(task.id)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main View ───────────────────────────────────────────────────────────────

export function CommTasksView({ onOpenInbox, onSelectDeal, onCallStarted }: CommTasksViewProps) {
  const [tasks, setTasks] = useState<CommTask[]>([]);
  const [contacts, setContacts] = useState<ContactInfo[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [channelFilter, setChannelFilter] = useState<Channel | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<Status | 'active'>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [sendNotice, setSendNotice] = useState<string | null>(null);

  // ── Load data ──────────────────────────────────────────────────────────────

  const loadTasks = useCallback(async () => {
    const { data, error } = await supabase
      .from('comm_tasks')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setTasks(data as CommTask[]);
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        // Load tasks
        await loadTasks();
        // Load contacts
        const { data: contactData } = await supabase
          .from('contacts')
          .select('id, first_name, last_name, contact_type, email, phone, company')
          .order('first_name');
        if (contactData) setContacts(contactData.map((c: any) => ({
          id: c.id,
          name: [c.first_name, c.last_name].filter(Boolean).join(' '),
          phone: c.phone,
          email: c.email,
          role: c.contact_type,
        })) as ContactInfo[]);
        // Load deals
        const { data: dealData } = await supabase
          .from('deals')
          .select('id, property_address')
          .order('created_at', { ascending: false });
        if (dealData) setDeals(dealData.map(d => ({
          id: d.id,
          propertyAddress: d.property_address,
        })));
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [loadTasks]);

  // ── CRUD ───────────────────────────────────────────────────────────────────

  const createTask = async (taskData: Partial<CommTask>) => {
    const { data, error } = await supabase
      .from('comm_tasks')
      .insert([taskData])
      .select()
      .single();
    if (!error && data) {
      setTasks(prev => [data as CommTask, ...prev]);
    }
  };

  const updateTaskStatus = async (id: string, status: Status) => {
    const update: any = { status };
    if (status === 'done') update.completed_at = new Date().toISOString();
    const { error } = await supabase.from('comm_tasks').update(update).eq('id', id);
    if (!error) {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status, ...update } : t));
    }
  };

  const deleteTask = async (id: string) => {
    const { error } = await supabase.from('comm_tasks').delete().eq('id', id);
    if (!error) {
      setTasks(prev => prev.filter(t => t.id !== id));
    }
  };

  const handleSend = (task: CommTask) => {
    // Mark as in progress
    updateTaskStatus(task.id, 'in_progress');
    // Navigate to inbox with pre-fill
    if (onOpenInbox) {
      onOpenInbox(task.channel, task.contact_phone, task.contact_email);
    }
    setSendNotice(`Opening ${CHANNEL_LABELS[task.channel]} ${task.contact_name ? `for ${task.contact_name}` : ''}...`);
    setTimeout(() => setSendNotice(null), 3000);
  };

  // ── Filter tasks ───────────────────────────────────────────────────────────

  const filteredTasks = tasks.filter(t => {
    if (channelFilter !== 'all' && t.channel !== channelFilter) return false;
    if (statusFilter === 'active' && t.status === 'done') return false;
    if (statusFilter !== 'active' && t.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        t.contact_name?.toLowerCase().includes(q) ||
        t.deal_address?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // ── Stats ──────────────────────────────────────────────────────────────────

  const stats = {
    total: tasks.filter(t => t.status !== 'done').length,
    sms: tasks.filter(t => t.channel === 'sms' && t.status !== 'done').length,
    email: tasks.filter(t => t.channel === 'email' && t.status !== 'done').length,
    whatsapp: tasks.filter(t => t.channel === 'whatsapp' && t.status !== 'done').length,
    inbound: tasks.filter(t => t.source === 'inbound' && t.status !== 'done').length,
    urgent: tasks.filter(t => t.priority === 'urgent' && t.status !== 'done').length,
    done: tasks.filter(t => t.status === 'done').length,
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <LoadingSpinner label="Loading tasks..." />
    );
  }

  return (
    <div className="flex flex-col h-full bg-base-100 overflow-hidden">
      {/* Header */}
      <div className="flex-none border-b border-base-300 bg-base-100">
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
              <CheckSquare size={18} className="text-primary" />
            </div>
            <div>
              <h1 className="font-bold text-base text-base-content">Communication Tasks</h1>
              <p className="text-xs text-base-content/45">
                {stats.total} active · {stats.inbound > 0 ? `${stats.inbound} inbound · ` : ''}{stats.done} done
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadTasks()}
              className="btn btn-ghost btn-sm btn-square"
              title="Refresh"
            >
              <RefreshCw size={15} />
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="btn btn-primary btn-sm gap-1.5"
            >
              <Plus size={14} />
              New Task
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex gap-2 px-5 pb-3 overflow-x-auto">
          {[
            { key: 'all', label: 'All Active', count: stats.total, color: 'bg-gray-100 text-gray-700' },
            { key: 'sms', label: 'SMS', count: stats.sms, color: 'bg-blue-100 text-blue-700' },
            { key: 'email', label: 'Email', count: stats.email, color: 'bg-purple-100 text-purple-700' },
            { key: 'whatsapp', label: 'WhatsApp', count: stats.whatsapp, color: 'bg-green-100 text-green-700' },
          ].map(s => (
            <button
              key={s.key}
              onClick={() => setChannelFilter(s.key as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-all whitespace-nowrap ${
                channelFilter === s.key
                  ? 'border-primary bg-primary text-white'
                  : `${s.color} border-transparent hover:border-current`
              }`}
            >
              {s.label}
              <span className={`px-1 rounded-full text-[10px] font-bold ${channelFilter === s.key ? 'bg-white/20' : 'bg-black/10'}`}>
                {s.count}
              </span>
            </button>
          ))}
          {stats.urgent > 0 && (
            <span className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-red-100 text-red-700 whitespace-nowrap">
              🔥 {stats.urgent} Urgent
            </span>
          )}
          {stats.inbound > 0 && (
            <span className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 whitespace-nowrap">
              📥 {stats.inbound} Inbound
            </span>
          )}
        </div>

        {/* Search + status filter */}
        <div className="flex items-center gap-2 px-5 pb-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search tasks, contacts, deals..."
              className="input input-bordered input-sm w-full pl-8 text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="select select-bordered select-sm text-sm"
          >
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
          </select>
        </div>
      </div>

      {/* Send notice */}
      {sendNotice && (
        <div className="flex-none mx-5 mt-3 px-4 py-2 bg-primary/10 text-primary rounded-xl text-sm font-medium flex items-center gap-2">
          <Send size={13} />
          {sendNotice}
        </div>
      )}

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {filteredTasks.length === 0 ? (
          <EmptyState
            icon={<CheckSquare size={40} className="opacity-30" />}
            title={searchQuery ? 'No tasks match your search' : 'No tasks here'}
            message={statusFilter === 'active'
              ? 'Create a task to follow up with clients via SMS, Email, or WhatsApp.'
              : statusFilter === 'done'
              ? 'Completed tasks will appear here.'
              : 'No tasks with this status.'}
            action={statusFilter === 'active' ? (
              <button onClick={() => setShowCreate(true)} className="btn btn-primary btn-sm gap-1.5 mt-2">
                <Plus size={13} /> Create First Task
              </button>
            ) : undefined}
          />
        ) : (
          filteredTasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onStatusChange={updateTaskStatus}
              onDelete={deleteTask}
              onSend={handleSend}
              onSelectDeal={onSelectDeal}
              onCallStarted={onCallStarted}
            />
          ))
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateTaskModal
          contacts={contacts}
          deals={deals}
          onSave={createTask}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
