import React, { useState } from 'react';
import { Sparkles, Copy, Check, ArrowRight } from 'lucide-react';
import { Deal } from '../types';

interface FollowUpResult {
  subject: string;
  body: string;
  toRole: string;
  urgency: 'routine' | 'important' | 'urgent';
  notes: string;
}

const FOLLOW_UP_TYPES = [
  { value: 'lender_follow_up', label: 'Lender Follow-Up' },
  { value: 'title_request', label: 'Title Request' },
  { value: 'missing_document', label: 'Missing Document Request' },
  { value: 'status_update', label: 'Client Status Update' },
  { value: 'agent_nudge', label: 'Co-op Agent Nudge' },
  { value: 'custom', label: 'Custom' },
];

const URGENCY_BADGE: Record<string, string> = {
  routine: 'badge-ghost',
  important: 'badge-warning',
  urgent: 'badge-error',
};

interface Props {
  deal: Deal;
  onSwitchToEmail?: () => void;
}

export const DraftFollowUp: React.FC<Props> = ({ deal, onSwitchToEmail }) => {
  const [followUpType, setFollowUpType] = useState('lender_follow_up');
  const [customPrompt, setCustomPrompt] = useState('');
  const [result, setResult] = useState<FollowUpResult | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai?action=generate-followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deal,
          followUpType,
          customPrompt: followUpType === 'custom' ? customPrompt : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to generate draft' }));
        throw new Error(err.error || 'Failed to generate draft');
      }
      const data: FollowUpResult = await res.json();
      setResult(data);
      setEditSubject(data.subject);
      setEditBody(data.body);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    const text = `Subject: ${editSubject}\n\n${editBody}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      window.prompt('Copy:', text);
    });
  };

  return (
    <div className="bg-base-200 rounded-xl border border-base-300 p-4">
      <h3 className="font-semibold text-sm text-base-content flex items-center gap-2 mb-3">
        <Sparkles size={14} className="text-primary opacity-70" />
        Draft Follow-Up
      </h3>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-2 mb-3">
        <div className="flex-1 min-w-[180px]">
          <label className="text-[10px] text-base-content/40 mb-1 block uppercase tracking-wide">Type</label>
          <select
            className="select select-bordered select-sm w-full"
            value={followUpType}
            onChange={e => setFollowUpType(e.target.value)}
          >
            {FOLLOW_UP_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="btn btn-sm btn-primary gap-1.5"
        >
          {loading ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            <Sparkles size={13} />
          )}
          {loading ? 'Generating…' : 'Generate Draft'}
        </button>
      </div>

      {/* Custom prompt */}
      {followUpType === 'custom' && (
        <div className="mb-3">
          <label className="text-[10px] text-base-content/40 mb-1 block uppercase tracking-wide">Describe what you need</label>
          <input
            className="input input-bordered input-sm w-full"
            placeholder="e.g., Follow up with lender about rate lock expiration…"
            value={customPrompt}
            onChange={e => setCustomPrompt(e.target.value)}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="alert alert-error alert-sm text-xs mb-3">
          <span>{error}</span>
        </div>
      )}

      {/* Result Preview */}
      {result && (
        <div className="bg-white rounded-lg border border-base-300 p-3 space-y-3">
          {/* To + Urgency */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-base-content/50">To:</span>
            <span className="badge badge-sm badge-outline">{result.toRole}</span>
            <span className={`badge badge-sm ${URGENCY_BADGE[result.urgency]}`}>{result.urgency}</span>
          </div>

          {/* Subject */}
          <div>
            <label className="text-[10px] text-base-content/40 mb-0.5 block">Subject</label>
            <input
              className="input input-bordered input-sm w-full font-medium"
              value={editSubject}
              onChange={e => setEditSubject(e.target.value)}
            />
          </div>

          {/* Body */}
          <div>
            <label className="text-[10px] text-base-content/40 mb-0.5 block">Body</label>
            <textarea
              className="textarea textarea-bordered w-full text-sm"
              rows={8}
              value={editBody}
              onChange={e => setEditBody(e.target.value)}
            />
          </div>

          {/* Notes */}
          {result.notes && (
            <p className="text-xs text-base-content/50 italic">{result.notes}</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={handleCopy} className="btn btn-xs btn-outline gap-1">
              {copied ? <Check size={11} className="text-success" /> : <Copy size={11} />}
              {copied ? 'Copied!' : 'Copy to Clipboard'}
            </button>
            {onSwitchToEmail && (
              <button onClick={onSwitchToEmail} className="btn btn-xs btn-ghost gap-1 text-primary">
                <ArrowRight size={11} />
                Send via Email Tab
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
