# Madad — Zero-Commission Local Micro-Bounties

A hyper-local, real-time bulletin board. Someone posts a small task with a cash
bounty (a **Wisher**), a nearby **Volunteer** accepts it, they coordinate in a
private chat, and the Wisher pays directly over UPI.

**The platform never touches the money.** No payment gateway, no escrow, no
commission — which is precisely why it needs no financial licence. What replaces
escrow is a two-sided verification flow and an algorithmic trust score.

Built with the MERN stack (MongoDB, Express, React, Node) plus Socket.IO for
real-time, an installable PWA for offline use, and Capacitor to ship the same
codebase as an Android APK.

---

> ### Deploying it
>
> **[DEPLOY.md](./DEPLOY.md)** — free hosting, start to finish, no credit
> card. One service serving the API and the app from one HTTPS address.
>
> Being on HTTPS is not cosmetic: browsers refuse to share precise location
> with a page served over plain `http://`, so a deployed build is the only
> place GPS works properly outside `localhost`.
>
> **[CHANGELOG.md](./CHANGELOG.md)** — what changed in the latest round and
> why, including the four separate causes behind "location is not detecting".
>
> **[RESEARCH.md](./RESEARCH.md)** — market position, how comparable
> platforms handle trust and safety, and the technical constraints that
> shaped the build.

---

## Table of contents

1. [What makes this work without escrow](#1-what-makes-this-work-without-escrow)
2. [Prerequisites](#2-prerequisites)
3. [Setup — step by step](#3-setup--step-by-step)
4. [Running the app](#4-running-the-app)
5. [Demo accounts](#5-demo-accounts)
6. [Testing on a real phone](#6-testing-on-a-real-phone)
7. [Building the Android APK](#7-building-the-android-apk)
8. [Demonstrating offline mode](#8-demonstrating-offline-mode)
9. [Enabling Sarvam AI voice](#9-enabling-sarvam-ai-voice)
10. [Presentation walkthrough](#10-presentation-walkthrough)
11. [Architecture](#11-architecture)
12. [Troubleshooting](#12-troubleshooting)
13. [Honest limitations](#13-honest-limitations)

---

## 1. What makes this work without escrow

This is the part worth understanding before you present it, because it is the
first thing anyone will poke at.

A normal marketplace holds your money until the job is done. Madad does not hold
anything. So three mechanisms do that job instead:

**The handshake code.** When a task is claimed, the server generates a random
4-digit code and gives it only to the Wisher. The Volunteer must type that code
into their phone to mark the task delivered. You cannot enter a code you were
never shown, so you cannot fake a completion from your bedroom — the two people
must physically meet.

**Two-sided payment confirmation.** The Wisher taps "I have paid". That alone
settles nothing. The Volunteer must separately tap "I received it". Only when
both agree does the task settle and trust points move. Neither side can close a
transaction unilaterally, which is what makes the resulting trust score mean
something.

**The trust score.** Every verified event moves a 0–100 score: paying on time
earns points, abandoning a claimed task costs 15, failing to pay costs 25. Below
40 the account is automatically restricted — it can no longer post or claim.
Gains have diminishing returns (climbing 90→100 is much harder than 50→60), so
the score stays informative instead of everyone maxing out in a week.

Because there is no escrow, disputes are resolved socially. That is why the chat
is soft-deleted rather than destroyed at settlement: hidden from both users
immediately, retained for 7 days so an admin can read both sides, then
purged automatically by a MongoDB TTL index.

---

## 2. Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| **Node.js** | 18 or newer | `node --version` |
| **npm** | 9 or newer | ships with Node |
| **MongoDB** | 6 or newer | Community Server, running locally |
| **Git** | any | optional |

For the Android APK only:

| Requirement | Notes |
|---|---|
| **Android Studio** | you already have this from your Flutter setup |
| **JDK 17** | bundled with recent Android Studio |
| **Android SDK 34** | install via Android Studio's SDK Manager |

> Your existing Flutter installation already put the Android SDK and JDK on your
> machine. Capacitor uses exactly those, so there is nothing new to install for
> the APK.

---

## 3. Setup — step by step

> **Shortcut:** at any point, run `npm run doctor` from the project root. It
> checks Node, MongoDB, ports, your network address and the whole Android
> toolchain, then tells you exactly what is missing and the command to fix it.

### Step 1 — Install MongoDB and start it

**Windows**

1. Download MongoDB Community Server from
   <https://www.mongodb.com/try/download/community> and run the installer.
2. Tick **"Install MongoDB as a Service"** — it then starts automatically on
   boot and you never think about it again.
3. Verify it is running:
   ```powershell
   Get-Service MongoDB
   ```

**macOS**

```bash
brew tap mongodb/brew
brew install mongodb-community@7.0
brew services start mongodb-community@7.0
```

**Linux**

```bash
sudo systemctl start mongod
sudo systemctl enable mongod
```

Confirm it is listening on port 27017:

```bash
mongosh --eval "db.runCommand({ ping: 1 })"
```

You should see `{ ok: 1 }`.

### Step 2 — Install backend dependencies

```bash
cd madad/server
npm install
```

### Step 3 — Create the backend `.env`

```bash
# macOS / Linux
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
```

The demo tasks are placed around Panvel. To put them somewhere else, use a
place name (needs internet) or coordinates — nothing is deleted:

```bash
npm run move-demo -- Kharghar
npm run move-demo -- 18.9894 73.1175 Panvel
```

Or, inside the app: **Demo → Move demo tasks to me** uses your phone's GPS.
Everything else in `server/.env` works as-is for local development.

### Step 4 — (optional) add sample tasks

Madad is a real app: accounts and tasks are created by people signing up, so
you don't need to seed anything. Register an account in the app and post a task.

If you'd like a few example tasks to look at first, you can add them once:

```bash
npm run seed
```

This adds sample open tasks around the area set in `server/.env`. Delete them
any time with `npm run seed:reset` (which clears and re-seeds). Optional — skip
it for the real experience.

### Step 5 — Install frontend dependencies

```bash
cd ../client
npm install
```

### Step 6 — Create the frontend `.env`

```bash
cp .env.example .env      # Windows: Copy-Item .env.example .env
```

Leave `VITE_API_URL` **blank** for laptop development — the Vite dev server
proxies `/api` to the backend automatically. You only fill it in for phone
testing and the APK (see sections 6 and 7).

---

## 4. Running the app

**The short way** — one command does the lot:

```bash
npm start
```

It checks MongoDB, creates the `.env` files, installs anything missing, starts
both servers and opens your browser. Then create an account in the app to begin.
See [START-HERE.md](./START-HERE.md).

**The manual way** — two terminals.

**Terminal 1 — backend**

```bash
cd madad/server
npm run dev
```

You should see:

```
  ╭──────────────────────────────────────────────╮
  │   Madad API                                  │
  ╰──────────────────────────────────────────────╯
  Mode      development
  Local     http://localhost:5000/api/health
  Network   http://192.168.1.5:5000/api/health
```

Note that **Network** address — you need it for phone testing.

**Terminal 2 — frontend**

```bash
cd madad/client
npm run dev
```

Open <http://localhost:5173>.

> **Convenience:** from the project root you can run `npm install` once and then
> `npm run dev` to start both at the same time.

### Verify everything is wired up

```bash
curl http://localhost:5000/api/health
```

```json
{ "success": true, "service": "madad-api", "status": "ok" }
```

---

## 5. Accounts

There are no built-in logins — you register. Email + password, or phone with a
one-time code (in development the code is always `123456` and the app shows it
on screen; a production build would send it by SMS).

**To see the two-person flow,** register a second account on another device or
in an incognito window. One posts a task, the other claims it. Both need
location on and a UPI ID in their profile.

The optional `npm run seed` adds a handful of sample tasks (posted by example
users) so the feed isn't empty while you explore on your own. If you ran it, the
first account you register becomes an admin only if you make it one in the
database — otherwise the admin dashboard stays hidden, as it should for ordinary
users.

**Fixed handshake codes** (so you can read them off a slide):
- Canteen delivery task → `4827`
- Post office task → `9163`

---

## 6. Testing on a real phone

Both devices must be on the **same Wi-Fi network**.

1. Find your laptop's LAN IP — the backend prints it as **Network** on startup.
   Otherwise: `ipconfig` (Windows) or `ifconfig | grep inet` (macOS/Linux).

2. Edit `client/.env`:
   ```ini
   VITE_API_URL=http://192.168.1.5:5000
   ```
   Use your actual IP.

3. Restart the frontend (`Ctrl+C`, then `npm run dev`).

4. On your phone, open `http://192.168.1.5:5173`.

5. **Install it:** Chrome menu → "Add to Home screen". It now launches
   fullscreen with no browser chrome, and works offline.

> **If your firewall blocks it:** on Windows, allow Node.js through Windows
> Defender Firewall for private networks.
>
> **GPS note:** browsers only grant precise location over HTTPS or on
> `localhost`. Over plain HTTP on a LAN IP, Chrome may refuse. The app falls
> back to your last known position or the configured city centre, so the demo
> still works — but if you want real GPS on the phone, use the APK, which has
> native location permission.

---

## 7. Building the Android APK

**Full walkthrough: [ANDROID.md](./ANDROID.md)** — troubleshooting, sharing the
APK, and signed release builds.

Your Flutter setup already provides the Android SDK and JDK, so there is nothing
new to install. Plug your phone in, unlock it, keep `npm start` running, then:

```bash
npm run android:run
```

That is the equivalent of `flutter run`. It finds your SDK and your phone (and
ignores any stuck emulator), builds, installs and opens the app, and connects it
to your laptop through a **USB tunnel** (`adb reverse`) — so no IP address, no
shared Wi-Fi and no firewall rule are involved.

To build an APK to hand to someone, with no phone plugged in:

```bash
npm run android:apk      # → Madad-debug.apk in the project folder
```

> **Note:** `flutter run` does not work on this project. There is no Dart code —
> Madad is React wrapped by Capacitor.

---

## 8. Demonstrating offline mode

This demos extremely well live. Do it in this order:

1. Open the installed PWA (or APK) with a working connection so the feed caches.
2. Turn on **airplane mode**.
3. A dark bar appears: *"Offline — showing your last saved feed."* The feed is
   still there and still scrollable.
4. Tap **Post**, fill in a task, submit. It says *"Saved. This posts the moment
   you are back online."*
5. Go to **My Tasks** — the task is listed with a dashed border and a "Queued"
   chip.
6. Turn airplane mode **off**.
7. Within a few seconds the bar turns blue (*"Syncing…"*), then a toast
   confirms *"1 queued action synced"*. The task appears live on the feed on any
   other device watching.

**What is actually happening:** the feed is cached in IndexedDB, and queued
actions are stored with a `clientRef` idempotency key. On reconnect they replay
oldest-first. Because the server dedupes on that key, replaying the queue twice
cannot create duplicate tasks. `navigator.onLine` is treated only as a hint — the
app confirms with a real request to `/api/health` before declaring itself back,
because `navigator.onLine` reports "online" for captive portals and dead
gateways.

**What cannot work offline, honestly:** the live feed of other people's new
tasks, claiming a task (it needs the atomic server-side lock), and real-time
chat. Say this out loud in your presentation — it is a design boundary, not an
oversight, and naming it first is much stronger than being asked.

---

## 9. Enabling Sarvam AI voice

The app works without a Sarvam key: it falls back to the browser's built-in
Web Speech API, and the server-side parser (which extracts the bounty, category
and landmark from the transcript) runs either way.

To enable Sarvam for better Hindi and regional-language accuracy:

1. Get an API key from <https://dashboard.sarvam.ai>.
2. Add it to `server/.env`:
   ```ini
   SARVAM_API_KEY=your_key_here
   ```
3. Restart the backend.

The client reads `/api/voice/status` on load and switches strategy automatically
— no frontend change needed. If Sarvam is down mid-request, it falls back to the
browser recogniser rather than failing.

**Try saying:** *"I need someone to pick up my printouts from the library, I will
pay fifty rupees."* The parser fills in the title, sets the category to
Printouts, the bounty to ₹50, and the landmark to "library".

It also handles Hinglish: *"mujhe printout chahiye, 40 rupaye dunga."*

---

## 10. Presentation walkthrough

Roughly 6 minutes. Use two browser windows side by side (one normal, one
incognito) so both sides of a transaction are visible at once.

**Setup before you start:** register one account in window A (your "wisher")
and a second account in window B, e.g. an incognito window (your "volunteer").
Allow location in both.

1. **The problem** (30s). You need a small favour right now. Existing apps are
   built for scheduled, commissioned, high-value work. There is nothing for
   "someone please grab my printouts, I'll give you ₹50."

2. **Real-time feed** (45s). In window A, post a task. It appears in window B
   **instantly** without a refresh. Emphasise: WebSockets, not polling.

3. **Voice creation** (45s). Post another task by speaking it. Show the form
   auto-filling. This is the feature that makes it feel Indian-market-native.

4. **The claim race** (30s). In window B, accept the task. It vanishes from
   window A's feed immediately. Explain the atomic `findOneAndUpdate` — two
   volunteers cannot both be sent to the same job.

5. **Private chat** (30s). Show the ephemeral chat opening between exactly those
   two users, with typing indicators.

6. **The handshake** (60s). **This is your strongest moment.** Window A shows a
   4-digit code. Window B types it in. Explain: this proves they physically met.
   A fake completion is impossible.

7. **The UPI handshake** (60s). Window A now shows a QR code. Scan it with your
   actual phone — GPay opens with the amount and payee pre-filled. **Do not
   complete the payment**, just show the screen. Say clearly: *"The money goes
   from their bank to mine. Our server never sees a rupee, which is why we need
   no payment licence and charge no commission."*

8. **Two-sided settlement** (30s). Window A taps "I have paid" — nothing
   settles. Window B taps "I received it" — now it settles, trust scores move
   live on both screens.

9. **Trust enforcement** (45s). Explain that an account whose trust score falls
   below 40 is restricted and can no longer post or claim — the score is the
   whole enforcement mechanism. If you have an admin account, open the admin
   dashboard and show a dispute with its retained chat as evidence.

10. **Offline** (45s). Airplane mode, post a task, come back online, watch it
    sync. See section 8.

**If asked "what stops someone just not paying?"** — answer honestly: nothing
stops it once. But the volunteer reports it, the score drops 25 points, and two
offences restricts the account. It is reputation-based enforcement, the same
model early eBay ran on. Then volunteer the limitation yourself: this works for
₹50 favours in a closed community like a campus; it would not work for ₹50,000
between strangers.

---

## 11. Architecture

```
madad/
├── scripts/                    setup automation
│   ├── doctor.mjs              environment check with fixes
│   ├── set-ip.mjs              LAN IP detection → client/.env
│   ├── android-run.mjs         build → install → launch on a phone, USB tunnel
│   ├── patch-android.mjs       manifest permissions, SDK path, branding
│   └── make-keystore.mjs       release signing key
│
├── server/                     Node + Express + MongoDB
│   ├── src/
│   │   ├── config/             env parsing, DB connection
│   │   ├── models/             User, Task, Message, Review, Dispute, Notification
│   │   ├── controllers/        request handlers
│   │   ├── routes/             Express routers
│   │   ├── middleware/         JWT auth, error handling, rate limits
│   │   ├── services/           trust engine, UPI builder, Sarvam, notifications
│   │   ├── sockets/            Socket.IO: feed, chat, presence
│   │   ├── utils/              geo maths, handshake codes, constants
│   │   └── seed/               optional sample data + logic self-tests
│   └── .env.example
│
└── client/                     React + Vite + Tailwind
    ├── src/
    │   ├── api/                fetch wrapper with offline fallback
    │   ├── components/         Avatar, TaskCard, UpiQr, TaskMap, …
    │   ├── context/            Auth, Socket, Offline, Toast
    │   ├── db/                 IndexedDB cache + sync queue
    │   ├── hooks/              geolocation, voice input
    │   └── pages/              Feed, TaskDetail, Chat, Profile, Admin, …
    ├── resources/              icon + splash sources for Android
    └── capacitor.config.json   Android packaging
```

### Task lifecycle

```
open ──claim──> claimed ──handshake code──> delivered
                                                 │
                                        wisher taps "paid"
                                                 ▼
                                          paid_pending
                                                 │
                                    volunteer confirms receipt
                                                 ▼
                                             settled
```

Side paths: `expired` (nobody claimed in 90 minutes), `cancelled`, `disputed`.

### Key technical decisions

| Decision | Why |
|---|---|
| **MongoDB `$geoNear` with a 2dsphere index** | The database does the distance maths against an index instead of Node pulling every task and filtering in memory |
| **Atomic `findOneAndUpdate` for claims** | Two simultaneous claims cannot both succeed; the loser gets a clean 409 |
| **`clientRef` idempotency keys** | A replayed offline queue cannot double-post |
| **TTL index on chat messages** | MongoDB deletes expired chat itself — no cron job to forget to run |
| **Leaflet + OpenStreetMap** | Free forever, no API key, no billing card. Google Maps would need one |
| **UPI deep links, not a gateway** | Zero PCI scope, zero commission, no financial licence |
| **Fuzzed public coordinates** | The feed shows an approximate area; the exact pin unlocks only after a claim |
| **JWT on the socket handshake** | The same auth as REST; unauthenticated sockets are rejected outright |

### Testing

```bash
npm test          # 37 logic tests — no database needed, runs in a second
npm run test:e2e  # 64 end-to-end checks against a real MongoDB
npm run test:prod # 28 checks against the production server (needs a build first)
```

`npm run test:prod` is the one that catches deployment problems: it mounts
the real production server and checks that the SPA is served, that deep links
return the shell rather than a 404, that `/api` still 404s as JSON, that the
cache headers are right, and that the CSP permits what the app actually needs.
Several real bugs in this round were caught by it and by rendering the built
app in a headless browser.

`npm test` covers the UPI URI builder, the voice transcript parser, trust badge
bands, geo maths, handshake code entropy, route registration and the privacy
serializer.

`npm run test:e2e` starts the real server against a throwaway database and
drives the whole lifecycle over HTTP: registration, posting, the geo feed, two
volunteers racing to claim the same task, the handshake code gate, the UPI
link, two-sided settlement, trust movement, reviews, chat closure and access
control. It uses a separate database (`madad_e2e`) and drops it afterwards, so
your own data is never touched.

---

## 12. Troubleshooting

**`MongooseServerSelectionError` / `[db] Connection failed`**
MongoDB is not running. Windows: `Get-Service MongoDB`. macOS:
`brew services start mongodb-community@7.0`. Linux: `sudo systemctl start mongod`.

**`EADDRINUSE: port 5000 already in use`**
Something else has the port. Change `PORT=5001` in `server/.env` and
`VITE_DEV_PROXY=http://localhost:5001` in `client/.env`.

**Frontend loads but every request fails**
The backend is not running, or `VITE_API_URL` points somewhere wrong. Check
`http://localhost:5000/api/health` in a browser first.

**Feed is empty**
You have not seeded: `npm run seed`. If you seeded but are still empty, you
are more than 3 km from the demo tasks. Tap **Demo → Move demo tasks to me**,
or run `npm run move-demo -- <your area>`.

**"Add your UPI ID before claiming"**
Working as intended. Go to Profile → Settings and add any valid-format UPI ID
(e.g. `test@okhdfcbank`). It is never charged.

**Voice button does nothing**
The Web Speech API needs Chrome or Edge and a network connection. Firefox does
not support it. On the APK, make sure you added `RECORD_AUDIO` to the manifest.

**Location permission denied**
Expected over plain HTTP on a LAN IP. The app falls back gracefully. Use
`localhost` or the APK for real GPS.

**Socket keeps disconnecting**
Usually a stale token. Sign out and back in. Check the browser console for
`Invalid or expired token`.

**`npm run cap:apk` fails with a Gradle or JDK error**
Open `client/android` in Android Studio once and let it sync — it will install
whatever SDK component is missing, then the CLI build works.

---

## 13. Honest limitations

Name these in your presentation before anyone asks. It is a much stronger
position than being caught out.

1. **Non-payment is punished, not prevented.** Without escrow, a wisher can
   simply not pay. The trust score is the only deterrent. This works in a closed
   community with repeated interactions; it would not work between strangers at
   high value.

2. **Payment confirmation is self-reported.** We never see the bank
   transaction, so settlement relies on both people telling the truth. Requiring
   both sides to agree makes collusion the only way to game it, which is
   pointless — but it is not proof.

3. **The OTP is mocked.** A real deployment needs an SMS provider. The code is
   structured so only one function changes. Because the code is a fixed,
   publicly-known value, the whole phone sign-in path is **refused in
   production** — otherwise anyone who knew a phone number could sign in as
   that account. Accounts created this way are not marked phone-verified.

4. **No identity verification.** Anyone can sign up with any email. The
   profile shows **account checks** (email, UPI, photo, completed tasks), not
   verification, and says so — a "verified" tick that meant nothing would be
   worse than no tick, because people weigh it when deciding whether to meet
   a stranger alone. A production version would want real phone verification
   at minimum, and Aadhaar-based KYC for higher bounties.

5. **Offline is partial.** Browsing and posting work offline; claiming,
   real-time updates and chat cannot, by nature.

6. **No background location.** The feed updates when the app is open, not
   continuously.

7. **Safety is improved, not solved.** There is now an SOS button, live trip
   sharing to someone outside the app, a private emergency contact and a
   pre-meet checklist — see `/safety` in the app. But Madad has **no
   connection to any emergency service**: the SOS alerts the other party and
   the operator, and offers you the 112 dialler. It does not summon help, and
   the UI says so rather than implying otherwise.

8. **Push notifications are web-only.** They need a service worker, which the
   Android build deliberately disables (a stale worker keeps serving the
   previous build after a reinstall). The installed PWA gets push; the APK
   would need Firebase Cloud Messaging.

9. **Weather and place names depend on third parties.** Open-Meteo and
   Nominatim are free and keyless, but they are courtesies — both degrade
   silently to nothing rather than failing anything that matters.

---

## Licence

MIT. Built as an academic project.
