import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Clock, MessageCircle, Shield, TrendingUp,
  CheckCircle2, AlertTriangle, Star, Share2, X, KeyRound,
} from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
// The app-wide position, rather than a second GPS watch on this screen.
import { useLocation as useGeo } from '../context/LocationContext.jsx';
import SafetyBar from '../components/SafetyBar.jsx';
import Avatar from '../components/Avatar.jsx';
import TrustBadge from '../components/TrustBadge.jsx';
import BountyPill from '../components/BountyPill.jsx';
import TaskMap from '../components/TaskMap.jsx';
import Spinner from '../components/Spinner.jsx';
import Sheet from '../components/Sheet.jsx';
import UpiQr from '../components/UpiQr.jsx';
import { categoryMeta, STATUS_META, SOCKET_EVENTS, DISPUTE_REASONS, REVIEW_TAGS } from '../utils/constants.js';

/**
 * The task lifecycle, start to finish:
 *
 *   open → claimed → delivered → paid_pending → settled
 *
 * The two gates that make this work without escrow:
 *   1. a 4-digit handshake code, proving the two actually met
 *   2. two-sided payment confirmation, so neither can settle unilaterally
 */
export default function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, config } = useAuth();
  const { on } = useSocket();
  const toast = useToast();
  const { coords } = useGeo();

  const [task, setTask] = useState(null);
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  /** Set when the other party raises an SOS on this task. */
  const [sosAlert, setSosAlert] = useState(null);

  const [codeInput, setCodeInput] = useState('');
  const [sheet, setSheet] = useState(null); // 'boost' | 'cancel' | 'dispute' | 'review' | 'pay'
  const [boostAmount, setBoostAmount] = useState(20);
  const [cancelReason, setCancelReason] = useState('');
  const [disputeReason, setDisputeReason] = useState('not_paid');
  const [disputeDetail, setDisputeDetail] = useState('');
  const [rating, setRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewTags, setReviewTags] = useState([]);
  const [myReview, setMyReview] = useState(null);

  const load = useCallback(async () => {
    try {
      const params = coords ? { lng: coords.lng, lat: coords.lat } : {};
      const res = await api.tasks.one(id, params);
      setTask(res.task);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id, coords]);

  useEffect(() => { load(); }, [load]);

  // Live status changes while the screen is open.
  useEffect(() => {
    const offUpdate = on(SOCKET_EVENTS.TASK_UPDATED, (t) => {
      if (t.id === id) load();
    });
    const offClaimed = on(SOCKET_EVENTS.TASK_CLAIMED, ({ id: claimedId }) => {
      if (claimedId === id) load();
    });
    /**
     * The other party raised a safety alert.
     *
     * This gets a persistent banner rather than a toast. A toast that fades
     * after four seconds is the wrong shape for "the person you are meeting
     * says something is wrong" — it needs to stay on screen until acted on.
     */
    const offSos = on(SOCKET_EVENTS.SOS_RAISED, (payload) => {
      if (payload.taskId !== id) return;
      if (payload.by?.id === user?.id) return; // our own alert, already handled
      setSosAlert(payload);
    });
    return () => { offUpdate(); offClaimed(); offSos(); };
  }, [on, id, load, user?.id]);

  // Payment details become available once the handshake is verified.
  useEffect(() => {
    if (!task) return;
    if (!['delivered', 'paid_pending'].includes(task.status)) return;
    if (!(task.isMine || task.isMyClaim)) return;

    api.tasks.payment(id).then((r) => setPayment(r.payment)).catch(() => {});
  }, [task, id]);

  // Load my review once settled.
  useEffect(() => {
    if (task?.status !== 'settled') return;
    api.reviews.forTask(id).then((r) => setMyReview(r.myReview)).catch(() => {});
  }, [task?.status, id]);

  const act = async (fn, successMessage) => {
    setBusy(true);
    try {
      await fn();
      if (successMessage) toast.success(successMessage);
      await load();
      setSheet(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const claim = () => act(() => api.tasks.claim(id), 'Task claimed — open the chat to coordinate');

  const verifyCode = () =>
    act(() => api.tasks.handshake(id, codeInput.trim()), 'Handshake verified — you can be paid now');

  const markPaid = () => act(() => api.tasks.markPaid(id), 'Marked as paid');
  const confirmReceipt = () => act(() => api.tasks.confirm(id), 'Payment confirmed. Task settled.');
  const boost = () => act(() => api.tasks.boost(id, Number(boostAmount)), 'Bounty raised');
  const cancel = () => act(() => api.tasks.cancel(id, cancelReason), 'Task cancelled');
  const reportNonPayment = () => act(() => api.tasks.reportNonPayment(id), 'Reported for review');
  const raiseDispute = () =>
    act(() => api.tasks.dispute(id, { reason: disputeReason, detail: disputeDetail }), 'Dispute raised');

  const submitReview = () =>
    act(
      () => api.reviews.create(id, { rating, comment: reviewComment, tags: reviewTags }),
      'Thanks for the rating'
    );

  const share = async () => {
    const url = `${window.location.origin}/task/${id}`;
    const text = `${task.title} — ₹${task.bounty} on Madad`;
    try {
      if (navigator.share) await navigator.share({ title: 'Madad task', text, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied');
      }
    } catch {
      /* user dismissed the share sheet */
    }
  };

  if (loading) {
    return (
      <div className="grid place-items-center h-full">
        <Spinner size={28} className="text-brand-500" />
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="grid place-items-center h-full p-6 text-center">
        <div>
          <AlertTriangle className="mx-auto text-ink-300 mb-3" size={36} />
          <p className="font-semibold text-ink-800">{error || 'Task not found'}</p>
          <Link to="/" className="btn-primary btn-md mt-4">Back to the feed</Link>
        </div>
      </div>
    );
  }

  const cat = categoryMeta(task.category);
  const status = STATUS_META[task.status];
  const [lng, lat] = task.location?.coordinates || [];
  const other = task.isMine ? task.volunteer : task.wisher;
  const canChat = ['claimed', 'delivered', 'paid_pending'].includes(task.status) && (task.isMine || task.isMyClaim);
  /**
   * Safety controls belong exactly to the window between a claim and
   * settlement — that is when two strangers are arranging to meet. Before the
   * claim there is nobody to meet; afterwards it is over.
   */
  const isParty = task.isMine || task.isMyClaim;
  const showSafety = isParty && ['claimed', 'delivered', 'paid_pending'].includes(task.status);

  return (
    <div className="flex flex-col h-full bg-ink-50">
      <header className="shrink-0 bg-surface border-b border-ink-100 safe-top px-4 pb-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 -ml-1.5 rounded-lg text-ink-500 hover:bg-ink-100" aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-display font-bold text-lg flex-1 truncate">Task details</h1>
          <button onClick={share} className="p-1.5 rounded-lg text-ink-500 hover:bg-ink-100" aria-label="Share">
            <Share2 size={18} />
          </button>
        </div>
      </header>

      {/* The other party raised an alarm — outranks everything on screen. */}
      {sosAlert && (
        <div className="shrink-0 bg-danger text-white px-4 py-3 flex items-start gap-2.5">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[13.5px]">
              {sosAlert.by?.name || 'The other person'} raised a safety alert
            </p>
            <p className="text-[12px] text-red-50 mt-0.5 leading-relaxed">
              They have flagged a problem with your meeting. Please check on them.
            </p>
            <div className="flex gap-2 mt-2">
              {other?.id && (
                <Link
                  to={`/chat/${task.id}`}
                  className="px-3 py-1.5 rounded-lg bg-surface text-danger text-[12px] font-bold"
                >
                  Message them
                </Link>
              )}
              <a
                href="tel:112"
                className="px-3 py-1.5 rounded-lg bg-red-900/40 text-white text-[12px] font-bold"
              >
                Call 112
              </a>
            </div>
          </div>
          <button
            onClick={() => setSosAlert(null)}
            aria-label="Dismiss"
            className="shrink-0 p-1 rounded-lg hover:bg-red-900/30"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-8">
        {/* Summary */}
        <div className="card p-4">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-12 h-12 rounded-xl bg-ink-50 grid place-items-center text-2xl" aria-hidden="true">
              {cat.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-display font-bold text-lg leading-snug">{task.title}</h2>
                <BountyPill amount={task.bounty} boosted={task.boostCount > 0} size="lg" />
              </div>
              {status && <span className={`chip ${status.tone} mt-2`}>{status.label}</span>}
            </div>
          </div>

          {task.description && (
            <p className="text-sm text-ink-600 leading-relaxed mt-3 pt-3 border-t border-ink-100">
              {task.description}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-ink-100 text-xs text-ink-500">
            {task.distanceLabel && <span className="inline-flex items-center gap-1"><MapPin size={12} /> {task.distanceLabel} away</span>}
            {task.landmark && <span>{task.landmark}</span>}
            {task.minutesLeft != null && task.status === 'open' && (
              <span className="inline-flex items-center gap-1"><Clock size={12} /> expires in {task.minutesLeft}m</span>
            )}
          </div>
        </div>

        {/* People */}
        <div className="card p-4 space-y-3">
          <PersonRow label="Posted by" person={task.wisher} isYou={task.isMine} />
          {task.volunteer && (
            <div className="pt-3 border-t border-ink-100">
              <PersonRow label="Accepted by" person={task.volunteer} isYou={task.isMyClaim} />
            </div>
          )}
        </div>

        {/* Map */}
        {lat != null && (
          <div>
            <TaskMap
              center={{ lat, lng }}
              singlePin={{ lat, lng, label: task.bounty, title: task.title }}
              showMe={false}
              height={180}
              zoom={task.isExactLocation ? 16 : 14}
            />
            {!task.isExactLocation && (
              <p className="text-xs text-ink-500 mt-2 flex items-center gap-1.5">
                <Shield size={12} />
                The approximate area is shown. The exact spot is revealed once you claim it.
              </p>
            )}
            {task.isExactLocation && task.address && (
              <p className="text-xs text-ink-600 mt-2 font-medium">{task.address}</p>
            )}
          </div>
        )}

        {/* Safety, while the two of you are arranging to meet. */}
        {showSafety && <SafetyBar task={task} />}

        {/* ---- Stage-specific actions ---- */}

        {task.status === 'open' && !task.isMine && (
          <div className="card p-4">
            {user?.isRestricted ? (
              <p className="text-sm text-danger font-medium text-center">
                Your account is restricted, so you cannot claim tasks right now.
              </p>
            ) : !user?.hasUpi ? (
              <div className="text-center">
                <p className="text-sm text-ink-600 mb-3">
                  Add your UPI ID first — that is how the wisher pays you.
                </p>
                <Link to="/profile" className="btn-dark btn-md w-full">Add UPI ID</Link>
              </div>
            ) : (
              <>
                <button onClick={claim} disabled={busy} className="btn-primary btn-lg w-full">
                  {busy ? <Spinner size={18} /> : <>Accept for ₹{task.bounty}</>}
                </button>
                <p className="text-xs text-ink-500 text-center mt-2.5 leading-relaxed">
                  Accepting removes this from everyone else's feed instantly.
                  Abandoning it afterwards costs trust points.
                </p>
              </>
            )}
          </div>
        )}

        {task.status === 'open' && task.isMine && (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setSheet('boost')} className="btn-dark btn-md">
              <TrendingUp size={16} /> Raise bounty
            </button>
            <button onClick={() => setSheet('cancel')} className="btn-outline btn-md">
              <X size={16} /> Cancel
            </button>
          </div>
        )}

        {/* Handshake — wisher shows, volunteer types */}
        {task.status === 'claimed' && task.isMine && task.handshakeCode && (
          <div className="card p-5 text-center border-2 border-brand-300 bg-brand-50">
            <KeyRound className="mx-auto text-brand-600 mb-2" size={22} />
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">
              Show this code when they arrive
            </p>
            <p className="font-display font-extrabold text-5xl tracking-[0.15em] text-ink-900 my-3 tabular-nums">
              {task.handshakeCode}
            </p>
            <p className="text-xs text-brand-800 leading-relaxed">
              Read it out only once the task is actually done. Entering it is how
              the volunteer proves they turned up — never share it in the chat.
            </p>
          </div>
        )}

        {task.status === 'claimed' && task.isMyClaim && (
          <div className="card p-5">
            <p className="font-semibold text-center mb-1">Finished the task?</p>
            <p className="text-xs text-ink-500 text-center mb-4 leading-relaxed">
              Ask them for their 4-digit code and enter it here to unlock payment.
            </p>
            <input
              inputMode="numeric" maxLength={4} value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, ''))}
              className="input text-center font-display font-extrabold text-3xl tracking-[0.4em] tabular-nums"
              placeholder="0000" aria-label="Handshake code"
            />
            <button onClick={verifyCode} disabled={busy || codeInput.length !== 4}
                    className="btn-primary btn-lg w-full mt-3">
              {busy ? <Spinner size={18} /> : 'Verify code'}
            </button>
          </div>
        )}

        {/* Payment */}
        {['delivered', 'paid_pending'].includes(task.status) && task.isMine && (
          <UpiQr
            payment={payment}
            onPaid={markPaid}
            paying={busy}
            alreadyPaid={task.payment?.wisherMarkedPaid}
          />
        )}

        {task.status === 'delivered' && task.isMyClaim && (
          <div className="card p-5 text-center">
            <Clock className="mx-auto text-ink-400 mb-2" size={22} />
            <p className="font-semibold">Waiting for payment</p>
            <p className="text-sm text-ink-500 mt-1 leading-relaxed">
              They can see your UPI QR for ₹{task.bounty}. You will be asked to
              confirm once the money arrives.
            </p>
            <button onClick={reportNonPayment} disabled={busy}
                    className="btn-outline btn-sm mt-4 w-full text-danger border-danger/30">
              They have not paid me
            </button>
          </div>
        )}

        {task.status === 'paid_pending' && task.isMyClaim && (
          <div className="card p-5 border-2 border-success/30 bg-success/5">
            <CheckCircle2 className="mx-auto text-success mb-2" size={26} />
            <p className="font-semibold text-center">They say they sent ₹{task.bounty}</p>
            <p className="text-sm text-ink-600 text-center mt-1 mb-4 leading-relaxed">
              Check your UPI app before confirming. Only confirm if the money actually arrived.
            </p>
            <button onClick={confirmReceipt} disabled={busy} className="btn-primary btn-lg w-full">
              {busy ? <Spinner size={18} /> : 'Yes, I received it'}
            </button>
            <button onClick={() => setSheet('dispute')} className="btn-ghost btn-sm w-full mt-2">
              I have not received anything
            </button>
          </div>
        )}

        {task.status === 'paid_pending' && task.isMine && (
          <div className="card p-5 text-center">
            <Clock className="mx-auto text-ink-400 mb-2" size={22} />
            <p className="font-semibold">Waiting for them to confirm</p>
            <p className="text-sm text-ink-500 mt-1 leading-relaxed">
              The task settles once {task.volunteer?.name} confirms the money arrived.
            </p>
          </div>
        )}

        {task.status === 'settled' && (
          <div className="card p-5 text-center border-2 border-success/30 bg-success/5">
            <CheckCircle2 className="mx-auto text-success mb-2" size={28} />
            <p className="font-display font-bold text-lg">Settled</p>
            <p className="text-sm text-ink-600 mt-1">
              ₹{task.bounty} paid directly. Both sides confirmed.
            </p>
            {(task.isMine || task.isMyClaim) && !myReview && (
              <button onClick={() => setSheet('review')} className="btn-primary btn-md w-full mt-4">
                <Star size={16} /> Rate {other?.name}
              </button>
            )}
            {myReview && (
              <p className="text-sm text-ink-500 mt-3">
                You rated them {myReview.rating}★
              </p>
            )}
          </div>
        )}

        {task.status === 'disputed' && (
          <div className="card p-5 text-center border-2 border-danger/30 bg-danger/5">
            <AlertTriangle className="mx-auto text-danger mb-2" size={24} />
            <p className="font-semibold">Under review</p>
            <p className="text-sm text-ink-600 mt-1 leading-relaxed">
              An admin is looking at this. The chat history has been kept as evidence.
            </p>
          </div>
        )}

        {/* Chat */}
        {canChat && (
          <Link to={`/chat/${id}`} className="btn-dark btn-lg w-full">
            <MessageCircle size={18} />
            Chat with {other?.name?.split(' ')[0] || 'them'}
          </Link>
        )}

        {/* Secondary actions */}
        {(task.isMine || task.isMyClaim) && ['claimed', 'delivered'].includes(task.status) && (
          <div className="flex gap-2">
            <button onClick={() => setSheet('cancel')} className="btn-ghost btn-sm flex-1">
              {task.isMyClaim ? 'Withdraw' : 'Cancel task'}
            </button>
            <button onClick={() => setSheet('dispute')} className="btn-ghost btn-sm flex-1 text-danger">
              Report a problem
            </button>
          </div>
        )}
      </div>

      {/* ---- Sheets ---- */}

      <Sheet open={sheet === 'boost'} onClose={() => setSheet(null)} title="Raise the bounty">
        <p className="text-sm text-ink-600 mb-4">
          Nobody biting? A higher bounty puts this back at the top and buys another 90 minutes.
        </p>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[10, 20, 50, 100].map((a) => (
            <button key={a} onClick={() => setBoostAmount(a)}
                    className={`h-12 rounded-xl font-semibold ${boostAmount === a ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600'}`}>
              +₹{a}
            </button>
          ))}
        </div>
        <p className="text-sm text-ink-500 mb-4">
          New bounty: <strong className="text-ink-900">₹{task.bounty + Number(boostAmount)}</strong>
        </p>
        <button onClick={boost} disabled={busy} className="btn-primary btn-lg w-full mb-4">
          {busy ? <Spinner size={18} /> : `Raise to ₹${task.bounty + Number(boostAmount)}`}
        </button>
      </Sheet>

      <Sheet open={sheet === 'cancel'} onClose={() => setSheet(null)}
             title={task.isMyClaim ? 'Withdraw from this task' : 'Cancel this task'}>
        <p className="text-sm text-ink-600 mb-4 leading-relaxed">
          {task.isMyClaim
            ? 'Someone is counting on you. Withdrawing after accepting costs 15 trust points and the task goes back on the feed.'
            : task.volunteer
              ? `${task.volunteer.name} has already committed their time. Cancelling now costs 10 trust points.`
              : 'Nobody has claimed this yet, so cancelling is free.'}
        </p>
        <textarea rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
                  className="textarea mb-4" placeholder="Reason (optional)" maxLength={200} />
        <button onClick={cancel} disabled={busy} className="btn-danger btn-lg w-full mb-4">
          {busy ? <Spinner size={18} /> : task.isMyClaim ? 'Withdraw anyway' : 'Cancel task'}
        </button>
      </Sheet>

      <Sheet open={sheet === 'dispute'} onClose={() => setSheet(null)} title="Report a problem">
        <div className="space-y-2 mb-4">
          {DISPUTE_REASONS.map((r) => (
            <button key={r.value} onClick={() => setDisputeReason(r.value)}
                    className={`w-full p-3 rounded-xl text-left text-sm font-medium transition-colors
                                ${disputeReason === r.value ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-700'}`}>
              {r.label}
            </button>
          ))}
        </div>
        <textarea rows={3} value={disputeDetail} onChange={(e) => setDisputeDetail(e.target.value)}
                  className="textarea mb-3" placeholder="What happened?" maxLength={600} />
        <p className="text-xs text-ink-500 mb-4 leading-relaxed">
          Your chat history is kept for 7 days so an admin can check both sides.
          Raising a dispute that gets dismissed costs you trust points too.
        </p>
        <button onClick={raiseDispute} disabled={busy} className="btn-danger btn-lg w-full mb-4">
          {busy ? <Spinner size={18} /> : 'Submit report'}
        </button>
      </Sheet>

      <Sheet open={sheet === 'review'} onClose={() => setSheet(null)} title={`Rate ${other?.name || 'them'}`}>
        <div className="flex justify-center gap-2 my-4">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setRating(n)} aria-label={`${n} stars`}>
              <Star size={34} className={n <= rating ? 'fill-brand-400 text-brand-400' : 'text-ink-200'} />
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 justify-center mb-4">
          {(rating >= 3 ? REVIEW_TAGS.positive : REVIEW_TAGS.negative).map((t) => (
            <button key={t}
                    onClick={() => setReviewTags((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t].slice(0, 4))}
                    className={`chip px-3 py-1.5 capitalize ${reviewTags.includes(t) ? 'bg-ink-900 text-ink-50' : 'bg-ink-100 text-ink-600'}`}>
              {t}
            </button>
          ))}
        </div>

        <textarea rows={3} value={reviewComment} onChange={(e) => setReviewComment(e.target.value)}
                  className="textarea mb-4" placeholder="Anything worth adding? (optional)" maxLength={300} />

        <p className="text-xs text-ink-500 mb-4 text-center">
          4–5 stars adds trust points. 1–2 removes them.
        </p>

        <button onClick={submitReview} disabled={busy} className="btn-primary btn-lg w-full mb-4">
          {busy ? <Spinner size={18} /> : 'Submit rating'}
        </button>
      </Sheet>
    </div>
  );
}

function PersonRow({ label, person, isYou }) {
  if (!person) return null;
  return (
    <div className="flex items-center gap-3">
      <Avatar name={person.name} color={person.avatarColor} src={person.avatar} size={40} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-ink-400 font-medium">{label}</p>
        <p className="font-semibold truncate">
          {person.name} {isYou && <span className="text-ink-400 font-normal">(you)</span>}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <TrustBadge score={person.trustScore} badge={person.badge} />
          {person.stats?.tasksCompleted > 0 && (
            <span className="text-[11px] text-ink-500">{person.stats.tasksCompleted} done</span>
          )}
        </div>
      </div>
      {!isYou && (
        <Link to={`/profile/${person.id}`} className="text-xs font-semibold text-brand-600 shrink-0">
          View
        </Link>
      )}
    </div>
  );
}
