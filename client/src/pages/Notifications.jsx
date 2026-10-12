import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell } from 'lucide-react';
import { api } from '../api/client.js';
import EmptyState from '../components/EmptyState.jsx';
import Spinner from '../components/Spinner.jsx';

const ICONS = {
  task_claimed: '🙋', task_delivered: '✅', payment_marked: '💸',
  payment_confirmed: '🎉', task_settled: '🤝', task_expired: '⌛',
  new_message: '💬', review_received: '⭐', trust_changed: '📈',
  restricted: '🚫', dispute_update: '⚖️', nearby_task: '📍',
};

export default function Notifications() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.users.notifications()
      .then((r) => setItems(r.notifications || []))
      .catch(() => {})
      .finally(() => setLoading(false));
    // Mark read on open — arriving here is the acknowledgement.
    api.users.readNotifications().catch(() => {});
  }, []);

  return (
    <div className="flex flex-col h-full bg-ink-50">
      <header className="shrink-0 bg-surface border-b border-ink-100 safe-top px-4 pb-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 -ml-1.5 rounded-lg text-ink-500 hover:bg-ink-100" aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-display font-bold text-lg">Notifications</h1>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="grid place-items-center py-16"><Spinner size={24} className="text-brand-500" /></div>
        ) : items.length === 0 ? (
          <EmptyState icon={Bell} title="Nothing yet" message="Updates about your tasks and payments will show up here." />
        ) : (
          <div className="p-4 space-y-2">
            {items.map((n) => {
              const body = (
                <div className={`card p-3.5 flex gap-3 ${!n.readAt ? 'border-brand-200 bg-brand-50/40' : ''}`}>
                  <span className="text-xl shrink-0" aria-hidden="true">{ICONS[n.type] || '🔔'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm">{n.title}</p>
                    {n.body && <p className="text-sm text-ink-600 mt-0.5 leading-relaxed">{n.body}</p>}
                    <p className="text-[11px] text-ink-400 mt-1">
                      {new Date(n.createdAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
              return n.link ? <Link key={n._id} to={n.link}>{body}</Link> : <div key={n._id}>{body}</div>;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
