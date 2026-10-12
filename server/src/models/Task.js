import mongoose from 'mongoose';
import {
  TASK_STATUS,
  TASK_CATEGORIES,
  TASK_EXPIRY_MINUTES,
} from '../utils/constants.js';
import env from '../config/env.js';

const timelineSchema = new mongoose.Schema(
  {
    event: { type: String, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: String,
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Give your task a title'],
      trim: true,
      minlength: [5, 'Title is too short'],
      maxlength: [90, 'Title is too long'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [600, 'Description is too long'],
      default: '',
    },
    category: {
      type: String,
      enum: TASK_CATEGORIES,
      default: 'other',
      index: true,
    },

    bounty: {
      type: Number,
      required: [true, 'Set a bounty amount'],
      min: [env.minBounty, `Bounty must be at least ₹${env.minBounty}`],
      max: [env.maxBounty, `Bounty cannot exceed ₹${env.maxBounty}`],
    },
    /** Times the wisher raised the bounty to attract a volunteer. */
    boostCount: { type: Number, default: 0 },
    originalBounty: Number,

    wisher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    volunteer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    status: {
      type: String,
      enum: Object.values(TASK_STATUS),
      default: TASK_STATUS.OPEN,
      index: true,
    },

    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: {
        type: [Number], // [lng, lat]
        required: true,
        validate: {
          validator: (v) =>
            Array.isArray(v) &&
            v.length === 2 &&
            v[0] >= -180 && v[0] <= 180 &&
            v[1] >= -90 && v[1] <= 90,
          message: 'Coordinates must be [longitude, latitude]',
        },
      },
    },
    address: { type: String, trim: true, maxlength: 200, default: '' },
    landmark: { type: String, trim: true, maxlength: 120, default: '' },

    /**
     * Four-digit handshake code. The wisher's screen shows it; the volunteer
     * types it in. Proves the two actually met, so completion can't be faked
     * from a bedroom. Never sent to the volunteer over the API.
     */
    handshakeCode: { type: String, select: false },
    handshakeVerifiedAt: Date,

    // ---- Two-sided payment settlement ----
    payment: {
      wisherMarkedPaidAt: Date,
      volunteerConfirmedAt: Date,
      method: { type: String, default: 'upi_direct' },
      /** Snapshot of the volunteer's UPI ID at settlement time. */
      upiIdUsed: String,
      reference: String, // optional UTR the wisher types in
    },

    createdVia: { type: String, enum: ['form', 'voice', 'offline_sync'], default: 'form' },
    voiceTranscript: { type: String, default: null },

    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + TASK_EXPIRY_MINUTES * 60 * 1000),
      index: true,
    },
    claimedAt: Date,
    settledAt: Date,
    cancelledAt: Date,
    cancelReason: String,

    /** Idempotency key so an offline task queued twice isn't posted twice. */
    clientRef: { type: String, index: true, sparse: true },

    viewCount: { type: Number, default: 0 },
    timeline: { type: [timelineSchema], default: [] },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

taskSchema.index({ location: '2dsphere' });
taskSchema.index({ status: 1, createdAt: -1 });
taskSchema.index({ status: 1, category: 1 });
taskSchema.index({ title: 'text', description: 'text', landmark: 'text' });

/** Is this task still claimable? */
taskSchema.virtual('isOpen').get(function () {
  return this.status === TASK_STATUS.OPEN && this.expiresAt > new Date();
});

/** Settlement needs BOTH sides to confirm. */
taskSchema.virtual('isFullyPaid').get(function () {
  return Boolean(this.payment?.wisherMarkedPaidAt && this.payment?.volunteerConfirmedAt);
});

taskSchema.virtual('minutesLeft').get(function () {
  if (this.status !== TASK_STATUS.OPEN) return null;
  return Math.max(0, Math.round((this.expiresAt - Date.now()) / 60000));
});

taskSchema.methods.log = function (event, by, note) {
  this.timeline.push({ event, by, note });
  return this;
};

const Task = mongoose.model('Task', taskSchema);
export default Task;
