import Task from '../models/Task.js';
import User from '../models/User.js';

/**
 * Moves the demo data so it sits around a new centre point.
 *
 * The seed scatters tasks around one point. When you present somewhere else,
 * or your phone's real GPS puts you far from that point, the feed is empty
 * because every task is out of range. This shifts every task and every demo
 * user by the same offset, so the layout — which task is 300 m north of which
 * — is kept, and nothing is deleted: chats, reviews, trust history and
 * anything you created yourself all stay.
 *
 * A plain latitude/longitude shift is accurate to a few metres over the
 * distances involved (a demo spread of ~2 km).
 */

const median = (nums) => {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** The point the demo data is currently centred on, or null if there are no tasks. */
export async function currentCentre({ Task: T = Task } = {}) {
  const tasks = await T.find({}, { location: 1 }).lean();
  const pts = tasks.map((t) => t.location?.coordinates).filter((c) => Array.isArray(c) && c.length === 2);
  if (!pts.length) return null;
  return { lng: median(pts.map((p) => p[0])), lat: median(pts.map((p) => p[1])) };
}

/** Great-circle distance in km. */
export function kmBetween(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const round6 = (n) => Number(n.toFixed(6));

/** Plain per-document updates: unambiguous, and the demo has under 100 documents. */
async function shiftAll(Model, filter, dLng, dLat) {
  const docs = await Model.find(filter, { location: 1 }).lean();
  const ops = docs
    .filter((d) => Array.isArray(d.location?.coordinates) && d.location.coordinates.length === 2)
    .map((d) => ({
      updateOne: {
        filter: { _id: d._id },
        update: {
          $set: {
            'location.coordinates': [
              round6(d.location.coordinates[0] + dLng),
              round6(d.location.coordinates[1] + dLat),
            ],
          },
        },
      },
    }));
  if (ops.length) await Model.bulkWrite(ops, { ordered: false });
  return ops.length;
}

/**
 * @param {{lat:number,lng:number}} target  new centre
 * @param {string} [city]                   name to show for the demo users
 * @returns {{moved:boolean, tasks:number, users:number, fromKm:number}}
 */
export async function recentreDemo(target, city, { Task: T = Task, User: U = User } = {}) {
  if (!Number.isFinite(target?.lat) || !Number.isFinite(target?.lng)) {
    throw new Error('A valid latitude and longitude are needed');
  }
  const from = await currentCentre({ Task: T });
  if (!from) return { moved: false, tasks: 0, users: 0, fromKm: 0 };

  const dLat = target.lat - from.lat;
  const dLng = target.lng - from.lng;
  const fromKm = kmBetween(from, target);

  const tasks = await shiftAll(T, {}, dLng, dLat);
  const users = await shiftAll(U, { email: /@madad\.local$/ }, dLng, dLat);
  if (city) await U.updateMany({ email: /@madad\.local$/ }, { $set: { city: String(city).slice(0, 60) } });

  return { moved: true, tasks, users, fromKm };
}

export default recentreDemo;
