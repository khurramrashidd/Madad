import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Send, Lock, ExternalLink } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import { useOffline } from '../context/OfflineContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Avatar from '../components/Avatar.jsx';
import TrustBadge from '../components/TrustBadge.jsx';
import Spinner from '../components/Spinner.jsx';
import { SOCKET_EVENTS } from '../utils/constants.js';
import { makeClientRef } from '../db/offline.js';

/**
 * Ephemeral private chat.
 *
 * The room exists only because a claim created it, and only the two parties
 * can join — membership is re-checked server-side on every join and send.
 * When the bounty settles the room closes and the history is hidden.
 */
export default function Chat() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { on, emitAck, emit, connected } = useSocket();
  const { offline, queueAction } = useOffline();
  const toast = useToast();

  const [messages, setMessages] = useState([]);
  const [other, setOther] = useState(null);
  const [closed, setClosed] = useState(false);
  const [closedReason, setClosedReason] = useState(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [theyreTyping, setTheyreTyping] = useState(false);

  const scrollRef = useRef(null);
  const typingTimer = useRef(null);
  const theirTypingTimer = useRef(null);

  const scrollToEnd = useCallback((smooth = true) => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
    });
  }, []);

  // Load history.
  useEffect(() => {
    let alive = true;
    api.chat
      .messages(taskId)
      .then((res) => {
        if (!alive) return;
        setMessages(res.messages || []);
        setOther(res.other);
        setClosed(res.closed);
        setClosedReason(res.closedReason);
        scrollToEnd(false);
      })
      .catch((err) => alive && toast.error(err.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [taskId, toast, scrollToEnd]);

  // Join the socket room.
  useEffect(() => {
    if (!connected || closed) return;
    emitAck(SOCKET_EVENTS.CHAT_JOIN, taskId).then((res) => {
      if (!res.ok && res.closed) setClosed(true);
    });
    return () => emit(SOCKET_EVENTS.CHAT_LEAVE, taskId);
  }, [connected, taskId, closed, emitAck, emit]);

  // Incoming messages, typing, and closure.
  useEffect(() => {
    const offMessage = on(SOCKET_EVENTS.CHAT_MESSAGE, (msg) => {
      if (msg.taskId !== taskId) return;
      setMessages((prev) => {
        // Replace my own optimistic bubble rather than duplicating it.
        if (msg.clientRef) {
          const idx = prev.findIndex((m) => m.clientRef === msg.clientRef);
          if (idx !== -1) {
            const next = [...prev];
            next[idx] = { ...msg, mine: true, pending: false };
            return next;
          }
        }
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, { ...msg, mine: msg.senderId === user?.id }];
      });
      scrollToEnd();
    });

    const offTyping = on(SOCKET_EVENTS.CHAT_TYPING, ({ taskId: tid, typing, userId }) => {
      if (tid !== taskId || userId === user?.id) return;
      setTheyreTyping(typing);
      clearTimeout(theirTypingTimer.current);
      if (typing) theirTypingTimer.current = setTimeout(() => setTheyreTyping(false), 3000);
    });

    const offClosed = on(SOCKET_EVENTS.CHAT_CLOSED, ({ taskId: tid }) => {
      if (tid !== taskId) return;
      setClosed(true);
      setClosedReason('This chat closed when the bounty was settled.');
      setMessages([]);
    });

    return () => { offMessage(); offTyping(); offClosed(); };
  }, [on, taskId, user?.id, scrollToEnd]);

  const onType = (e) => {
    setDraft(e.target.value);
    if (closed || offline) return;
    emit(SOCKET_EVENTS.CHAT_TYPING_SEND, { taskId, typing: true });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(
      () => emit(SOCKET_EVENTS.CHAT_TYPING_SEND, { taskId, typing: false }),
      1200
    );
  };

  const send = async (e) => {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || sending || closed) return;

    const clientRef = makeClientRef('msg');
    setDraft('');
    setSending(true);

    // Optimistic bubble so the UI never feels like it stalled.
    setMessages((prev) => [
      ...prev,
      {
        id: clientRef, clientRef, body, mine: true, pending: true,
        senderId: user?.id, senderName: user?.name, createdAt: new Date().toISOString(),
      },
    ]);
    scrollToEnd();

    try {
      if (offline) {
        await queueAction('send_message', { taskId, body, clientRef });
        setMessages((prev) =>
          prev.map((m) => (m.clientRef === clientRef ? { ...m, pending: false, queued: true } : m))
        );
        return;
      }

      const res = await emitAck(SOCKET_EVENTS.CHAT_SEND, { taskId, body, clientRef });

      if (!res.ok) {
        // Socket failed — try the HTTP fallback before giving up.
        try {
          await api.chat.send(taskId, body);
          setMessages((prev) =>
            prev.map((m) => (m.clientRef === clientRef ? { ...m, pending: false } : m))
          );
        } catch {
          setMessages((prev) => prev.filter((m) => m.clientRef !== clientRef));
          toast.error(res.error || 'Could not send that');
          setDraft(body);
        }
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-ink-50">
      <header className="shrink-0 bg-surface border-b border-ink-100 safe-top px-4 pb-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 -ml-1.5 rounded-lg text-ink-500 hover:bg-ink-100" aria-label="Back">
            <ArrowLeft size={20} />
          </button>

          {other ? (
            <>
              <Avatar name={other.name} color={other.avatarColor} src={other.avatar} size={36} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate leading-tight">{other.name}</p>
                <div className="flex items-center gap-2">
                  {theyreTyping ? (
                    <span className="text-xs text-success font-medium">typing…</span>
                  ) : (
                    <TrustBadge score={other.trustScore} badge={other.badge} showScore={false} />
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 h-9 skeleton rounded-lg" />
          )}

          <Link to={`/task/${taskId}`} className="p-1.5 rounded-lg text-ink-500 hover:bg-ink-100" aria-label="Open task">
            <ExternalLink size={18} />
          </Link>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {loading ? (
          <div className="grid place-items-center py-12">
            <Spinner size={24} className="text-brand-500" />
          </div>
        ) : closed ? (
          <div className="grid place-items-center py-12 text-center px-6">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-ink-100 grid place-items-center mx-auto mb-3">
                <Lock size={22} className="text-ink-400" />
              </div>
              <p className="font-semibold text-ink-800">This chat is closed</p>
              <p className="text-sm text-ink-500 mt-1.5 max-w-xs leading-relaxed">
                {closedReason || 'The conversation ended when the task settled.'}
                {' '}Messages are kept privately for 7 days in case of a dispute, then deleted for good.
              </p>
              <Link to={`/task/${taskId}`} className="btn-ghost btn-md mt-4">View the task</Link>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-sm text-ink-400 py-12">
            Say hello and sort out the details.
          </p>
        ) : (
          messages.map((m) =>
            m.kind === 'system' ? (
              <p key={m.id} className="text-center text-xs text-ink-500 bg-ink-100 rounded-xl px-3 py-2 mx-auto max-w-xs my-3">
                {m.body}
              </p>
            ) : (
              <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed
                              ${m.mine
                                ? 'bg-brand-600 text-white rounded-br-md'
                                : 'bg-surface border border-ink-100 rounded-bl-md'}
                              ${m.pending ? 'opacity-60' : ''}`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`text-[10px] mt-1 ${m.mine ? 'text-ink-700/60' : 'text-ink-400'}`}>
                    {m.queued ? 'queued — sends when online'
                      : m.pending ? 'sending…'
                      : new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            )
          )
        )}
      </div>

      {!closed && (
        <form onSubmit={send} className="shrink-0 bg-surface border-t border-ink-100 p-3 safe-bottom">
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={onType}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e); }
              }}
              rows={1}
              maxLength={800}
              placeholder={offline ? 'Offline — messages will queue' : 'Message…'}
              className="flex-1 max-h-28 px-4 py-2.5 rounded-2xl bg-ink-100 text-sm outline-none
                         resize-none focus:ring-2 focus:ring-brand-400"
              style={{ minHeight: '2.75rem' }}
            />
            <button
              type="submit"
              disabled={!draft.trim() || sending}
              className="shrink-0 w-11 h-11 rounded-2xl bg-brand-600 text-white grid place-items-center
                         disabled:opacity-40 active:scale-95 transition-transform"
              aria-label="Send"
            >
              <Send size={18} />
            </button>
          </div>
          <p className="text-[10px] text-ink-400 mt-1.5 px-1">
            Never share your handshake code here — read it out in person.
          </p>
        </form>
      )}
    </div>
  );
}
