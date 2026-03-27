import React, { useState } from 'react';
import { Tag, Copy, Check } from 'lucide-react';

interface Props {
  pageId: string;
  /** Extra context shown after the page ID (e.g. wizard step number, deal ref) */
  context?: string;
}

/**
 * Floating badge in the bottom-right corner showing the current page ID.
 * Click the copy icon to copy the ID to clipboard for easy bug reporting.
 */
export const PageIdBadge: React.FC<Props> = ({ pageId, context }) => {
  const [copied, setCopied] = useState(false);

  const fullId = context ? `${pageId} · ${context}` : pageId;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullId);
    } catch {
      // Fallback for browsers that don't support clipboard API
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
      className="fixed bottom-4 right-4 z-[9999] flex items-center gap-1.5 bg-gray-900/85 backdrop-blur-sm text-white font-mono rounded-full shadow-xl px-3 py-1.5 select-none group"
      style={{ fontSize: '10px' }}
    >
      <Tag size={9} className="text-gray-400 shrink-0" />
      <span className="text-gray-300 tracking-wide">{fullId}</span>
      <button
        onClick={handleCopy}
        className="ml-0.5 p-0.5 rounded-full hover:bg-white/20 transition-colors focus:outline-none"
        title={copied ? 'Copied!' : 'Copy page ID'}
        aria-label="Copy page ID"
      >
        {copied
          ? <Check size={10} className="text-green-400" />
          : <Copy size={10} className="text-gray-400 group-hover:text-white transition-colors" />
        }
      </button>
    </div>
  );
};
