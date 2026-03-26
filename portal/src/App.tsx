import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Lock,
  Phone,
  Calendar,
  ArrowRight,
  ClipboardList,
  InboxIcon,
} from 'lucide-react';

const SUPABASE_URL = 'https://alxrmusieuzgssynktxg.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFseHJtdXNpZXV6Z3NzeW5rdHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU1MDY1OTQsImV4cCI6MjA1MTA4MjU5NH0.wGaBlD2C0ioMLJgGBxdBOGdTxZHT0SL0cN9cXWu67zo';

// ── Types ─────────────────────────────────────────────────────────────────────
type RequestType =
  | 'Document Request'
  | 'Milestone Status'
  | 'General Question'
  | 'Deal Sheet'
  | 'Special Task Request';

interface NextItem {
  title: string;
  dueDate: string | null;
}

interface ClientDeal {
  id: string;
  address: string;
  closingDate: string | null;
  status: string;
  dealRef: string | null;
  nextItem: NextItem | null;
}

interface PortalSettings {
  showStatus: boolean;
  showClosingDate: boolean;
  showNextItem: boolean;
}

const DEFAULT_PORTAL_SETTINGS: PortalSettings = {
  showStatus: true,
  showClosingDate: true,
  showNextItem: true,
};

const STATUS_COLORS: Record<string, string> = {
  'Under Contract': 'bg-blue-100 text-blue-800',
  'Due Diligence': 'bg-amber-100 text-amber-800',
  'Clear to Close': 'bg-green-100 text-green-800',
  Pending: 'bg-purple-100 text-purple-800',
  Closed: 'bg-gray-100 text-gray-600',
  Terminated: 'bg-red-100 text-red-700',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(s: string | null): string {
  if (!s) return 'TBD';
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatShortDate(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [contactName, setContactName] = useState('');
  const [deals, setDeals] = useState<ClientDeal[]>([]);
  const [selectedDeal, setSelectedDeal] = useState('');
  const [requestType, setRequestType] = useState<RequestType>('Document Request');
  const [availableRequestTypes, setAvailableRequestTypes] = useState<string[]>([
    'Document Request',
    'Milestone Status',
    'General Question',
    'Deal Sheet',
    'Special Task Request',
  ]);
  const [portalSettings, setPortalSettings] = useState<PortalSettings>(DEFAULT_PORTAL_SETTINGS);
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const selectedDealData = deals.find((d) => d.id === selectedDeal) ?? null;

  // ── Step 1: Authenticate ───────────────────────────────────────────────────
  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const digits = phone.replace(/\D/g, '');
      if (digits.length < 10) {
        setError('Please enter a valid 10-digit phone number.');
        return;
      }
      // Accept 4–6 digit PINs
      if (!/^\d{4,6}$/.test(pin)) {
        setError('Please enter your PIN (4–6 digits).');
        return;
      }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/client-portal-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ phone, pin }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? 'An error occurred. Please try again.');
        return;
      }

      setContactName(data.contactName ?? '');
      setDeals(data.deals ?? []);
      if ((data.deals ?? []).length === 1) setSelectedDeal(data.deals[0].id);
      if (data.requestTypes?.length) setAvailableRequestTypes(data.requestTypes);
      if (data.requestTypes?.[0]) setRequestType(data.requestTypes[0] as RequestType);
      if (data.portalSettings) setPortalSettings({ ...DEFAULT_PORTAL_SETTINGS, ...data.portalSettings });
      if (data.welcomeMessage) setWelcomeMessage(data.welcomeMessage);
      setStep(2);
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Submit request ─────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          deal_id: selectedDeal,
          request_type: requestType.toLowerCase().replace(/ /g, '_'),
          status: 'sent',
          notes: message,
          requires_review: true,
          source: 'client_portal',
        }),
      });

      if (!res.ok) throw new Error('Failed to submit');
      setSubmitted(true);
    } catch {
      setError('Failed to submit request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setSubmitted(false);
    setStep(1);
    setPhone('');
    setPin('');
    setContactName('');
    setDeals([]);
    setSelectedDeal('');
    setMessage('');
    setError('');
    setWelcomeMessage('');
    setPortalSettings(DEFAULT_PORTAL_SETTINGS);
  };

  // ── Success screen ─────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#1B2C5E] to-[#2a3a7a] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-9 h-9 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-[#1B2C5E] mb-2">Request Submitted!</h2>
          <p className="text-gray-500 mb-2 text-sm font-medium">{requestType}</p>
          {selectedDealData && (
            <p className="text-gray-400 mb-6 text-sm">{selectedDealData.address}</p>
          )}
          <p className="text-gray-600 mb-8">
            Your Transaction Coordinator will review this and get back to you shortly.
          </p>
          <button
            onClick={reset}
            className="bg-[#1B2C5E] text-white px-8 py-3 rounded-lg hover:bg-[#0f1a38] transition font-semibold"
          >
            Submit Another Request
          </button>
        </div>
      </div>
    );
  }

  // ── Main ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1B2C5E] to-[#2a3a7a] p-4 flex flex-col">
      <div className="max-w-lg mx-auto w-full flex-1">

        {/* Header card */}
        <div className="bg-white rounded-t-2xl shadow-xl px-8 pt-8 pb-6">
          {/* Logo */}
          <div className="flex items-center justify-center mb-5">
            <span className="text-3xl font-bold tracking-tight">
              <span className="text-[#1B2C5E]">my</span>
              <span className="text-[#F4B942]">RE</span>
              <span className="text-[#1B2C5E]">deal</span>
            </span>
          </div>
          <h1 className="text-xl font-bold text-center text-[#1B2C5E] mb-1">Client Portal</h1>
          <p className="text-center text-gray-400 text-sm mb-5">
            {step === 1
              ? (welcomeMessage || 'Enter your phone number and PIN to access your deals')
              : `Welcome back${contactName ? ', ' + contactName.split(' ')[0] : ''}!${deals.length > 1 ? ' Select your deal below.' : ''}`}
          </p>
          {/* Step indicator */}
          <div className="flex items-center gap-2 justify-center">
            <div className={`h-1.5 w-16 rounded-full transition-all ${step >= 1 ? 'bg-[#F4B942]' : 'bg-gray-200'}`} />
            <div className={`h-1.5 w-16 rounded-full transition-all ${step >= 2 ? 'bg-[#F4B942]' : 'bg-gray-200'}`} />
          </div>
        </div>

        {/* Form body */}
        <div className="bg-white shadow-xl rounded-b-2xl px-8 py-7 border-t border-gray-100">

          {/* Error banner */}
          {error && (
            <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* ── Step 1: Auth ──────────────────────────────────────────────── */}
          {step === 1 && (
            <form onSubmit={handleLookup} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-[#1B2C5E] mb-1.5">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#F4B942] focus:outline-none text-gray-700 transition"
                    required
                    autoComplete="tel"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#1B2C5E] mb-1.5">
                  PIN
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="••••"
                    className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#F4B942] focus:outline-none text-gray-700 tracking-widest text-center text-lg transition"
                    required
                    autoComplete="current-password"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1.5">
                  Your PIN was provided by your Transaction Coordinator
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#1B2C5E] text-white font-semibold py-3 rounded-xl hover:bg-[#0f1a38] transition disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Access My Deals'
                )}
              </button>
            </form>
          )}

          {/* ── Step 2: No deals empty state ──────────────────────────────── */}
          {step === 2 && deals.length === 0 && (
            <div className="text-center py-6">
              <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <InboxIcon className="w-7 h-7 text-gray-400" />
              </div>
              <h3 className="text-base font-semibold text-[#1B2C5E] mb-2">No Active Deals</h3>
              <p className="text-sm text-gray-500 mb-6">
                We couldn't find any active deals linked to your account right now.
                If you believe this is an error, please contact your Transaction Coordinator.
              </p>
              <button
                type="button"
                onClick={() => { setStep(1); setError(''); }}
                className="px-5 py-2.5 border-2 border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 transition text-sm"
              >
                ← Back to Login
              </button>
            </div>
          )}

          {/* ── Step 2: Deal selector + request ───────────────────────────── */}
          {step === 2 && deals.length > 0 && (
            <form onSubmit={handleSubmit} className="space-y-5">

              {/* Verified badge */}
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
                <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                <p className="text-sm text-green-700 font-medium">
                  Verified — {deals.length} active deal{deals.length !== 1 ? 's' : ''} found
                </p>
              </div>

              {/* Deal selector — only show if multiple deals */}
              {deals.length > 1 && (
                <div>
                  <label className="block text-sm font-semibold text-[#1B2C5E] mb-1.5">
                    Which Deal?
                  </label>
                  <select
                    value={selectedDeal}
                    onChange={(e) => setSelectedDeal(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#F4B942] focus:outline-none text-gray-700 transition"
                    required
                  >
                    <option value="">Select a deal...</option>
                    {deals.map((deal) => (
                      <option key={deal.id} value={deal.id}>
                        {deal.address}{deal.dealRef ? ` (${deal.dealRef})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Deal info card */}
              {selectedDealData && (
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  {/* Address header */}
                  <div className="px-4 py-3 bg-[#1B2C5E]">
                    <p className="text-white font-semibold text-sm leading-snug">{selectedDealData.address}</p>
                    {selectedDealData.dealRef && (
                      <p className="text-white/60 text-xs mt-0.5">{selectedDealData.dealRef}</p>
                    )}
                  </div>

                  {/* Status */}
                  {portalSettings.showStatus && (
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Status
                      </span>
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                          STATUS_COLORS[selectedDealData.status] ?? 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {selectedDealData.status}
                      </span>
                    </div>
                  )}

                  {/* Closing date */}
                  {portalSettings.showClosingDate && (
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                      <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        <Calendar className="w-3.5 h-3.5" />
                        Closing Date
                      </div>
                      <span className="text-sm font-bold text-[#1B2C5E]">
                        {formatDate(selectedDealData.closingDate)}
                      </span>
                    </div>
                  )}

                  {/* What's next */}
                  {portalSettings.showNextItem && (
                    <div className="flex items-start justify-between px-4 py-3">
                      <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide mt-0.5">
                        <ArrowRight className="w-3.5 h-3.5" />
                        What's Next
                      </div>
                      <div className="text-right ml-4">
                        {selectedDealData.nextItem ? (
                          <>
                            <p className="text-sm font-medium text-gray-800 leading-snug">
                              {selectedDealData.nextItem.title}
                            </p>
                            {selectedDealData.nextItem.dueDate && (
                              <p className="text-xs text-gray-400 mt-0.5">
                                Due {formatShortDate(selectedDealData.nextItem.dueDate)}
                              </p>
                            )}
                          </>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <ClipboardList className="w-4 h-4 text-green-500" />
                            <p className="text-sm text-green-600 font-medium">All caught up!</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Request type */}
              <div>
                <label className="block text-sm font-semibold text-[#1B2C5E] mb-1.5">
                  Request Type
                </label>
                <select
                  value={requestType}
                  onChange={(e) => setRequestType(e.target.value as RequestType)}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#F4B942] focus:outline-none text-gray-700 transition"
                >
                  {availableRequestTypes.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Message */}
              <div>
                <label className="block text-sm font-semibold text-[#1B2C5E] mb-1.5">
                  Message{' '}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us more about your request..."
                  rows={3}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#F4B942] focus:outline-none text-gray-700 resize-none transition"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setStep(1); setError(''); }}
                  className="px-5 py-3 border-2 border-gray-200 text-gray-600 font-semibold rounded-xl hover:border-gray-300 hover:bg-gray-50 transition"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading || !selectedDeal}
                  className="flex-1 bg-[#1B2C5E] text-white font-semibold py-3 rounded-xl hover:bg-[#0f1a38] transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    'Submit Request'
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-white/70 text-xs pb-4">
          <p>
            Need help? Contact us at{' '}
            <a href="mailto:tc@myredeal.com" className="font-semibold text-white hover:underline">
              tc@myredeal.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
