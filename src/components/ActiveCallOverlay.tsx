import React, { useState, useEffect, useRef } from 'react';
import {
  Phone, PhoneOff, Minimize2, Maximize2, Mic, MicOff, Pause, Play,
  Plus, FileText, StickyNote, MessageCircle, Mail, MapPin, Users,
  Clock, Loader2, ChevronRight, CalendarDays, Building2, Edit3, ChevronDown, X,
} from 'lucide-react';
import { Deal } from '../types';

interface CallData {
  contactName: string;
  contactPhone: string;
  contactId?: string;
  dealId?: string;
  callSid?: string;
  startedAt: string;
}

export type EmailTemplate = 'deal-snapshot' | 'contract-dates' | 'key-contacts' | 'custom';

interface ActiveCallOverlayProps {
  isActive: boolean;
  callData: CallData | null;
  deal?: Deal;
  onEndCall: () => void;
  onMinimize: () => void;
  onAddNote: (note: string) => void;
  onCreateTask: (description: string) => void;
  onSendEmail?: (template: EmailTemplate, deal?: Deal, contactName?: string) => void;
  isMinimized: boolean;
}

const EMAIL_TEMPLATES: { id: EmailTemplate; label: string; icon: React.ReactNode; desc: string }[] = [
  {
    id: 'deal-snapshot',
    label: 'Deal Snapshot',
    icon: <Building2 size={13} />,
    desc: 'Stage, closing date, price & pending docs',
  },
  {
    id: 'contract-dates',
    label: 'Contract Dates',
    icon: <CalendarDays size={13} />,
    desc: 'All key deadlines & milestone dates',
  },
  {
    id: 'key-contacts',
    label: 'Key Contacts',
    icon: <Users size={13} />,
    desc: 'Transaction team directory',
  },
  {
    id: 'custom',
    label: 'Custom Email',
    icon: <Edit3 size={13} />,
    desc: 'Write your own message',
  },
];

function useCallTimer(startedAt: string | undefined) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const secs = (elapsed % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

export const ActiveCallOverlay: React.FC<ActiveCallOverlayProps> = ({
  isActive,
  callData,
  deal,
  onEndCall,
  onMinimize,
  onAddNote,
  onCreateTask,
  onSendEmail,
  isMinimized,
}) => {
  const [notes, setNotes] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [showTaskInput, setShowTaskInput] = useState(false);
  const [taskDesc, setTaskDesc] = useState('');
  const [taskSaving, setTaskSaving] = useState(false);
  const [showEmailMenu, setShowEmailMenu] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const emailMenuRef = useRef<HTMLDivElement>(null);

  const timer = useCallTimer(callData?.startedAt);

  // Close email menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (emailMenuRef.current && !emailMenuRef.current.contains(e.target as Node)) {
        setShowEmailMenu(false);
      }
    }
    if (showEmailMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmailMenu]);

  if (!isActive || !callData) return null;

  const handleEndCall = () => {
    if (notes.trim()) {
      onAddNote(notes.trim());
    }
    onEndCall();
    setNotes('');
    setIsMuted(false);
    setIsOnHold(false);
    setShowEmailMenu(false);
  };

  const handleCreateTask = async () => {
    if (!taskDesc.trim()) return;
    setTaskSaving(true);
    try {
      onCreateTask(taskDesc.trim());
      setTaskDesc('');
      setShowTaskInput(false);
    } finally {
      setTaskSaving(false);
    }
  };

  const handleEmailTemplate = (template: EmailTemplate) => {
    setShowEmailMenu(false);
    if (onSendEmail) {
      onSendEmail(template, deal, callData.contactName);
    }
  };

  const participants = deal?.participants ?? [];
  const dealContacts = deal?.contacts ?? [];

  // Minimized pill
  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-[9999]">
        <button
          onClick={onMinimize}
          className="flex items-center gap-3 px-4 py-2.5 bg-success text-success-content rounded-full shadow-2xl hover:shadow-3xl transition-all"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-content opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success-content" />
          </span>
          <Phone size={14} />
          <span className="text-sm font-semibold max-w-[150px] truncate">
            {callData.contactName}
          </span>
          <span className="text-sm font-mono opacity-80">{timer}</span>
          <Maximize2 size={14} className="opacity-60" />
        </button>
      </div>
    );
  }

  // Full overlay
  return (
    <div className="fixed bottom-4 right-4 z-[9999] w-[800px] max-w-[95vw]">
      <div className="bg-base-100 border border-base-300 shadow-2xl rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-success/10 border-b border-success/20 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <span className="relative flex h-3 w-3 flex-none">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-success" />
            </span>
            <span className="badge badge-sm bg-success text-success-content border-0 font-bold text-[10px]">
              LIVE
            </span>
            <div className="min-w-0">
              <span className="font-bold text-base-content text-sm truncate block">
                {callData.contactName}
              </span>
              <span className="text-xs text-base-content/50">{callData.contactPhone}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-none">
            <span className="font-mono text-sm text-base-content/70 flex items-center gap-1">
              <Clock size={12} /> {timer}
            </span>
            <button onClick={onMinimize} className="btn btn-ghost btn-xs btn-square" title="Minimize">
              <Minimize2 size={14} />
            </button>
          </div>
        </div>

        {/* Deal context row */}
        {deal && (
          <div className="px-4 py-2 border-b border-base-200 flex items-center gap-2 text-xs text-base-content/60">
            <MapPin size={11} className="text-primary flex-none" />
            <span className="font-medium text-base-content">{deal.propertyAddress}</span>
            {deal.mlsNumber && (
              <>
                <span className="text-base-content/30">|</span>
                <span>MLS# {deal.mlsNumber}</span>
              </>
            )}
          </div>
        )}

        {/* 3-column body */}
        <div className={`grid gap-0 ${deal ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1'}`}>
          {/* Column 1: Quick Actions */}
          <div className="border-b md:border-b-0 md:border-r border-base-200 p-3">
            <h4 className="text-[10px] font-bold text-base-content/40 uppercase tracking-wider mb-2 flex items-center gap-1">
              ⚡ Quick Actions
            </h4>
            <div className="space-y-1">
              {/* Create Task */}
              <button
                onClick={() => setShowTaskInput(!showTaskInput)}
                className="btn btn-sm btn-ghost w-full justify-start gap-2 text-xs"
              >
                <Plus size={13} /> Create Task
              </button>
              {showTaskInput && (
                <div className="px-1 pb-2">
                  <input
                    type="text"
                    autoComplete="off"
                    value={taskDesc}
                    onChange={(e) => setTaskDesc(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTask(); }}
                    placeholder="Task description..."
                    className="input input-bordered input-xs w-full mb-1"
                    autoFocus
                  />
                  <button
                    onClick={handleCreateTask}
                    disabled={!taskDesc.trim() || taskSaving}
                    className="btn btn-xs btn-primary w-full gap-1"
                  >
                    {taskSaving ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
                    Add Task
                  </button>
                </div>
              )}

              {/* Open Docs */}
              <button className="btn btn-sm btn-ghost w-full justify-start gap-2 text-xs">
                <FileText size={13} /> Open Docs
              </button>

              {/* Add Note */}
              <button
                onClick={() => notesRef.current?.focus()}
                className="btn btn-sm btn-ghost w-full justify-start gap-2 text-xs"
              >
                <StickyNote size={13} /> Add Note
              </button>

              {/* Send Text */}
              <button className="btn btn-sm btn-ghost w-full justify-start gap-2 text-xs">
                <MessageCircle size={13} /> Send Text
              </button>

              {/* Send Email — dropdown trigger */}
              <div className="relative" ref={emailMenuRef}>
                <button
                  onClick={() => setShowEmailMenu(!showEmailMenu)}
                  className={`btn btn-sm btn-ghost w-full justify-start gap-2 text-xs ${
                    showEmailMenu ? 'bg-base-200' : ''
                  }`}
                >
                  <Mail size={13} /> Send Email
                  <ChevronDown
                    size={11}
                    className={`ml-auto transition-transform ${
                      showEmailMenu ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {/* Email template dropdown */}
                {showEmailMenu && (
                  <div className="absolute left-0 top-full mt-1 w-56 bg-base-100 border border-base-300 rounded-xl shadow-xl z-50 overflow-hidden">
                    <div className="px-3 py-2 border-b border-base-200">
                      <p className="text-[10px] font-bold text-base-content/40 uppercase tracking-wider">
                        Choose Template
                      </p>
                    </div>
                    {EMAIL_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.id}
                        onClick={() => handleEmailTemplate(tpl.id)}
                        className="w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-base-200 transition-colors text-left"
                      >
                        <span className="text-primary mt-0.5 flex-none">{tpl.icon}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-base-content">{tpl.label}</p>
                          <p className="text-[10px] text-base-content/50 truncate">{tpl.desc}</p>
                        </div>
                        <ChevronRight size={11} className="text-base-content/30 flex-none ml-auto mt-1" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Column 2: Deal Snapshot */}
          {deal && (
            <div className="border-b md:border-b-0 md:border-r border-base-200 p-3">
              <h4 className="text-[10px] font-bold text-base-content/40 uppercase tracking-wider mb-2 flex items-center gap-1">
                📋 Deal Snapshot
              </h4>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-base-content/50">Stage</span>
                  <span className="font-medium text-base-content capitalize">
                    {deal.milestone?.replace(/-/g, ' ') ?? deal.status}
                  </span>
                </div>
                {deal.closingDate && (
                  <div className="flex justify-between">
                    <span className="text-base-content/50">Closing</span>
                    <span className="font-medium text-base-content">
                      {new Date(deal.closingDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                )}
                {deal.contractPrice > 0 && (
                  <div className="flex justify-between">
                    <span className="text-base-content/50">Price</span>
                    <span className="font-medium text-base-content">
                      ${deal.contractPrice.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              {deal.documentRequests?.filter((d: any) => d.status === 'pending').length > 0 && (
                <div className="mt-3">
                  <p className="text-[10px] font-bold text-warning uppercase tracking-wider mb-1">
                    ⚠️ Pending Docs
                  </p>
                  <div className="space-y-0.5">
                    {deal.documentRequests
                      .filter((d: any) => d.status === 'pending')
                      .slice(0, 3)
                      .map((d: any) => (
                        <p key={d.id} className="text-[11px] text-base-content/60 truncate">
                          • {d.label}
                        </p>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Column 3: Deal Team */}
          {deal && (
            <div className="p-3">
              <h4 className="text-[10px] font-bold text-base-content/40 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Users size={11} /> Deal Team
              </h4>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {participants.length > 0
                  ? participants.slice(0, 8).map((p: any) => (
                      <div key={p.id} className="flex items-center gap-2 text-xs">
                        <span className="font-medium text-base-content truncate flex-1">
                          {p.contactName || 'Unknown'}
                        </span>
                        <span className="text-base-content/40 text-[10px] flex-none capitalize">
                          {p.dealRole?.replace(/_/g, ' ')}
                        </span>
                        {p.contactPhone && (
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="text-success hover:bg-success/10 rounded p-0.5 flex-none"
                            title={`Call ${p.contactName}`}
                          >
                            <Phone size={10} />
                          </button>
                        )}
                      </div>
                    ))
                  : dealContacts.slice(0, 8).map((c: any) => (
                      <div key={c.id} className="flex items-center gap-2 text-xs">
                        <span className="font-medium text-base-content truncate flex-1">
                          {c.name}
                        </span>
                        <span className="text-base-content/40 text-[10px] flex-none capitalize">
                          {c.role}
                        </span>
                        {c.phone && (
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="text-success hover:bg-success/10 rounded p-0.5 flex-none"
                            title={`Call ${c.name}`}
                          >
                            <Phone size={10} />
                          </button>
                        )}
                      </div>
                    ))}
                {participants.length === 0 && dealContacts.length === 0 && (
                  <p className="text-xs text-base-content/40 italic">No team members</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Call Notes */}
        <div className="border-t border-base-200 px-4 py-3">
          <label className="text-[10px] font-bold text-base-content/40 uppercase tracking-wider mb-1.5 block">
            💬 Call Notes
          </label>
          <textarea
            ref={notesRef}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Type notes during the call..."
            autoComplete="off"
            rows={2}
            className="textarea textarea-bordered w-full text-sm resize-none"
          />
        </div>

        {/* Call Controls */}
        <div className="border-t border-base-200 px-4 py-3 flex items-center justify-between bg-base-200/50">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={`btn btn-sm btn-ghost gap-1.5 ${isMuted ? 'text-error' : ''}`}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
              <span className="text-xs hidden sm:inline">{isMuted ? 'Unmute' : 'Mute'}</span>
            </button>
            <button
              onClick={() => setIsOnHold(!isOnHold)}
              className={`btn btn-sm btn-ghost gap-1.5 ${isOnHold ? 'text-warning' : ''}`}
              title={isOnHold ? 'Resume' : 'Hold'}
            >
              {isOnHold ? <Play size={14} /> : <Pause size={14} />}
              <span className="text-xs hidden sm:inline">{isOnHold ? 'Resume' : 'Hold'}</span>
            </button>
          </div>
          <button
            onClick={handleEndCall}
            className="btn btn-error btn-sm gap-1.5 text-white"
          >
            <PhoneOff size={14} />
            End Call
          </button>
        </div>
      </div>
    </div>
  );
};
