import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trophy, Flame } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from '../components/Avatar.jsx';
import TrustBadge from '../components/TrustBadge.jsx';
import Spinner from '../components/Spinner.jsx';
import EmptyState from '../components/EmptyState.jsx';

/** Gamifies the trust score. Restricted users are excluded by the API. */
export default function Leaderboard() {
  const [scope, setScope] = useState('trust');
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    api.users.leaderboard(scope)
      .then((r) => setLeaders(r.leaders || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [scope]);

  const medal = (rank) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null);

  return (
    <div className="flex flex-col h-full bg-ink-50">
      <header className="shrink-0 bg-surface border-b border-ink-100 safe-top px-4 pb-3">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate(-1)} className="p-1.5 -ml-1.5 rounded-lg text-ink-500 hover:bg-ink-100" aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-display font-bold text-lg">Leaderboard</h1>
        </div>

        <div className="flex p-1 bg-ink-100 rounded-xl">
          {[
            { key: 'trust', label: 'Trust score', icon: Trophy },
            { key: 'streak', label: 'Streaks', icon: Flame },
          ].map((s) => (
            <button key={s.key} onClick={() => setScope(s.key)}
                    className={`flex-1 h-9 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-all
                                ${scope === s.key ? 'bg-surface shadow-sm text-ink-900' : 'text-ink-500'}`}>
              <s.icon size={15} /> {s.label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          <div className="grid place-items-center py-16"><Spinner size={24} className="text-brand-500" /></div>
        ) : leaders.length === 0 ? (
          <EmptyState icon={Trophy} title="No rankings yet" message="Complete a task to get on the board." />
        ) : (
          leaders.map((l) => (
            <Link key={l.id} to={`/profile/${l.id}`}
                  className={`card p-3.5 flex items-center gap-3 ${l.id === user?.id ? 'border-brand-300 bg-brand-50/40' : ''}`}>
              <span className="w-8 text-center font-display font-bold text-ink-400 shrink-0">
                {medal(l.rank) || l.rank}
              </span>
              <Avatar name={l.name} color={l.avatarColor} src={l.avatar} size={40} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">
                  {l.name} {l.id === user?.id && <span className="text-ink-400 font-normal text-sm">(you)</span>}
                </p>
                <p className="text-xs text-ink-500">{l.stats?.tasksCompleted || 0} tasks completed</p>
              </div>
              <div className="shrink-0 text-right">
                {scope === 'streak' ? (
                  <p className="font-display font-bold text-lg tabular-nums inline-flex items-center gap-1">
                    <Flame size={15} className="text-brand-500" />{l.stats?.currentStreak || 0}
                  </p>
                ) : (
                  <TrustBadge score={l.trustScore} badge={l.badge} />
                )}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
