# What changed in this round

Three things were asked for: deploy it free, fix the bugs (location above
all), and make the mobile app better to use. This is what was done, and why.

---

## Bugs fixed

### 1. Location was not being detected — four separate causes

This had more than one cause, which is why it looked intermittent.

**a. HTTPS.** Browsers expose `navigator.geolocation` only in a *secure
context* — HTTPS or `localhost`. Over `http://192.168.x.x:5173`, which is how
the app was being tested on a phone, the API either does not exist or
silently rejects, and the failure is indistinguishable from a denied
permission. Deploying on HTTPS is the largest part of the fix; the app now
also *detects* an insecure origin and says so, instead of showing generic
"turn on location" advice that cannot help.

**b. High-accuracy-only requests.** The code asked for a GPS fix
(`enableHighAccuracy: true`) with a 12-second timeout and never tried
anything else. A laptop has no GPS radio; a phone indoors may take 30+
seconds or never get a lock. The request timed out and reported failure even
though a perfectly good Wi-Fi-derived position was available in 200 ms.
It now runs a **fast coarse pass first**, paints the feed with it, then
upgrades to a precise fix in the background.

**c. Retrying a denial.** Once permission is denied, the browser never
re-prompts — so the "Try again" button could not work, ever. Permission state
is now checked up front, and a denial goes straight to the fallback with the
actual remedy ("tap the icon beside the address bar").

**d. No fallback at all.** If location failed, the user hit a dead end. There
is now a chain: manual choice → cached fix → coarse fix → GPS → IP-derived
position → configured default. Only the last link can fail, and it cannot.
A **"set my area manually"** picker (type "Kharghar", get a working feed) is
the final escape hatch.

The reasoning is written out in `client/src/lib/geo.js` and
`client/src/hooks/useGeolocation.js`.

### 2. Every new task was pushed to every user in the country

`io.emit('task:new', …)` broadcast each new task to all connected clients.
The client tried to filter by distance — but the payload was serialised with
no origin, so `distance` was always `null` and the guard never fired. Someone
in Delhi received live notifications for a ₹50 errand in Panvel.

Each socket now reports its position, and a new task is sent **only to
sockets within range, each with the distance from that person**, already
formatted. Covered by three new tests.

### 3. Anyone could sign in as anyone (critical)

`requestOtp` hid the OTP from the response in production — but `verifyOtp`
still accepted the fixed code `123456`. On a public URL, anyone who knew a
phone number could log in as that account. The whole mocked-OTP path is now
refused in production unless explicitly opted into with `ALLOW_MOCK_OTP`,
and the login screen hides the tab rather than offering a route that fails.

Related: accounts created through the mock OTP are **no longer marked
`phoneVerified`**. Passing a publicly-known fixed code proves nothing, and a
"verified" tick that users weigh when deciding whether to meet a stranger
must not be given away for free.

### 4. The deployed app would not have loaded at all

Found by running the built app in a real browser. ES module scripts are
fetched in CORS mode *even when same-origin*, so the browser sends an `Origin`
header for the app's own JavaScript. The CORS middleware — applied to every
request, not just the API — rejected it, threw, and returned a 500. Result:
the page renders and every script fails.

CORS is now scoped to `/api`, same-origin is always allowed, and a disallowed
origin is denied by withholding headers rather than by throwing a 500.

### 5. Caching bugs that would have pinned users to stale builds

Also found in the browser. `index.html` and the service worker were being
served cacheable, so a deploy would not reach anyone until they cleared
storage. Separately, the "is this a hashed asset" test looked for hex, but
Vite emits base64url hashes — so *no* asset ever got a long cache and
everything was re-downloaded on every visit.

### 6. Smaller fixes

- Socket.IO and Express had **separate, divergent CORS logic**; now one
  shared module.
- `/api/health` sat behind the rate limiter — a keep-alive pinger could
  exhaust the budget, and a 429 there makes the app believe it is offline.
- The radius was clamped to 25 km, so "nothing nearby" in a village was a
  dead end with no way to widen.
- The body limit (1 MB) was too small once profiles carry a photo.
- No CSP at all in production.
- The server would happily boot in production with the **example JWT secret**,
  which anyone reading the repo could use to forge a login token. It now
  refuses to start and says why.

---

## Deployment

One service, one HTTPS URL: Express serves the React build *and* the API.
Besides being simpler, it removes CORS entirely and puts the app on HTTPS —
which is what makes geolocation work.

- `render.yaml` — Render blueprint, free tier
- `.github/workflows/ci.yml` — tests, build, bundle check and a boot check on
  every push, so a broken deploy fails in GitHub rather than on the host
- `.github/workflows/keep-awake.yml` — optional, disabled, documented
- `ADMIN_EMAILS` — become admin without hand-editing the database
- `npm run test:prod` — 28 checks against the real production server
- Full walkthrough in **[DEPLOY.md](./DEPLOY.md)**

---

## New features

### Header, sidebar, and the location strip
Logo and menu on the left, user on the right, a time-of-day greeting, and a
context strip: **area · IST date · weather**. All three are things a user is
about to act on — the area confirms the feed is anchored correctly, the date
is in IST because they are arranging to meet today, and the weather changes
whether walking ten minutes for ₹50 is worth it.

The strip is also where location *state* lives: approximate or hand-set
positions say so, and tapping opens the picker.

Weather is Open-Meteo — no API key, no signup, called straight from the
browser so it works while the backend is cold-starting.

### Sidebar drawer
Leaderboard, notifications, reviews, earnings, safety, help, admin, theme,
language, logout — plus a profile card with trust score and UPI status. These
were previously reachable only by knowing the URL.

### Distance and radius
Distances now read the way people say them: `300 m`, `0.5 km`, `5.2 km`,
`500 km` — precision drops as distance grows. Radius options run
500 m → 2 km → 5 km → 25 km → 100 km → Anywhere, with a **"widen the search"**
button on an empty feed.

Posting a task shows exactly where it will be pinned, and warns when that pin
is approximate — a task posted from a rough IP guess can be kilometres from
the real errand.

### Safety
- **Share my trip** — a link showing live position and destination, sent over
  WhatsApp. No account needed to view it (the token is the credential), it
  expires after 6 hours, and only the latest position is stored, never a trail.
- **SOS** — alerts the other party and the operator, and offers one-tap calls
  to 112 and to your emergency contact. It states plainly that it does **not**
  contact the police, because someone who believes otherwise might delay
  calling them.
- **Emergency contact**, stored privately and never shown to the other party.
- **Pre-meet checklist.**

### Dark mode
A real one, driven by CSS variables rather than `dark:` classes on every
element — so screens written later inherit it automatically. Follows the
system by default, with light/dark/system in the sidebar. A blocking inline
script applies the theme before first paint, so there is no white flash on a
dark-mode cold start. The native Android status bar follows too.

### Languages
English, हिन्दी, and **Hinglish** — the last because many users speak Hindi
but read Latin script faster, and offering only the first two pushes exactly
those people into English they half-follow.

### Push notifications
The server side already existed (VAPID, subscription storage, pruning) but
nothing on the client ever subscribed, and the service worker had no `push`
handler — so no notification could ever arrive. Both halves are now wired up,
and new nearby tasks notify the closest 25 people rather than everyone.

### Profile
Photo upload (compressed in the browser to ~25 KB and stored in MongoDB,
because the free host's filesystem is temporary), honest **account checks**
rather than a fake "verified" badge, and an **earnings page** showing money
in, money out, completion rate and settled history.

---

## Testing

| Command | What it covers |
|---|---|
| `npm test` | 37 logic tests, no database, ~1s |
| `npm run test:e2e` | full lifecycle against a real MongoDB |
| `npm run test:prod` | 28 checks against the production server: static serving, SPA deep links, cache headers, CSP, API isolation |
| `node scripts/check-bundle.mjs` | asserts no demo credentials in the production bundle |

All of these run in CI on every push.
