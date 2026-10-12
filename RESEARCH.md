# Madad — research notes

Background research behind the changes in this round: where the product sits
in the Indian market, what comparable platforms do about trust and safety,
and the technical constraints that shaped the deployment.

Written October 2026.

---

## 1. Where Madad sits

India's hyperlocal sector is crowded, but almost entirely at one end of it.
Quick-commerce and delivery platforms — Zepto, Blinkit, Swiggy Instamart,
Porter, Borzo and the rest — are **logistics businesses**: a fleet, a
dispatcher, a commission, and a defined catalogue of things they will move.
Dunzo was the closest thing to a general "get me anything" service and it
could not make the unit economics work at scale; its collapse is now taught
as a case study.

What none of them serve is the ₹50 favour:

- the errand is **too small** to be worth a delivery fee that often exceeds
  the task value
- it is **undefined** — "stand in the Aadhaar queue for me" is not in any
  catalogue
- it is **immediate and local** — the person who should do it is three
  streets away, not dispatched from a hub

That gap is real, and it is where Madad sits. The design consequence is that
the platform must cost nothing to operate per transaction, because there is
no margin in a ₹50 errand to pay for a gateway, a dispatcher or an escrow
account. Zero-commission is not a marketing position here; it is the only
structure the economics permit.

**Implication for the product:** the ₹500 bounty cap is correct and should
stay. Raising it would invite the high-value transactions between strangers
that a reputation-only model cannot protect — and would also, at some point,
attract the regulatory attention that handling no money currently avoids.

---

## 2. Trust: what comparable platforms actually do

Peer-to-peer marketplaces converge on a recognisable "trust stack":

| Layer | What platforms do | What Madad does | Gap |
|---|---|---|---|
| Identity | Government ID + OCR + liveness selfie (Airbnb, Turo) | nothing | **large, and acknowledged** |
| Contact verification | email + phone, re-verified | email only; OTP is mocked | real |
| Reputation | two-sided reviews, visible history | trust score 0–100 + reviews | solid |
| Structural hold | payouts held until completion | none — no escrow by design | by design |
| Communication safety | contact details stripped until booking; scam-pattern monitoring | in-app chat, soft-deleted after settlement | partial |
| Fraud screening | ML on transactions | none (no transactions pass through) | not applicable |
| Progressive trust | tiered limits by verification/tenure | restriction below score 40 | partial |

Two things stand out.

**First, the structural hold is what every large platform leans on, and Madad
cannot have one.** Airbnb holds host payouts until 24 hours after check-in;
Turo pays on a schedule with a dispute window. Each sits *between* the
parties. Madad deliberately does not, which is precisely why it needs no
payment licence — but it means the trust score is carrying the entire load
that escrow carries elsewhere. That is sustainable in a closed community with
repeated interaction (a campus, a housing society) and would not be between
strangers at higher value. The README was already honest about this; it is
worth keeping that honesty prominent rather than softening it.

**Second, "verified" is a word to avoid.** Several platforms use targeted
friction — extra checks only on flagged transactions — rather than verifying
everyone. Madad verifies nobody, and the OTP flow in this build is mocked.
This round therefore renamed the profile panel from verification to
**"Account checks"** and states plainly that these are activity signals, not
identity proof. A green "Verified" tick that meant nothing would be worse
than no tick at all, because users would reasonably weigh it when deciding
whether to meet someone alone.

---

## 3. Safety: the genuinely unsolved problem

The original README listed this as limitation #7, and it was the right call —
two strangers meeting to exchange cash is the real risk, and a reputation
score does nothing about it. A score is a *consequence*, applied after
something has already happened.

What personal-safety products actually provide, and what is feasible here:

| Feature | Common in safety apps | Feasible for Madad | Built this round |
|---|---|---|---|
| Live location sharing with a trusted person | yes | yes | **yes** |
| Timed check-ins ("I should be back by 7") | yes | yes | not yet |
| One-tap emergency dial | yes | yes | **yes** |
| Alerting the counterparty | rare | yes, and useful | **yes** |
| Meet-in-public guidance | yes | yes | **yes** |
| Designated safe exchange zones | yes (police-station car parks in the US) | later, needs local partnerships | no |
| Actual emergency dispatch | only with a monitoring contract | **no** | no, and said so |

The last row matters most. A button that *looks* like it summons help, but
does not, is worse than no button — someone might delay calling 112 because
they believe help is already coming. So the SOS flow offers the 112 dialler
**first and unconditionally**, and states in plain words that Madad has no
connection to any emergency service.

The trip-share link was designed around one constraint: the person watching
it almost certainly has no Madad account and will not make one. So the token
in the URL is the credential, the page needs no login, and it expires — a
share that outlives the errand stops being a safety feature and becomes an
ambient tracking device. Only the latest position is stored, never a trail.

---

## 4. Language: why three, not two

India's smartphone growth is overwhelmingly in non-English-first users, and
the "small town and village" market this app targets is exactly that
population. But offering only English and Devanagari Hindi misses a large
group in the middle: people who **speak** Hindi but **read Latin script far
faster**, because Latin is what they type in on a phone keyboard.

Hence three options — English, हिन्दी, and Hinglish. Hinglish is not a
novelty entry; for many users it is the most readable of the three. It is
also the only one no browser will ever report in `navigator.languages`, so it
must be offered explicitly rather than detected.

Only durable UI chrome is translated. User content is never touched, and the
honest-limitation copy stays deliberately precise.

---

## 5. Technical findings that shaped the build

### Geolocation needs HTTPS — this was the root cause

Browsers expose `navigator.geolocation` only in a **secure context**: HTTPS,
or `localhost`. Over plain HTTP on a LAN address the API either does not
exist or silently rejects, and the failure is indistinguishable from a denied
permission. The app was being tested over `http://192.168.x.x:5173`, which
cannot work by design.

Deploying on HTTPS fixes the largest part of "location is not detecting".
The rest was in the acquisition strategy — see `client/src/lib/geo.js`, where
the reasoning is written out in full.

### Open-Meteo over OpenWeatherMap

| | Open-Meteo | OpenWeatherMap |
|---|---|---|
| API key | **none** | required |
| Signup | **none** | required |
| Free tier | non-commercial, generous | 60 calls/min, rate-limited |
| Called from | browser directly | would need a server proxy to hide the key |

No key means nothing to configure, nothing to leak, and — because the browser
calls it directly — the weather still appears while the backend is
cold-starting on a free host.

### Render free tier: the constraints that mattered

Checked against Render's current documentation:

- **Spins down after 15 minutes** of no traffic; ~1 minute to wake.
  WebSocket messages count as traffic, so an open app keeps itself awake.
- **750 instance hours/month** per workspace; sleeping does not consume them.
- **Ephemeral filesystem, no persistent disk on free.** This directly decided
  the avatar design: files written to disk vanish on restart, so photos are
  compressed in the browser to ~25 KB and stored in MongoDB instead. No image
  host to sign up for, nothing to lose on redeploy.
- **No shell access on free.** Seeding must be run from a laptop against the
  live Atlas URI — documented in `DEPLOY.md`.
- **Free PostgreSQL expires after 30 days** — irrelevant here, but it is the
  reason MongoDB Atlas (whose free tier does not expire) is the right choice
  rather than Render's own database.

### Single service rather than two

Beyond simplicity, serving the SPA from the API process removes a whole class
of problem: no CORS configuration, Socket.IO connects same-origin, and the
app is on HTTPS without a second certificate to think about. It also fits the
free tier, which allows one free web service per workspace.

---

## 6. What to build next

Roughly in order of value per unit of effort:

1. **Timed check-ins.** "I should be done by 7pm" — if not marked safe, the
   trusted contact is prompted. The trip-share infrastructure already built
   this round covers most of the work.
2. **Real phone verification.** The single highest-value trust upgrade, and
   the one thing on this list that costs money. MSG91 or Twilio; the code is
   structured so one function changes. Until then the honest labelling stays.
3. **Task templates.** "Printouts from the library" is posted repeatedly;
   one-tap reposting would materially cut friction.
4. **Scheduled tasks.** Currently everything expires in 90 minutes. "Tomorrow
   morning" is a common real need the model cannot express.
5. **Safe exchange zones.** Suggest a nearby public, busy landmark as the
   default meeting point rather than the poster's exact location.
6. **Community scoping.** The reputation model works best in a closed group.
   A campus or society code that scopes the feed would strengthen the whole
   trust argument rather than diluting it.

Explicitly **not** recommended: raising the bounty cap, adding an escrow or
wallet, or adding a commission. Each would break the structural reason the
platform needs no financial licence.

---

## Sources

- [Dunzo's battle for scale in India's hyperlocal delivery market](https://www.emerald.com/tcj/article-abstract/doi/10.1108/TCJ-08-2025-0302/1360016/Dunzo-s-battle-for-scale-in-India-s-hyperlocal) — Emerald, The Case Journal
- [Top 10 Hyperlocal Delivery Platforms in India](https://unicommerce.com/blog/top-hyperlocal-delivery-platforms-india/) — Unicommerce
- [Top 15 Apps Like Dunzo for Local Delivery in India](https://www.coherentlab.com/blog/apps-like-dunzo-india) — Coherent Lab
- [How Peer-to-Peer Marketplaces Vet Users: Inside the Trust Stack](https://neighborstrailer.com/blog/how-peer-to-peer-marketplaces-vet-users-inside-the-trust-stack-powering-the-sharing-economy-in-2026) — Neighbors Trailer
- [Personal Safety App Features 2026: SOS, Monitoring & More](https://www.imsafe.app/post/personal-safety-app-features-from-sos-to-senior-monitoring) — imsafe
- [The Handbook for Safe User-to-User Communications in the Sharing Economy](https://www.callr.com/blog/sharing-economy-communications/) — Callr
- [Building Trust and Loyalty in Peer-to-Peer Marketplaces](https://www.zigpoll.com/content/what-strategies-can-entrepreneurs-use-to-build-trust-and-loyalty-among-users-in-a-peertopeer-marketplace) — Zigpoll
- [Open-Meteo API documentation](https://open-meteo.com/en/docs)
- [Render free tier documentation](https://render.com/docs/free)
- [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/)
