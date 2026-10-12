import { z } from 'zod';
import User from '../models/User.js';
import env from '../config/env.js';
import { signToken } from '../middleware/auth.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { recentreDemo } from '../seed/recentre.js';
import { placeName } from '../utils/placeName.js';
import { ROLES } from '../utils/constants.js';

const AVATAR_COLORS = ['#F59E0B', '#EF4444', '#10B981', '#6366F1', '#EC4899', '#14B8A6', '#F97316', '#8B5CF6'];
const pickColor = () => AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(50),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number').optional(),
  upiId: z.string().regex(/^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/, 'Enter a valid UPI ID').optional(),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

function parse(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw ApiError.badRequest(
      result.error.issues[0].message,
      result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    );
  }
  return result.data;
}

const authResponse = (user) => ({
  success: true,
  token: signToken(user._id),
  user: user.toPrivate(),
});

/** POST /api/auth/register */
export const register = asyncHandler(async (req, res) => {
  const data = parse(registerSchema, req.body);

  if (await User.findOne({ email: data.email })) {
    throw ApiError.conflict('That email is already registered');
  }
  if (data.phone && (await User.findOne({ phone: data.phone }))) {
    throw ApiError.conflict('That mobile number is already registered');
  }

  const user = await User.create({
    ...data,
    avatarColor: pickColor(),
    location: { type: 'Point', coordinates: [env.seed.lng, env.seed.lat] },
    // Operator accounts, named in ADMIN_EMAILS, get the admin role on signup.
    // Everyone else is a plain user; there is no way to request this.
    role: env.adminEmails.includes(data.email) ? ROLES.ADMIN : ROLES.USER,
  });

  res.status(201).json(authResponse(user));
});

/** POST /api/auth/login */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = parse(loginSchema, req.body);

  const user = await User.findOne({ email }).select('+password');
  // Same message either way — don't leak which emails exist.
  if (!user || !(await user.matchPassword(password))) {
    throw ApiError.unauthorized('Incorrect email or password');
  }

  /**
   * Reconcile the admin list on the way in, so adding an email to
   * ADMIN_EMAILS promotes an account that already existed — otherwise the
   * setting would only ever work for accounts created after it was set, which
   * is a confusing trap. Removing an email demotes on the next login too.
   */
  const shouldBeAdmin = env.adminEmails.includes(user.email);
  const isAdmin = user.role === ROLES.ADMIN;
  if (shouldBeAdmin !== isAdmin && (shouldBeAdmin || env.adminEmails.length)) {
    user.role = shouldBeAdmin ? ROLES.ADMIN : ROLES.USER;
    await User.updateOne({ _id: user._id }, { $set: { role: user.role } });
  }

  res.json(authResponse(user));
});

/**
 * Phone sign-in is MOCKED: there is no SMS provider, and the code is a fixed
 * value from the environment.
 *
 * That is fine on a laptop and fatal on a public URL. Hiding the code from
 * the *request* response was not enough, because `verifyOtp` still accepted
 * it — so on a deployed site, anyone who knew a phone number could sign in as
 * that account by typing 123456. An attacker does not need to be told the
 * code to try the obvious one.
 *
 * So the whole path is refused in production unless the operator explicitly
 * opts in with ALLOW_MOCK_OTP=true, which exists only so the flow can still
 * be demonstrated on a deployed build if that is wanted. Email sign-in is
 * unaffected and is what a real deployment should use.
 */
const mockOtpAllowed = () => !env.isProd || process.env.ALLOW_MOCK_OTP === 'true';

if (env.isProd && process.env.ALLOW_MOCK_OTP === 'true') {
  console.warn(
    '\n  ⚠  ALLOW_MOCK_OTP=true in production.\n' +
    `     Anyone who knows a phone number can sign in as that account using the fixed code.\n` +
    '     Remove this variable unless you are deliberately running a public demo.\n'
  );
}

const MOCK_OTP_DISABLED =
  'Phone sign-in is not available on this deployment — it needs an SMS provider. ' +
  'Please sign in with your email and password instead.';

/** POST /api/auth/otp/request */
export const requestOtp = asyncHandler(async (req, res) => {
  if (!mockOtpAllowed()) throw ApiError.badRequest(MOCK_OTP_DISABLED);

  const phone = String(req.body.phone || '').trim();
  if (!/^[6-9]\d{9}$/.test(phone)) {
    throw ApiError.badRequest('Enter a valid 10-digit mobile number');
  }

  const exists = await User.exists({ phone });

  res.json({
    success: true,
    message: `OTP sent to +91 ${phone}`,
    phone,
    isRegistered: Boolean(exists),
    ...(env.isProd ? {} : { devOtp: env.mockOtp, note: 'Development mode: OTP is fixed.' }),
  });
});

/** POST /api/auth/otp/verify */
export const verifyOtp = asyncHandler(async (req, res) => {
  // The gate that actually matters — see the note above requestOtp.
  if (!mockOtpAllowed()) throw ApiError.badRequest(MOCK_OTP_DISABLED);

  const { phone, otp, name } = req.body;

  if (!/^[6-9]\d{9}$/.test(String(phone || ''))) {
    throw ApiError.badRequest('Enter a valid 10-digit mobile number');
  }
  if (String(otp) !== env.mockOtp) {
    throw ApiError.unauthorized('That OTP is incorrect');
  }

  let user = await User.findOne({ phone });

  if (!user) {
    if (!name || String(name).trim().length < 2) {
      throw ApiError.badRequest('Tell us your name to finish signing up', [
        { field: 'name', message: 'Name is required for a new account' },
      ]);
    }
    user = await User.create({
      name: String(name).trim(),
      phone,
      /**
       * NOT marked verified.
       *
       * Passing a fixed, publicly-known code proves nothing about who holds
       * that number. Setting this true would put a "mobile verified" tick on
       * the profile that other users would reasonably weigh when deciding
       * whether to meet someone alone for cash — which makes it worse than
       * having no badge at all. It flips to true only when a real SMS
       * provider is wired in.
       */
      phoneVerified: false,
      // Placeholder credentials so phone-first users still fit the schema.
      email: `${phone}@phone.madad.local`,
      password: `otp-${phone}-${Date.now()}`,
      avatarColor: pickColor(),
      location: { type: 'Point', coordinates: [env.seed.lng, env.seed.lat] },
    });
  }

  res.json(authResponse(user));
});

/**
 * GET /api/auth/demo-accounts
 *
 * Lists the seeded demo logins so the in-app switcher can offer them.
 *
 * DEVELOPMENT ONLY. This hands out working credentials, so it refuses to
 * respond at all when NODE_ENV is production — a 404, not a 403, so a
 * deployed build does not even advertise that the route exists.
 */
export const getDemoAccounts = asyncHandler(async (req, res) => {
  if (env.isProd) throw ApiError.notFound('Route not found');

  // Only ever the accounts the seed script creates, never real signups.
  const users = await User.find({ email: /@madad\.local$/ })
    .select('name email role trustScore badge avatarColor upiId isRestricted stats')
    .sort({ role: -1, trustScore: -1 })
    .limit(12);

  const ROLE_HINTS = {
    'admin@madad.local': { hint: 'Admin dashboard and disputes', order: 9 },
    'kinza@madad.local': { hint: 'Posts tasks · has a live chat waiting', order: 1 },
    'rohan@madad.local': { hint: 'Does tasks · top of the leaderboard', order: 2 },
    'priya@madad.local': { hint: 'Posts tasks · one waiting to be paid', order: 3 },
    'ananya@madad.local': { hint: 'Does tasks · waiting to be paid', order: 4 },
    'vikram@madad.local': { hint: 'Does tasks', order: 5 },
    'sameer@madad.local': { hint: 'New here · low trust score', order: 6 },
    'deepak@madad.local': { hint: 'Restricted · cannot post or claim', order: 8 },
  };

  const accounts = users
    .map((u) => ({
      id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      trustScore: u.trustScore,
      badge: u.badge,
      avatarColor: u.avatarColor,
      hasUpi: Boolean(u.upiId),
      isRestricted: u.isRestricted,
      tasksCompleted: u.stats?.tasksCompleted || 0,
      hint: ROLE_HINTS[u.email]?.hint || '',
      order: ROLE_HINTS[u.email]?.order ?? 7,
    }))
    .sort((a, b) => a.order - b.order);

  res.json({ success: true, password: 'password123', accounts });
});

/** GET /api/auth/me */
export const getMe = asyncHandler(async (req, res) => {
  res.json({ success: true, user: req.user.toPrivate() });
});

/** POST /api/auth/logout — stateless JWT, so the client just drops the token. */
export const logout = asyncHandler(async (req, res) => {
  res.json({ success: true, message: 'Logged out' });
});

/**
 * POST /api/auth/demo-recentre   { lat, lng }
 *
 * "Move demo tasks to me": shifts the seeded demo data so it sits around the
 * caller's real position. Nothing is deleted. DEVELOPMENT ONLY — 404 in
 * production, like the demo-accounts route.
 */
export const demoRecentre = asyncHandler(async (req, res) => {
  if (env.isProd) throw ApiError.notFound('Route not found');
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw ApiError.badRequest('Invalid coordinates');
  }
  const city = (await placeName(lat, lng)) || null;
  const result = await recentreDemo({ lat, lng }, city);
  res.json({ success: true, city, ...result });
});
