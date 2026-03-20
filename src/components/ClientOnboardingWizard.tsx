import React, { useState } from 'react';
import {
  CheckCircle2,
  MessageSquare,
  Lock,
  Sun,
  FolderOpen,
  PartyPopper,
  X,
  ChevronRight,
  ChevronLeft,
  Loader2,
  ExternalLink,
  ClipboardList,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

type WizardStep = 'welcome' | 'communication' | 'access' | 'briefing' | 'drive' | 'instructions' | 'done';

interface ClientOnboardingWizardProps {
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    phone: string;
    email: string;
    timezone: string;
  };
  onComplete: () => void;
  onSkip: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

const STEPS: WizardStep[] = ['welcome', 'communication', 'access', 'briefing', 'drive', 'instructions', 'done'];

const STEP_LABELS: Record<WizardStep, string> = {
  welcome: 'Welcome',
  communication: 'Communication',
  access: 'Access',
  briefing: 'Briefings',
  drive: 'Drive',
  instructions: 'Instructions',
  done: 'Done',
};

const STEP_ICONS: Record<WizardStep, React.ReactNode> = {
  welcome: <PartyPopper size={14} />,
  communication: <MessageSquare size={14} />,
  access: <Lock size={14} />,
  briefing: <Sun size={14} />,
  drive: <FolderOpen size={14} />,
  instructions: <ClipboardList size={14} />,
  done: <CheckCircle2 size={14} />,
};

// ── Summary state ─────────────────────────────────────────────────────────────

interface Summary {
  welcomeSent: boolean | null;
  accessGranted: boolean | null;
  briefingEnabled: boolean | null;
  folderCreated: boolean | null;
  folderUrl?: string;
  hasInstructions?: boolean;
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ClientOnboardingWizard({ contact, onComplete, onSkip }: ClientOnboardingWizardProps) {
  const [step, setStep] = useState<WizardStep>('welcome');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Step 2: Communication
  const defaultMessage = `Hi ${contact.firstName}! I'm Andre, your Transaction Coordinator at MyReDeal. I'll be managing your deals from contract to close. I'll send you updates here. Reply anytime with questions! 🏠`;
  const [preferredComm, setPreferredComm] = useState<'sms' | 'whatsapp' | 'email'>('sms');
  const [sendWelcome, setSendWelcome] = useState(true);
  const [welcomeMessage, setWelcomeMessage] = useState(defaultMessage);
  const [formSent, setFormSent] = useState(false);
  const [smsSent, setSmsSent] = useState(false);

  // Step 3: Access
  const [grantAccess, setGrantAccess] = useState<'yes' | 'no'>('yes');
  const [accessPhone, setAccessPhone] = useState(contact.phone);
  const [accessEmail, setAccessEmail] = useState(contact.email);
  const [accessRole, setAccessRole] = useState<'viewer' | 'agent'>('viewer');

  // Step 4: Briefing
  const [briefingEnabled, setBriefingEnabled] = useState(true);
  const [briefingPreviewOpen, setBriefingPreviewOpen] = useState(false);

  // Step 5: Drive
  const [clientInstructions, setClientInstructions] = useState('');
  const [createFolder, setCreateFolder] = useState<'yes' | 'no'>('yes');
  const [folderResult, setFolderResult] = useState<{ url?: string; manual?: boolean } | null>(null);

  // Summary
  const [summary, setSummary] = useState<Summary>({
    welcomeSent: null,
    accessGranted: null,
    briefingEnabled: null,
    folderCreated: null,
  });

  const currentStepIdx = STEPS.indexOf(step);
  const totalSteps = STEPS.length - 1; // exclude 'done' from progress

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Step navigation ──────────────────────────────────────────────────────────

  function getNextStep(current: WizardStep): WizardStep {
    const idx = STEPS.indexOf(current);
    return STEPS[idx + 1] as WizardStep;
  }

  function getPrevStep(current: WizardStep): WizardStep {
    const idx = STEPS.indexOf(current);
    return STEPS[idx - 1] as WizardStep;
  }

  // ── Step 2: Communication handler ────────────────────────────────────────────

  async function handleCommunicationNext() {
    setLoading(true);
    let sent = false;
    try {
      if (sendWelcome) {
        if (preferredComm !== 'email' && contact.phone) {
          const resp = await fetch('/api/sms?action=send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: contact.phone,
              body: welcomeMessage,
              channel: preferredComm === 'whatsapp' ? 'whatsapp' : 'sms',
            }),
          });
          if (resp.ok) {
            sent = true;
            showToast('✓ Welcome message sent!');
          }
        } else if (preferredComm === 'email' && contact.email) {
          const resp = await fetch('/api/email?action=send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: contact.email,
              subject: `Welcome — Your Transaction Coordinator is Here`,
              body: welcomeMessage,
            }),
          });
          if (resp.ok) {
            sent = true;
            showToast('✓ Welcome email sent!');
          }
        }
      }

      // Store preferred comm channel in notes
      try {
        const { data: existing } = await supabase
          .from('contacts')
          .select('notes')
          .eq('id', contact.id)
          .single();
        const existingNotes = existing?.notes || '';
        const commNote = `Preferred contact: ${preferredComm === 'sms' ? 'SMS' : preferredComm === 'whatsapp' ? 'WhatsApp' : 'Email'}`;
        const newNotes = existingNotes
          ? existingNotes.includes('Preferred contact:')
            ? existingNotes.replace(/Preferred contact:[^\n]*/g, commNote)
            : `${existingNotes}\n${commNote}`
          : commNote;
        await supabase
          .from('contacts')
          .update({ notes: newNotes, updated_at: new Date().toISOString() })
          .eq('id', contact.id);
      } catch {
        // non-fatal
      }

      setSummary(prev => ({ ...prev, welcomeSent: sendWelcome ? sent : false }));
    } catch (err) {
      console.error('Communication step error:', err);
    } finally {
      setLoading(false);
      setStep(getNextStep('communication'));
    }
  }

  // ── Step 3: Access handler ───────────────────────────────────────────────────

  async function handleAccessNext() {
    setLoading(true);
    let granted = false;
    try {
      if (grantAccess === 'yes' && accessPhone) {
        const e164 = toE164(accessPhone);
        // Try the API endpoint first
        try {
          const resp = await fetch('/api/auth?action=add-phone', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: e164,
              name: contact.fullName,
              role: accessRole,
              email: accessEmail || undefined,
            }),
          });
          if (resp.ok) {
            granted = true;
            showToast('✓ Access granted!');
          } else if (resp.status === 400) {
            const data = await resp.json();
            if (data?.error?.toLowerCase().includes('already')) {
              showToast('Phone already has access');
              granted = true;
            }
          }
        } catch {
          // Fallback: direct Supabase insert
          const { error: insertErr } = await supabase.from('allowed_phones').insert({
            phone: e164,
            name: contact.fullName,
            role: accessRole,
            email: accessEmail || null,
            is_demo: false,
            is_active: true,
          });
          if (!insertErr) {
            granted = true;
            showToast('✓ Access granted!');
          } else if (insertErr.code === '23505') {
            // duplicate key
            showToast('Phone already has access');
            granted = true;
          } else {
            showToast('Could not grant access: ' + insertErr.message, 'error');
          }
        }
      } else {
        granted = false;
      }
      setSummary(prev => ({ ...prev, accessGranted: grantAccess === 'yes' ? granted : false }));
    } catch (err) {
      console.error('Access step error:', err);
    } finally {
      setLoading(false);
      setStep(getNextStep('access'));
    }
  }

  // ── Step 4: Briefing handler ─────────────────────────────────────────────────

  async function handleBriefingNext() {
    setLoading(true);
    try {
      if (briefingEnabled) {
        // Try to update client_accounts notes
        try {
          const { data: ca } = await supabase
            .from('client_accounts')
            .select('id, notes')
            .eq('primary_contact_id', contact.id)
            .single();
          if (ca) {
            const tz = contact.timezone || 'America/Chicago';
            const briefingNote = `morning_briefing:enabled,timezone:${tz}`;
            const existingNotes = ca.notes || '';
            const newNotes = existingNotes
              ? existingNotes.includes('morning_briefing:')
                ? existingNotes.replace(/morning_briefing:[^\n,]*/g, briefingNote)
                : `${existingNotes}\n${briefingNote}`
              : briefingNote;
            await supabase
              .from('client_accounts')
              .update({ notes: newNotes, updated_at: new Date().toISOString() })
              .eq('id', ca.id);
          }
        } catch {
          // non-fatal
        }
        showToast('✓ Morning briefings enabled!');
      }
      setSummary(prev => ({ ...prev, briefingEnabled }));
    } catch (err) {
      console.error('Briefing step error:', err);
    } finally {
      setLoading(false);
      setStep(getNextStep('briefing'));
    }
  }

  // ── Step 5: Drive handler ────────────────────────────────────────────────────

  async function handleDriveNext() {
    setLoading(true);
    let created = false;
    let folderUrl: string | undefined;
    try {
      if (createFolder === 'yes') {
        try {
          const resp = await fetch('/api/drive?action=create-client-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contactId: contact.id, name: contact.fullName }),
          });
          const data = await resp.json();
          if (data.success) {
            created = true;
            folderUrl = data.folderUrl;
            setFolderResult({ url: folderUrl });
            showToast('✓ Drive folder created!');
          } else if (data.manual) {
            setFolderResult({ manual: true, url: data.driveUrl });
            showToast('Folder path ready — create manually in Drive');
          }
        } catch {
          // graceful fallback — show manual link
          setFolderResult({ manual: true, url: 'https://drive.google.com/drive/folders/1Dfqf3pYXelt6tLJ9ryRYyQBOXMrsilDI' });
        }
      }
      setSummary(prev => ({ ...prev, folderCreated: createFolder === 'yes' ? created : false, folderUrl }));
    } catch (err) {
      console.error('Drive step error:', err);
    } finally {
      setLoading(false);
      setStep(getNextStep('drive'));
    }
  }

  // ── Step 6: Instructions handler ─────────────────────────────────────────────

  async function handleInstructionsNext() {
    setLoading(true);
    try {
      if (clientInstructions.trim()) {
        await supabase
          .from('contacts')
          .update({ default_instructions: clientInstructions.trim() })
          .eq('id', contact.id);
        setSummary(prev => ({ ...prev, hasInstructions: true }));
      }
    } catch (err) {
      console.error('Instructions step error:', err);
    } finally {
      setLoading(false);
      setStep(getNextStep('instructions'));
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────────

  function StepIndicator() {
    const visibleSteps = STEPS.filter(s => s !== 'done');
    return (
      <div className="flex items-center justify-center gap-1 mb-3">
        {visibleSteps.map((s, idx) => {
          const stepIdx = STEPS.indexOf(s);
          const currentIdx = STEPS.indexOf(step);
          const isCompleted = currentIdx > stepIdx;
          const isActive = step === s;
          return (
            <React.Fragment key={s}>
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  isCompleted
                    ? 'bg-green-500 text-white'
                    : isActive
                    ? 'bg-primary text-primary-content'
                    : 'bg-gray-100 text-gray-400'
                }`}
                title={STEP_LABELS[s]}
              >
                {isCompleted ? <CheckCircle2 size={13} /> : <span>{idx + 1}</span>}
              </div>
              {idx < visibleSteps.length - 1 && (
                <div className={`h-0.5 w-5 transition-all ${currentIdx > stepIdx + 1 || (currentIdx > stepIdx) ? 'bg-green-400' : 'bg-gray-200'}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  function ProgressBar() {
    const progress = step === 'done' ? 100 : (currentStepIdx / (totalSteps - 1)) * 100;
    return (
      <div className="w-full h-1 bg-gray-100 rounded-full mb-4">
        <div
          className="h-1 bg-primary rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    );
  }

  // ── Step Renders ──────────────────────────────────────────────────────────────

  function renderWelcome() {
    return (
      <div className="text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <CheckCircle2 size={36} className="text-green-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-800">🎉 New Client Onboarded!</h2>
          <p className="mt-2 text-gray-600">
            <strong>{contact.firstName} {contact.lastName}</strong> has been added as a client agent.
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Let's finish setting them up — takes about 60 seconds.
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-left">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Setup steps</p>
          <div className="space-y-1.5">
            {(['communication', 'access', 'briefing', 'drive', 'instructions'] as WizardStep[]).map((s, i) => (
              <div key={s} className="flex items-center gap-2 text-sm text-gray-600">
                <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">{i + 1}</div>
                <span className="flex items-center gap-1.5">{STEP_ICONS[s]} {STEP_LABELS[s]}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button className="btn btn-ghost btn-sm flex-1" onClick={onSkip}>Skip Setup</button>
          <button className="btn btn-primary btn-sm flex-1 gap-1" onClick={() => setStep('communication')}>
            Let's Go <ChevronRight size={15} />
          </button>
        </div>
      </div>
    );
  }

  function renderCommunication() {
    const commOptions = [
      { value: 'sms' as const, icon: '📱', label: 'SMS', desc: 'Standard text messaging' },
      { value: 'whatsapp' as const, icon: '💬', label: 'WhatsApp', desc: 'WhatsApp messaging' },
      { value: 'email' as const, icon: '📧', label: 'Email', desc: 'Email only' },
    ];
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-gray-800">📱 Communication Setup</h2>
          <p className="text-sm text-gray-500 mt-0.5">How does {contact.firstName} prefer to be contacted?</p>
        </div>
        <div className="space-y-2">
          {commOptions.map(opt => (
            <label
              key={opt.value}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                preferredComm === opt.value
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-200 bg-gray-50 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                className="radio radio-sm radio-primary"
                checked={preferredComm === opt.value}
                onChange={() => setPreferredComm(opt.value)}
              />
              <span className="text-lg">{opt.icon}</span>
              <div>
                <span className="font-semibold text-sm text-gray-800">{opt.label}</span>
                <span className="text-xs text-gray-400 ml-2">— {opt.desc}</span>
              </div>
            </label>
          ))}
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox checkbox-sm checkbox-primary"
              checked={sendWelcome}
              onChange={e => setSendWelcome(e.target.checked)}
            />
            <span className="text-sm font-medium text-gray-700">Send welcome message now</span>
          </label>

          {sendWelcome && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Welcome message preview</p>
              <textarea
                className="textarea textarea-bordered textarea-sm w-full text-sm min-h-[80px]"
                value={welcomeMessage}
                onChange={e => setWelcomeMessage(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Onboarding Channels */}
        <div className="mt-4 border-t pt-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Additional Onboarding Options</p>
          <div className="grid grid-cols-2 gap-3">
            {/* Send Form Card */}
            <button
              onClick={async () => {
                setLoading(true);
                try {
                  await fetch('/api/onboard?action=send-form', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      phone: contact.phone,
                      contact_name: `${contact.firstName} ${contact.lastName}`,
                      channel: preferredComm,
                      form_url: 'https://form.jotform.com/260755368659069',
                    }),
                  });
                  setFormSent(true);
                } catch (e) {
                  console.error(e);
                }
                setLoading(false);
              }}
              disabled={loading || formSent || !contact.phone}
              className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all text-left ${
                formSent ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-indigo-400 hover:bg-indigo-50'
              }`}
            >
              <span className="text-2xl mb-1">{formSent ? '✅' : '📋'}</span>
              <span className="text-xs font-semibold text-gray-700">{formSent ? 'Form Sent!' : 'Send Onboarding Form'}</span>
              <span className="text-xs text-gray-400 mt-0.5">Client fills out their info</span>
            </button>

            {/* SMS Onboarding Card */}
            <button
              onClick={async () => {
                setLoading(true);
                try {
                  await fetch('/api/onboard?action=start-sms', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      phone: contact.phone,
                      contact_id: contact.id,
                      contact_name: `${contact.firstName} ${contact.lastName}`,
                      channel: preferredComm,
                      initiated_by: 'TC',
                    }),
                  });
                  setSmsSent(true);
                } catch (e) {
                  console.error(e);
                }
                setLoading(false);
              }}
              disabled={loading || smsSent || !contact.phone}
              className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all text-left ${
                smsSent ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-indigo-400 hover:bg-indigo-50'
              }`}
            >
              <span className="text-2xl mb-1">{smsSent ? '✅' : '💬'}</span>
              <span className="text-xs font-semibold text-gray-700">{smsSent ? 'SMS Flow Started!' : 'Start SMS Onboarding'}</span>
              <span className="text-xs text-gray-400 mt-0.5">8-step guided text flow</span>
            </button>
          </div>
          {formSent && <p className="text-xs text-green-600 mt-2">✓ Form link sent — client will fill out their details</p>}
          {smsSent && <p className="text-xs text-green-600 mt-2">✓ SMS onboarding started — client will receive step-by-step texts</p>}
        </div>

        <div className="flex gap-3">
          <button className="btn btn-ghost btn-sm" onClick={() => setStep(getPrevStep('communication'))}>
            <ChevronLeft size={15} /> Back
          </button>
          <button
            className="btn btn-primary btn-sm flex-1 gap-1"
            onClick={handleCommunicationNext}
            disabled={loading}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            Next <ChevronRight size={15} />
          </button>
        </div>
      </div>
    );
  }

  function renderAccess() {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-gray-800">🔐 App Access</h2>
          <p className="text-sm text-gray-500 mt-0.5">Would you like {contact.firstName} to have access to TC Command?</p>
        </div>
        <div className="space-y-2">
          {[
            { value: 'yes' as const, icon: '✅', label: 'Yes, add them', desc: 'They can log in with their phone number to view their deals and messages' },
            { value: 'no' as const, icon: '❌', label: 'No, not yet', desc: 'You can add them later from Settings → Access & Users' },
          ].map(opt => (
            <label
              key={opt.value}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                grantAccess === opt.value
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-200 bg-gray-50 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                className="radio radio-sm radio-primary mt-0.5"
                checked={grantAccess === opt.value}
                onChange={() => setGrantAccess(opt.value)}
              />
              <div>
                <span className="text-sm font-semibold text-gray-800">{opt.icon} {opt.label}</span>
                <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>

        {grantAccess === 'yes' && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label py-0"><span className="label-text text-xs">Phone</span></label>
                <input
                  className="input input-sm input-bordered w-full"
                  value={accessPhone}
                  onChange={e => setAccessPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                />
              </div>
              <div>
                <label className="label py-0"><span className="label-text text-xs">Role</span></label>
                <select
                  className="select select-sm select-bordered w-full"
                  value={accessRole}
                  onChange={e => setAccessRole(e.target.value as 'viewer' | 'agent')}
                >
                  <option value="viewer">Viewer</option>
                  <option value="agent">Agent</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label py-0"><span className="label-text text-xs">Email (optional)</span></label>
              <input
                className="input input-sm input-bordered w-full"
                type="email"
                value={accessEmail}
                onChange={e => setAccessEmail(e.target.value)}
                placeholder="agent@example.com"
              />
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button className="btn btn-ghost btn-sm" onClick={() => setStep(getPrevStep('access'))}>
            <ChevronLeft size={15} /> Back
          </button>
          <button
            className="btn btn-primary btn-sm flex-1 gap-1"
            onClick={handleAccessNext}
            disabled={loading}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            Next <ChevronRight size={15} />
          </button>
        </div>
      </div>
    );
  }

  function renderBriefing() {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-gray-800">🌅 Morning Briefings</h2>
          <p className="text-sm text-gray-500 mt-0.5">Send {contact.firstName} a daily deal briefing each morning?</p>
        </div>

        <div className={`rounded-lg border p-4 transition-all ${briefingEnabled ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm text-gray-800">
                {briefingEnabled
                  ? `Enabled — ${contact.firstName} will receive a briefing at 8:45 AM`
                  : 'Disabled — you can enable this later from their contact profile'}
              </p>
              {briefingEnabled && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {contact.timezone
                    ? `Timezone: ${contact.timezone}`
                    : <span className="text-amber-600">⚠️ No timezone set — briefing will use Central Time</span>}
                </p>
              )}
            </div>
            <input
              type="checkbox"
              className="toggle toggle-success toggle-md"
              checked={briefingEnabled}
              onChange={e => setBriefingEnabled(e.target.checked)}
            />
          </div>
        </div>

        <div>
          <button
            className="text-xs text-primary underline flex items-center gap-1"
            onClick={() => setBriefingPreviewOpen(!briefingPreviewOpen)}
          >
            {briefingPreviewOpen ? 'Hide' : 'Show'} briefing preview
          </button>
          {briefingPreviewOpen && (
            <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-600 space-y-1">
              <p>Good morning, {contact.firstName}! Here's your deal update for today...</p>
              <div className="flex gap-3 mt-2 text-xs text-gray-500">
                <span>📋 2 active deals</span>
                <span>⏰ 1 deadline today</span>
                <span>📄 3 docs needed</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button className="btn btn-ghost btn-sm" onClick={() => setStep(getPrevStep('briefing'))}>
            <ChevronLeft size={15} /> Back
          </button>
          <button
            className="btn btn-primary btn-sm flex-1 gap-1"
            onClick={handleBriefingNext}
            disabled={loading}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            Next <ChevronRight size={15} />
          </button>
        </div>
      </div>
    );
  }

  function renderDrive() {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-gray-800">📁 Google Drive Folder</h2>
          <p className="text-sm text-gray-500 mt-0.5">Create a dedicated Google Drive folder for {contact.firstName}'s deals?</p>
        </div>

        <div className="space-y-2">
          {[
            { value: 'yes' as const, icon: '📁', label: 'Yes, create folder', desc: `Creates '${contact.fullName}' subfolder in Active Deals` },
            { value: 'no' as const, icon: '⏭️', label: 'Skip for now', desc: 'You can create folders manually in Google Drive' },
          ].map(opt => (
            <label
              key={opt.value}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                createFolder === opt.value
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-200 bg-gray-50 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                className="radio radio-sm radio-primary mt-0.5"
                checked={createFolder === opt.value}
                onChange={() => setCreateFolder(opt.value)}
              />
              <div>
                <span className="text-sm font-semibold text-gray-800">{opt.icon} {opt.label}</span>
                <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>

        {createFolder === 'yes' && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Folder path</p>
            <p className="text-sm text-gray-700">
              TC Command - MyReDeal / Active Deals / <strong>{contact.fullName}</strong>
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <button className="btn btn-ghost btn-sm" onClick={() => setStep(getPrevStep('drive'))}>
            <ChevronLeft size={15} /> Back
          </button>
          <button
            className="btn btn-primary btn-sm flex-1 gap-1"
            onClick={handleDriveNext}
            disabled={loading}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            Next <ChevronRight size={15} />
          </button>
        </div>
      </div>
    );
  }

  function renderInstructions() {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-gray-800">📝 Special Instructions</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Any recurring TC instructions for {contact.firstName}'s deals?
          </p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs text-amber-700 font-medium">
            💡 These will auto-fill the Special Notes box every time you create a new deal for {contact.firstName}.
          </p>
        </div>
        <div>
          <textarea
            className={`textarea textarea-bordered w-full transition-all ${
              clientInstructions.trim()
                ? 'border-red-400 shadow-[0_0_12px_2px_rgba(239,68,68,0.4)]'
                : ''
            }`}
            rows={4}
            placeholder="e.g. Always CC buyer's attorney. EMD via wire only. Call before sending any docs."
            value={clientInstructions}
            onChange={e => setClientInstructions(e.target.value)}
          />
          <p className="text-xs text-gray-400 mt-1">Optional — leave blank to skip</p>
        </div>
        <div className="flex gap-3">
          <button className="btn btn-ghost btn-sm" onClick={() => setStep(getPrevStep('instructions'))}>
            <ChevronLeft size={15} /> Back
          </button>
          <button
            className="btn btn-primary btn-sm flex-1 gap-1"
            onClick={handleInstructionsNext}
            disabled={loading}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            {clientInstructions.trim() ? 'Save & Finish' : 'Skip'} <ChevronRight size={15} />
          </button>
        </div>
      </div>
    );
  }

  function SummaryRow({ icon, label, status }: { icon: string; label: string; status: boolean | null }) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
          status === true ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
        }`}>
          {status === true ? '✓' : '—'}
        </span>
        <span className="text-gray-700">{icon} {label}</span>
        {status === false && <span className="text-xs text-gray-400 ml-auto">Skipped</span>}
        {status === null && <span className="text-xs text-gray-400 ml-auto">—</span>}
      </div>
    );
  }

  function renderDone() {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 size={32} className="text-green-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-800">✅ {contact.firstName} is ready!</h2>
          <p className="text-sm text-gray-500 mt-1">Here's a summary of what was set up</p>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
          <SummaryRow icon="👤" label="Added as client agent" status={true} />
          <SummaryRow
            icon="💬"
            label={summary.welcomeSent ? 'Welcome message sent' : 'Welcome message skipped'}
            status={summary.welcomeSent}
          />
          <SummaryRow
            icon="🔐"
            label={summary.accessGranted ? 'App access granted' : 'App access not added'}
            status={summary.accessGranted}
          />
          <SummaryRow
            icon="🌅"
            label={summary.briefingEnabled ? 'Morning briefings enabled' : 'Morning briefings disabled'}
            status={summary.briefingEnabled}
          />
          <div className="flex items-center gap-2 text-sm">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
              summary.folderCreated ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
            }`}>
              {summary.folderCreated ? '✓' : '—'}
            </span>
            <span className="text-gray-700">
              📁 {summary.folderCreated ? 'Drive folder created' : 'Drive folder — create manually'}
            </span>
            {(folderResult?.url || summary.folderUrl) && (
              <a
                href={folderResult?.url || summary.folderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-xs text-primary flex items-center gap-1"
              >
                Open <ExternalLink size={11} />
              </a>
            )}
          </div>
          <SummaryRow
            icon="📝"
            label={summary.hasInstructions ? 'Special instructions saved' : 'No special instructions'}
            status={summary.hasInstructions ?? false}
          />
        </div>

        <div className="space-y-2">
          <button
            className="btn btn-success w-full gap-2"
            onClick={onComplete}
          >
            ➕ Create First Deal for {contact.firstName}
          </button>
          <button className="btn btn-ghost btn-sm w-full" onClick={onComplete}>
            Done
          </button>
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────────

  return (
    <div className="modal modal-open">
      <div
        className="modal-box bg-white max-w-[520px] w-full flex flex-col p-0 overflow-hidden"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Client Setup — {contact.firstName} {contact.lastName}
          </span>
          {step !== 'done' && (
            <button className="btn btn-ghost btn-xs btn-circle text-gray-400" onClick={onSkip}>
              <X size={14} />
            </button>
          )}
        </div>

        {/* Step indicators + progress */}
        {step !== 'done' && (
          <div className="px-5 pt-4">
            <StepIndicator />
            <ProgressBar />
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 'welcome' && renderWelcome()}
          {step === 'communication' && renderCommunication()}
          {step === 'access' && renderAccess()}
          {step === 'briefing' && renderBriefing()}
          {step === 'drive' && renderDrive()}
          {step === 'instructions' && renderInstructions()}
          {step === 'done' && renderDone()}
        </div>

        {/* Toast */}
        {toast && (
          <div
            className={`absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-sm font-medium shadow-lg transition-all ${
              toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
            }`}
          >
            {toast.message}
          </div>
        )}
      </div>
      {step !== 'done' && <div className="modal-backdrop" onClick={onSkip} />}
    </div>
  );
}
