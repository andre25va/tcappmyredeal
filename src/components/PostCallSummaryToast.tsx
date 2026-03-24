import React, { useState } from 'react';
import { Sparkles, X, Check, Copy, StickyNote, Loader2 } from 'lucide-react';

interface PostCallSummaryToastProps {
  /** True while waiting for Twilio to process the recording */
  loading: boolean;
  /** The AI-generated summary string once available */
  summary: string | null;
  onDismiss: () => void;
  /** Called when the user clicks "Save as Note" */
  onSaveNote: (note: string) => Promise<void>;
}

export const PostCallSummaryToast: React.FC<PostCallSummaryToastProps> = ({
  loading,
  summary,
  onDismiss,
  onSaveNote,
}) => {
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [copied,  setCopied]  = useState(false);

  const handleSave = async () => {
    if (!summary) return;
    setSaving(true);
    try {
      await onSaveNote(summary);
      setSaved(true);
      setTimeout(() => { setSaved(false); onDismiss(); }, 1500);
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = () => {
    if (!summary) return;
    navigator.clipboard.writeText(summary).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed bottom-4 left-4 z-[9998] w-[360px] max-w-[92vw] pointer-events-auto">
      <div className="bg-base-100 border border-base-300 shadow-2xl rounded-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-primary/5 border-b border-primary/10">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-primary" />
            <span className="text-sm font-bold text-base-content">AI Call Summary</span>
            {loading && !summary && (
              <span className="badge badge-xs badge-ghost text-[9px] font-medium">Generating…</span>
            )}
          </div>
          <button
            onClick={onDismiss}
            className="btn btn-ghost btn-xs btn-square opacity-60 hover:opacity-100"
            title="Dismiss"
          >
            <X size={13} />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3 min-h-[56px]">
          {loading && !summary ? (
            <div className="flex items-center gap-3 py-1">
              <Loader2 size={15} className="animate-spin text-primary flex-none" />
              <div>
                <p className="text-sm font-medium text-base-content">Transcribing recording…</p>
                <p className="text-[11px] text-base-content/50 mt-0.5">
                  Usually ready within 60 seconds
                </p>
              </div>
            </div>
          ) : summary ? (
            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
              {summary
                .split('\n')
                .filter(l => l.trim())
                .map((line, i) => (
                  <p key={i} className="text-xs text-base-content leading-relaxed">
                    {line}
                  </p>
                ))}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        {summary && (
          <div className="border-t border-base-200 px-4 py-2.5 flex items-center justify-between bg-base-50">
            <button
              onClick={handleCopy}
              className="btn btn-ghost btn-xs gap-1.5 text-xs"
            >
              {copied
                ? <Check size={11} className="text-success" />
                : <Copy size={11} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>

            <button
              onClick={handleSave}
              disabled={saving || saved}
              className="btn btn-primary btn-xs gap-1.5 text-xs"
            >
              {saving ? (
                <Loader2 size={11} className="animate-spin" />
              ) : saved ? (
                <Check size={11} />
              ) : (
                <StickyNote size={11} />
              )}
              {saved ? 'Saved!' : 'Save as Note'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
