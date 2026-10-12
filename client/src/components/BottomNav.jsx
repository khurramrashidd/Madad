import { NavLink, useLocation } from 'react-router-dom';
import { Home, ClipboardList, Plus, MessageCircle, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useSocket } from '../context/SocketContext.jsx';
import { SOCKET_EVENTS } from '../utils/constants.js';

const tabs = [
  { to: '/', icon: Home, label: 'Feed', end: true },
  { to: '/my-tasks', icon: ClipboardList, label: 'Tasks' },
  { to: '/create', icon: Plus, label: 'Post', primary: true },
  { to: '/chats', icon: MessageCircle, label: 'Chats', badge: true },
  { to: '/profile', icon: User, label: 'Profile' },
];

export default function BottomNav() {
  const [unread, setUnread] = useState(0);
  const { on } = useSocket();
  const location = useLocation();

  const load = () => api.chat.rooms().then((r) => setUnread(r.totalUnread || 0)).catch(() => {});

  useEffect(() => { load(); }, [location.pathname]);
  useEffect(() => on(SOCKET_EVENTS.CHAT_MESSAGE, () => load()), [on]);

  return (
    <nav className="shrink-0 bg-surface/95 backdrop-blur border-t border-ink-100 safe-bottom" aria-label="Main">
      <div className="flex items-stretch max-w-lg mx-auto px-1">
        {tabs.map(({ to, icon: Icon, label, primary, end, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `relative flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[3.75rem]
               transition-colors ${primary ? '' : isActive ? 'text-brand-600' : 'text-ink-400'}`
            }
          >
            {({ isActive }) => (
              <>
                {primary ? (
                  <span className="grid place-items-center w-12 h-12 -mt-5 rounded-2xl bg-brand-600 text-white shadow-brand-glow ring-4 ring-surface">
                    <Icon size={23} strokeWidth={2.4} />
                  </span>
                ) : (
                  <span className="relative">
                    <Icon size={22} strokeWidth={isActive ? 2.4 : 1.9} />
                    {badge && unread > 0 && (
                      <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full
                                       bg-danger text-white text-[10px] font-bold grid place-items-center ring-2 ring-surface">
                        {unread > 9 ? '9+' : unread}
                      </span>
                    )}
                  </span>
                )}
                <span className={`text-[10px] font-semibold ${primary ? 'text-brand-700' : ''}`}>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
