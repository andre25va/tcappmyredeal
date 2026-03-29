import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { PageIdBadge } from './PageIdBadge';
import { PAGE_IDS } from '../utils/pageTracking';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

interface Props {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;   // default "Delete"
  confirmClass?: string;   // default "btn-error"
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<Props> = ({
  isOpen, title, message,
  confirmLabel = 'Delete',
  confirmClass = 'btn-error',
  onConfirm, onCancel,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} size="sm">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-none">
          <AlertTriangle size={20} className="text-red-500" />
        </div>
        <div>
          <h3 className="font-bold text-base text-black">{title}</h3>
          <p className="text-sm text-gray-500 mt-1">{message}</p>
        </div>
      </div>
      <PageIdBadge pageId={PAGE_IDS.CONFIRM_MODAL} />
      <Modal.Footer>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <button onClick={onConfirm} className={`btn btn-sm ${confirmClass} gap-1`}>
          {confirmLabel}
        </button>
      </Modal.Footer>
    </Modal>
  );
};
