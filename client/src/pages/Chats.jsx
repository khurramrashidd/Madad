import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { api } from '../api/client.js';
import { useSocket } from '../context/SocketContext.jsx';
import Avatar from '../components/Avatar.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Spinner from '../components/Spinner.jsx';
import { STATUS_META, SOCKET_EVENTS } from '../utils/constants.js';

/** Inbox. Only active tasks have rooms — settled ones close automatically. */
export default function Chats() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const { on } = useSocket();

  const load = () => api.chat.rooms().then((r) => setRooms(r.rooms || [])).catch(() => {}).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);
  useEffect(() => on(SOCKET_EVENTS.CHAT_MESSAGE, load), [on]);

  return (
    <div className="flex flex-col h-full bg-ink-50">
      <header className="shrink-0 bg-surface border-b border-ink-100 safe-top px-4 pb-3">
        <h1 className="font-display font-bold text-xl">Chats</h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="grid place-items-center py-16"><Spinner size={24} className="text-brand-500" /></div>
        ) : rooms.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="No active chats"
            message="A private chat opens as soon as you claim a task, or someone claims yours."
            action={<Link to="/" className="btn-primary btn-md">Browse tasks</Link>}
          />
        ) : (
          <div className="p-4 space-y-2">
            {rooms.map((r) => {
              const status = STATUS_META[r.status];
              return (
                <Link key={r.taskId} to={`/chat/${r.taskId}`} className="card p-3.5 flex items-center gap-3 active:scale-[0.99] transition-transform">
                  <Avatar name={r.other?.name} color={r.other?.avatarColor} src={r.other?.avatar} size={44} />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-semibold truncate">{r.other?.name || 'Unknown'}</p>
                      {r.lastMessage && (
                        <span className="text-[11px] text-ink-400 shrink-0">
                          {new Date(r.lastMessage.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ink-500 truncate mt-0.5">{r.taskTitle}</p>
                    {r.lastMessage && (
                      <p className={`text-sm truncate mt-0.5 ${r.unread ? 'font-semibold text-ink-800' : 'text-ink-500'}`}>
                        {r.lastMessage.kind === 'system' ? '· ' : ''}{r.lastMessage.body}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    {status && <span className={`chip ${status.tone} text-[10px]`}>{status.label}</span>}
                    {r.unread > 0 && (
                      <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-danger text-white text-[11px] font-bold grid place-items-center">
                        {r.unread}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
