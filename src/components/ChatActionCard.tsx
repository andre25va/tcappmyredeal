import React, { useState } from 'react';
import { CheckCircle2, X, ChevronDown, ChevronUp, ListPlus, StickyNote, Mail, AlertTriangle, ArrowRightCircle } from 'lucide-react';
import type { DealChatAction } from '../ai/types';

interface Props {
  action: DealChatAction;
  onApprove: (action: DealChatAction) => void;
  onDismiss: (action: DealChatAction) => void;
}

const iconMap: Record<string, React.ReactNode> = {
  create_task: <ListPlus size={14} className="text-blue-500" />,
  add_note: <StickyNote size={14} className="text-amber-500" />,
  draft_email: <Mail size={14} className="text-green-500" />,
  flag_compliance_issue: <AlertTriangle size={14} className="text-red-500" />,
  suggest_stage_update: <ArrowRightCircle size={14} className="text-purple-500" />,
};

const labelMap: Record<string, string> = {
  create_task: 'Create Task',
  add_note: 'Add Note',
  draft_email: 'Draft Email',
  flag_compliance_issue: 'Flag Compliance Issue',
  suggest_stage_update: 'Update Stage',
};

export const ChatActionCard: React.FC<Props> = ({ action, onApprove, onDismiss }) => {
  const [expanded, setExpanded] = useState(false);
  const p = action.payload as Record<string, unknown>;

  return (
    <div className="bg-base-200 border border-base-300 rounded-xl p-3 mt-2 text-sm">
      {/* Header */}
      <div className="flex items-center gap-2">
        {iconMap[action.type] || null}
        <span className="font-semibold text-xs flex-1">{labelMap[action.type] || action.type}</span>
        <span className="text-[10px] text-base-content/50">
          {Math.round(action.confidence * 100)}% confident
        </span>
        <button onClick={() => setExpanded(!expanded)} className="btn btn-ghost btn-xs btn-square">
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* Title */}
      <p className="font-medium text-xs mt-1 text-base-content/80">{String(p.title || '')}</p>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-2 space-y-1 text-xs text-base-content/60">
          {p.description && <p>{String(p.description)}</p>}
          {p.dueDate && <p><strong>Due:</strong> {String(p.dueDate)}</p>}
          {p.priority && p.priority !== 'none' && <p><strong>Priority:</strong> {String(p.priority)}</p>}
          {p.targetRole && <p><strong>For:</strong> {String(p.targetRole)}</p>}
          <p className="italic text-base-content/40">{action.rationale}</p>
        </div>
      )}

      {/* Buttons */}
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={() => onApprove(action)}
          className="btn btn-xs btn-primary gap-1 rounded-lg"
        >
          <CheckCircle2 size={12} /> Approve
        </button>
        <button
          onClick={() => onDismiss(action)}
          className="btn btn-xs btn-ghost gap-1 rounded-lg text-base-content/50"
        >
          <X size={12} /> Dismiss
        </button>
      </div>
    </div>
  );
};
