import React, { useState, useEffect } from 'react';
import { AlertTriangle, Check, RefreshCw, UserPlus, X } from 'lucide-react';
import { ContactRecord } from '../types';
import { WizardParticipant } from './StepDealContacts';
import { saveContactRecord } from '../utils/supabaseDb';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FieldDiff {
  field: keyof WizardParticipant & keyof ContactRecord;
  label: string;
  contractValue: string;
  systemValue: string;
}

export interface ContactMatchPopupProps {
  isOpen: boolean;
  participant: WizardParticipant | null;
  match: ContactRecord | null;
  onClose: () => void;
  /** Link wizard card to existing contact — no DB changes */
  onUseAsIs: (participant: WizardParticipant, match: ContactRecord) => void;
  /** Link wizard card + update system contact record */
  onUseAndUpdate: (participant: WizardParticipant, match: ContactRecord) => void;
  /** Dismiss — keep as a new contact, don't link */
  onKeepNew: (participant: WizardParticipant) => void;
}

// ── Diff detection ────────────────────────────────────────────────────────────

function norm(s: string | undefined | null): string {
  return (s ?? '').trim().toLowerCase();
}

function phoneDigits(s: string | undefined | null): string {
  return (s ?? '').replace(/\D/g, '');
}

function getDiffs(p: WizardParticipant, c: ContactRecord): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  if (norm(p.firstName) && norm(p.firstName) !== norm(c.firstName)) {
    diffs.push({ field: 'firstName', label: 'First Name', contractValue: p.firstName, systemValue: c.firstName });
  }
  if (norm(p.lastName) && norm(p.lastName) !== norm(c.lastName)) {
    diffs.push({ field: 'lastName', label: 'Last Name', contractValue: p.lastName, systemValue: c.lastName });
  }
  if (norm(p.company) && norm(p.company) !== norm(c.company)) {
    diffs.push({ field: 'company', label: 'Company', contractValue: p.company ?? '', systemValue: c.company });
  }
  if (norm(p.email) && norm(p.email) !== norm(c.email)) {
    diffs.push({ field: 'email', label: 'Email', contractValue: p.email, systemValue: c.email });
  }
  const pPhone = phoneDigits(p.phone);
  const cPhone = phoneDigits(c.phone);
  if (pPhone && pPhone !== cPhone) {
    diffs.push({ field: 'phone', label: 'Phone', contractValue: p.phone, systemValue: c.phone });
  }

  return diffs;
}

// ── Row component ─────────────────────────────────────────────────────────────

function CompareRow({
  label, contractValue, systemValue, isDiff,
}: {
  label: string;
  contractValue: string;
  systemValue: string;
  isDiff: boolean;
}) {
  return (
    <tr className={isDiff ? 'bg-warning/10' : ''}>
      <td className="py-1.5 pr-3 text-xs font-semibold text-base-content/50 whitespace-nowrap w-20">{label}</td>
      <td className={`py-1.5 pr-3 text-sm ${isDiff ? 'text-warning font-medium' : 'text-base-content/70'}`}>
        {contractValue || <span className="italic text-base-content/30">—</span>}
      </td>
      <td className={`py-1.5 text-sm ${isDiff ? 'text-base-content font-medium' : 'text-base-content/70'}`}>
        {systemValue || <span className="italic text-base-content/30">—</span>}
      </td>
    </tr>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

type Step = 'compare' | 'confirmUpdate';

export default function ContactMatchPopup({
  isOpen,
  participant,
  match,
  onClose,
  onUseAsIs,
  onUseAndUpdate,
  onKeepNew,
}: ContactMatchPopupProps) {
  const [step, setStep]       = useState<Step>('compare');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Reset step when popup opens
  useEffect(() => {
    if (isOpen) {
      setStep('compare');
      setError(null);
    }
  }, [isOpen, participant?.tempId]);

  if (!isOpen || !participant || !match) return null;

  const diffs = getDiffs(participant, match);
  const hasDiffs = diffs.length > 0;
  const systemName = [match.firstName, match.lastName].filter(Boolean).join(' ') || match.fullName;
  const contractName = [participant.firstName, participant.lastName].filter(Boolean).join(' ');

  // ── Confirm update: save record then callback ─────────────────────────────

  async function handleConfirmUpdate() {
    setSaving(true);
    setError(null);
    try {
      await saveContactRecord({
        id:            match!.id,
        firstName:     participant!.firstName  || match!.firstName,
        lastName:      participant!.lastName   || match!.lastName,
        email:         participant!.email      || match!.email,
        phone:         participant!.phone      || match!.phone,
        contactType:   match!.contactType,
        company:       participant!.company    ?? match!.company,
        timezone:      match!.timezone,
        notes:         match!.notes,
        defaultInstructions: match!.defaultInstructions,
        preferredLanguage:   match!.preferredLanguage,
        pin:           match!.pin,
        teamName:      match!.teamName,
        orgId:         match!.orgId,
      });
      onUseAndUpdate(participant!, match!);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to update contact. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-lg border border-base-300">

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-base-300">
          <div className="flex items-center gap-3">
            <div className="bg-warning/15 rounded-full p-2">
              <AlertTriangle size={18} className="text-warning" />
            </div>
            <div>
              <h3 className="font-bold text-base-content text-base">Possible Match Found</h3>
              <p className="text-xs text-base-content/50 mt-0.5">
                {contractName} may already exist in your contacts
              </p>
            </div>
          </div>
          <button className="btn btn-ghost btn-xs btn-square" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">

          {step === 'compare' && (
            <>
              {/* Comparison table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="text-left text-xs font-semibold text-base-content/40 pb-2 w-20"></th>
                      <th className="text-left text-xs font-semibold text-base-content/40 pb-2 pr-3">From Contract</th>
                      <th className="text-left text-xs font-semibold text-base-content/40 pb-2">System Contact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-base-200">
                    <CompareRow
                      label="First"
                      contractValue={participant.firstName}
                      systemValue={match.firstName}
                      isDiff={norm(participant.firstName) !== norm(match.firstName) && !!norm(participant.firstName)}
                    />
                    <CompareRow
                      label="Last"
                      contractValue={participant.lastName}
                      systemValue={match.lastName}
                      isDiff={norm(participant.lastName) !== norm(match.lastName) && !!norm(participant.lastName)}
                    />
                    <CompareRow
                      label="Company"
                      contractValue={participant.company ?? ''}
                      systemValue={match.company}
                      isDiff={!!norm(participant.company) && norm(participant.company) !== norm(match.company)}
                    />
                    <CompareRow
                      label="Email"
                      contractValue={participant.email}
                      systemValue={match.email}
                      isDiff={!!norm(participant.email) && norm(participant.email) !== norm(match.email)}
                    />
                    <CompareRow
                      label="Phone"
                      contractValue={participant.phone}
                      systemValue={match.phone}
                      isDiff={!!phoneDigits(participant.phone) && phoneDigits(participant.phone) !== phoneDigits(match.phone)}
                    />
                  </tbody>
                </table>
              </div>

              {hasDiffs && (
                <div className="flex items-center gap-2 bg-warning/10 rounded-lg px-3 py-2">
                  <AlertTriangle size={13} className="text-warning shrink-0" />
                  <p className="text-xs text-warning">
                    <span className="font-semibold">{diffs.length} field{diffs.length > 1 ? 's' : ''} differ</span>
                    {' '}between the contract and the system contact.
                    Highlighted in yellow above.
                  </p>
                </div>
              )}
            </>
          )}

          {step === 'confirmUpdate' && (
            <div className="space-y-3">
              <div className="bg-warning/10 rounded-xl p-4 space-y-2">
                <p className="text-sm font-semibold text-base-content">
                  Update <span className="text-warning">{systemName}</span>'s contact record?
                </p>
                <p className="text-xs text-base-content/60">
                  The following fields will be overwritten with information from the contract:
                </p>
                <ul className="space-y-1 mt-2">
                  {diffs.map(d => (
                    <li key={d.field} className="flex items-center gap-2 text-xs">
                      <span className="text-base-content/40 w-16 shrink-0">{d.label}</span>
                      <span className="line-through text-base-content/30">{d.systemValue || '—'}</span>
                      <span className="text-warning">→</span>
                      <span className="text-base-content font-medium">{d.contractValue}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {error && (
                <p className="text-xs text-error flex items-center gap-1">
                  <AlertTriangle size={12} /> {error}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex flex-col gap-2 px-5 pb-5">
          {step === 'compare' && (
            <>
              {/* Use as-is */}
              <button
                className="btn btn-primary btn-sm gap-2 w-full"
                onClick={() => onUseAsIs(participant, match)}
              >
                <Check size={14} /> Use System Contact
              </button>

              {/* Use + update (only shown when there are diffs) */}
              {hasDiffs && (
                <button
                  className="btn btn-warning btn-outline btn-sm gap-2 w-full"
                  onClick={() => setStep('confirmUpdate')}
                >
                  <RefreshCw size={14} /> Use System Contact + Update {diffs.length} Field{diffs.length > 1 ? 's' : ''}
                </button>
              )}

              {/* Keep as new */}
              <button
                className="btn btn-ghost btn-sm gap-2 w-full"
                onClick={() => onKeepNew(participant)}
              >
                <UserPlus size={14} /> Keep as New Contact
              </button>
            </>
          )}

          {step === 'confirmUpdate' && (
            <>
              <button
                className="btn btn-warning btn-sm gap-2 w-full"
                onClick={handleConfirmUpdate}
                disabled={saving}
              >
                {saving ? <span className="loading loading-spinner loading-xs" /> : <Check size={14} />}
                {saving ? 'Saving…' : 'Confirm Update'}
              </button>
              <button
                className="btn btn-ghost btn-sm w-full"
                onClick={() => setStep('compare')}
                disabled={saving}
              >
                Go Back
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
