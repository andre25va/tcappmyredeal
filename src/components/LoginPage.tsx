import React, { useState, useRef, useEffect } from 'react';
import { Building2, ArrowRight, RefreshCw, Phone, KeyRound, CheckCircle2, Eye, Mail } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

type Step = 'phone' | 'otp' | 'success';

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

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) { setError('Enter a valid 10-digit phone number.'); return; }

    setLoading(true);
    try {
      const resp = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: digits }),
      });
      const data = await resp.json();
      if (!resp.ok) { setError(data.error || 'Failed to send code.'); return; }
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
      const resp = await fetch('/api/auth/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await resp.json();
      if (!resp.ok) { setError(data.error || 'Demo login failed.'); return; }
      setStep('success');
      setTimeout(() => {
        login(data.token, data.profile, false);
      }, 800);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setDemoLoading(false);
    }
  };

  const handleSendEmail = async () => {
    if (emailLoading) return;
    setEmailLoading(true);
    setError('');
    try {
      const resp = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.replace(/\D/g, ''), delivery: 'email' }),
      });
      const data = await resp.json();
      if (!resp.ok) { setError(data.error || 'Failed to send to email.'); return; }
      setEmailHint(data.emailHint || '');
      setEmailSent(true);
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

  const handleVerify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const fullCode = code.join('');
    if (fullCode.length < 6) { setError('Enter the 6-digit code.'); return; }

    setError('');
    setLoading(true);
    try {
      const resp = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.replace(/\D/g, ''), code: fullCode }),
      });
      const data = await resp.json();
      if (!resp.ok) { setError(data.error || 'Verification failed.'); return; }
      setStep('success');
      setTimeout(() => {
        login(data.token, data.profile, data.isFirstLogin);
      }, 800);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setError('');
    setCode(['', '', '', '', '', '']);
    setEmailSent(false);
    setEmailHint('');
    setLoading(true);
    try {
      const resp = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.replace(/\D/g, '') }),
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

  // Auto-verify when all 6 digits entered
  useEffect(() => {
    if (step === 'otp' && code.join('').length === 6 && !loading) {
      handleVerify();
    }
  }, [code, step]);

  return (
    <div
      data-theme="light"
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-base-100 to-secondary/10 px-4"
    >
      <div className="w-full max-w-sm">
        {/* Logo card */}
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
                    <p className="text-xs text-base-content/50">We'll text you a code to verify</p>
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

                  <button
                    type="submit"
                    className="btn btn-primary w-full gap-2"
                    disabled={loading || phone.replace(/\D/g, '').length < 10}
                  >
                    {loading ? (
                      <span className="loading loading-spinner loading-sm" />
                    ) : (
                      <>Send code <ArrowRight size={16} /></>
                    )}
                  </button>
                </form>

                {/* Divider */}
                <div className="divider text-xs text-base-content/30 my-0">or</div>

                {/* Demo Access button */}
                <button
                  onClick={handleDemoLogin}
                  disabled={demoLoading}
                  className="btn btn-outline w-full gap-2 border-base-300 text-base-content/70 hover:bg-base-200 hover:border-base-300 hover:text-base-content"
                >
                  {demoLoading ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : (
                    <Eye size={16} />
                  )}
                  Demo / View Only Access
                </button>
                <p className="text-center text-xs text-base-content/40 -mt-3">
                  Client-facing preview · read only
                </p>

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
                        ? `Sent to ${emailHint}`
                        : `Sent via SMS to (${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6, 10)}`}
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
                      onClick={() => { setStep('phone'); setCode(['','','','','','']); setError(''); setEmailSent(false); setEmailHint(''); }}
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

                  {/* Email delivery option */}
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
