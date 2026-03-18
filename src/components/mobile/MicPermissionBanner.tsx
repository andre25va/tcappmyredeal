import React from 'react';
import { Mic, MicOff, X } from 'lucide-react';
import type { MicPermissionState } from '../../hooks/useMicPermission';

interface MicPermissionBannerProps {
  micState: MicPermissionState;
  onRequestMic: () => void;
  onDismiss: () => void;
}

/**
 * Shown inside the Calls/Voice view on mobile when mic permission is not yet granted.
 * Prompts the user to tap once before attempting a call — required on iOS Safari.
 */
export function MicPermissionBanner({ micState, onRequestMic, onDismiss }: MicPermissionBannerProps) {
  if (micState === 'granted') return null;

  const isDenied = micState === 'denied';

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 text-sm border-b border-base-300 ${
        isDenied ? 'bg-error/10' : 'bg-warning/10'
      }`}
    >
      {isDenied ? (
        <MicOff size={18} className="flex-none text-error" />
      ) : (
        <Mic size={18} className="flex-none text-warning" />
      )}
      <p className="flex-1 min-w-0 text-xs leading-snug">
        {isDenied
          ? 'Microphone blocked. Go to iOS Settings → Safari → Microphone to re-enable.'
          : 'Tap Enable to allow microphone access for voice calls on this iPhone.'}
      </p>
      {!isDenied && (
        <button
          onClick={onRequestMic}
          className="btn btn-xs btn-warning flex-none"
        >
          Enable
        </button>
      )}
      <button
        onClick={onDismiss}
        className="flex-none text-base-content/40 p-1"
        aria-label="Dismiss"
      >
        <X size={15} />
      </button>
    </div>
  );
}
