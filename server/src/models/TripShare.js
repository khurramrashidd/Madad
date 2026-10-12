import mongoose from 'mongoose';
import crypto from 'crypto';

/**
 * A "someone knows where I am" link.
 *
 * Two strangers meeting in person to exchange cash is the genuinely risky
 * part of this product, and the trust score does nothing about it — a score
 * is a consequence after the fact, not a safeguard during. This is the
 * safeguard: before setting off, a user creates a share link and sends it to
 * whoever they like over WhatsApp. That person can then watch the trip
 * without needing an account.
 *
 * Design notes:
 *
 * - The token is the capability. Anyone holding the link can watch, which is
 *   the point: a parent should not have to sign up to see it. So the token is
 *   long and random, never derived from the task or user id.
 * - It expires. A share that outlives the errand becomes an ambient tracking
 *   device, so it carries a hard expiry and a TTL index that removes the
 *   document outright — not a flag, actual deletion.
 * - Only the latest position is kept, not a trail. The viewer's question is
 *   "where are they now", and storing a route history would create a far more
 *   sensitive record than the feature needs.
 */
const tripShareSchema = new mongoose.Schema(
  {
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    token: {
      type: String,
      required: true,
      unique: true,
      default: () => crypto.randomBytes(16).toString('base64url'),
    },

    /** Latest reported position only — deliberately not a trail. */
    lastPosition: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: undefined },
    },
    lastReportedAt: Date,

    /** The meeting point, so a watcher can see progress toward it. */
    destination: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: undefined },
    },

    note: { type: String, maxlength: 200, default: '' },
    sosRaisedAt: Date,
    endedAt: Date,

    /**
     * Hard stop. A task expires in 90 minutes and an errand rarely runs past
     * a couple of hours, so 6 hours is generous while still bounded.
     */
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 6 * 60 * 60 * 1000),
    },
  },
  { timestamps: true }
);

// MongoDB deletes the document itself once expiresAt passes — no cron job to
// forget to run, and no stale share quietly still resolving.
tripShareSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

tripShareSchema.virtual('isLive').get(function () {
  return !this.endedAt && this.expiresAt > new Date();
});

const TripShare = mongoose.model('TripShare', tripShareSchema);
export default TripShare;
