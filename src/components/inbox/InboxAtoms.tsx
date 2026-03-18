import React, { useState } from 'react';
import { Clock, ExternalLink, Paperclip } from 'lucide-react';
import type { EmailAttachment, EmailMessage } from './types';
import { getFileIcon, formatFileSize } from './helpers';

export function ChannelBadge({ channel }: { channel: 'sms' | 'email' | 'whatsapp' }) {
  if (channel === 'whatsapp') return <span className="badge badge-xs text-white font-bold" style={{ backgroundColor: '#25D366' }}>WA</span>;
  if (channel === 'sms') return <span className="badge badge-xs badge-info">SMS</span>;
  return <span className="badge badge-xs badge-success">EMAIL</span>;
}

export function ChannelAvatar({ channel, name }: { channel: 'sms' | 'email' | 'whatsapp'; name: string }) {
  const letter = name.charAt(0).toUpperCase();
  if (channel === 'whatsapp') return <div className="w-9 h-9 rounded-full flex items-center justify-center flex-none text-sm font-bold text-white" style={{ backgroundColor: '#25D366' }}>{letter}</div>;
  if (channel === 'sms') return <div className="w-9 h-9 rounded-full flex items-center justify-center flex-none text-sm font-bold bg-blue-100 text-blue-600">{letter}</div>;
  return <div className="w-9 h-9 rounded-full flex items-center justify-center flex-none text-sm font-bold bg-green-100 text-green-600">{letter}</div>;
}

export function AttachmentChips({ attachments }: { attachments: EmailAttachment[] }) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-base-200 bg-base-50">
      <div className="w-full text-[10px] text-base-content/40 font-semibold uppercase tracking-wide mb-0.5">
        <Paperclip size={10} className="inline mr-1" />{attachments.length} attachment{attachments.length > 1 ? 's' : ''}
      </div>
      {attachments.map((att, i) => (
        <a key={i} href={att.downloadUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-base-200 hover:bg-base-300 border border-base-300 rounded-xl px-3 py-2 transition-colors group">
          <span className="text-base">{getFileIcon(att.contentType)}</span>
          <div className="min-w-0"><div className="text-xs font-medium truncate max-w-[140px]">{att.filename}</div><div className="text-[10px] text-base-content/40">{formatFileSize(att.size)}</div></div>
          <ExternalLink size={11} className="text-base-content/30 group-hover:text-primary flex-none" />
        </a>
      ))}
    </div>
  );
}

export function EmailBodyRenderer({ msg }: { msg: EmailMessage }) {
  const [showHtml, setShowHtml] = useState(true);
  const hasHtml = !!msg.bodyHtml;
  if (hasHtml && showHtml) {
    return (
      <div>
        <div className="flex items-center justify-between px-4 pt-2 pb-1">
          <div />
          <button onClick={() => setShowHtml(false)} className="text-[10px] text-base-content/35 hover:text-base-content/60">View plain text</button>
        </div>
        <iframe srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;color:#374151;margin:0;padding:12px;word-wrap:break-word;}img{max-width:100%;height:auto;}a{color:#2563eb;}</style></head><body>${msg.bodyHtml}</body></html>`} className="w-full border-0 min-h-[120px]" style={{ height: '300px', maxHeight: '400px' }} sandbox="allow-same-origin" title="Email content" onLoad={(e) => { try { const iframe = e.currentTarget; const height = iframe.contentDocument?.body?.scrollHeight; if (height) iframe.style.height = Math.min(height + 24, 500) + 'px'; } catch {} }} />
      </div>
    );
  }
  return (
    <div className="px-4 py-3">
      {hasHtml && <button onClick={() => setShowHtml(true)} className="text-[10px] text-base-content/35 hover:text-primary mb-2 block">View formatted email</button>}
      <pre className="text-sm text-base-content/80 whitespace-pre-wrap font-sans leading-relaxed max-h-80 overflow-y-auto">{msg.body || msg.snippet || '(no content)'}</pre>
    </div>
  );
}

export function NeedReplyCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer group select-none" onClick={() => onChange(!checked)}>
      <div className="flex items-center justify-center flex-none transition-all" style={{ width: '14px', height: '14px', border: '2px solid #1f2937', borderRadius: '3px', backgroundColor: 'white', boxShadow: checked ? '0 0 0 1px #1f2937' : 'none' }}>
        {checked && <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="#1f2937" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </div>
      <span className={`text-[11px] font-medium transition-colors ${checked ? 'text-amber-600' : 'text-base-content/50 group-hover:text-base-content/70'}`}>Reply Needed</span>
      {checked && <Clock size={11} className="text-amber-500 animate-pulse" />}
    </label>
  );
}
