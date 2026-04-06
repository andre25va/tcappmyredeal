import React, { useState } from 'react';
import { Tag, Copy, Check } from 'lucide-react';

interface Props {
  pageId: string;
  /** Extra context shown after the page ID (e.g. wizard step number, deal ref) */
  context?: string;
}

/**
 * Inline badge rendered inside the Sidebar between the user pill and Log Out button.
 * Click the copy icon to copy the ID to clipboard for quick bug reporting.
 */
export const PageIdBadge: React.FC<Props> = ({ pageId, context }) => {
  const [copied, setCopied] = useState(false);

  const fullId = context ? `${pageId} · ${context}` : pageId;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullId);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = fullId;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1.5 bg-base-300/60 rounded-lg font-mono select-none group"
      style={{ fontSize: '10px' }}
    >
      <Tag size={9} className="text-base-content/30 shrink-0" />
      <span className="text-base-content/40 tracking-wide truncate flex-1">{fullId}</span>
      <button
        onClick={handleCopy}
        className="p-0.5 rounded hover:bg-base-content/10 transition-colors focus:outline-none flex-none"
        title={copied ? 'Copied!' : 'Copy page ID'}
        aria-label="Copy page ID"
      >
        {copied
          ? <Check size={9} className="text-success" />
          : <Copy size={9} className="text-base-content/30 group-hover:text-base-content/60 transition-colors" />
        }
      </button>
    </div>
  );
};
