import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES, BADGES, TRUST_MIN, TRUST_MAX } from '../utils/constants.js';
import env from '../config/env.js';

const trustEventSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: String,
    delta: { type: Number, required: true },
    scoreAfter: Number,
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
    note: String,
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name is too short'],
      maxlength: [50, 'Name is too long'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Enter a valid email address'],
    },
    phone: {
      type: String,
      trim: true,
      unique: true,
      sparse: true, // allows multiple docs without a phone
      match: [/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'],
    },
    phoneVerified: { type: Boolean, default: false },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.USER },

    avatarColor: { type: String, default: '#F59E0B' },
    bio: { type: String, maxlength: 200, default: '' },

    /**
     * Profile photo as a data URI.
     *
     * Stored in the document rather than on disk because the free host has an
     * ephemeral filesystem — anything written there vanishes on the next
     * restart or deploy. An object store would be the right answer at scale,
     * but it means another account and another set of credentials, and the
     * client downscales to a 256 px WebP (~20-40 KB) before upload, so a
     * thousand users is tens of megabytes against Atlas's 512 MB.
     */
    avatar: { type: String, default: null, maxlength: 600_000 },

    /**
     * Who to alert if the SOS button is pressed. Never shown to other users;
     * it exists so that "I am meeting a stranger for cash" has someone on the
     * other end of it.
     */
    trustedContact: {
      name: { type: String, trim: true, maxlength: 50, default: '' },
      phone: { type: String, trim: true, default: '' },
    },

    /** UI preferences, kept server-side so they follow the user across devices. */
    preferences: {
      language: { type: String, enum: ['en', 'hi', 'hinglish'], default: 'en' },
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
      notifyNearbyTasks: { type: Boolean, default: true },
    },

    /**
     * UPI ID the volunteer gets paid on. The platform never touches money —
     * this only ever becomes a QR code the wisher scans in their own UPI app.
     */
    upiId: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/, 'Enter a valid UPI ID, e.g. name@okhdfcbank'],
      default: null,
    },

    // Last known location, used for the radius feed. GeoJSON [lng, lat].
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [env.seed.lng, env.seed.lat] },
    },
    locationUpdatedAt: Date,
    city: { type: String, default: env.seed.city },

    // ---- Trust engine ----
    trustScore: {
      type: Number,
      default: env.trust.startingScore,
      min: TRUST_MIN,
      max: TRUST_MAX,
    },
    badge: { type: String, enum: Object.values(BADGES), default: BADGES.NEWCOMER },
    isRestricted: { type: Boolean, default: false },
    restrictedReason: { type: String, default: null },
    trustHistory: { type: [trustEventSchema], default: [] },

    // ---- Counters ----
    stats: {
      tasksPosted: { type: Number, default: 0 },
      tasksCompleted: { type: Number, default: 0 },
      bountiesPaid: { type: Number, default: 0 },
      totalEarned: { type: Number, default: 0 },
      totalSpent: { type: Number, default: 0 },
      flakeCount: { type: Number, default: 0 },
      nonPaymentCount: { type: Number, default: 0 },
      ratingSum: { type: Number, default: 0 },
      ratingCount: { type: Number, default: 0 },
      currentStreak: { type: Number, default: 0 },
      bestStreak: { type: Number, default: 0 },
      lastCompletedAt: Date,
    },

    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    pushSubscriptions: { type: [mongoose.Schema.Types.Mixed], default: [] },

    lastActiveAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

userSchema.index({ location: '2dsphere' });
userSchema.index({ trustScore: -1 });
userSchema.index({ 'stats.tasksCompleted': -1 });

/** Average star rating, or null when never rated. */
userSchema.virtual('rating').get(function () {
  if (!this.stats?.ratingCount) return null;
  return Number((this.stats.ratingSum / this.stats.ratingCount).toFixed(2));
});

/** Can this user take part right now? */
userSchema.virtual('canTransact').get(function () {
  return !this.isRestricted && this.trustScore >= env.trust.restrictBelow;
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = function (entered) {
  return bcrypt.compare(entered, this.password);
};

/** Strips sensitive fields — safe to send to any client. */
userSchema.methods.toPublic = function () {
  return {
    id: this._id,
    name: this.name,
    avatarColor: this.avatarColor,
    avatar: this.avatar || null,
    bio: this.bio,
    trustScore: this.trustScore,
    badge: this.badge,
    isRestricted: this.isRestricted,
    rating: this.rating,
    city: this.city,
    stats: {
      tasksCompleted: this.stats.tasksCompleted,
      tasksPosted: this.stats.tasksPosted,
      ratingCount: this.stats.ratingCount,
      currentStreak: this.stats.currentStreak,
    },
    memberSince: this.createdAt,
  };
};

/** Fuller view for the owner of the account. */
userSchema.methods.toPrivate = function () {
  return {
    ...this.toPublic(),
    email: this.email,
    phone: this.phone,
    phoneVerified: this.phoneVerified,
    role: this.role,
    upiId: this.upiId,
    hasUpi: Boolean(this.upiId),
    location: this.location,
    restrictedReason: this.restrictedReason,
    stats: this.stats,
    canTransact: this.canTransact,
    trustedContact: this.trustedContact || { name: '', phone: '' },
    hasTrustedContact: Boolean(this.trustedContact?.phone),
    preferences: this.preferences,
  };
};

/**
 * Verification state, stated honestly.
 *
 * Deliberately does NOT claim identity verification. The OTP path in this
 * build is mocked (there is no SMS provider), so a "verified" badge here
 * would be a lie that users would reasonably rely on when deciding whether
 * to meet someone. What can be said truthfully is how much history an
 * account has, which is what these levels describe.
 */
userSchema.methods.verificationLevel = function () {
  const checks = {
    email: true, // registration requires one
    phone: Boolean(this.phone && this.phoneVerified),
    upi: Boolean(this.upiId),
    photo: Boolean(this.avatar),
    history: (this.stats?.tasksCompleted || 0) >= 3,
  };
  const score = Object.values(checks).filter(Boolean).length;
  return {
    checks,
    level: score >= 4 ? 'established' : score >= 3 ? 'building' : 'new',
  };
};

const User = mongoose.model('User', userSchema);
export default User;
