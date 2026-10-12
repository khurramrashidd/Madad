import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, Ban } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Avatar from '../components/Avatar.jsx';
import TrustBadge from '../components/TrustBadge.jsx';
import TrustMeter from '../components/TrustMeter.jsx';
import Spinner from '../components/Spinner.jsx';

/** Somebody else's profile. The trust score is the point of this screen. */
export default function UserProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: me, config } = useAuth();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.users.profile(id)
      .then(setData)
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, [id, toast]);

  const block = async () => {
    try {
      const res = await api.users.block(id);
      toast.success(res.blocked ? 'Blocked — their tasks are hidden' : 'Unblocked');
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) {
    return <div className="grid place-items-center h-full"><Spinner size={28} className="text-brand-500" /></div>;
  }
  if (!data) return null;

  const u = data.user;
  const isMe = me?.id === id;

  return (
    <div className="flex flex-col h-full bg-ink-50">
      <header className="shrink-0 bg-surface border-b border-ink-100 safe-top px-4 pb-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1.5 -ml-1.5 rounded-lg text-ink-500 hover:bg-ink-100" aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-display font-bold text-lg flex-1 truncate">{u.name}</h1>
        {!isMe && (
          <button onClick={block} className="p-1.5 rounded-lg text-ink-400 hover:bg-ink-100" aria-label="Block user">
            <Ban size={18} />
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-8">
        <div className="card p-5 text-center">
          <div className="inline-block"><Avatar name={u.name} color={u.avatarColor} src={u.avatar} size={72} /></div>
          <h2 className="font-display font-bold text-xl mt-3">{u.name}</h2>
          {u.bio && <p className="text-sm text-ink-500 mt-1 leading-relaxed">{u.bio}</p>}
          <div className="flex items-center justify-center gap-2 mt-3">
            <TrustBadge score={u.trustScore} badge={u.badge} size="lg" />
            {u.rating && <span className="chip bg-ink-100 text-ink-700 px-3 py-1.5">⭐ {u.rating}</span>}
          </div>
          <p className="text-xs text-ink-400 mt-3">
            Member since {new Date(u.memberSince).toLocaleDateString([], { month: 'long', year: 'numeric' })}
          </p>
        </div>

        <div className="card p-5">
          <TrustMeter score={u.trustScore} restrictBelow={config?.trustRestrictBelow ?? 40} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <MiniStat value={u.stats?.tasksCompleted || 0} label="Completed" />
          <MiniStat value={u.stats?.tasksPosted || 0} label="Posted" />
          <MiniStat value={u.stats?.ratingCount || 0} label="Ratings" />
        </div>

        {data.reviews?.length > 0 && (
          <div>
            <h3 className="font-display font-bold text-base mb-2 px-1">Reviews</h3>
            <div className="space-y-2">
              {data.reviews.map((r) => (
                <div key={r.id} className="card p-4">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={r.reviewer?.name} color={r.reviewer?.avatarColor} size={30} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{r.reviewer?.name}</p>
                      <p className="text-[11px] text-ink-400">
                        as the {r.role} · {new Date(r.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <div className="flex gap-0.5 shrink-0">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star key={n} size={13} className={n <= r.rating ? 'fill-brand-400 text-brand-400' : 'text-ink-200'} />
                      ))}
                    </div>
                  </div>
                  {r.comment && <p className="text-sm text-ink-600 mt-2.5 leading-relaxed">{r.comment}</p>}
                  {r.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {r.tags.map((t) => (
                        <span key={t} className="chip bg-ink-100 text-ink-600 capitalize">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MiniStat({ value, label }) {
  return (
    <div className="card p-3 text-center">
      <p className="font-display font-bold text-xl tabular-nums">{value}</p>
      <p className="text-[11px] text-ink-500">{label}</p>
    </div>
  );
}
