# Deploying Madad — free, start to finish

Everything in this guide is free. No credit card is required at any point.

You are deploying **one service**: a single Node process that serves both the
API and the React app from one HTTPS address. That matters beyond tidiness —
browsers refuse to share precise GPS location with a page served over plain
`http://`, so being on HTTPS is what makes location work at all.

**Total time: about 25 minutes**, most of it waiting for builds.

---

## What you need

| | Account | Cost | What it does |
|---|---|---|---|
| 1 | [github.com](https://github.com) | free | holds the code; Render deploys from it |
| 2 | [mongodb.com/atlas](https://www.mongodb.com/cloud/atlas/register) | free (M0, 512 MB) | the database |
| 3 | [render.com](https://render.com) | free | runs the app |

Nothing else needs signing up for. Maps (OpenStreetMap), weather (Open-Meteo)
and place names (Nominatim) are all keyless.

---

## Step 1 — Push to GitHub

Your repository: **`https://github.com/khurramrashidd/Madad`**

From inside this project folder:

```bash
git init
git add .
git commit -m "Madad: location fixes, safety, dark mode, i18n, single-service deploy"
git branch -M main
git remote add origin https://github.com/khurramrashidd/Madad.git
git push -u origin main
```

> If the repository already has commits, use `git pull --rebase origin main`
> before pushing, or `git push -u origin main --force` if you want this to
> replace what is there. Force-pushing discards the old history — only do it
> if you are sure.

`.gitignore` already excludes `node_modules`, `.env`, `client/dist` and the
Android build folder, so none of those are uploaded.

---

## Step 2 — Create the database (MongoDB Atlas)

1. Sign up at <https://www.mongodb.com/cloud/atlas/register>.
2. **Create a cluster** → choose **M0 (Free)**. For region pick
   **Mumbai (ap-south-1)** if offered — closest to both you and your users.
3. Wait ~3 minutes for it to provision.
4. **Database Access** (left sidebar) → **Add New Database User**
   - Username: `madad`
   - Password: click **Autogenerate** and **copy it somewhere now** — you
     cannot see it again.
   - Role: **Read and write to any database**
5. **Network Access** → **Add IP Address** → **Allow Access From Anywhere**
   (`0.0.0.0/0`).

   > This is necessary, not lazy: Render's free tier gives your service no
   > fixed outbound IP, so there is no narrower range to allow. Your database
   > is still protected by the username and password, which is the control
   > that actually matters here.

6. **Database** → **Connect** → **Drivers** → copy the connection string. It
   looks like:

   ```
   mongodb+srv://madad:<db_password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

7. **Edit it in two ways** before using it:
   - replace `<db_password>` with the password you copied
   - insert the database name `madad` before the `?`

   Final result:

   ```
   mongodb+srv://madad:YOURPASSWORD@cluster0.xxxxx.mongodb.net/madad?retryWrites=true&w=majority
   ```

   > Forgetting the `/madad` part is the single most common mistake here.
   > Without it, Mongo connects to a database called `test` and your data goes
   > somewhere you will not think to look.

---

## Step 3 — Generate your secrets

Run these on your laptop and keep the output. You will paste them in Step 4.

**JWT secret** (signs login tokens — the app refuses to start in production
without a real one):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**Push notification keys** (free, no account):

```bash
npx web-push generate-vapid-keys
```

That prints a **Public Key** and a **Private Key**. Keep both.

---

## Step 4 — Deploy on Render

1. Sign up at <https://render.com> with **"Sign in with GitHub"**.
2. **New +** → **Web Service** → connect your `khurramrashidd/Madad` repo.
3. Render reads `render.yaml` and fills most settings in. Confirm:

   | Setting | Value |
   |---|---|
   | Name | `madad` (your URL becomes `madad.onrender.com`) |
   | Region | **Singapore** |
   | Branch | `main` |
   | Runtime | Node |
   | Build command | `npm install --prefix server && npm install --prefix client && npm run build --prefix client` |
   | Start command | `npm start --prefix server` |
   | Instance type | **Free** |

4. **Environment variables** — add these:

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `MONGO_URI` | your Atlas string from Step 2 |
   | `JWT_SECRET` | the hex string from Step 3 |
   | `ADMIN_EMAILS` | `laiqrashid786@gmail.com` |
   | `VAPID_PUBLIC_KEY` | from Step 3 |
   | `VAPID_PRIVATE_KEY` | from Step 3 |
   | `VAPID_SUBJECT` | `mailto:laiqrashid786@gmail.com` |
   | `CLIENT_ORIGIN` | `http://localhost,capacitor://localhost` |
   | `SEED_CENTER_LAT` | `18.9894` |
   | `SEED_CENTER_LNG` | `73.1175` |
   | `SEED_CITY` | `Panvel` |

   Leave `SARVAM_API_KEY` unset unless you have one — the app falls back to
   the browser's own speech recognition.

5. **Create Web Service.** The first build takes 4–6 minutes.

When the log shows the Madad banner with `Client served from client/dist`,
open your URL. **Create your account using the email you put in
`ADMIN_EMAILS`** and you will have the admin dashboard.

---

## Step 5 — Check it worked

Visit `https://your-app.onrender.com/api/health`. You should see:

```json
{ "success": true, "service": "madad-api", "status": "ok", "env": "production" }
```

Then on the app itself:

- [ ] The page loads and shows the login screen
- [ ] Registering works
- [ ] The header shows your area, today's date and the temperature
- [ ] The browser asks for location permission, and the feed anchors to you
- [ ] Posting a task works, and it appears on a second device nearby
- [ ] Dark mode follows your phone, and the sidebar switches it
- [ ] Profile → notifications can be turned on

---

## About the free tier (what to expect)

**It sleeps.** After 15 minutes with no traffic, Render shuts the service
down. The next visitor waits about 50–60 seconds while it restarts. You said
this is acceptable; everything below is for reference if you change your mind.

- **750 free instance hours per month** per Render workspace. Sleeping does
  not consume them. A service kept awake 24/7 uses ~744 — nearly all of it.
- **Keeping it awake:** `.github/workflows/keep-awake.yml` is included but
  **disabled**. Read the comments inside before enabling it; a free account at
  [cron-job.org](https://cron-job.org) pinging `/api/health` every 13 minutes
  is the better tool, and does not spend your GitHub Actions minutes.
- **The filesystem is temporary.** Anything written to disk vanishes on
  restart. This is why profile photos are compressed in the browser and stored
  in MongoDB rather than as files — nothing to configure, nothing to lose.
- **No shell access** on the free tier, which means you cannot run the seed
  script on Render. Run it from your laptop against the live database:

  ```bash
  cd server
  MONGO_URI="your-atlas-string" npm run seed
  ```

---

## Afterwards: every push deploys itself

Render watches your `main` branch. Any push rebuilds and redeploys
automatically, and `.github/workflows/ci.yml` runs the tests first so a broken
build is caught in GitHub rather than on the host.

```bash
git add .
git commit -m "what changed"
git push
```

---

## Building the Android APK against the live server

The APK has no dev server to proxy through, so it must be told where the
backend is.

1. In `client/.env`:

   ```ini
   VITE_API_URL=https://your-app.onrender.com
   ```

2. Then, from the project root:

   ```bash
   npm run android:init    # first time only
   npm run android:apk     # produces Madad-debug.apk
   ```

The APK then works anywhere with internet — no shared Wi-Fi, no laptop
running. Native GPS works properly because Capacitor asks for the OS location
permission directly.

> **Note:** push notifications are a web feature and will not arrive in the
> APK. They need a service worker, which Capacitor deliberately disables (a
> stale worker would keep serving the previous build after a reinstall). The
> installed PWA from Chrome does get push. Native push would need Firebase
> Cloud Messaging, which is a separate setup.

---

## Troubleshooting

**Build fails: "Cannot find module"**
The build command is wrong. It must install *both* `server` and `client`
before building. Copy it exactly from the table in Step 4.

**App loads but everything says "You appear to be offline"**
`MONGO_URI` is wrong or Atlas is blocking the connection. Check the Render
logs for `MongooseServerSelectionError`, and confirm Network Access is set to
`0.0.0.0/0`.

**Deploy fails instantly with "Refusing to start with an unsafe configuration"**
Working as intended — the message names the problem. Either `JWT_SECRET` is
still the example value, or `MONGO_URI` points at `localhost`.

**Location does not work**
Confirm you are on the `https://` address, not `http://`. If the browser
previously denied permission it will not ask again — reset it via the icon
beside the address bar. Failing all that, the app falls back to an
approximate position and the header offers "set my area manually".

**The admin dashboard is missing**
`ADMIN_EMAILS` must match your account's email exactly. It is applied on every
login, so set the variable and sign out and back in — no need to re-register.

**Changes do not appear after a deploy**
Hard-refresh once (`Ctrl+Shift+R`). The service worker updates on the next
load; `index.html` and `sw.js` are served uncached specifically so this
resolves itself.
