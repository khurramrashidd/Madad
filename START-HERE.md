# Start here

Three commands. That's it.

```powershell
npm install
npm run install:all
npm start
```

`npm start` checks MongoDB, creates the config files, starts everything, and
opens your browser. If something is missing it stops and tells you exactly what
to do about it.

---

## If `npm start` says MongoDB is not running

Open PowerShell **as Administrator**:

```powershell
net start MongoDB
```

Not installed yet? Get Community Server from
<https://www.mongodb.com/try/download/community> and **tick "Install MongoDB as
a Service"** during setup. Then run `npm start` again.

---

## Once it opens

Madad is a real app, so there are no demo logins — you create an account.

1. Tap **Create an account** and fill in your name, email and a password.
2. When the browser asks for **location**, allow it. The feed is built around
   where you are, so this matters. (On a laptop the position can be rough; on a
   phone it's your real GPS.)
3. Go to **Profile → gear icon** and add a **UPI ID** (any valid-looking one,
   e.g. `yourname@okhdfcbank`). You need it before you can claim a task — it's
   how you get paid.

Post a task from the **Post** tab and it appears on the feed for anyone nearby.

---

## Seeing it work with two people

You cannot claim your own task — the app hides your own posts from your feed,
because claiming your own errand would be meaningless. So the real flow needs
two people.

The easiest way: **register a second account somewhere else** — on your phone,
or a second browser (or an incognito window). One account posts a task, the
other sees it on the feed and claims it. Both must have location on, and be
near enough to each other (within the distance filter, up to 10 km).

Then the two coordinate in the private chat, the poster shows a 4-digit code,
the helper enters it, a UPI QR appears, and both confirm the payment.

> Want a few sample tasks to look at on your own first? Run `npm run seed` once.
> It adds example tasks around the area in `server/.env`. It's optional — the
> app works without it.

---

## If the feed is empty

That's normal on a brand-new account — nobody nearby has posted yet. Either
post the first task yourself, or widen the distance (filter icon, top right) to
10 km. If you ran `npm run seed`, make sure your location is near the seeded
area, or move it with `npm run move-demo -- <your area>`.

---

## Check everything actually works

```powershell
npm run test:e2e
```

This starts the real server against a throwaway database and drives the entire
flow over HTTP — register, post, claim (including two people racing for the
same task), the handshake code, the UPI link, two-sided settlement, trust
scores, reviews, chat closing, access control and location. 64 checks.

Run it before your presentation. If it passes, the backend is sound and
anything odd you see is in the browser, not the server.

## Other commands

| Command | What it does |
|---|---|
| `npm start` | Set up and run everything |
| `npm run doctor` | Check what's broken and how to fix it |
| `npm run test:e2e` | Full lifecycle test against a real database |
| `npm test` | Fast logic tests, no database needed |
| `npm run seed` | Add optional sample tasks |

## On your Android phone

Keep `npm start` running. In a second terminal, with the phone plugged in and
unlocked:

```
npm run android:run
```

It builds, installs and opens the app, and connects it to your laptop through
the USB cable — no Wi-Fi or IP address needed. While `npm start` is running it
reconnects the phone by itself whenever you plug it in, and without the cable
the app uses Wi-Fi if the phone and laptop share one. Allow location when the
app asks. Problems: **[ANDROID.md](./ANDROID.md)**. For how everything works,
see **[README.md](./README.md)**.
