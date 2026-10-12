import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Wallet, TrendingUp, TrendingDown, Flame, Target, Inbox } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { categoryMeta, STATUS_META } from '../utils/constants.js';

/**
 * Money in, money out.
 *
 * The counters for this (`stats.totalEarned`, `stats.totalSpent`) were always
 * being maintained by the trust engine but had nowhere to appear, so a
 * volunteer had no way to answer "how much have I actually made from this?"
 * — which is the single question that decides whether they come back.
 *
 * Everything here is derived from data the client already fetches. There is
 * no new endpoint, and deliberately no chart: on a 5" screen two large
 * numbers and a list read better than a graph of a dozen ₹50 errands.
 */
export default function Earnings() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [tasks, setTasks] = useState({ posted: [], claimed: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.tasks
      .mine()
      .then((r) => setTasks({ posted: r.posted || [], claimed: r.claimed || [] }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const stats = user?.stats || {};

  /**
   * Settled history, newest first, as a single stream.
   *
   * Only settled tasks count. A claimed-but-unpaid task is not earnings, and
   * showing it as such would be the sort of optimistic accounting that makes
   * people distrust the number.
   */
  const history = useMemo(() => {
    const earned = (tasks.claimed || [])
      .filter((x) => x.status === 'settled')
      .map((x) => ({ ...x, direction: 'in' }));
    const spent = (tasks.posted || [])
      .filter((x) => x.status === 'settled')
      .map((x) => ({ ...x, direction: 'out' }));
    return [...earned, ...spent].sort(
      (a, b) => new Date(b.settledAt || b.createdAt) - new Date(a.settledAt || a.createdAt)
    );
  }, [tasks]);

  /**
   * Completion rate: of the tasks you claimed and therefore promised to do,
   * how many did you finish? Abandoning a claim is the behaviour this is
   * meant to expose, so the denominator is claims, not completions.
   */
  const claimedTotal = (tasks.claimed || []).filter((x) =>
    ['settled', 'cancelled', 'disputed', 'expired'].includes(x.status)
  ).length;
  const completedTotal = (tasks.claimed || []).filter((x) => x.status === 'settled').length;
  const completionRate = claimedTotal > 0 ? Math.round((completedTotal / claimedTotal) * 100) : null;

  const rupees = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;

  return (
    <div className="flex flex-col h-full bg-ink-50">
      <PageHeader title={t('nav.earnings')} subtitle="Settled tasks only" />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ---- The two numbers that matter ---- */}
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp size={14} className="text-success" />
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-ink-400">
                {t('profile.totalEarned')}
              </p>
            </div>
            <p className="font-display font-extrabold text-2xl text-ink-900 tabular-nums">
              {rupees(stats.totalEarned)}
            </p>
            <p className="text-[11px] text-ink-500 mt-0.5">
              {stats.tasksCompleted || 0} {t('profile.tasksDone').toLowerCase()}
            </p>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingDown size={14} className="text-money-500" />
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-ink-400">
                {t('profile.totalSpent')}
              </p>
            </div>
            <p className="font-display font-extrabold text-2xl text-ink-900 tabular-nums">
              {rupees(stats.totalSpent)}
            </p>
            <p className="text-[11px] text-ink-500 mt-0.5">
              {stats.bountiesPaid || 0} bounties paid
            </p>
          </div>
        </div>

        {/* ---- Reliability ---- */}
        <div className="card p-4">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-ink-400 mb-3">
            Reliability
          </p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="flex items-center justify-center gap-1 text-ink-400 mb-1">
                <Target size={13} />
              </div>
              <p className="font-display font-bold text-lg text-ink-900 tabular-nums">
                {completionRate == null ? '—' : `${completionRate}%`}
              </p>
              <p className="text-[10.5px] text-ink-500 leading-tight">
                {t('profile.completionRate')}
              </p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-ink-400 mb-1">
                <Flame size={13} />
              </div>
              <p className="font-display font-bold text-lg text-ink-900 tabular-nums">
                {stats.currentStreak || 0}
              </p>
              <p className="text-[10.5px] text-ink-500 leading-tight">Current streak</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-ink-400 mb-1">
                <Wallet size={13} />
              </div>
              <p className="font-display font-bold text-lg text-ink-900 tabular-nums">
                {user?.trustScore ?? '—'}
              </p>
              <p className="text-[10.5px] text-ink-500 leading-tight">Trust score</p>
            </div>
          </div>

          {/* Honest about what the rate does and does not include. */}
          {claimedTotal === 0 && (
            <p className="hint mt-3">
              Your completion rate appears once you have claimed and finished a task.
            </p>
          )}
        </div>

        {/* ---- History ---- */}
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-ink-400 px-1 mb-2">
            History
          </p>

          {loading ? (
            <div className="py-10 grid place-items-center">
              <Spinner size={22} className="text-brand-500" />
            </div>
          ) : history.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Nothing settled yet"
              message="Once a task is paid and both sides confirm, it appears here."
              action={<Link to="/" className="btn-primary btn-md">Browse tasks</Link>}
            />
          ) : (
            <ul className="space-y-2">
              {history.map((task) => {
                const meta = categoryMeta(task.category);
                const incoming = task.direction === 'in';
                return (
                  <li key={`${task.direction}-${task.id}`}>
                    <Link
                      to={`/task/${task.id}`}
                      className="card-interactive p-3 flex items-center gap-3"
                    >
                      <span
                        className="shrink-0 w-9 h-9 rounded-xl bg-ink-100 grid place-items-center text-base"
                        aria-hidden="true"
                      >
                        {meta.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-semibold text-ink-800 truncate">
                          {task.title}
                        </span>
                        <span className="block text-[11px] text-ink-500">
                          {incoming ? 'You did this' : 'You posted this'}
                          {task.settledAt &&
                            ` · ${new Date(task.settledAt).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                            })}`}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 font-display font-bold text-[14.5px] tabular-nums
                                    ${incoming ? 'text-success' : 'text-ink-500'}`}
                      >
                        {incoming ? '+' : '−'}₹{task.bounty}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="text-[11px] text-ink-400 leading-relaxed px-1 pb-4">
          These totals are what Madad recorded when both sides confirmed a payment. Madad never
          handles the money itself, so this is a log of what you both agreed happened — not a bank
          statement.
        </p>
      </div>
    </div>
  );
}
