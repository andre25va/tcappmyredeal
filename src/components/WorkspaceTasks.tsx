import React, { useState, useEffect } from 'react';
import {
  CheckSquare, Plus, Trash2, Check, ChevronDown, User, Calendar,
  MoreVertical, Smartphone, AtSign, MessageCircle, Phone, Loader2,
} from 'lucide-react';
import { Deal, DealTask, TaskPriority, AppUser } from '../types';
import { generateId } from '../utils/helpers';
import { MILESTONE_LABELS, MILESTONE_ORDER } from '../utils/taskTemplates';
import { ConfirmModal } from './ConfirmModal';
import { supabase } from '../lib/supabase';

// ── Comm task types (mirrors comm_tasks table) ──────────────────────────────

type CommChannel = 'sms' | 'email' | 'whatsapp' | 'phone';
type CommStatus  = 'pending' | 'in_progress' | 'done';
type CommPriority = 'low' | 'normal' | 'high' | 'urgent';

interface CommTask {
  id: string;
  title: string;
  description?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  channel: CommChannel;
  status: CommStatus;
  priority: CommPriority;
  source: string;
  due_date?: string;
  created_at: string;
}

const CHANNEL_ICONS: Record<CommChannel, React.ReactNode> = {
  sms:      <Smartphone size={11} />,
  email:    <AtSign size={11} />,
  whatsapp: <MessageCircle size={11} />,
  phone:    <Phone size={11} />,
};

const CHANNEL_COLORS: Record<CommChannel, string> = {
  sms:      'bg-blue-100 text-blue-700',
  email:    'bg-purple-100 text-purple-700',
  whatsapp: 'bg-green-100 text-green-700',
  phone:    'bg-gray-100 text-gray-700',
};

const COMM_PRIORITY_COLORS: Record<CommPriority, string> = {
  low:    'text-gray-400',
  normal: 'text-blue-500',
  high:   'text-orange-500',
  urgent: 'text-red-600',
};

// ── Props ───────────────────────────────────────────────────────────────────

interface Props {
  deal: Deal;
  onUpdate: (d: Deal) => void;
  users?: AppUser[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().slice(0, 10);

const urgencyOf = (task: DealTask): 'overdue' | 'today' | 'soon' | 'upcoming' | 'done' => {
  if (task.completedAt) return 'done';
  const now = today();
  if (task.dueDate < now) return 'overdue';
  if (task.dueDate === now) return 'today';
  const diff = Math.ceil((new Date(task.dueDate).getTime() - new Date(now).getTime()) / 86400000);
  if (diff <= 3) return 'soon';
  return 'upcoming';
};

const URGENCY_CONFIG = {
  overdue:  { label: 'Overdue',   bg: 'bg-red-50 border-red-200',      badge: 'bg-red-500 text-white',       dot: 'bg-red-500' },
  today:    { label: 'Due Today', bg: 'bg-amber-50 border-amber-200',   badge: 'bg-amber-500 text-white',     dot: 'bg-amber-500' },
  soon:     { label: 'Due Soon',  bg: 'bg-yellow-50 border-yellow-200', badge: 'bg-yellow-400 text-black',    dot: 'bg-yellow-400' },
  upcoming: { label: 'Upcoming',  bg: 'bg-white border-gray-200',       badge: 'bg-gray-100 text-gray-700',   dot: 'bg-gray-300' },
  done:     { label: 'Done',      bg: 'bg-gray-50 border-gray-200',     badge: 'bg-green-100 text-green-700', dot: 'bg-green-400' },
};

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  high:   'text-red-600',
  medium: 'text-amber-600',
  low:    'text-gray-400',
};

// ── Main Component ──────────────────────────────────────────────────────────

export const WorkspaceTasks: React.FC<Props> = ({ deal, onUpdate, users = [] }) => {
  const tasks = deal.tasks ?? [];

  const [commTasks, setCommTasks]           = useState<CommTask[]>([]);
  const [commLoading, setCommLoading]       = useState(false);
  const [showCommDone, setShowCommDone]     = useState(false);

  const [showAdd, setShowAdd]               = useState(false);
  const [newTitle, setNewTitle]             = useState('');
  const [newDue, setNewDue]                 = useState(today());
  const [newPriority, setNewPriority]       = useState<TaskPriority>('medium');
  const [newCategory, setNewCategory]       = useState('General');
  const [showDone, setShowDone]             = useState(false);
  const [completingId, setCompletingId]     = useState<string | null>(null);
  const [completedBy, setCompletedBy]       = useState('');
  const [completedDate, setCompletedDate]   = useState(today());
  const [deleteTaskId, setDeleteTaskId]     = useState<string | null>(null);
  const [taskMenuId, setTaskMenuId]         = useState<string | null>(null);

  // ── Load comm_tasks for this deal ────────────────────────────────────────

  useEffect(() => {
    if (!deal.id) return;
    const load = async () => {
      setCommLoading(true);
      const { data } = await supabase
        .from('comm_tasks')
        .select('*')
        .eq('deal_id', deal.id)
        .order('created_at', { ascending: false });
      if (data) setCommTasks(data as CommTask[]);
      setCommLoading(false);
    };
    load();

    // Realtime subscription
    const channel = supabase
      .channel(`comm_tasks_deal_${deal.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'comm_tasks',
        filter: `deal_id=eq.${deal.id}`,
      }, () => load())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [deal.id]);

  // ── Update comm task status ───────────────────────────────────────────────

  const markCommDone = async (id: string, currentStatus: CommStatus) => {
    const newStatus: CommStatus = currentStatus === 'done' ? 'pending' : 'done';
    const update: any = { status: newStatus };
    if (newStatus === 'done') update.completed_at = new Date().toISOString();
    await supabase.from('comm_tasks').update(update).eq('id', id);
    setCommTasks(prev => prev.map(t => t.id === id ? { ...t, status: newStatus } : t));
  };

  // ── Deal task CRUD ────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = () => setTaskMenuId(null);
    if (taskMenuId) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [taskMenuId]);

  const updateTasks = (updated: DealTask[]) => {
    onUpdate({
      ...deal,
      tasks: updated,
      activityLog: deal.activityLog,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    const task: DealTask = {
      id: generateId(),
      title: newTitle.trim(),
      dueDate: newDue,
      priority: newPriority,
      category: newCategory,
      milestone: deal.milestone,
      autoGenerated: false,
    };
    updateTasks([...tasks, task]);
    setNewTitle('');
    setNewDue(today());
    setNewPriority('medium');
    setNewCategory('General');
    setShowAdd(false);
  };

  const handleComplete = (id: string) => {
    if (!completedBy.trim()) return;
    updateTasks(tasks.map(t => t.id === id
      ? { ...t, completedAt: completedDate, completedBy: completedBy.trim() }
      : t
    ));
    setCompletingId(null);
    setCompletedBy('');
    setCompletedDate(today());
  };

  const handleUndo = (id: string) => {
    updateTasks(tasks.map(t => t.id === id
      ? { ...t, completedAt: undefined, completedBy: undefined }
      : t
    ));
  };

  const confirmDeleteTask = () => {
    updateTasks(tasks.filter(t => t.id !== deleteTaskId));
    setDeleteTaskId(null);
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const pending  = tasks.filter(t => !t.completedAt);
  const done     = tasks.filter(t => t.completedAt);
  const overdue  = pending.filter(t => urgencyOf(t) === 'overdue');
  const dueToday = pending.filter(t => urgencyOf(t) === 'today');
  const soon     = pending.filter(t => urgencyOf(t) === 'soon');
  const upcoming = pending.filter(t => urgencyOf(t) === 'upcoming');

  const activeCommTasks = commTasks.filter(t => t.status !== 'done');
  const doneCommTasks   = commTasks.filter(t => t.status === 'done');

  const formatDue = (date: string) => {
    const d = new Date(date + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatRelative = (dateStr: string) => {
    const d = new Date(dateStr);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  // ── Sub-components ────────────────────────────────────────────────────────

  const TaskRow: React.FC<{ task: DealTask }> = ({ task }) => {
    const u   = urgencyOf(task);
    const cfg = URGENCY_CONFIG[u];
    const isCompleting = completingId === task.id;
    const menuOpen     = taskMenuId === task.id;

    return (
      <div className="rounded-lg border mb-2 overflow-hidden">
        <div className={`flex items-start gap-3 p-3 ${cfg.bg} group`}>
          <div className={`w-2 h-2 rounded-full flex-none mt-1.5 ${cfg.dot}`} />
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium ${task.completedAt ? 'line-through text-gray-400' : 'text-gray-900'}`}>
              {task.title}
            </p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Calendar size={10} />
                {task.completedAt ? `Done ${formatDue(task.completedAt)}` : formatDue(task.dueDate)}
              </span>
              <span className={`text-xs font-medium ${PRIORITY_COLORS[task.priority]}`}>
                {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
              </span>
              <span className="text-xs text-gray-400">{task.category}</span>
              {task.autoGenerated && (
                <span className="text-[10px] bg-gray-100 text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded-full">Auto</span>
              )}
              {task.completedBy && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <User size={10} /> {task.completedBy}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-none">
            {!task.completedAt ? (
              <button
                onClick={() => { setCompletingId(isCompleting ? null : task.id); setCompletedBy(''); setCompletedDate(today()); }}
                className="btn btn-xs btn-success gap-1"
              >
                <Check size={10} /> Complete
              </button>
            ) : (
              <button onClick={() => handleUndo(task.id)} className="btn btn-xs btn-ghost text-gray-400 hover:text-gray-700">
                Undo
              </button>
            )}
            <div className="relative">
              <button
                onClick={() => setTaskMenuId(menuOpen ? null : task.id)}
                className="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100"
              >
                <MoreVertical size={13} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl min-w-[160px] py-1">
                  {!task.completedAt && (
                    <button
                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      onClick={() => { setTaskMenuId(null); setCompletingId(task.id); setCompletedBy(''); setCompletedDate(today()); }}
                    >
                      <Check size={12} className="text-green-500" /> Mark Complete
                    </button>
                  )}
                  <button
                    className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                    onClick={() => { setTaskMenuId(null); setDeleteTaskId(task.id); }}
                  >
                    <Trash2 size={12} /> Delete Task
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {isCompleting && (
          <div className="border-t border-gray-200 bg-gray-50 p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-600">Confirm Completion</p>
            <div className="flex gap-2 flex-wrap">
              <div className="flex-1 min-w-32">
                <label className="text-[10px] text-gray-400 mb-0.5 block">Completion Date</label>
                <input
                  type="date"
                  className="input input-bordered input-xs w-full"
                  value={completedDate}
                  onChange={e => setCompletedDate(e.target.value)}
                />
              </div>
              <div className="flex-1 min-w-32">
                <label className="text-[10px] text-gray-400 mb-0.5 block">Completed By</label>
                {users.length > 0 ? (
                  <select
                    className="select select-bordered select-xs w-full"
                    value={completedBy}
                    onChange={e => setCompletedBy(e.target.value)}
                  >
                    <option value="">— select user —</option>
                    {users.filter(u => u.active).map(u => (
                      <option key={u.id} value={u.name}>{u.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="input input-bordered input-xs w-full"
                    placeholder="Your name"
                    value={completedBy}
                    onChange={e => setCompletedBy(e.target.value)}
                  />
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleComplete(task.id)}
                disabled={!completedBy.trim()}
                className="btn btn-xs btn-success gap-1 disabled:opacity-40"
              >
                <Check size={10} /> Confirm Complete
              </button>
              <button onClick={() => setCompletingId(null)} className="btn btn-xs btn-ghost">Cancel</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const CommTaskRow: React.FC<{ task: CommTask }> = ({ task }) => {
    const isDone = task.status === 'done';
    const channel = (task.channel ?? 'sms') as CommChannel;
    return (
      <div className={`rounded-lg border mb-2 flex items-start gap-3 p-3 transition-opacity ${isDone ? 'opacity-50 bg-gray-50 border-gray-100' : 'bg-white border-gray-200 hover:shadow-sm'}`}>
        {/* Toggle */}
        <button
          onClick={() => markCommDone(task.id, task.status)}
          className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-none transition-all ${
            isDone ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-green-400'
          }`}
        >
          {isDone && <Check size={9} className="text-white" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${CHANNEL_COLORS[channel] ?? 'bg-gray-100 text-gray-600'}`}>
              {CHANNEL_ICONS[channel]}
              {channel.toUpperCase()}
            </span>
            {task.source === 'auto' && (
              <span className="text-[10px] bg-cyan-100 text-cyan-700 px-1.5 py-0.5 rounded-full font-medium">🤖 From Call</span>
            )}
            {task.priority === 'urgent' && (
              <span className="text-[10px] font-bold text-red-600">🔥 Urgent</span>
            )}
          </div>
          <p className={`text-sm font-medium leading-tight ${isDone ? 'line-through text-gray-400' : 'text-gray-900'}`}>
            {task.title}
          </p>
          {task.contact_name && (
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
              <User size={10} /> {task.contact_name}
              {task.contact_phone && <span className="ml-1">{task.contact_phone}</span>}
            </p>
          )}
          {task.description && (
            <p className="text-xs text-gray-400 mt-0.5 line-clamp-1 italic">{task.description}</p>
          )}
        </div>

        <span className="text-[10px] text-gray-400 flex-none">{formatRelative(task.created_at)}</span>
      </div>
    );
  };

  const Section = ({ title, tasks: sectionTasks, color }: { title: string; tasks: DealTask[]; color: string }) => {
    if (sectionTasks.length === 0) return null;
    return (
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${color}`}>{title}</span>
          <span className="text-xs text-gray-400">{sectionTasks.length}</span>
        </div>
        {sectionTasks.map(t => <TaskRow key={t.id} task={t} />)}
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <CheckSquare size={16} className="text-primary opacity-70" />
            Tasks
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {pending.length} pending · {done.length} completed
            {overdue.length > 0 && <span className="text-red-500 font-semibold ml-1">· {overdue.length} overdue!</span>}
            {activeCommTasks.length > 0 && (
              <span className="text-blue-500 font-semibold ml-1">· {activeCommTasks.length} comm tasks</span>
            )}
          </p>
        </div>
        <button onClick={() => setShowAdd(s => !s)} className="btn btn-sm btn-primary gap-1.5">
          <Plus size={13} /> Add Task
        </button>
      </div>

      {/* Add Task form */}
      {showAdd && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-5 space-y-3">
          <p className="text-xs font-semibold text-gray-600">New Task</p>
          <input
            className="input input-bordered input-sm w-full"
            placeholder="Task title..."
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-gray-400 mb-0.5 block">Due Date</label>
              <input type="date" className="input input-bordered input-xs w-full" value={newDue} onChange={e => setNewDue(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 mb-0.5 block">Priority</label>
              <select className="select select-bordered select-xs w-full" value={newPriority} onChange={e => setNewPriority(e.target.value as TaskPriority)}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-400 mb-0.5 block">Category</label>
              <input className="input input-bordered input-xs w-full" value={newCategory} onChange={e => setNewCategory(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={!newTitle.trim()} className="btn btn-xs btn-primary gap-1 disabled:opacity-40">
              <Plus size={10} /> Add
            </button>
            <button onClick={() => setShowAdd(false)} className="btn btn-xs btn-ghost">Cancel</button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {tasks.length === 0 && commTasks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-300 gap-3">
          <CheckSquare size={40} />
          <p className="text-sm">No tasks yet. Advance the milestone or add a task manually.</p>
        </div>
      )}

      {/* ── Checklist tasks by urgency ─────────────────────────────────────── */}
      <Section title="Overdue"            tasks={overdue}  color="bg-red-100 text-red-700 border-red-300" />
      <Section title="Due Today"          tasks={dueToday} color="bg-amber-100 text-amber-700 border-amber-300" />
      <Section title="Due Soon (1–3 days)" tasks={soon}   color="bg-yellow-100 text-yellow-700 border-yellow-300" />
      <Section title="Upcoming"           tasks={upcoming} color="bg-gray-100 text-gray-600 border-gray-300" />

      {/* Completed deal tasks (collapsible) */}
      {done.length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => setShowDone(s => !s)}
            className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 mb-2 font-medium"
          >
            <ChevronDown size={13} className={`transition-transform ${showDone ? '' : '-rotate-90'}`} />
            Completed ({done.length})
          </button>
          {showDone && done.map(t => <TaskRow key={t.id} task={t} />)}
        </div>
      )}

      {/* ── Communication Tasks (from DB) ──────────────────────────────────── */}
      {(commLoading || commTasks.length > 0) && (
        <div className="mt-2">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-1.5">
              <Phone size={10} />
              Communication Tasks
            </span>
            {commLoading
              ? <Loader2 size={12} className="animate-spin text-gray-400" />
              : <span className="text-xs text-gray-400">{activeCommTasks.length} active</span>
            }
          </div>

          {!commLoading && activeCommTasks.length === 0 && doneCommTasks.length === 0 && (
            <p className="text-xs text-gray-400 italic mb-4">No communication tasks for this deal yet.</p>
          )}

          {activeCommTasks.map(t => <CommTaskRow key={t.id} task={t} />)}

          {doneCommTasks.length > 0 && (
            <div>
              <button
                onClick={() => setShowCommDone(s => !s)}
                className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 mb-2 font-medium"
              >
                <ChevronDown size={13} className={`transition-transform ${showCommDone ? '' : '-rotate-90'}`} />
                Completed comm tasks ({doneCommTasks.length})
              </button>
              {showCommDone && doneCommTasks.map(t => <CommTaskRow key={t.id} task={t} />)}
            </div>
          )}
        </div>
      )}

      {/* Confirm delete modal */}
      <ConfirmModal
        isOpen={deleteTaskId !== null}
        title="Delete Task?"
        message="This task will be permanently removed. This cannot be undone."
        confirmLabel="Delete Task"
        onConfirm={confirmDeleteTask}
        onCancel={() => setDeleteTaskId(null)}
      />
    </div>
  );
};
