import React, { useState, useEffect } from 'react';
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
  RefreshCw,
  ArrowLeft,
  Printer,
  ChevronRight,
  User,
  Mail,
  PhoneCall,
} from 'lucide-react';

const SUPABASE_URL = 'https://alxrmusieuzgssynktxg.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFseHJtdXNpZXV6Z3NzeW5rdHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU1MDY1OTQsImV4cCI6MjA1MTA4MjU5NH0.wGaBlD2C0ioMLJgGBxdBOGdTxZHT0SL0cN9cXWu67zo';

// ── Types ─────────────────────────────────────────────────────────────────────
type Screen = 'login' | 'dashboard' | 'deal' | 'sheet' | 'request';

type RequestType =
  | 'Document Request'
  | 'Milestone Status'
  | 'General Question'
  | 'Deal Sheet'
  | 'Special Task Request';

interface Milestone {
  label: string;
  done: boolean;
  date: string | null;
}

interface DealParticipant {
  name: string;
  role: string;
  phone: string | null;
  email: string | null;
}

interface ClientDeal {
  id: string;
  address: string;
  city: string;
  state: string;
  closingDate: string | null;
  status: string;
  dealRef: string | null;
  nextItem: { title: string; dueDate: string | null } | null;
  purchasePrice: number | null;
  earnestMoney: number | null;
  loanType: string | null;
  loanAmount: number | null;
  downPaymentPct: number | null;
  sellerConcessions: number | null;
  propertyType: string | null;
  mlsNumber: string | null;
  contractDate: string | null;
  optionPeriodEnd: string | null;
  inspectionDate: string | null;
  financeDeadline: string | null;
  possessionDate: string | null;
  participants: DealParticipant[];
  milestones: Milestone[];
  tasksCompleted: number;
  tasksTotal: number;
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

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-purple-500',
  'bg-green-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-teal-500',
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(s: string | null): string {
  if (!s) return 'TBD';
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatShortDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysToClose(closingDate: string | null): number | null {
  if (!closingDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const close = new Date(closingDate + 'T00:00:00');
  return Math.round((close.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function daysAwayBadge(days: number | null): JSX.Element {
  if (days === null) return <span className="text-xs text-gray-400">—</span>;
  const cls =
    days < 0
      ? 'bg-red-100 text-red-700'
      : days <= 14
      ? 'bg-orange-100 text-orange-700'
      : 'bg-green-100 text-green-700';
  const label = days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today' : `${days}d away`;
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

function formatCurrency(n: number | null): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function Logo() {
  return (
    <span className="text-2xl font-bold tracking-tight">
      <span className="text-[#1B2C5E]">my</span>
      <span className="text-[#F4B942]">RE</span>
      <span className="text-[#1B2C5E]">deal</span>
    </span>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState<Screen>('login');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [contactName, setContactName] = useState('');
  const [deals, setDeals] = useState<ClientDeal[]>([]);
  const [activeDealId, setActiveDealId] = useState('');
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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const activeDeal = deals.find((d) => d.id === activeDealId) ?? null;

  // ── Page Tracking ──────────────────────────────────────────────────────────
  useEffect(() => {
    const pageId = `portal-${screen}`;
    console.log(`📍 [Portal Page] ${pageId}`, {
      screen,
      dealRef: activeDeal?.dealRef ?? null,
      dealId: activeDeal?.id ?? null,
    });
    document.documentElement.setAttribute('data-portal-page', pageId);
  }, [screen, activeDeal]);

  // ── Auth ───────────────────────────────────────────────────────────────────
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
      if ((data.deals ?? []).length >= 1) setActiveDealId(data.deals[0].id);
      if (data.requestTypes?.length) setAvailableRequestTypes(data.requestTypes);
      if (data.requestTypes?.[0]) setRequestType(data.requestTypes[0] as RequestType);
      if (data.portalSettings) setPortalSettings({ ...DEFAULT_PORTAL_SETTINGS, ...data.portalSettings });
      if (data.welcomeMessage) setWelcomeMessage(data.welcomeMessage);
      setScreen('dashboard');
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Refresh ────────────────────────────────────────────────────────────────
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/client-portal-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ phone, pin }),
      });
      const data = await res.json();
      if (res.ok && !data.error) {
        setDeals(data.deals ?? []);
        if (data.requestTypes?.length) setAvailableRequestTypes(data.requestTypes);
        if (data.portalSettings) setPortalSettings({ ...DEFAULT_PORTAL_SETTINGS, ...data.portalSettings });
      }
    } catch {
      // silent
    } finally {
      setRefreshing(false);
    }
  };

  // ── Submit request ─────────────────────────────────────────────────────────
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
          deal_id: activeDealId,
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
    setScreen('login');
    setPhone('');
    setPin('');
    setContactName('');
    setDeals([]);
    setActiveDealId('');
    setMessage('');
    setError('');
    setWelcomeMessage('');
    setPortalSettings(DEFAULT_PORTAL_SETTINGS);
  };

  // ── Screens ────────────────────────────────────────────────────────────────

  /* ── LOGIN ── */
  if (screen === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#1B2C5E] to-[#2a3a7a] p-4 flex flex-col" data-page-id="portal-login">
        <div className="max-w-lg mx-auto w-full flex-1">
          <div className="bg-white rounded-t-2xl shadow-xl px-8 pt-8 pb-6">
            <div className="flex items-center justify-center mb-5">
              <span className="text-3xl font-bold tracking-tight">
                <span className="text-[#1B2C5E]">my</span>
                <span className="text-[#F4B942]">RE</span>
                <span className="text-[#1B2C5E]">deal</span>
              </span>
            </div>
            <h1 className="text-xl font-bold text-center text-[#1B2C5E] mb-1">Client Portal</h1>
            <p className="text-center text-gray-400 text-sm mb-5">
              {welcomeMessage || 'Enter your phone number and PIN to access your deals'}
            </p>
            <div className="flex items-center gap-2 justify-center">
              <div className="h-1.5 w-16 rounded-full bg-[#F4B942]" />
              <div className="h-1.5 w-16 rounded-full bg-gray-200" />
            </div>
          </div>
          <div className="bg-white shadow-xl rounded-b-2xl px-8 py-7 border-t border-gray-100">
            {error && (
              <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}
            <form onSubmit={handleLookup} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-[#1B2C5E] mb-1.5">Phone Number</label>
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
                <label className="block text-sm font-semibold text-[#1B2C5E] mb-1.5">PIN</label>
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
                <p className="text-xs text-gray-400 mt-1.5">Your PIN was provided by your Transaction Coordinator</p>
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
          </div>
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

  /* ── DASHBOARD ── */
  if (screen === 'dashboard') {
    const firstName = contactName.split(' ')[0] || contactName;
    return (
      <div className="min-h-screen bg-gray-50" data-page-id="portal-dashboard">
        {/* Header */}
        <header className="bg-[#1B2C5E] text-white px-4 py-4 shadow-lg">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <Logo />
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                className="p-2 rounded-lg hover:bg-white/10 transition"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={reset}
                className="text-sm font-semibold px-3 py-1.5 bg-white/10 rounded-lg hover:bg-white/20 transition"
              >
                Sign Out
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-6">
          <h2 className="text-2xl font-bold text-[#1B2C5E] mb-1">Welcome back, {firstName}!</h2>
          <p className="text-gray-500 text-sm mb-6">
            {deals.length} Active Deal{deals.length !== 1 ? 's' : ''}
          </p>

          {deals.length === 0 ? (
            <div className="bg-white rounded-2xl shadow p-10 text-center">
              <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <InboxIcon className="w-7 h-7 text-gray-400" />
              </div>
              <h3 className="text-base font-semibold text-[#1B2C5E] mb-2">No Active Deals</h3>
              <p className="text-sm text-gray-500 mb-6">
                We couldn't find any active deals linked to your account right now.
                If you believe this is an error, please contact your Transaction Coordinator at{' '}
                <a href="mailto:tc@myredeal.com" className="text-[#1B2C5E] font-semibold hover:underline">
                  tc@myredeal.com
                </a>
                .
              </p>
              <button
                onClick={reset}
                className="px-5 py-2.5 border-2 border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 transition text-sm"
              >
                ← Back to Login
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {deals.map((deal) => {
                const days = daysToClose(deal.closingDate);
                return (
                  <div key={deal.id} className="bg-white rounded-2xl shadow overflow-hidden">
                    {/* Card header */}
                    <div className="bg-[#1B2C5E] px-5 py-4">
                      <p className="text-white font-bold leading-snug">{deal.address}</p>
                      {deal.dealRef && (
                        <p className="text-white/80 text-xs mt-1 font-mono">
                          <span className="text-white/50">Deal ID: </span>{deal.dealRef}
                        </p>
                      )}
                    </div>
                    {/* Card body */}
                    <div className="px-5 py-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</span>
                        <span
                          className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                            STATUS_COLORS[deal.status] ?? 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {deal.status}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          Closing Date
                        </span>
                        <span className="text-sm font-bold text-[#1B2C5E]">
                          {formatDate(deal.closingDate)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Days to Close</span>
                        {daysAwayBadge(days)}
                      </div>
                    </div>
                    {/* CTA */}
                    <div className="px-5 pb-4">
                      <button
                        onClick={() => { setActiveDealId(deal.id); setScreen('deal'); }}
                        className="w-full bg-[#F4B942] text-[#1B2C5E] font-bold py-2.5 rounded-xl hover:bg-[#e0a830] transition flex items-center justify-center gap-1.5"
                      >
                        View Deal <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
    );
  }

  /* ── DEAL KPI VIEW ── */
  if (screen === 'deal' && activeDeal) {
    const days = daysToClose(activeDeal.closingDate);
    const milestones = activeDeal.milestones ?? [];
    const lastDone = [...milestones].reverse().find((m) => m.done) ?? null;
    const nextUp = milestones.find((m) => !m.done) ?? null;
    const firstNotDoneIdx = milestones.findIndex((m) => !m.done);
    const progress =
      milestones.length > 0
        ? Math.round((milestones.filter((m) => m.done).length / milestones.length) * 100)
        : 0;

    return (
      <div className="min-h-screen bg-gray-50" data-page-id="portal-deal-kpi">
        {/* Header */}
        <header className="bg-[#1B2C5E] text-white px-4 py-4 shadow-lg">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <button
              onClick={() => setScreen('dashboard')}
              className="flex items-center gap-1.5 text-sm font-semibold hover:text-white/80 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              Dashboard
            </button>
            <Logo />
            <button
              onClick={handleRefresh}
              className="p-2 rounded-lg hover:bg-white/10 transition"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {/* Deal selector */}
          {deals.length > 1 && (
            <select
              value={activeDealId}
              onChange={(e) => setActiveDealId(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#F4B942] focus:outline-none text-gray-700 transition bg-white"
            >
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.address}{d.dealRef ? ` (${d.dealRef})` : ''}
                </option>
              ))}
            </select>
          )}

          {/* Deal header card */}
          <div className="bg-[#1B2C5E] rounded-2xl px-5 py-5 text-white">
            <p className="font-bold text-lg leading-snug">{activeDeal.address}</p>
            {activeDeal.dealRef && (
              <p className="text-white/80 text-xs mt-1 font-mono">
                <span className="text-white/50">Deal ID: </span>{activeDeal.dealRef}
              </p>
            )}
            <div className="mt-3">
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  STATUS_COLORS[activeDeal.status] ?? 'bg-white/20 text-white'
                }`}
              >
                {activeDeal.status}
              </span>
            </div>
          </div>

          {/* KPI grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl shadow p-4 text-center">
              <p className="text-2xl font-bold text-orange-500">
                {days !== null ? (days < 0 ? `+${Math.abs(days)}` : days) : '—'}
              </p>
              <p className="text-xs text-gray-500 mt-1 leading-tight">
                {days !== null && days < 0 ? 'Days Past' : 'Days to Close'}
              </p>
            </div>
            <div className="bg-white rounded-xl shadow p-4 text-center">
              <p className="text-2xl font-bold text-green-600">
                {activeDeal.tasksCompleted}/{activeDeal.tasksTotal}
              </p>
              <p className="text-xs text-gray-500 mt-1 leading-tight">Tasks Done</p>
            </div>
            <div className="bg-white rounded-xl shadow p-4 text-center">
              <p className="text-lg font-bold text-blue-600">
                {activeDeal.closingDate ? formatShortDate(activeDeal.closingDate) : '—'}
              </p>
              <p className="text-xs text-gray-500 mt-1 leading-tight">Closing</p>
            </div>
          </div>

          {/* Progress bar card */}
          <div className="bg-white rounded-2xl shadow p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-[#1B2C5E]">Deal Progress</span>
              <span className="text-sm font-bold text-gray-600">{progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
              <div
                className="bg-[#F4B942] h-2.5 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            {activeDeal.nextItem && (
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Up Next</p>
                <p className="text-sm font-semibold text-gray-800">{activeDeal.nextItem.title}</p>
                {activeDeal.nextItem.dueDate && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Due {formatShortDate(activeDeal.nextItem.dueDate)}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Milestone spotlight */}
          {milestones.length > 0 && (lastDone || nextUp) && (
            <div className="bg-white rounded-2xl shadow p-5">
              <p className="text-sm font-bold text-[#1B2C5E] mb-4">Where You Are</p>
              <div className="flex items-stretch gap-3">
                {lastDone && (
                  <div className="flex-1 text-center">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-2">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    </div>
                    <p className="text-xs font-bold text-gray-800 leading-tight">{lastDone.label}</p>
                    {lastDone.date && (
                      <p className="text-xs text-gray-400 mt-0.5">{formatShortDate(lastDone.date)}</p>
                    )}
                    <p className="text-xs text-green-600 font-semibold mt-1">Completed</p>
                  </div>
                )}
                {lastDone && nextUp && (
                  <div className="flex items-center">
                    <ArrowRight className="w-5 h-5 text-gray-300" />
                  </div>
                )}
                {nextUp && (
                  <div className="flex-1 text-center">
                    <div className="w-10 h-10 rounded-full border-2 border-dashed border-[#F4B942] flex items-center justify-center mx-auto mb-2">
                      <div className="w-3 h-3 rounded-full bg-[#F4B942]" />
                    </div>
                    <p className="text-xs font-bold text-gray-800 leading-tight">{nextUp.label}</p>
                    {nextUp.date && (
                      <p className="text-xs text-gray-400 mt-0.5">{formatShortDate(nextUp.date)}</p>
                    )}
                    <p className="text-xs text-[#F4B942] font-semibold mt-1">Up Next</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Full milestones */}
          {milestones.length > 0 && (
            <div className="bg-white rounded-2xl shadow overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <p className="text-sm font-bold text-[#1B2C5E]">Milestones</p>
              </div>
              {milestones.map((m, i) => {
                const isCurrent = !m.done && i === firstNotDoneIdx;
                return (
                  <div
                    key={m.label}
                    className={`flex items-center gap-4 px-5 py-3.5 ${
                      i > 0 ? 'border-t border-gray-100' : ''
                    } ${isCurrent ? 'bg-blue-50' : ''}`}
                  >
                    <div className="flex-shrink-0">
                      {m.done ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                      ) : isCurrent ? (
                        <div className="w-5 h-5 rounded-full border-2 border-blue-500 flex items-center justify-center">
                          <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm ${
                          m.done
                            ? 'line-through text-gray-400'
                            : isCurrent
                            ? 'font-bold text-blue-700'
                            : 'text-gray-400'
                        }`}
                      >
                        {m.label}
                      </p>
                      {m.date && (
                        <p className={`text-xs mt-0.5 ${m.done ? 'text-gray-400' : 'text-gray-400'}`}>
                          {formatShortDate(m.date)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Bottom CTAs */}
          <div className="grid grid-cols-2 gap-3 pb-6">
            <button
              onClick={() => setScreen('sheet')}
              className="flex items-center justify-center gap-2 py-3 border-2 border-[#1B2C5E] text-[#1B2C5E] font-bold rounded-xl hover:bg-[#1B2C5E]/5 transition"
            >
              📄 Deal Sheet
            </button>
            <button
              onClick={() => { setMessage(''); setScreen('request'); }}
              className="flex items-center justify-center gap-2 py-3 bg-[#1B2C5E] text-white font-bold rounded-xl hover:bg-[#0f1a38] transition"
            >
              Make a Request
            </button>
          </div>
        </main>
      </div>
    );
  }

  /* ── DEAL SHEET ── */
  if (screen === 'sheet' && activeDeal) {
    const milestones = activeDeal.milestones ?? [];
    const doneMilestones = milestones.filter((m) => m.done).length;
    const sheetProgress = milestones.length > 0 ? Math.round((doneMilestones / milestones.length) * 100) : 0;
    const days = daysToClose(activeDeal.closingDate);

    const keyDates: { label: string; value: string | null; badge?: boolean }[] = [
      { label: 'Contract Date', value: activeDeal.contractDate },
      { label: 'Option Period End', value: activeDeal.optionPeriodEnd },
      { label: 'Inspection', value: activeDeal.inspectionDate },
      { label: 'Finance Deadline', value: activeDeal.financeDeadline },
      { label: 'Closing Date', value: activeDeal.closingDate, badge: true },
      { label: 'Possession', value: activeDeal.possessionDate },
    ];

    const financials: { label: string; value: string }[] = [
      { label: 'Purchase Price', value: formatCurrency(activeDeal.purchasePrice) },
      { label: 'Earnest Money', value: formatCurrency(activeDeal.earnestMoney) },
      { label: 'Loan Type', value: activeDeal.loanType ?? '—' },
      { label: 'Loan Amount', value: formatCurrency(activeDeal.loanAmount) },
      {
        label: 'Down Payment',
        value: activeDeal.downPaymentPct != null ? `${activeDeal.downPaymentPct}%` : '—',
      },
      { label: 'Seller Concessions', value: formatCurrency(activeDeal.sellerConcessions) },
    ];

    return (
      <div className="min-h-screen bg-gray-50" data-page-id="portal-deal-sheet">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-4 py-4 shadow-sm print:hidden">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <button
              onClick={() => setScreen('deal')}
              className="flex items-center gap-1.5 text-sm font-semibold text-[#1B2C5E] hover:text-[#0f1a38] transition"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <h1 className="text-base font-bold text-[#1B2C5E]">Deal Sheet</h1>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 text-sm font-semibold text-[#1B2C5E] hover:text-[#0f1a38] transition"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-6 space-y-4 pb-10">
          {/* Property header */}
          <div className="bg-[#1B2C5E] rounded-2xl px-5 py-5 text-white">
            <p className="font-bold text-lg leading-snug">{activeDeal.address}</p>
            <p className="text-white/70 text-sm mt-0.5">
              {[activeDeal.city, activeDeal.state].filter(Boolean).join(', ')}
            </p>
            {activeDeal.dealRef && (
              <p className="text-white/80 text-xs mt-1 font-mono">
                <span className="text-white/50">Deal ID: </span>{activeDeal.dealRef}
              </p>
            )}
            {activeDeal.mlsNumber && (
              <p className="text-white/60 text-xs mt-1">MLS# {activeDeal.mlsNumber}</p>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {activeDeal.propertyType && (
                <span className="text-xs font-semibold bg-white/20 px-2.5 py-0.5 rounded-full">
                  {activeDeal.propertyType}
                </span>
              )}
              <span
                className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                  STATUS_COLORS[activeDeal.status] ?? 'bg-white/20 text-white'
                }`}
              >
                {activeDeal.status}
              </span>
            </div>
            {/* Milestone progress bar */}
            {milestones.length > 0 && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-white/70 mb-1">
                  <span>Deal Progress</span>
                  <span>{sheetProgress}%</span>
                </div>
                <div className="w-full bg-white/20 rounded-full h-2">
                  <div
                    className="bg-[#F4B942] h-2 rounded-full"
                    style={{ width: `${sheetProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Key Dates */}
          <div className="bg-white rounded-2xl shadow overflow-hidden">
            <div className="px-5 py-4 bg-gray-50 border-b border-gray-100">
              <p className="text-sm font-bold text-[#1B2C5E]">Key Dates</p>
            </div>
            {keyDates.map(({ label, value, badge }) => (
              <div
                key={label}
                className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50 last:border-0"
              >
                <span className="text-sm text-gray-500">{label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800">
                    {value ? formatDate(value) : '—'}
                  </span>
                  {badge && value && daysAwayBadge(days)}
                </div>
              </div>
            ))}
          </div>

          {/* Financials */}
          <div className="bg-white rounded-2xl shadow overflow-hidden">
            <div className="px-5 py-4 bg-gray-50 border-b border-gray-100">
              <p className="text-sm font-bold text-[#1B2C5E]">Financials</p>
            </div>
            {financials.map(({ label, value }) => (
              <div
                key={label}
                className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50 last:border-0"
              >
                <span className="text-sm text-gray-500">{label}</span>
                <span className="text-sm font-semibold text-gray-800">{value}</span>
              </div>
            ))}
          </div>

          {/* Deal Team */}
          {activeDeal.participants && activeDeal.participants.length > 0 && (
            <div className="bg-white rounded-2xl shadow overflow-hidden">
              <div className="px-5 py-4 bg-gray-50 border-b border-gray-100">
                <p className="text-sm font-bold text-[#1B2C5E]">Deal Team</p>
              </div>
              {activeDeal.participants.map((p, i) => (
                <div
                  key={i}
                  className="flex items-start gap-4 px-5 py-4 border-b border-gray-50 last:border-0"
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${
                      AVATAR_COLORS[i % AVATAR_COLORS.length]
                    }`}
                  >
                    {(p.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-gray-800">{p.name || '—'}</p>
                      {p.role && (
                        <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full">
                          {p.role}
                        </span>
                      )}
                    </div>
                    {p.phone && (
                      <a
                        href={`tel:${p.phone}`}
                        className="flex items-center gap-1.5 text-xs text-gray-500 mt-1 hover:text-[#1B2C5E] transition"
                      >
                        <PhoneCall className="w-3 h-3" />
                        {p.phone}
                      </a>
                    )}
                    {p.email && (
                      <a
                        href={`mailto:${p.email}`}
                        className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5 hover:text-[#1B2C5E] transition"
                      >
                        <Mail className="w-3 h-3" />
                        {p.email}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="text-center text-xs text-gray-400 pt-2 pb-4">
            Generated by myREDeal · {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </main>
      </div>
    );
  }

  /* ── REQUEST FORM ── */
  if (screen === 'request') {
    if (submitted) {
      return (
        <div className="min-h-screen bg-gradient-to-b from-[#1B2C5E] to-[#2a3a7a] flex items-center justify-center p-4" data-page-id="portal-request-submitted">
          <div className="bg-white rounded-2xl shadow-2xl p-10 max-w-md w-full text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-9 h-9 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-[#1B2C5E] mb-2">Request Submitted!</h2>
            <p className="text-gray-500 mb-2 text-sm font-medium">{requestType}</p>
            {activeDeal && (
              <div className="mb-6">
                <p className="text-gray-400 text-sm">{activeDeal.address}</p>
                {activeDeal.dealRef && (
                  <p className="text-gray-400 text-xs font-mono mt-0.5">Deal ID: {activeDeal.dealRef}</p>
                )}
              </div>
            )}
            <p className="text-gray-600 mb-8">
              Your Transaction Coordinator will review this and get back to you shortly.
            </p>
            <button
              onClick={() => { setSubmitted(false); setScreen('deal'); }}
              className="bg-[#1B2C5E] text-white px-8 py-3 rounded-lg hover:bg-[#0f1a38] transition font-semibold"
            >
              Back to My Deal
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gray-50" data-page-id="portal-request">
        {/* Header */}
        <header className="bg-[#1B2C5E] text-white px-4 py-4 shadow-lg">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <button
              onClick={() => setScreen('deal')}
              className="flex items-center gap-1.5 text-sm font-semibold hover:text-white/80 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <Logo />
            <div className="w-16" />
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-6">
          <h2 className="text-xl font-bold text-[#1B2C5E] mb-1">Make a Request</h2>
          {activeDeal && (
            <div className="mb-6">
              <p className="text-sm text-gray-500">{activeDeal.address}</p>
              {activeDeal.dealRef && (
                <p className="text-xs text-gray-400 font-mono mt-0.5">Deal ID: {activeDeal.dealRef}</p>
              )}
            </div>
          )}

          {error && (
            <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Deal selector if multiple deals */}
            {deals.length > 1 && (
              <div>
                <label className="block text-sm font-semibold text-[#1B2C5E] mb-1.5">Which Deal?</label>
                <select
                  value={activeDealId}
                  onChange={(e) => setActiveDealId(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#F4B942] focus:outline-none text-gray-700 transition"
                  required
                >
                  <option value="">Select a deal...</option>
                  {deals.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.address}{d.dealRef ? ` (${d.dealRef})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Request type */}
            <div>
              <label className="block text-sm font-semibold text-[#1B2C5E] mb-1.5">Request Type</label>
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
                Message <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us more about your request..."
                rows={4}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#F4B942] focus:outline-none text-gray-700 resize-none transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !activeDealId}
              className="w-full bg-[#1B2C5E] text-white font-semibold py-3 rounded-xl hover:bg-[#0f1a38] transition disabled:opacity-50 flex items-center justify-center gap-2"
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
          </form>
        </main>
      </div>
    );
  }

  // Fallback (should not reach here in normal flow)
  return null;
}
