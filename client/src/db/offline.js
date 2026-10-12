import { openDB } from 'idb';

/**
 * Offline store.
 *
 * Three object stores:
 *   feed     — last successfully fetched task list, so a cold offline open
 *              still shows something real rather than an error screen
 *   queue    — actions taken while offline, replayed in order on reconnect
 *   meta     — profile snapshot, config, last sync time
 *
 * Every queued action carries a clientRef. The server treats that as an
 * idempotency key, so replaying a queue twice cannot double-post a task.
 */

const DB_NAME = 'madad-offline';
const DB_VERSION = 1;

let dbPromise = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('feed')) {
          db.createObjectStore('feed', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('queue')) {
          const store = db.createObjectStore('queue', { keyPath: 'clientRef' });
          store.createIndex('by-created', 'createdAt');
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta');
        }
      },
    });
  }
  return dbPromise;
}

/** A stable-enough unique id without pulling in a uuid dependency. */
export function makeClientRef(prefix = 'ref') {
  const rand =
    globalThis.crypto?.randomUUID?.().slice(0, 8) ||
    Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

// ---- Feed cache ----

export async function cacheFeed(tasks) {
  try {
    const db = await getDB();
    const tx = db.transaction('feed', 'readwrite');
    await tx.store.clear();
    for (const t of tasks) await tx.store.put(t);
    await tx.done;
    await setMeta('feedCachedAt', Date.now());
  } catch (err) {
    console.warn('[offline] Could not cache feed:', err);
  }
}

export async function getCachedFeed() {
  try {
    const db = await getDB();
    return await db.getAll('feed');
  } catch {
    return [];
  }
}

// ---- Action queue ----

/**
 * @param {'create_task'|'send_message'|'claim_task'} type
 * @param {object} payload
 */
export async function enqueue(type, payload) {
  const db = await getDB();
  const item = {
    clientRef: payload.clientRef || makeClientRef(type),
    type,
    payload,
    createdAt: Date.now(),
    attempts: 0,
    lastError: null,
  };
  await db.put('queue', item);
  return item;
}

export async function getQueue() {
  try {
    const db = await getDB();
    const items = await db.getAllFromIndex('queue', 'by-created');
    return items;
  } catch {
    return [];
  }
}

export async function getQueueCount() {
  try {
    const db = await getDB();
    return await db.count('queue');
  } catch {
    return 0;
  }
}

export async function dequeue(clientRef) {
  const db = await getDB();
  await db.delete('queue', clientRef);
}

export async function markAttempt(clientRef, error) {
  const db = await getDB();
  const item = await db.get('queue', clientRef);
  if (!item) return;
  item.attempts += 1;
  item.lastError = error ? String(error).slice(0, 200) : null;
  // Give up after 5 failed replays so one poisoned item can't block the queue.
  if (item.attempts >= 5) {
    await db.delete('queue', clientRef);
    return;
  }
  await db.put('queue', item);
}

export async function clearQueue() {
  const db = await getDB();
  await db.clear('queue');
}

// ---- Meta ----

export async function setMeta(key, value) {
  try {
    const db = await getDB();
    await db.put('meta', value, key);
  } catch {
    /* storage may be unavailable in private mode — never fatal */
  }
}

export async function getMeta(key) {
  try {
    const db = await getDB();
    return await db.get('meta', key);
  } catch {
    return undefined;
  }
}

export async function clearAll() {
  try {
    const db = await getDB();
    await Promise.all([db.clear('feed'), db.clear('queue'), db.clear('meta')]);
  } catch {
    /* ignore */
  }
}

export default {
  makeClientRef, cacheFeed, getCachedFeed, enqueue, getQueue, getQueueCount,
  dequeue, markAttempt, clearQueue, setMeta, getMeta, clearAll,
};
