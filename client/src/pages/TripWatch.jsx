import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { MapPin, ShieldAlert, Clock, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { api } from '../api/client.js';
import TaskMap from '../components/TaskMap.jsx';
import Spinner from '../components/Spinner.jsx';
import { istTime } from '../lib/datetime.js';

/**
 * The watcher view for a shared trip.
 *
 * Opened by someone the user sent a link to — a parent, a flatmate, a friend
 * — who almost certainly has no Madad account and is not going to make one to
 * check that somebody got home. So this page is deliberately outside the
 * authenticated app: no login, no bottom bar, no branding chrome in the way.
 * The token in the URL is the credential.
 *
 * It shows only what a watcher needs, which is much less than the app knows:
 * a first name, a dot on a map, how far is left, and whether an alarm has
 * been raised. Not the bounty, not the other party, not the chat.
 *
 * Polling rather than a socket, on purpose: this page is opened once, watched
 * for twenty minutes and closed, often on a weak connection. A 15-second poll
 * recovers from a dropped network by itself, where a socket needs reconnect
 * logic for no real benefit at this cadence.
 */
const POLL_MS = 15000;

export default function TripWatch() {
  const { token } = useParams();
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);
  const timer = useRef(null);

  const load = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const r = await api.safety.viewTrip(token);
      setTrip(r.trip);
      setError(null);
      setLastChecked(new Date());
    } catch (err) {
      // A 404 means expired or ended — that is information, not a failure.
      setError(err.status === 404 ? 'expired' : err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    return () => clearInterval(timer.current);
  }, [token]);

  // Stop polling once the trip is over; there is nothing further to learn.
  useEffect(() => {
    clearInterval(timer.current);
    if (error === 'expired' || trip?.ended) return undefined;
    timer.current = setInterval(() => load({ silent: true }), POLL_MS);
    return () => clearInterval(timer.current);
  }, [trip?.ended, error]);

  if (loading) {
    return (
      <div className="h-full grid place-items-center bg-ink-50">
        <Spinner size={26} className="text-brand-500" />
      </div>
    );
  }

  if (error === 'expired') {
    return (
      <div className="h-full grid place-items-center bg-ink-50 px-6 text-center">
        <div>
          <div className="w-16 h-16 rounded-2xl bg-ink-100 grid place-items-center mx-auto mb-4">
            <Clock size={28} className="text-ink-400" />
          </div>
          <h1 className="font-display font-bold text-lg text-ink-900">This link has expired</h1>
          <p className="text-sm text-ink-500 mt-2 max-w-xs leading-relaxed">
            Trip links stop working once the trip ends, or after six hours. Ask them to send a new
            one if they are still out.
          </p>
        </div>
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="h-full grid place-items-center bg-ink-50 px-6 text-center">
        <div>
          <AlertTriangle size={28} className="text-danger mx-auto mb-3" />
          <h1 className="font-display font-bold text-lg text-ink-900">Couldn’t load this trip</h1>
          <p className="text-sm text-ink-500 mt-2">{error}</p>
          <button onClick={() => load()} className="btn-primary btn-md mt-5">
            <RefreshCw size={15} /> Try again
          </button>
        </div>
      </div>
    );
  }

  const { traveller, position, destination, remaining, lastReportedAt, sosRaisedAt, ended } = trip;

  return (
    <div className="flex flex-col h-full bg-ink-50">
      <header className="shrink-0 bg-surface border-b border-ink-100 safe-top px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid place-items-center w-8 h-8 rounded-xl bg-brand-600 shrink-0">
            <span className="font-display font-extrabold text-base text-white leading-none">M</span>
          </span>
          <div className="min-w-0">
            <h1 className="font-display font-bold text-[15px] text-ink-900 truncate">
              {traveller.name}’s trip
            </h1>
            <p className="text-[11px] text-ink-500">
              Shared with you through Madad
            </p>
          </div>
        </div>
      </header>

      {/* An SOS outranks everything else on the screen. */}
      {sosRaisedAt && (
        <div className="shrink-0 bg-danger text-white px-4 py-3 flex items-start gap-2.5">
          <ShieldAlert size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-[13.5px]">
              {traveller.name} raised a safety alert at {istTime(new Date(sosRaisedAt))}
            </p>
            <p className="text-[12px] text-red-50 mt-0.5 leading-relaxed">
              Try calling them. If you cannot reach them and you are worried, call 112.
            </p>
          </div>
        </div>
      )}

      {ended && !sosRaisedAt && (
        <div className="shrink-0 bg-success/10 text-ink-700 px-4 py-2.5 flex items-center gap-2">
          <CheckCircle2 size={16} className="text-success shrink-0" />
          <p className="text-[12.5px] font-medium">{traveller.name} ended the trip.</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {position ? (
          <TaskMap
            center={position}
            singlePin={destination ? { ...destination, label: '◎', title: 'Meeting point' } : null}
            height={340}
            zoom={15}
            showMe
          />
        ) : (
          <div className="card p-6 text-center">
            <MapPin size={24} className="text-ink-300 mx-auto mb-2" />
            <p className="text-[13px] font-semibold text-ink-700">No position yet</p>
            <p className="text-[12px] text-ink-500 mt-1 leading-relaxed">
              {traveller.name} has shared this trip but their phone has not reported a location yet.
            </p>
          </div>
        )}

        <div className="card p-4 space-y-3">
          {trip.taskTitle && (
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-ink-400">Doing</p>
              <p className="text-[13.5px] font-semibold text-ink-800">{trip.taskTitle}</p>
            </div>
          )}

          {trip.landmark && (
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-ink-400">
                Meeting near
              </p>
              <p className="text-[13.5px] text-ink-700">{trip.landmark}</p>
            </div>
          )}

          {remaining && (
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-ink-400">
                Distance left
              </p>
              <p className="text-[13.5px] font-semibold text-ink-800">{remaining}</p>
            </div>
          )}

          {trip.note && (
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-ink-400">
                Their note
              </p>
              <p className="text-[13px] text-ink-700 leading-relaxed">{trip.note}</p>
            </div>
          )}

          <div className="pt-2 border-t border-ink-100">
            <p className="text-[11px] text-ink-500">
              {lastReportedAt
                ? `Position updated ${istTime(new Date(lastReportedAt))}`
                : 'Waiting for a position'}
              {!ended && lastChecked && ` · checked ${istTime(lastChecked)}`}
            </p>
          </div>
        </div>

        <p className="text-[11px] text-ink-400 leading-relaxed px-1 pb-4">
          This page updates by itself every few seconds while the trip is live, and stops working
          when the trip ends or after six hours. Madad is not an emergency service — if you are
          worried about someone, call them, and call 112 if you cannot reach them.
        </p>
      </div>
    </div>
  );
}
