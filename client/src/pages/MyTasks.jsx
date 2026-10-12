import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, CloudUpload } from 'lucide-react';
import { api } from '../api/client.js';
import { useOffline } from '../context/OfflineContext.jsx';
import TaskCard, { TaskCardSkeleton } from '../components/TaskCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { getQueue } from '../db/offline.js';

/** Everything I posted, everything I claimed, plus anything still queued offline. */
export default function MyTasks() {
  const [tab, setTab] = useState('posted');
  const [data, setData] = useState({ posted: [], claimed: [] });
  const [queued, setQueued] = useState([]);
  const [loading, setLoading] = useState(true);
  const { queueCount, syncing, sync, online } = useOffline();

  useEffect(() => {
    api.tasks.mine()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [queueCount]);

  useEffect(() => {
    getQueue().then((items) => setQueued(items.filter((i) => i.type === 'create_task')));
  }, [queueCount]);

  const list = tab === 'posted' ? data.posted : data.claimed;

  return (
    <div className="flex flex-col h-full bg-ink-50">
      <header className="shrink-0 bg-surface border-b border-ink-100 safe-top px-4 pb-0">
        <h1 className="font-display font-bold text-xl mb-3">My tasks</h1>
        <div className="flex gap-6">
          {[
            { key: 'posted', label: 'Posted', count: data.posted.length + queued.length },
            { key: 'claimed', label: 'Claimed', count: data.claimed.length },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
                    className={`pb-3 text-sm font-semibold border-b-2 transition-colors
                                ${tab === t.key ? 'border-brand-500 text-ink-900' : 'border-transparent text-ink-400'}`}>
              {t.label} {t.count > 0 && <span className="text-ink-400">({t.count})</span>}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Queued offline drafts appear first so they are never forgotten. */}
        {tab === 'posted' && queued.map((q) => (
          <div key={q.clientRef} className="card p-4 border-dashed border-2 border-ink-300 bg-ink-50">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-ink-700 truncate">{q.payload.title}</p>
                <p className="text-xs text-ink-500 mt-1">₹{q.payload.bounty} · waiting to send</p>
              </div>
              <span className="chip bg-ink-200 text-ink-600 shrink-0">Queued</span>
            </div>
            {online && (
              <button onClick={sync} disabled={syncing} className="btn-ghost btn-sm w-full mt-3">
                <CloudUpload size={14} /> {syncing ? 'Sending…' : 'Send now'}
              </button>
            )}
          </div>
        ))}

        {loading ? (
          <><TaskCardSkeleton /><TaskCardSkeleton /></>
        ) : list.length === 0 && (tab === 'claimed' || queued.length === 0) ? (
          <EmptyState
            icon={ClipboardList}
            title={tab === 'posted' ? 'You have not posted anything yet' : 'You have not claimed anything yet'}
            message={tab === 'posted'
              ? 'Post a quick task and someone nearby will pick it up.'
              : 'Browse the feed and accept a task to start earning.'}
            action={<Link to={tab === 'posted' ? '/create' : '/'} className="btn-primary btn-md">
              {tab === 'posted' ? 'Post a task' : 'Browse tasks'}
            </Link>}
          />
        ) : (
          list.map((t) => <TaskCard key={t.id} task={t} showStatus />)
        )}
      </div>
    </div>
  );
}
