import mongoose from 'mongoose';
import env from '../config/env.js';
import { connectDB, disconnectDB } from '../config/db.js';
import User from '../models/User.js';
import Task from '../models/Task.js';
import Message from '../models/Message.js';
import Review from '../models/Review.js';
import Dispute from '../models/Dispute.js';
import Notification from '../models/Notification.js';
import { generateHandshakeCode } from '../utils/geo.js';
import { TASK_STATUS, BADGES } from '../utils/constants.js';

/**
 * Demo seed.
 *
 * Builds a believable snapshot: a spread of trust scores including one
 * restricted account, tasks at every stage of the lifecycle, and a live chat.
 * Every password is "password123" so nothing has to be remembered on stage.
 *
 * Run:  npm run seed          (adds to what is there)
 *       npm run seed:reset    (wipes first)
 */

const CENTER = { lat: env.seed.lat, lng: env.seed.lng };

/** Offset a point by roughly this many metres, for realistic scatter. */
function nearby(meters, bearingDeg) {
  const R = 6378137;
  const brng = (bearingDeg * Math.PI) / 180;
  const lat1 = (CENTER.lat * Math.PI) / 180;
  const lng1 = (CENTER.lng * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(meters / R) +
      Math.cos(lat1) * Math.sin(meters / R) * Math.cos(brng)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(meters / R) * Math.cos(lat1),
      Math.cos(meters / R) - Math.sin(lat1) * Math.sin(lat2)
    );

  return [
    Number(((lng2 * 180) / Math.PI).toFixed(6)),
    Number(((lat2 * 180) / Math.PI).toFixed(6)),
  ];
}

const minutesAgo = (m) => new Date(Date.now() - m * 60 * 1000);
const daysAgo = (d) => new Date(Date.now() - d * 24 * 60 * 60 * 1000);

const USERS = [
  {
    name: 'Admin',
    email: 'admin@madad.local',
    phone: '9000000001',
    password: 'password123',
    role: 'admin',
    upiId: 'admin@okaxis',
    trustScore: 95,
    badge: BADGES.CHAMPION,
    avatarColor: '#6366F1',
    bio: 'Platform administrator.',
    stats: { tasksPosted: 0, tasksCompleted: 0, ratingSum: 0, ratingCount: 0 },
  },
  {
    name: 'Kinza Zahra',
    email: 'kinza@madad.local',
    phone: '9000000002',
    password: 'password123',
    upiId: 'kinza@okhdfcbank',
    trustScore: 88,
    badge: BADGES.TRUSTED,
    avatarColor: '#F59E0B',
    bio: 'Final year CS. Posts a lot of printout runs before deadlines.',
    stats: { tasksPosted: 14, tasksCompleted: 6, bountiesPaid: 13, totalSpent: 780, totalEarned: 310, ratingSum: 42, ratingCount: 9, currentStreak: 3, bestStreak: 5 },
  },
  {
    name: 'Rohan Mehta',
    email: 'rohan@madad.local',
    phone: '9000000003',
    password: 'password123',
    upiId: 'rohan.mehta@okicici',
    trustScore: 94,
    badge: BADGES.CHAMPION,
    avatarColor: '#10B981',
    bio: 'Bike, helmet, free evenings. I do delivery runs across campus.',
    stats: { tasksPosted: 2, tasksCompleted: 31, bountiesPaid: 2, totalSpent: 90, totalEarned: 1840, ratingSum: 141, ratingCount: 29, currentStreak: 7, bestStreak: 11 },
  },
  {
    name: 'Ananya Iyer',
    email: 'ananya@madad.local',
    phone: '9000000004',
    password: 'password123',
    upiId: 'ananya@oksbi',
    trustScore: 76,
    badge: BADGES.RELIABLE,
    avatarColor: '#EC4899',
    bio: 'Hostel B. Happy to stand in queues, I always carry a book.',
    stats: { tasksPosted: 5, tasksCompleted: 12, bountiesPaid: 5, totalSpent: 240, totalEarned: 640, ratingSum: 50, ratingCount: 11, currentStreak: 2, bestStreak: 4 },
  },
  {
    name: 'Vikram Singh',
    email: 'vikram@madad.local',
    phone: '9000000005',
    password: 'password123',
    upiId: 'vikram@okaxis',
    trustScore: 62,
    badge: BADGES.RELIABLE,
    avatarColor: '#14B8A6',
    bio: 'Gym regular — heavy lifting is genuinely my thing.',
    stats: { tasksPosted: 3, tasksCompleted: 8, bountiesPaid: 3, totalSpent: 190, totalEarned: 520, ratingSum: 30, ratingCount: 7, currentStreak: 1, bestStreak: 3 },
  },
  {
    name: 'Sameer Khan',
    email: 'sameer@madad.local',
    phone: '9000000006',
    password: 'password123',
    upiId: 'sameer@okhdfcbank',
    trustScore: 51,
    badge: BADGES.NEWCOMER,
    avatarColor: '#F97316',
    bio: 'New here, still figuring it out.',
    stats: { tasksPosted: 4, tasksCompleted: 2, bountiesPaid: 3, totalSpent: 110, totalEarned: 90, ratingSum: 11, ratingCount: 3, flakeCount: 1 },
  },
  {
    // The cautionary tale. Demonstrates the restriction mechanic live.
    name: 'Deepak Verma',
    email: 'deepak@madad.local',
    phone: '9000000007',
    password: 'password123',
    upiId: 'deepak@okicici',
    trustScore: 28,
    badge: BADGES.RESTRICTED,
    isRestricted: true,
    restrictedReason: 'Trust score fell below 40',
    avatarColor: '#EF4444',
    bio: '',
    stats: { tasksPosted: 9, tasksCompleted: 1, bountiesPaid: 4, totalSpent: 120, totalEarned: 40, ratingSum: 8, ratingCount: 5, flakeCount: 3, nonPaymentCount: 2 },
  },
  {
    name: 'Priya Nair',
    email: 'priya@madad.local',
    phone: '9000000008',
    password: 'password123',
    upiId: 'priya@okaxis',
    trustScore: 83,
    badge: BADGES.TRUSTED,
    avatarColor: '#8B5CF6',
    bio: 'MBA block. Tech help and tutoring, mostly.',
    stats: { tasksPosted: 7, tasksCompleted: 15, bountiesPaid: 7, totalSpent: 330, totalEarned: 890, ratingSum: 66, ratingCount: 14, currentStreak: 4, bestStreak: 6 },
  },
];

const TASK_BLUEPRINTS = [
  { title: 'Pick up 20 printouts from the library copy shop', category: 'printout', bounty: 40, landmark: 'Central Library', address: 'Library annexe, ground floor', dist: 280, bearing: 45, ageMin: 4 },
  { title: 'Help me carry a mini fridge up to the 3rd floor', category: 'heavy_lifting', bounty: 150, landmark: 'Hostel B', address: 'Hostel B main gate', dist: 620, bearing: 140, ageMin: 11 },
  { title: 'Stand in the bank queue and collect my new passbook', category: 'queue_standing', bounty: 120, landmark: 'SBI Branch', address: 'Ground floor, admin block', dist: 900, bearing: 200, ageMin: 19 },
  { title: 'Drop this envelope at the placement office before 5pm', category: 'delivery', bounty: 60, landmark: 'Placement Cell', address: 'Block C, 2nd floor', dist: 430, bearing: 310, ageMin: 27 },
  { title: 'Buy paracetamol and ORS from the chemist', category: 'shopping', bounty: 50, landmark: 'Main Gate Chemist', address: 'Outside main gate', dist: 1200, bearing: 85, ageMin: 35 },
  { title: 'Walk my labrador for 30 minutes this evening', category: 'pet_care', bounty: 100, landmark: 'Staff Quarters', address: 'Quarters 12B', dist: 1500, bearing: 255, ageMin: 42 },
  { title: 'My printer will not connect to wifi — need 15 mins of help', category: 'tech_help', bounty: 80, landmark: 'Hostel A', address: 'Room 214, Hostel A', dist: 750, bearing: 10, ageMin: 50 },
  { title: 'Explain DBMS normalization before tomorrow morning', category: 'tutoring', bounty: 200, landmark: 'Study Room 2', address: 'Library study room 2', dist: 340, bearing: 170, ageMin: 58 },
  { title: 'Collect my parcel from the security desk', category: 'delivery', bounty: 30, landmark: 'Main Security Gate', address: 'Gate 1 security cabin', dist: 1050, bearing: 120, ageMin: 8 },
  { title: 'Get 3 sets of spiral binding done for my project', category: 'printout', bounty: 70, landmark: 'Xerox Corner', address: 'Market road, shop 4', dist: 1800, bearing: 300, ageMin: 15 },
];

async function wipe() {
  await Promise.all([
    User.deleteMany({}), Task.deleteMany({}), Message.deleteMany({}),
    Review.deleteMany({}), Dispute.deleteMany({}), Notification.deleteMany({}),
  ]);
  console.log('[seed] Collections cleared');
}

async function run() {
  const reset = process.argv.includes('--reset');
  await connectDB();

  if (reset) await wipe();
  else if (await User.countDocuments()) {
    console.log('[seed] Database already has users. Use `npm run seed:reset` to start clean.');
    await disconnectDB();
    return;
  }

  // ---- Users ----
  // create() (not insertMany) so the pre-save hook hashes each password.
  const users = [];
  for (const u of USERS) {
    const doc = await User.create({
      ...u,
      city: env.seed.city,
      phoneVerified: true,
      location: { type: 'Point', coordinates: nearby(300 + Math.random() * 900, Math.random() * 360) },
      trustHistory: [
        { key: 'TASK_COMPLETED', label: 'Completed a task', delta: 4, scoreAfter: u.trustScore, at: daysAgo(2) },
      ],
    });
    users.push(doc);
  }
  const [admin, kinza, rohan, ananya, vikram, sameer, deepak, priya] = users;
  console.log(`[seed] ${users.length} users created`);

  // ---- Open tasks on the feed ----
  const posters = [kinza, priya, sameer, ananya, vikram];
  const openTasks = [];
  for (let i = 0; i < TASK_BLUEPRINTS.length; i++) {
    const b = TASK_BLUEPRINTS[i];
    const wisher = posters[i % posters.length];
    const t = await Task.create({
      title: b.title,
      description: `${b.title}. Message me once you accept and I will share the exact details.`,
      category: b.category,
      bounty: b.bounty,
      originalBounty: b.bounty,
      wisher: wisher._id,
      status: TASK_STATUS.OPEN,
      location: { type: 'Point', coordinates: nearby(b.dist, b.bearing) },
      address: b.address,
      landmark: b.landmark,
      handshakeCode: generateHandshakeCode(),
      createdAt: minutesAgo(b.ageMin),
      expiresAt: new Date(Date.now() + (90 - b.ageMin) * 60 * 1000),
      createdVia: i === 0 ? 'voice' : 'form',
      voiceTranscript: i === 0 ? 'I need someone to pick up twenty printouts from the library copy shop, I will pay forty rupees' : null,
      timeline: [{ event: 'posted', by: wisher._id, at: minutesAgo(b.ageMin) }],
    });
    openTasks.push(t);
  }
  console.log(`[seed] ${openTasks.length} open tasks on the feed`);

  // ---- A claimed task with a live chat (demo the chat instantly) ----
  const claimed = await Task.create({
    title: 'Bring me a cold coffee and a sandwich from the canteen',
    description: 'Cold coffee without sugar please, and a veg sandwich. I am stuck in the lab.',
    category: 'delivery',
    bounty: 90,
    originalBounty: 90,
    wisher: kinza._id,
    volunteer: rohan._id,
    status: TASK_STATUS.CLAIMED,
    location: { type: 'Point', coordinates: nearby(400, 65) },
    address: 'CS Lab 3, Block D',
    landmark: 'Block D',
    handshakeCode: '4827', // fixed so it can be read off a slide
    claimedAt: minutesAgo(6),
    createdAt: minutesAgo(14),
    timeline: [
      { event: 'posted', by: kinza._id, at: minutesAgo(14) },
      { event: 'claimed', by: rohan._id, at: minutesAgo(6) },
    ],
  });

  await Message.create([
    { task: claimed._id, sender: rohan._id, kind: 'system', body: 'Rohan Mehta accepted this task. Coordinate here — this chat closes once the bounty is settled.', createdAt: minutesAgo(6) },
    { task: claimed._id, sender: rohan._id, body: 'On my way to the canteen now. Cold coffee without sugar, right?', createdAt: minutesAgo(5) },
    { task: claimed._id, sender: kinza._id, body: 'Yes exactly. I am in Lab 3, Block D — second floor.', createdAt: minutesAgo(4) },
    { task: claimed._id, sender: rohan._id, body: 'Got it. Should be there in about 10 minutes.', createdAt: minutesAgo(3) },
  ]);
  console.log('[seed] 1 claimed task with a live chat');

  // ---- A delivered task awaiting payment (demo the UPI QR immediately) ----
  const delivered = await Task.create({
    title: 'Collect my registered post from the post office',
    description: 'Speed post, my ID copy is with the desk already.',
    category: 'delivery',
    bounty: 110,
    originalBounty: 110,
    wisher: priya._id,
    volunteer: ananya._id,
    status: TASK_STATUS.DELIVERED,
    location: { type: 'Point', coordinates: nearby(1100, 220) },
    address: 'Sector post office',
    landmark: 'Post Office',
    handshakeCode: '9163',
    handshakeVerifiedAt: minutesAgo(3),
    claimedAt: minutesAgo(48),
    createdAt: minutesAgo(70),
    timeline: [
      { event: 'posted', by: priya._id, at: minutesAgo(70) },
      { event: 'claimed', by: ananya._id, at: minutesAgo(48) },
      { event: 'handshake_verified', by: ananya._id, at: minutesAgo(3) },
    ],
  });
  await Message.create([
    { task: delivered._id, sender: ananya._id, kind: 'system', body: 'Ananya Iyer accepted this task.', createdAt: minutesAgo(48) },
    { task: delivered._id, sender: ananya._id, body: 'Collected it. Handing it over now — code verified.', createdAt: minutesAgo(3) },
  ]);
  console.log('[seed] 1 delivered task awaiting payment (UPI QR ready)');

  // ---- Settled history, so profiles and the leaderboard look lived-in ----
  const settledSpecs = [
    { w: kinza, v: rohan, title: 'Drop my assignment at the faculty room', bounty: 50, days: 2 },
    { w: priya, v: rohan, title: 'Pick up my laptop from the service centre', bounty: 180, days: 4 },
    { w: ananya, v: vikram, title: 'Shift two cartons to the store room', bounty: 140, days: 5 },
    { w: sameer, v: priya, title: 'Help me install Ubuntu alongside Windows', bounty: 160, days: 7 },
    { w: vikram, v: ananya, title: 'Stand in the fee counter queue', bounty: 90, days: 9 },
  ];

  for (const s of settledSpecs) {
    const t = await Task.create({
      title: s.title,
      category: 'other',
      bounty: s.bounty,
      originalBounty: s.bounty,
      wisher: s.w._id,
      volunteer: s.v._id,
      status: TASK_STATUS.SETTLED,
      location: { type: 'Point', coordinates: nearby(500 + Math.random() * 1500, Math.random() * 360) },
      handshakeCode: generateHandshakeCode(),
      handshakeVerifiedAt: daysAgo(s.days),
      claimedAt: daysAgo(s.days),
      settledAt: daysAgo(s.days),
      createdAt: daysAgo(s.days),
      payment: {
        wisherMarkedPaidAt: daysAgo(s.days),
        volunteerConfirmedAt: daysAgo(s.days),
        upiIdUsed: s.v.upiId,
      },
    });

    await Review.create([
      {
        task: t._id, reviewer: s.w._id, subject: s.v._id, role: 'wisher',
        rating: 5, comment: 'Quick and no fuss. Would ask again.',
        tags: ['punctual', 'polite'], createdAt: daysAgo(s.days),
      },
      {
        task: t._id, reviewer: s.v._id, subject: s.w._id, role: 'volunteer',
        rating: 5, comment: 'Paid immediately, clear instructions.',
        tags: ['clear', 'fast'], createdAt: daysAgo(s.days),
      },
    ]);
  }
  console.log(`[seed] ${settledSpecs.length} settled tasks with reviews`);

  // ---- An open dispute for the admin dashboard ----
  const disputed = await Task.create({
    title: 'Deliver a birthday cake to the girls hostel',
    category: 'delivery',
    bounty: 120,
    originalBounty: 120,
    wisher: deepak._id,
    volunteer: sameer._id,
    status: TASK_STATUS.DISPUTED,
    location: { type: 'Point', coordinates: nearby(800, 30) },
    handshakeCode: generateHandshakeCode(),
    handshakeVerifiedAt: daysAgo(1),
    claimedAt: daysAgo(1),
    createdAt: daysAgo(1),
  });
  await Message.create([
    { task: disputed._id, sender: sameer._id, body: 'Delivered at the gate, code verified. Please send the 120.', createdAt: daysAgo(1) },
    { task: disputed._id, sender: sameer._id, body: 'Hi, any update on the payment?', createdAt: minutesAgo(200) },
  ]);
  await Dispute.create({
    task: disputed._id,
    raisedBy: sameer._id,
    against: deepak._id,
    reason: 'not_paid',
    detail: 'Task was completed and the handshake code verified, but the bounty was never sent. No reply for a day.',
    status: 'open',
  });
  console.log('[seed] 1 open dispute for the admin dashboard');

  // ---- Notifications ----
  await Notification.create([
    { user: kinza._id, type: 'task_claimed', title: 'Your task was claimed', body: 'Rohan Mehta is on it.', task: claimed._id, link: `/task/${claimed._id}` },
    { user: priya._id, type: 'task_delivered', title: 'Task complete — time to pay', body: 'Ananya Iyer verified the handshake. Scan their UPI QR to settle ₹110.', task: delivered._id, link: `/task/${delivered._id}` },
    { user: rohan._id, type: 'review_received', title: 'Kinza Zahra rated you 5★', body: 'Quick and no fuss. Would ask again.' },
  ]);

  console.log('');
  console.log('  ╭─────────────────────────────────────────────────────╮');
  console.log('  │  Seed complete. Every password is: password123      │');
  console.log('  ╰─────────────────────────────────────────────────────╯');
  console.log('  admin@madad.local    admin dashboard, disputes');
  console.log('  kinza@madad.local    WISHER  — has a claimed task + live chat');
  console.log('  rohan@madad.local    VOLUNTEER — top of the leaderboard');
  console.log('  priya@madad.local    WISHER  — has a task awaiting UPI payment');
  console.log('  ananya@madad.local   VOLUNTEER — delivered, awaiting payment');
  console.log('  deepak@madad.local   RESTRICTED — blocked by trust score 28');
  console.log('');
  console.log(`  Demo handshake codes:  canteen run = 4827,  post office = 9163`);
  console.log(`  Map centre:            ${CENTER.lat}, ${CENTER.lng} (${env.seed.city})`);
  console.log('');

  await disconnectDB();
}

run().catch(async (err) => {
  console.error('[seed] Failed:', err);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
