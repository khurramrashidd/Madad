import { getCachedFeed, cacheFeed } from '../db/offline.js';

/**
 * Tiny fetch wrapper. No axios — one dependency fewer in the APK and we need
 * custom offline behaviour anyway.
 *
 * VITE_API_URL empty  → relative '/api', handled by the Vite dev proxy.
 * VITE_API_URL set    → absolute, which is what the Capacitor APK needs since
 *                       an installed app has no dev server to proxy through.
 * VITE_API_FALLBACKS  → more addresses for the same laptop, comma separated.
 *
 * The phone build gets several ways to reach the laptop: the USB tunnel
 * (http://localhost:5000) and the laptop's Wi-Fi address(es). Whichever one
 * answers is used, and if it stops answering the others are tried — so
 * unplugging the cable on the same Wi-Fi does not leave the app "offline".
 */
const clean = (u) => String(u || '').trim().replace(/\/$/, '');
const CANDIDATES = [
  ...new Set(
    [import.meta.env.VITE_API_URL, ...String(import.meta.env.VITE_API_FALLBACKS || '').split(',')]
      .map(clean)
      .filter(Boolean)
  ),
];
const SERVER_KEY = 'madad_server';

let base = (() => {
  try {
    const saved = localStorage.getItem(SERVER_KEY);
    if (saved && CANDIDATES.includes(saved)) return saved;
  } catch {
    /* private mode */
  }
  return CANDIDATES[0] || '';
})();

export const serverCandidates = CANDIDATES;
export const getServerBase = () => base;
export const getApiRoot = () => (base ? `${base}/api` : '/api');
export const getSocketUrl = () => base || undefined;

/** True if this address answers as a Madad backend within the time limit. */
async function probe(candidate, ms = 3500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(`${candidate}/api/health`, { signal: controller.signal, cache: 'no-store' });
    const data = await res.json();
    return res.ok && data?.service === 'madad-api';
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

let discovering = null;

/**
 * Tries every known address at once and switches to the first that answers.
 * Resolves true if some address works. With a single address there is
 * nothing to choose, so this only reports whether that one works.
 */
export function discoverServer() {
  if (discovering) return discovering;
  discovering = (async () => {
    if (CANDIDATES.length < 2) return CANDIDATES.length === 1 ? probe(CANDIDATES[0]) : false;
    try {
      const winner = await Promise.any(
        CANDIDATES.map((c) => probe(c).then((ok) => (ok ? c : Promise.reject(new Error('no')))))
      );
      if (winner !== base) {
        base = winner;
        try {
          localStorage.setItem(SERVER_KEY, winner);
        } catch {
          /* private mode */
        }
        window.dispatchEvent(new CustomEvent('madad:server-changed', { detail: { base: winner } }));
      }
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    discovering = null;
  });
  return discovering;
}

const TOKEN_KEY = 'madad_token';

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
export const setToken = (t) => {
  try {
    t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode */
  }
};

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
    this.isOffline = status === 0;
  }
}

async function requestOnce(path, { method = 'GET', body, headers = {}, signal, timeout = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const token = getToken();

  try {
    const res = await fetch(`${getApiRoot()}${path}`, {
      method,
      headers: {
        ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      signal: signal || controller.signal,
    });

    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new ApiError('The server sent something unexpected', res.status);
    }

    if (!res.ok) {
      // An expired or invalid token should log the user out cleanly rather
      // than leaving the app in a half-signed-in state.
      if (res.status === 401 && token) {
        setToken(null);
        window.dispatchEvent(new CustomEvent('madad:unauthorized'));
      }
      throw new ApiError(data.message || `Request failed (${res.status})`, res.status, data.details);
    }

    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err.name === 'AbortError') {
      throw new ApiError('That took too long. Check your connection.', 0);
    }
    // fetch() only rejects like this when the network itself is unreachable.
    throw new ApiError('You appear to be offline', 0);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One request, and if the laptop could not be reached at all, one more try
 * after looking for it at its other addresses.
 */
async function request(path, opts = {}) {
  try {
    return await requestOnce(path, opts);
  } catch (err) {
    if (err.isOffline && CANDIDATES.length > 1 && !opts.signal) {
      const before = base;
      if ((await discoverServer()) && base !== before) return requestOnce(path, opts);
    }
    // Let the offline engine know right away, instead of at its next check.
    if (err.isOffline && path !== '/health') window.dispatchEvent(new CustomEvent('madad:unreachable'));
    throw err;
  }
}

const get = (p, o) => request(p, { ...o, method: 'GET' });
const post = (p, body, o) => request(p, { ...o, method: 'POST', body });
const patch = (p, body, o) => request(p, { ...o, method: 'PATCH', body });
const put = (p, body, o) => request(p, { ...o, method: 'PUT', body });

export const api = {
  request, get, post, patch, put,

  config: () => get('/config'),
  health: () => get('/health', { timeout: 5000 }),

  auth: {
    register: (data) => post('/auth/register', data),
    login: (data) => post('/auth/login', data),
    requestOtp: (phone) => post('/auth/otp/request', { phone }),
    verifyOtp: (data) => post('/auth/otp/verify', data),
    me: () => get('/auth/me'),
    /**
     * Development only. Defined inside a build-time branch so the route string
     * is not even present in a production bundle — the server 404s it there
     * anyway, but there is no reason to advertise it.
     */
    ...(__DEMO_TOOLS__
      ? {
          demoAccounts: () => get('/auth/demo-accounts'),
          demoRecentre: (lat, lng) => post('/auth/demo-recentre', { lat, lng }, { timeout: 20000 }),
        }
      : {}),
  },

  tasks: {
    /**
     * Feed with a cache fallback. Offline, we return the last good list and
     * flag it, so the UI can say "showing cached tasks" instead of failing.
     */
    async feed(params = {}) {
      const qs = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
      ).toString();
      try {
        const data = await get(`/tasks${qs ? `?${qs}` : ''}`);
        cacheFeed(data.tasks || []);
        return { ...data, fromCache: false };
      } catch (err) {
        if (err.isOffline) {
          const cached = await getCachedFeed();
          if (cached.length) return { success: true, tasks: cached, fromCache: true, count: cached.length };
        }
        throw err;
      }
    },
    mine: () => get('/tasks/mine'),
    one: (id, params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return get(`/tasks/${id}${qs ? `?${qs}` : ''}`);
    },
    create: (data) => post('/tasks', data),
    claim: (id) => post(`/tasks/${id}/claim`),
    handshake: (id, code) => post(`/tasks/${id}/handshake`, { code }),
    payment: (id) => get(`/tasks/${id}/payment`),
    markPaid: (id, reference) => post(`/tasks/${id}/paid`, { reference }),
    confirm: (id) => post(`/tasks/${id}/confirm`),
    boost: (id, amount) => post(`/tasks/${id}/boost`, { amount }),
    cancel: (id, reason) => post(`/tasks/${id}/cancel`, { reason }),
    reportNonPayment: (id) => post(`/tasks/${id}/no-payment`),
    dispute: (id, data) => post(`/tasks/${id}/dispute`, data),
  },

  chat: {
    rooms: () => get('/chat'),
    messages: (taskId) => get(`/chat/${taskId}`),
    send: (taskId, body) => post(`/chat/${taskId}`, { body }),
  },

  users: {
    updateMe: (data) => patch('/users/me', data),
    updateLocation: (lng, lat, city) => put('/users/me/location', { lng, lat, city }),
    profile: (id) => get(`/users/${id}`),
    trust: () => get('/users/me/trust'),
    leaderboard: (scope = 'trust') => get(`/users/leaderboard?scope=${scope}`),
    block: (id) => post(`/users/${id}/block`),
    notifications: () => get('/users/me/notifications'),
    readNotifications: () => post('/users/me/notifications/read'),
    savePush: (subscription) => post('/users/me/push', { subscription }),
  },

  /** Location services the browser can't do for itself — see geoController. */
  geo: {
    // Short timeout: this is a fallback, and a slow fallback is no better
    // than no fallback when the user is staring at an empty feed.
    ip: () => get('/geo/ip', { timeout: 6000 }),
    reverse: (lat, lng) => get(`/geo/reverse?lat=${lat}&lng=${lng}`, { timeout: 6000 }),
    search: (q) => get(`/geo/search?q=${encodeURIComponent(q)}`, { timeout: 10000 }),
  },

  safety: {
    startTrip: (taskId, note) => post(`/safety/trip/${taskId}`, { note }),
    reportPosition: (token, lng, lat) => put(`/safety/trip/${token}/position`, { lng, lat }),
    endTrip: (token) => post(`/safety/trip/${token}/end`),
    viewTrip: (token) => get(`/safety/trip/${token}`),
    sos: (taskId, coords) => post(`/safety/sos/${taskId}`, coords || {}),
  },

  reviews: {
    create: (taskId, data) => post(`/reviews/${taskId}`, data),
    forTask: (taskId) => get(`/reviews/task/${taskId}`),
  },

  voice: {
    status: () => get('/voice/status'),
    parse: (transcript) => post('/voice/parse', { transcript }),
    transcribe: (formData) => request('/voice/transcribe', { method: 'POST', body: formData, timeout: 30000 }),
  },

  admin: {
    stats: () => get('/admin/stats'),
    users: (params = {}) => get(`/admin/users?${new URLSearchParams(params)}`),
    adjustTrust: (id, delta, note) => post(`/admin/users/${id}/trust`, { delta, note }),
    toggleRestrict: (id, reason) => post(`/admin/users/${id}/restrict`, { reason }),
    tasks: (status) => get(`/admin/tasks${status ? `?status=${status}` : ''}`),
    disputes: () => get('/admin/disputes'),
    evidence: (id) => get(`/admin/disputes/${id}/evidence`),
    resolve: (id, verdict, note) => post(`/admin/disputes/${id}/resolve`, { verdict, note }),
  },
};

export default api;
