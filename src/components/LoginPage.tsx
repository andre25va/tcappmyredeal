import React, { useState, useRef, useEffect } from 'react';
import { Building2, ArrowRight, RefreshCw, Phone, KeyRound, CheckCircle2, Eye, Mail, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

type Step = 'phone' | 'otp' | 'success';

const DEMO_PHONE = '7085069000';

function formatPhoneDisplay(raw: string) {
  const d = raw.replace(/\D/g, '');
  if (d.length === 0) return '';
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
}

export function LoginPage() {
  const { login } = useAuth();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [emailHint, setEmailHint] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [pendingOtpCode, setPendingOtpCode] = useState('');

  const codeRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const phoneDigits = phone.replace(/\D/g, '');
  const phoneReady = phoneDigits.length === 10;
  const isDemo = phoneDigits === DEMO_PHONE;

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemo) { handleDemoLogin(); return; }
    setError('');
    if (!phoneReady) { setError('Enter a valid 10-digit phone number.'); return; }
    setLoading(true);
    try {
      const resp = await fetch('/api/auth?action=request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneDigits }),
      });
      const data = await resp.json();
      if (!resp.ok) { setError(data.error || 'Failed to send code.'); return; }
      setEmailSent(false);
      setEmailHint('');
      setStep('otp');
      setCountdown(60);
      setTimeout(() => codeRefs[0].current?.focus(), 100);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setDemoLoading(true);
    setError('');
    try {
      const resp = await fetch('/api/auth?action=demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await resp.json();
      if (!resp.ok) { setError(data.error || 'Demo login failed.'); return; }
      setStep('success');
      setTimeout(() => { login(data.token, data.profile, false); }, 800);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setDemoLoading(false);
    }
  };

  const handleSendEmail = async () => {
    if (emailLoading) return;
    if (!phoneReady) { setError('Enter your phone number first so we can find your account.'); return; }
    setEmailLoading(true);
    setError('');
    try {
      const resp = await fetch('/api/auth?action=request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneDigits, delivery: 'email' }),
      });
      const data = await resp.json();
      if (!resp.ok) { setError(data.error || 'Failed to send to email.'); return; }
      setEmailHint(data.emailHint || '');
      setEmailSent(true);
      setStep('otp');
      setCountdown(60);
      setTimeout(() => codeRefs[0].current?.focus(), 100);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleCodeChange = (index: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const newCode = [...code];
    if (val.length > 1) {
      const digits = val.replace(/\D/g, '').slice(0, 6);
      const arr = digits.split('').concat(Array(6).fill('')).slice(0, 6);
      setCode(arr);
      setTimeout(() => codeRefs[Math.min(digits.length, 5)].current?.focus(), 50);
      return;
    }
    newCode[index] = val;
    setCode(newCode);
    if (val && index < 5) setTimeout(() => codeRefs[index + 1].current?.focus(), 50);
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      setTimeout(() => codeRefs[index - 1].current?.focus(), 50);
    }
  };

  const doVerify = async (_isAuto = false) => {
    const fullCode = code.join('');
    if (fullCode.length < 6) { setError('Enter the 6-digit code.'); return; }
    setError('');
    setLoading(true);
    try {
      const resp = await fetch('/api/auth?action=verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneDigits, code: fullCode }),
      });
      const data = await resp.json();
      if (!resp.ok) { setError(data.error || 'Verification failed.'); return; }
      setStep('success');
      setTimeout(() => { login(data.token, data.profile, data.isFirstLogin); }, 800);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    await doVerify(false);
  };


  const handleResend = async () => {
    if (countdown > 0) return;
    setError('');
    setCode(['', '', '', '', '', '']);
    setPendingOtpCode('');
    setEmailSent(false);
    setEmailHint('');
    setLoading(true);
    try {
      const resp = await fetch('/api/auth?action=request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneDigits }),
      });
      const data = await resp.json();
      if (!resp.ok) { setError(data.error || 'Failed to resend.'); return; }
      setCountdown(60);
      setTimeout(() => codeRefs[0].current?.focus(), 100);
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (step === 'otp' && code.join('').length === 6 && !loading) {
      doVerify(false);
    }
  }, [code, step]);

  return (
    <div
      data-theme="light"
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-base-100 to-secondary/10 px-4"
    >
      {/* ── Kicked-out banner ── */}
<div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-lg mb-4">
            <Building2 size={32} className="text-primary-content" />
          </div>
          <h1 className="text-2xl font-bold text-base-content">TC Command</h1>
          <p className="text-sm text-base-content/50 mt-1">Transaction Coordinator Hub</p>
        </div>

        <div className="card bg-base-100 shadow-xl border border-base-200">
          <div className="card-body gap-5">

            {/* ── Step: Phone ── */}
            {step === 'phone' && (
              <>
                <div className="flex items-center gap-2">
                  <Phone size={18} className="text-primary flex-none" />
                  <div>
                    <h2 className="font-semibold text-base-content">Sign in</h2>
                    <p className="text-xs text-base-content/50">Enter your number to receive a code</p>
                  </div>
                </div>

                <form onSubmit={handlePhoneSubmit} className="flex flex-col gap-3">
                  <div className="form-control">
                    <label className="label py-1">
                      <span className="label-text text-xs font-medium">Phone number</span>
                    </label>
                    <input
                      type="tel"
                      autoFocus
                      placeholder="(555) 000-0000"
                      className="input input-bordered w-full text-lg tracking-wide"
                      value={formatPhoneDisplay(phone)}
                      onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      inputMode="numeric"
                    />
                  </div>

                  {error && (
                    <div className="alert alert-error py-2 px-3 text-sm">{error}</div>
                  )}

                  {isDemo ? (
                    <>
                      <button
                        type="submit"
                        className="btn btn-accent w-full gap-2"
                        disabled={demoLoading}
                      >
                        {demoLoading ? (
                          <span className="loading loading-spinner loading-sm" />
                        ) : (
                          <><Eye size={16} /> Access Demo View</>
                        )}
                      </button>
                      <p className="text-center text-xs text-base-content/40 -mt-2">
                        Read-only demo account · no code needed
                      </p>
                    </>
                  ) : (
                    <>
                      <button
                        type="submit"
                        className="btn btn-primary w-full gap-2"
                        disabled={loading || !phoneReady}
                      >
                        {loading ? (
                          <span className="loading loading-spinner loading-sm" />
                        ) : (
                          <><Phone size={15} /> Send code via SMS</>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={handleSendEmail}
                        disabled={emailLoading || !phoneReady}
                        className="btn btn-outline w-full gap-2 border-primary/40 text-primary hover:bg-primary/5 hover:border-primary disabled:opacity-40"
                      >
                        {emailLoading ? (
                          <span className="loading loading-spinner loading-sm" />
                        ) : (
                          <Mail size={15} />
                        )}
                        Send code to my email
                      </button>
                    </>
                  )}
                </form>

                <p className="text-center text-xs text-base-content/40">
                  Only authorized TC staff can log in
                </p>
              </>
            )}

            {/* ── Step: OTP ── */}
            {step === 'otp' && (
              <>
                <div className="flex items-center gap-2">
                  <KeyRound size={18} className="text-primary flex-none" />
                  <div>
                    <h2 className="font-semibold text-base-content">Enter your code</h2>
                    <p className="text-xs text-base-content/50">
                      {emailSent
                        ? `📧 Sent to ${emailHint}`
                        : `📱 Sent via SMS to (${phoneDigits.slice(0,3)}) ${phoneDigits.slice(3,6)}-${phoneDigits.slice(6,10)}`}
                    </p>
                  </div>
                </div>

                <form onSubmit={handleVerify} className="flex flex-col gap-4">
                  <div className="flex gap-2 justify-center">
                    {code.map((digit, i) => (
                      <input
                        key={i}
                        ref={codeRefs[i]}
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={digit}
                        onChange={e => handleCodeChange(i, e.target.value)}
                        onKeyDown={e => handleCodeKeyDown(i, e)}
                        className="w-11 h-14 text-center text-xl font-bold border-2 border-base-300 rounded-xl focus:border-primary focus:outline-none transition-colors bg-base-100"
                      />
                    ))}
                  </div>

                  {error && (
                    <div className="alert alert-error py-2 px-3 text-sm">{error}</div>
                  )}

                  <button
                    type="submit"
                    className="btn btn-primary w-full gap-2"
                    disabled={loading || code.join('').length < 6}
                  >
                    {loading ? (
                      <span className="loading loading-spinner loading-sm" />
                    ) : (
                      <>Verify <ArrowRight size={16} /></>
                    )}
                  </button>

                  <div className="flex items-center justify-between text-xs text-base-content/50">
                    <button
                      type="button"
                      onClick={() => { setStep('phone'); setCode(['','','','','','']); setError(''); setEmailSent(false); setEmailHint(''); setPendingOtpCode(''); }}
                      className="link link-hover"
                    >
                      ← Change number
                    </button>
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={countdown > 0}
                      className="flex items-center gap-1 link link-hover disabled:no-underline disabled:cursor-not-allowed"
                    >
                      <RefreshCw size={11} />
                      {countdown > 0 ? `Resend in ${countdown}s` : 'Resend via SMS'}
                    </button>
                  </div>

                  {!emailSent ? (
                    <button
                      type="button"
                      onClick={handleSendEmail}
                      disabled={emailLoading}
                      className="btn btn-ghost btn-sm gap-2 text-base-content/60 border border-base-200 hover:bg-base-200"
                    >
                      {emailLoading ? (
                        <span className="loading loading-spinner loading-xs" />
                      ) : (
                        <Mail size={14} />
                      )}
                      Send to my email instead
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-success bg-success/10 rounded-lg px-3 py-2 border border-success/20">
                      <Mail size={13} />
                      <span>Code also sent to <strong>{emailHint}</strong></span>
                    </div>
                  )}
                </form>
              </>
            )}

            {/* ── Step: Success ── */}
            {step === 'success' && (
              <div className="flex flex-col items-center gap-3 py-4">
                <CheckCircle2 size={48} className="text-success" />
                <p className="font-semibold text-base-content">Verified! Logging you in...</p>
                <span className="loading loading-dots loading-md text-primary" />
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-base-content/30 mt-6">
          MyReDeal · TC Command v1.0
        </p>
      </div>
    </div>
  );
}
