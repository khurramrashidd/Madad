import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Mail, Lock, Phone, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../api/client.js';
import Spinner from '../components/Spinner.jsx';

/**
 * Seeded credentials for the "Fill demo account" shortcut.
 *
 * __DEMO_TOOLS__ is a build-time literal (see vite.config.js), so in a web
 * production build this collapses to `null` and the minifier drops the object
 * entirely — the strings never reach the shipped bundle. A runtime `if` guard
 * inside the function would not achieve that.
 */
const DEMO_LOGIN = __DEMO_TOOLS__
  ? { email: 'kinza@madad.local', password: 'password123' }
  : null;

/**
 * Two ways in: email + password, or phone with a mock OTP.
 *
 * The OTP is deliberately fake — wiring a real SMS gateway costs money and
 * can fail live on stage. In development the server returns the code so the
 * flow is fully demonstrable; in production it refuses to.
 */
export default function Login() {
  const [mode, setMode] = useState('email');
  const navigate = useNavigate();
  const location = useLocation();
  const { login, verifyOtp, config } = useAuth();
  const toast = useToast();

  const from = location.state?.from?.pathname || '/';

  /**
   * Default to email while the config is still loading, then let the server's
   * answer decide. `config` is null on a cold start, and defaulting the other
   * way would flash a tab that then disappears.
   */
  const phoneLoginEnabled = config?.phoneLoginEnabled ?? false;

  // If phone sign-in turns out to be unavailable while that tab is open,
  // fall back rather than leaving the user on a form that cannot work.
  useEffect(() => {
    if (!phoneLoginEnabled && mode === 'phone') setMode('email');
  }, [phoneLoginEnabled, mode]);

  // email mode
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // phone mode
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [devOtp, setDevOtp] = useState(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submitEmail = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login({ email: email.trim(), password });
      toast.success('Welcome back');
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const sendOtp = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.auth.requestOtp(phone.trim());
      setOtpSent(true);
      setIsNewUser(!res.isRegistered);
      setDevOtp(res.devOtp || null);
      toast.info(`OTP sent to +91 ${phone}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitOtp = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await verifyOtp({ phone: phone.trim(), otp: otp.trim(), name: name.trim() });
      toast.success('Signed in');
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const fillDemo = () => {
    if (!DEMO_LOGIN) return;
    setMode('email');
    setEmail(DEMO_LOGIN.email);
    setPassword(DEMO_LOGIN.password);
  };

  return (
    <div className="min-h-full flex flex-col bg-surface">
      <div className="flex-1 flex flex-col justify-center px-6 py-10 max-w-md w-full mx-auto">
        <div className="mb-8">
          <div className="w-14 h-14 rounded-2xl bg-brand-600 grid place-items-center mb-4">
            <span className="font-display font-extrabold text-2xl text-white">M</span>
          </div>
          <h1 className="font-display font-extrabold text-3xl text-ink-900">Welcome back</h1>
          <p className="text-ink-500 mt-1">Small favours. Fair rewards. Paid directly.</p>
        </div>

        {/*
          Mode switch.

          The phone tab is hidden when the server says phone sign-in is
          unavailable — it is mocked (a fixed code, no SMS provider) and so
          refused on a public deployment. Offering a tab that always errors is
          worse than not offering it.
        */}
        {phoneLoginEnabled && (
        <div className="flex p-1 bg-ink-100 rounded-xl mb-6" role="tablist">
          {[
            { key: 'email', label: 'Email' },
            { key: 'phone', label: 'Phone' },
          ].map((m) => (
            <button
              key={m.key}
              role="tab"
              aria-selected={mode === m.key}
              onClick={() => { setMode(m.key); setError(null); }}
              className={`flex-1 h-9 rounded-lg text-sm font-semibold transition-all
                          ${mode === m.key ? 'bg-surface shadow-sm text-ink-900' : 'text-ink-500'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-danger/10 text-danger text-sm font-medium">{error}</div>
        )}

        {mode === 'email' ? (
          <form onSubmit={submitEmail} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  id="email" type="email" required autoComplete="email"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  className="input pl-11" placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="password">Password</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  id="password" type="password" required autoComplete="current-password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  className="input pl-11" placeholder="••••••••"
                />
              </div>
            </div>

            <button type="submit" disabled={busy} className="btn-primary btn-lg w-full">
              {busy ? <Spinner size={18} /> : <>Sign in <ArrowRight size={18} /></>}
            </button>
          </form>
        ) : !otpSent ? (
          <form onSubmit={sendOtp} className="space-y-4">
            <div>
              <label className="label" htmlFor="phone">Mobile number</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500 font-medium text-sm">+91</span>
                <Phone size={16} className="absolute left-12 top-1/2 -translate-y-1/2 text-ink-300" />
                <input
                  id="phone" type="tel" required inputMode="numeric" maxLength={10}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  className="input pl-20 tracking-wider" placeholder="98765 43210"
                />
              </div>
            </div>

            <button type="submit" disabled={busy || phone.length !== 10} className="btn-primary btn-lg w-full">
              {busy ? <Spinner size={18} /> : <>Send OTP <ArrowRight size={18} /></>}
            </button>
          </form>
        ) : (
          <form onSubmit={submitOtp} className="space-y-4">
            <button
              type="button"
              onClick={() => { setOtpSent(false); setOtp(''); setError(null); }}
              className="inline-flex items-center gap-1 text-sm font-medium text-ink-500"
            >
              <ArrowLeft size={15} /> Change number
            </button>

            <div>
              <label className="label" htmlFor="otp">Enter the 6-digit code</label>
              <input
                id="otp" type="text" required inputMode="numeric" maxLength={6} autoFocus
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                className="input text-center text-2xl font-bold tracking-[0.5em] font-display"
                placeholder="000000"
              />
              <p className="text-xs text-ink-500 mt-2">Sent to +91 {phone}</p>
              {devOtp && (
                <p className="mt-2 p-2.5 rounded-lg bg-brand-50 text-brand-800 text-xs font-medium">
                  Development mode — your code is <strong className="font-mono">{devOtp}</strong>.
                  A production build would send this by SMS.
                </p>
              )}
            </div>

            {isNewUser && (
              <div>
                <label className="label" htmlFor="name">Your name</label>
                <input
                  id="name" type="text" required value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input" placeholder="Your full name"
                />
                <p className="text-xs text-ink-500 mt-1.5">New number — we will create your account.</p>
              </div>
            )}

            <button type="submit" disabled={busy || otp.length !== 6} className="btn-primary btn-lg w-full">
              {busy ? <Spinner size={18} /> : <>Verify <ArrowRight size={18} /></>}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-ink-500 mt-6">
          New here?{' '}
          <Link to="/register" className="font-semibold text-brand-600">Create an account</Link>
        </p>

        {DEMO_LOGIN && (
          <button
            onClick={fillDemo}
            className="mt-6 w-full p-3 rounded-xl border-2 border-dashed border-ink-200 text-sm text-ink-500
                       hover:border-brand-300 hover:text-brand-700 transition-colors inline-flex items-center justify-center gap-2"
          >
            <Sparkles size={15} />
            Fill demo account
          </button>
        )}
      </div>
    </div>
  );
}
