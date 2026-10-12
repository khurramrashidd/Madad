import { Link } from 'react-router-dom';
import { MapPin, Clock, Mic } from 'lucide-react';
import Avatar from './Avatar.jsx';
import TrustBadge from './TrustBadge.jsx';
import BountyPill from './BountyPill.jsx';
import { categoryMeta, STATUS_META } from '../utils/constants.js';

/**
 * A task on the feed. A volunteer decides on two things — how much, and how
 * far — so the bounty and the distance carry the most weight.
 */
export default function TaskCard({ task, isNew = false, showStatus = false }) {
  const cat = categoryMeta(task.category);
  const status = STATUS_META[task.status];
  const urgent = task.minutesLeft != null && task.minutesLeft <= 15;

  return (
    <Link
      to={`/task/${task.id}`}
      className={`card-interactive block p-4 ${isNew ? 'animate-pop-in ring-2 ring-brand-300' : ''}`}
    >
      <div className="flex items-start gap-3.5">
        <div
          className="shrink-0 w-11 h-11 rounded-xl bg-ink-50 border border-ink-100 grid place-items-center text-lg"
          aria-hidden="true"
        >
          {cat.icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-semibold text-ink-900 leading-snug line-clamp-2">{task.title}</h3>
            <BountyPill amount={task.bounty} boosted={task.boostCount > 0} />
          </div>

          <div className="flex items-center gap-2.5 mt-2 text-xs text-ink-500">
            {task.distanceLabel && (
              <span className="inline-flex items-center gap-1 font-medium text-ink-700">
                <MapPin size={12} className="text-brand-600" />
                {task.distanceLabel}
              </span>
            )}
            {task.landmark && (
              <span className="truncate max-w-[9rem] text-ink-400">· {task.landmark}</span>
            )}
            {task.minutesLeft != null && task.status === 'open' && (
              <span
                className={`inline-flex items-center gap-1 ml-auto font-medium
                            ${urgent ? 'text-danger' : 'text-ink-400'}`}
              >
                <Clock size={12} />
                {task.minutesLeft}m left
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-ink-100">
            <Avatar name={task.wisher?.name} color={task.wisher?.avatarColor} src={task.wisher?.avatar} size={22} />
            <span className="text-xs font-medium text-ink-600 truncate">{task.wisher?.name}</span>
            <TrustBadge score={task.wisher?.trustScore} badge={task.wisher?.badge} showScore={false} />

            {showStatus && status && <span className={`chip ${status.tone} ml-auto`}>{status.label}</span>}
            {task.createdVia === 'voice' && !showStatus && (
              <span className="chip bg-info/10 text-info ml-auto" title="Posted by voice">
                <Mic size={11} /> voice
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

export function TaskCardSkeleton() {
  return (
    <div className="card p-4">
      <div className="flex gap-3.5">
        <div className="skeleton w-11 h-11 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2.5">
          <div className="skeleton h-4 w-3/4" />
          <div className="skeleton h-3 w-1/2" />
          <div className="skeleton h-6 w-full mt-3" />
        </div>
      </div>
    </div>
  );
}
