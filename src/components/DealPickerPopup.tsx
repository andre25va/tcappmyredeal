import React, { useEffect, useRef } from 'react';
import { MapPin, X } from 'lucide-react';

interface DealPickerPopupProps {
  deals: Array<{ id: string; propertyAddress: string }>;
  onSelect: (dealId: string) => void;
  onCancel: () => void;
  contactName: string;
}

export const DealPickerPopup: React.FC<DealPickerPopupProps> = ({
  deals,
  onSelect,
  onCancel,
  contactName,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [onCancel]);

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1 z-50 w-64 bg-base-100 border border-base-300 rounded-xl shadow-lg overflow-hidden"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-base-200">
        <span className="text-xs font-semibold text-base-content/60">
          Select deal for call
        </span>
        <button
          onClick={onCancel}
          className="btn btn-ghost btn-xs btn-circle"
        >
          <X size={12} />
        </button>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {deals.map((deal) => (
          <button
            key={deal.id}
            onClick={(e) => { e.stopPropagation(); onSelect(deal.id); }}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-base-200 transition-colors text-left"
          >
            <MapPin size={12} className="text-primary flex-none" />
            <span className="text-sm text-base-content truncate">
              {deal.propertyAddress}
            </span>
          </button>
        ))}
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(''); }}
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-base-200 transition-colors text-left border-t border-base-200"
        >
          <span className="text-sm text-base-content/50 italic">
            No deal context
          </span>
        </button>
      </div>
    </div>
  );
};
