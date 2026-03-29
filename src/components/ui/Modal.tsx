/**
 * MRD-UI-002 | Modal  —  LOCKED DESIGN
 * ─────────────────────────────────────────────────────────────────
 * Canonical modal wrapper for MyReDeal.
 *
 * SOURCE OF TRUTH — import this everywhere. Never rebuild inline.
 * Replaces all `fixed inset-0 z-[200]` patterns scattered across components.
 *
 * Usage:
 *   <Modal isOpen={open} onClose={() => setOpen(false)} title="Edit Note">
 *     <p>Content here</p>
 *     <Modal.Footer>
 *       <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
 *       <button className="btn btn-primary btn-sm" onClick={handleSave}>Save</button>
 *     </Modal.Footer>
 *   </Modal>
 *
 * Sizes: 'sm' (max-w-sm), 'md' (max-w-md, default), 'lg' (max-w-2xl), 'xl' (max-w-4xl)
 * ─────────────────────────────────────────────────────────────────
 */

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  size?: ModalSize;
  /** Prevent closing when clicking the backdrop */
  disableBackdropClose?: boolean;
  /** Skip the default p-6 body wrapper — children control their own padding/layout */
  noPadding?: boolean;
  children: React.ReactNode;
  className?: string;
}

const sizeMap: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 justify-end mt-6 pt-4 border-t border-base-200">
      {children}
    </div>
  );
}

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  size = 'md',
  disableBackdropClose = false,
  noPadding = false,
  children,
  className = '',
}: ModalProps) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      onClick={disableBackdropClose ? undefined : (e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`bg-base-100 rounded-2xl shadow-2xl w-full ${sizeMap[size]} mx-4 ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {(title || subtitle) && (
          <div className="flex items-start justify-between p-6 pb-0">
            <div>
              {title && <h3 className="font-bold text-base text-black">{title}</h3>}
              {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost btn-xs btn-square ml-2 -mt-1 -mr-1"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Body */}
        {noPadding ? children : (
          <div className="p-6">{children}</div>
        )}
      </div>
    </div>
  );
}

Modal.Footer = ModalFooter;
