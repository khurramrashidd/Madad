import { useState, useEffect } from 'react';
import { ShieldCheck, Phone, UserRound, Check, AlertTriangle, Info } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import PageHeader from '../components/PageHeader.jsx';

/**
 * Safety settings and guidance.
 *
 * Two strangers meeting in a lane to hand over cash is the genuinely risky
 * part of this product, and the trust score does nothing about it — a score
 * is a consequence, applied after something has already happened.
 *
 * What this screen can actually do is small and concrete: store one phone
 * number to call, explain what the SOS button will and will not do, and set
 * out the four habits that prevent most trouble. It does not claim to make
 * anyone safe, because a page cannot.
 */
export default function Safety() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const { t } = useI18n();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setName(user?.trustedContact?.name || '');
    setPhone(user?.trustedContact?.phone || '');
  }, [user?.trustedContact?.name, user?.trustedContact?.phone]);

  const dirty =
    name !== (user?.trustedContact?.name || '') || phone !== (user?.trustedContact?.phone || '');

  const save = async (e) => {
    e.preventDefault();
    setError(null);

    if (phone && !/^[6-9]\d{9}$/.test(phone)) {
      setError('Enter a valid 10-digit Indian mobile number.');
      return;
    }

    setSaving(true);
    try {
      const r = await api.users.updateMe({ trustedContact: { name, phone } });
      setUser?.(r.user);
      toast.success(phone ? 'Emergency contact saved' : 'Emergency contact removed');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const checklist = t('safety.checklistItems');

  return (
    <div className="flex flex-col h-full bg-ink-50">
      <PageHeader title={t('safety.title')} />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ---- Emergency contact ---- */}
        <form onSubmit={save} className="card p-4">
          <div className="flex items-start gap-2.5 mb-3">
            <span className="shrink-0 w-9 h-9 rounded-xl bg-danger/10 grid place-items-center">
              <Phone size={17} className="text-danger" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display font-bold text-[15px] text-ink-900">
                {t('safety.trustedContact')}
              </h2>
              <p className="text-[11.5px] text-ink-500 leading-relaxed mt-0.5">
                {t('safety.trustedContactHint')}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="contact-name">
                Their name
              </label>
              <div className="relative">
                <UserRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  id="contact-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ammi, Rahul"
                  maxLength={50}
                  className="input pl-9"
                />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="contact-phone">
                Their mobile number
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500 text-sm font-medium">
                  +91
                </span>
                <input
                  id="contact-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="98765 43210"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  className="input pl-12 tabular-nums"
                />
              </div>
              <p className="hint">
                Leave this empty to remove the contact. Madad does not call or message them on its
                own — the SOS button offers you the call to make.
              </p>
            </div>

            {error && (
              <p className="text-[12.5px] text-danger flex items-center gap-1.5">
                <AlertTriangle size={14} /> {error}
              </p>
            )}

            <button type="submit" disabled={!dirty || saving} className="btn-primary btn-md w-full">
              {saving ? 'Saving…' : t('common.save')}
            </button>
          </div>
        </form>

        {/* ---- What SOS does ---- */}
        <div className="card p-4">
          <div className="flex items-start gap-2.5 mb-2">
            <span className="shrink-0 w-9 h-9 rounded-xl bg-warn/10 grid place-items-center">
              <ShieldCheck size={17} className="text-warn" />
            </span>
            <h2 className="font-display font-bold text-[15px] text-ink-900 pt-1.5">
              What the SOS button does
            </h2>
          </div>

          <ul className="space-y-2 text-[12.5px] text-ink-600 leading-relaxed">
            {[
              'Tells the other person you have flagged a problem.',
              'Alerts whoever runs Madad, with the task attached.',
              'Offers you a one-tap call to 112 and to your emergency contact.',
            ].map((line) => (
              <li key={line} className="flex gap-2">
                <Check size={15} className="text-success shrink-0 mt-0.5" />
                {line}
              </li>
            ))}
          </ul>

          {/*
            Stated plainly. Someone who believes this button summons police
            may delay actually calling them, which would make the feature
            worse than not having it.
          */}
          <div className="mt-3 flex gap-2 p-3 rounded-xl bg-ink-100">
            <Info size={15} className="text-ink-500 shrink-0 mt-0.5" />
            <p className="text-[12px] text-ink-600 leading-relaxed">
              <strong className="font-semibold text-ink-800">It does not contact the police.</strong>{' '}
              Madad has no connection to any emergency service. In a real emergency, call{' '}
              <strong className="font-semibold text-ink-800">112</strong> yourself — the button
              gives you that dialler, nothing more.
            </p>
          </div>

          <a href="tel:112" className="btn-danger btn-md w-full mt-3">
            <Phone size={16} />
            {t('safety.call112')}
          </a>
        </div>

        {/* ---- The habits that actually help ---- */}
        <div className="card p-4">
          <h2 className="font-display font-bold text-[15px] text-ink-900 mb-3">
            {t('safety.checklist')}
          </h2>
          <ol className="space-y-2.5">
            {(Array.isArray(checklist) ? checklist : []).map((item, i) => (
              <li key={i} className="flex gap-2.5 text-[12.5px] text-ink-600 leading-relaxed">
                <span className="shrink-0 w-5 h-5 rounded-full bg-brand-50 text-brand-700 text-[11px] font-bold grid place-items-center">
                  {i + 1}
                </span>
                {item}
              </li>
            ))}
          </ol>
        </div>

        <p className="text-[11px] text-ink-400 leading-relaxed px-1 pb-4">
          Madad does not verify anyone’s identity. Anyone can sign up with any email address. The
          trust score reflects how people have behaved on the platform, which is useful — but it is
          not proof of who someone is, and it is not a safety guarantee.
        </p>
      </div>
    </div>
  );
}
