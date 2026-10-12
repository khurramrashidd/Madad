import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Spinner from '../components/Spinner.jsx';

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', upiId: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
      };
      if (form.phone.trim()) payload.phone = form.phone.trim();
      if (form.upiId.trim()) payload.upiId = form.upiId.trim();

      await register(payload);
      toast.success('Account created. Welcome to Madad.');
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-full bg-surface">
      <div className="px-6 py-10 max-w-md w-full mx-auto">
        <div className="mb-7">
          <div className="w-14 h-14 rounded-2xl bg-brand-600 grid place-items-center mb-4">
            <span className="font-display font-extrabold text-2xl text-white">M</span>
          </div>
          <h1 className="font-display font-extrabold text-3xl text-ink-900">Create your account</h1>
          <p className="text-ink-500 mt-1">Post tasks, earn bounties, build your trust score.</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-danger/10 text-danger text-sm font-medium">{error}</div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="name">Full name</label>
            <input id="name" required minLength={2} value={form.name} onChange={set('name')}
                   className="input" placeholder="Your full name" autoComplete="name" />
          </div>

          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" required value={form.email} onChange={set('email')}
                   className="input" placeholder="you@example.com" autoComplete="email" />
          </div>

          <div>
            <label className="label" htmlFor="phone">
              Mobile <span className="font-normal text-ink-400">(optional)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500 font-medium text-sm">+91</span>
              <input id="phone" type="tel" inputMode="numeric" maxLength={10}
                     value={form.phone}
                     onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '') }))}
                     className="input pl-14 tracking-wider" placeholder="98765 43210" autoComplete="tel" />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" type="password" required minLength={6}
                   value={form.password} onChange={set('password')}
                   className="input" placeholder="At least 6 characters" autoComplete="new-password" />
          </div>

          <div>
            <label className="label" htmlFor="upi">
              UPI ID <span className="font-normal text-ink-400">(optional for now)</span>
            </label>
            <input id="upi" value={form.upiId} onChange={set('upiId')}
                   className="input font-mono text-sm" placeholder="yourname@okhdfcbank" />
            <div className="flex gap-2 mt-2 p-3 rounded-xl bg-brand-50">
              <Info size={15} className="text-brand-600 shrink-0 mt-0.5" />
              <p className="text-xs text-brand-900 leading-relaxed">
                This is how you get paid. Madad never holds your money — wishers pay
                straight into your UPI. You will need it before claiming a task.
              </p>
            </div>
          </div>

          <button type="submit" disabled={busy} className="btn-primary btn-lg w-full !mt-6">
            {busy ? <Spinner size={18} /> : <>Create account <ArrowRight size={18} /></>}
          </button>
        </form>

        <p className="text-center text-sm text-ink-500 mt-6">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-600">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
