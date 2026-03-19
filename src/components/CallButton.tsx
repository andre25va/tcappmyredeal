import React, { useState } from 'react';
import { Phone, Loader2 } from 'lucide-react';
import { DealPickerPopup } from './DealPickerPopup';
import { FEATURE_FLAGS } from '../config/feature.flags';
import { TELEPHONY_URL } from '../lib/telephony';
import { useAuth } from '../contexts/AuthContext';

interface CallButtonProps {
  phoneNumber: string;
  contactName: string;
  contactId?: string;
  dealId?: string;
  deals?: Array<{ id: string; propertyAddress: string }>;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'icon' | 'button';
  className?: string;
  onCallStarted?: (callId: string) => void;
}

const SIZE_MAP = {
  sm: { btn: 'w-7 h-7 min-h-0', icon: 14 },
  md: { btn: 'w-8 h-8 min-h-0', icon: 16 },
  lg: { btn: 'w-9 h-9 min-h-0', icon: 18 },
} as const;

export const CallButton: React.FC<CallButtonProps> = ({
  phoneNumber,
  contactName,
  contactId,
  dealId,
  deals = [],
  size = 'sm',
  variant = 'icon',
  className = '',
  onCallStarted,
}) => {
  const [loading, setLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const { profile } = useAuth();

  // Feature flag gate — disable all call buttons with one flag flip
  if (!FEATURE_FLAGS.outboundCallbacks) return null;

  const initiateCall = async (selectedDealId?: string) => {
    if (!profile?.id) {
      console.warn('CallButton: no profile id — cannot initiate callback');
      return;
    }

    // Use E.164 phone if available, fall back to raw phone
    const staffPhone =
      (profile as any).login_phone_e164 ||
      (profile as any).phone ||
      '';

    if (!staffPhone) {
      console.warn('CallButton: no staff phone on profile — cannot initiate callback');
      return;
    }

    setLoading(true);
    setShowPicker(false);
    try {
      const res = await fetch(`${TELEPHONY_URL}/callbacks/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: contactId || undefined,
          contactName,
          contactPhone: phoneNumber,
          staffPhone,
          dealId: selectedDealId || undefined,
          profileId: profile.id,
          requestedBy: 'tc-app',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        onCallStarted?.(data.callSid || data.staffCallSid || data.id || 'call-initiated');
      } else {
        const err = await res.json().catch(() => ({}));
        console.error('CallButton: initiate failed', res.status, err);
      }
    } catch (err) {
      console.error('Failed to initiate call:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (loading) return;

    if (dealId) {
      initiateCall(dealId);
    } else if (deals.length > 1) {
      setShowPicker(true);
    } else if (deals.length === 1) {
      initiateCall(deals[0].id);
    } else {
      initiateCall();
    }
  };

  const s = SIZE_MAP[size];

  if (variant === 'button') {
    return (
      <div className={`relative inline-flex ${className}`}>
        <button
          onClick={handleClick}
          disabled={loading}
          className="btn btn-sm btn-ghost text-success hover:bg-success/10 gap-1.5 min-h-0 h-7"
          title={`Call ${contactName}`}
        >
          {loading
            ? <Loader2 size={s.icon} className="animate-spin" />
            : <Phone size={s.icon} />}
          <span className="text-xs font-medium">Call</span>
        </button>
        {showPicker && (
          <DealPickerPopup
            deals={deals}
            contactName={contactName}
            onSelect={(id) => initiateCall(id)}
            onCancel={() => setShowPicker(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className={`relative inline-flex ${className}`}>
      <button
        onClick={handleClick}
        disabled={loading}
        className={`btn btn-ghost btn-circle ${s.btn} text-success hover:bg-success/10 p-0 flex items-center justify-center`}
        title={`Call ${contactName}`}
      >
        {loading
          ? <Loader2 size={s.icon} className="animate-spin" />
          : <Phone size={s.icon} />}
      </button>
      {showPicker && (
        <DealPickerPopup
          deals={deals}
          contactName={contactName}
          onSelect={(id) => initiateCall(id)}
          onCancel={() => setShowPicker(false)}
        />
      )}
    </div>
  );
};
