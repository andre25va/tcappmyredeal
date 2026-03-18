import React, { useState, useEffect } from 'react';
import {
  Plus, FileText, CheckSquare, Users, AlertTriangle, CheckCircle2,
  Bell, Pencil, MessageSquare, ArrowRightLeft
} from 'lucide-react';
import { Deal, ActivityType } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { generateId } from '../utils/helpers';

interface Props { deal: Deal; onUpdate: (d: Deal) => void; }

const TYPE_ICON: Record<ActivityType, React.ReactNode> = {
  deal_created: <FileText size={13} className="text-primary" />,
  status_change: <ArrowRightLeft size={13} className="text-info" />,
  checklist: <CheckSquare size={13} className="text-success" />,
  contact_added: <Users size={13} className="text-secondary" />,
  document_requested: <AlertTriangle size={13} className="text-warning" />,
  document_confirmed: <CheckCircle2 size={13} className="text-success" />,
  reminder_set: <Bell size={13} className="text-info" />,
  note: <MessageSquare size={13} className="text-base-content/60" />,
  price_change: <Pencil size={13} className="text-warning" />,
};

const TYPE_BG: Record<ActivityType, string> = {
  deal_created: 'bg-primary/15',
  status_change: 'bg-info/15',
  checklist: 'bg-success/15',
  contact_added: 'bg-secondary/15',
  document_requested: 'bg-warning/15',
  document_confirmed: 'bg-success/15',
  reminder_set: 'bg-info/15',
  note: 'bg-base-300',
  price_change: 'bg-warning/15',
};

const ALL_TYPES: { value: ActivityType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'note', label: 'Notes' },
  { value: 'status_change', label: 'Status' },
  { value: 'document_requested', label: 'Documents' },
  { value: 'checklist', label: 'Checklist' },
  { value: 'contact_added', label: 'Contacts' },
];

export const WorkspaceActivityLog: React.FC<Props> = ({ deal, onUpdate }) => {
  const { profile } = useAuth();
  const [filter, setFilter] = useState<ActivityType | 'all'>('all');
  const [note, setNote] = useState('');
  const [staffName, setStaffName] = useState(profile?.name || 'TC Staff');

  // Sync staffName when profile loads (auth may resolve after mount)
  useEffect(() => {
    if (profile?.name) setStaffName(profile.name);
  }, [profile?.name]);

  const addNote = () => {
    if (!note.trim()) return;
    const entry = {
      id: generateId(), timestamp: new Date().toISOString(),
      action: note.trim(), detail: '', user: staffName.trim() || 'TC Staff', type: 'note' as ActivityType,
    };
    onUpdate({
      ...deal,
      activityLog: [entry, ...deal.activityLog],
      updatedAt: new Date().toISOString(),
    });
    setNote('');
  };

  const filtered = filter === 'all'
    ? deal.activityLog
    : deal.activityLog.filter(e => e.type === filter);

  // Group by date
  const grouped: { date: string; entries: typeof filtered }[] = [];
  filtered.forEach(entry => {
    const date = new Date(entry.timestamp).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const last = grouped[grouped.length - 1];
    if (last && last.date === date) last.entries.push(entry);
    else grouped.push({ date, entries: [entry] });
  });

  return (
    <div className="p-5 space-y-4">
      {/* Add note */}
      <div className="bg-base-200 rounded-xl border border-base-300 p-4">
        <p className="text-xs font-semibold text-base-content/50 mb-2 flex items-center gap-1.5"><MessageSquare size={12} /> Add Note to Log</p>
        <div className="flex gap-2 mb-2">
          <input
            className="input input-bordered input-sm flex-1"
            placeholder="Add a note or update..."
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addNote()}
          />
          <input
            className="input input-bordered input-sm w-32"
            placeholder="Your name"
            value={staffName}
            onChange={e => setStaffName(e.target.value)}
          />
          <button onClick={addNote} className="btn btn-primary btn-sm gap-1"><Plus size={13} /> Add</button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1 flex-wrap">
        {ALL_TYPES.map(t => (
          <button key={t.value} onClick={() => setFilter(t.value as ActivityType | 'all')}
            className={`btn btn-xs ${filter === t.value ? 'btn-primary' : 'btn-ghost'}`}>{t.label}</button>
        ))}
        <span className="ml-auto text-xs text-base-content/40 self-center">{filtered.length} entries</span>
      </div>

      {/* Log */}
      {grouped.length === 0 && (
        <p className="text-center text-base-content/30 text-sm py-8">No activity yet.</p>
      )}
      {grouped.map(group => (
        <div key={group.date}>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-px bg-base-300 flex-1" />
            <span className="text-xs text-base-content/40 font-medium">{group.date}</span>
            <div className="h-px bg-base-300 flex-1" />
          </div>
          <div className="space-y-2">
            {group.entries.map(entry => (
              <div key={entry.id} className="flex gap-3 items-start">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-none mt-0.5 ${TYPE_BG[entry.type]}`}>
                  {TYPE_ICON[entry.type]}
                </div>
                <div className="flex-1 min-w-0 bg-base-200 rounded-xl border border-base-300 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-base-content leading-snug">{entry.action}</p>
                    <span className="text-xs text-base-content/40 flex-none whitespace-nowrap">
                      {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                  {entry.detail && <p className="text-xs text-base-content/60 mt-0.5 leading-relaxed">{entry.detail}</p>}
                  <p className="text-xs text-base-content/40 mt-1">— {entry.user}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
