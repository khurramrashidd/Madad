# Running Madad on your Android phone

**Windows · VS Code · physical phone over USB**

---

## The one command

Plug your phone in, unlock it, then from the `madad` folder:

```
npm run android:run
```

That is the whole thing. It:

1. finds your Android SDK on its own — nothing needs to be on PATH
2. finds your **phone**, and ignores any stuck emulator
3. waits for you if the phone is showing "Allow USB debugging?"
4. builds the app, creates the Android project if needed, compiles the APK
5. opens a **USB tunnel** so the phone reaches your laptop through the cable
6. installs it — replacing an old copy if one is in the way — and opens it

Keep `npm start` running in another terminal so the backend is up.

Whatever happens, it leaves a working `Madad-debug.apk` in the `madad` folder.

> **Why not `flutter run`?** This project has no Dart code — it is React,
> wrapped for Android by Capacitor. `npm run android:run` is the equivalent.
> Your Flutter install still helps: it is where your Android SDK came from.

---

## The USB tunnel, and why it matters

Normally a phone talks to your laptop over Wi-Fi, which needs your laptop's IP
address, both devices on the same network, and Windows Firewall to let the
connection in. Campus networks often block devices from seeing each other
entirely.

`android:run` sidesteps all of that. It uses `adb reverse` so that, on the
phone, `localhost:5000` *is* your laptop's backend — carried over the USB cable.
No IP address, no shared Wi-Fi, no firewall rule.

You do not have to babysit the tunnel: while `npm start` is running it checks
every few seconds and reopens the tunnel for any phone that is plugged in. The
`npm start` window prints `[phone] connected` when it does.

The app also knows the laptop's Wi-Fi address. Unplug the cable while the phone
and laptop are on the same Wi-Fi and it switches over by itself (see the
Windows Firewall note below for that route). `npm run android:reverse` still
exists if you want to reopen the tunnel by hand.

---

## Daily loop

**Terminal 1** — leave running:

```
npm start
```

**Terminal 2** — after changing code:

```
npm run android:run
```

The first build takes a few minutes. After that, Gradle reuses its work and it
is much quicker.

---

## Handing the APK to someone else

```
npm run android:apk
```

Builds `Madad-debug.apk` in the `madad` folder without needing a phone plugged
in. Send it over WhatsApp, Drive or a USB copy; on the phone, open it and allow
"Install unknown apps".

This version talks to your laptop **over Wi-Fi** (it cannot use the tunnel —
there is no cable), so the phone must be on the same Wi-Fi as your laptop while
`npm start` is running. If it cannot connect, see
[Windows Firewall](#the-phone-cannot-reach-the-backend-over-wi-fi) below.

To run your *own* phone over Wi-Fi instead of the tunnel:

```
npm run android:wifi
```

---

## Command reference

All from the `madad` folder.

| Command | What it does |
|---|---|
| `npm run android:run` | Build, install and open on your phone over USB |
| `npm run android:reverse` | Reconnect the USB tunnel after replugging |
| `npm run android:apk` | Build `Madad-debug.apk` to share — no phone needed |
| `npm run android:wifi` | Like `android:run`, but over Wi-Fi instead of the tunnel |
| `npm run doctor` | Check the setup and list connected phones |
| `npm run android:open` | Open the Android project in Android Studio |
| `npm run android:keystore` | Create a key for a signed release build |
| `npm run android:apk:release` | Build a signed release APK |

Options for `android:run`, after `--`:

```
npm run android:run -- --emulator         prefer a running emulator
npm run android:run -- --device R5CR10ABC use one specific device
```

---

## Debugging on the phone

Chrome on your laptop can inspect the app running on your phone — full console,
network tab, everything.

1. Keep the phone plugged in with Madad open
2. In laptop Chrome, go to `chrome://inspect/#devices`
3. Find **Madad** under your phone and click **inspect**

If the feed is empty or something looks wrong, open the **Network** tab and look
at what the API call actually returned.

---

## Troubleshooting

Start with:

```
npm run doctor
```

The **Android build chain** section lists every connected device and what state
it is in.

### "No usable phone found"

The command still builds the APK; it just could not install it. To get the
phone detected:

1. **Use a data cable.** Many cables only charge. This is the most common cause
   by far — try a different one.
2. **Unlock the phone.** Pull down the notification shade, tap the USB
   notification, choose **File transfer**.
3. **Tap "Allow"** on the "Allow USB debugging?" popup. Tick "Always allow from
   this computer".
4. Run `npm run doctor` — your phone should now be listed as connected.

Still nothing on Windows? Your phone brand's USB driver may be missing — search
for "*your brand* USB driver" (Samsung, Xiaomi and others publish them).

### "Stuck emulator" in the doctor

That is an Android Studio emulator that stopped responding. `android:run`
ignores it, so it is harmless. To clear it: close the emulator window, or
Android Studio → Device Manager → ⋮ → **Cold Boot Now**.

### "The phone blocked the install"

Some brands block installs over USB by default.

- **Xiaomi / Redmi / POCO**: Settings → Additional settings → Developer options
  → turn on **Install via USB** and **USB debugging (Security settings)**.
- **Oppo / Realme / Vivo**: Developer options → turn off
  **Permission monitoring**.
- **Any phone**: watch the screen during install — some ask you to tap Install.

### The app says "Can't reach Madad"

The app is fine; it cannot find your laptop. In order:

1. Is `npm start` still running on the laptop?
2. Is the cable plugged in? Watch the `npm start` window for `[phone] connected`.
   Nothing? Unlock the phone and check the USB notification says "File transfer".
3. No cable? The phone and laptop must be on the same Wi-Fi, and Windows
   Firewall must allow port 5000 (next section).
4. Tap **Retry** on the banner. It also retries by itself every few seconds.

A phone with Wi-Fi and mobile data both off still works over the cable — the
app no longer trusts Android's "no internet" flag and asks the laptop directly.

**Built the app before this update?** Rebuild once with `npm run android:run`,
so the phone app knows about the Wi-Fi fallback and the new checks.

### The feed shows the wrong place, or no tasks

The header shows the area your phone's GPS reports (for example "Panvel"),
looked up from OpenStreetMap when the laptop has internet. If it shows the
wrong place:

1. Allow location for Madad: Settings → Apps → Madad → Permissions → Location →
   **Allow only while using the app**, and turn on **Use precise location**.
2. Turn on the phone's Location (quick settings tile), then pull down on the feed.

If the header is right but there are no tasks, the demo tasks are somewhere
else. Tap **Demo → Move demo tasks to me**.

### The phone cannot reach the backend over Wi-Fi

Windows Firewall blocks incoming connections to Node by default. Open
**Command Prompt as administrator** (Start → type cmd → right-click →
Run as administrator) and run once:

```
netsh advfirewall firewall add rule name="Madad API" dir=in action=allow protocol=TCP localport=5000
```

Also check both devices are on the *same* network — many places run separate
2.4 GHz and 5 GHz networks, or a guest network that isolates devices. If the
venue Wi-Fi isolates devices, connect your laptop to your phone's hotspot.

Or skip all of this and use the USB tunnel: `npm run android:run`.

### "Could not find the Android SDK"

Android Studio → More Actions → **SDK Manager**. Copy the "Android SDK
Location" path, then in **cmd**:

```
setx ANDROID_HOME "C:\Users\you\AppData\Local\Android\Sdk"
```

Close the terminal and open a new one. (Only `ANDROID_HOME` — you do not need to
touch PATH. `android:run` finds adb inside the SDK on its own.)

> **Never run `setx PATH "%PATH%;..."`.** `setx` silently cuts values at 1024
> characters, and `%PATH%` copies your system PATH into your user PATH. Between
> them they can wreck your PATH. Nothing in this project needs PATH changed.

### A Gradle or JDK error during "Compiling the APK"

Scroll up to the first line starting with `* What went wrong`.

- **JDK / Java version**: Android Studio ships a JDK that always works:

  ```
  setx JAVA_HOME "C:\Program Files\Android\Android Studio\jbr"
  ```

  Open a new terminal afterwards.

- **Missing SDK component** (platform, build-tools): open the project in Android
  Studio once and let it finish syncing — it installs whatever is missing:

  ```
  npm run android:open
  ```

  Close Android Studio, then `npm run android:run` again.

### The splash screen or icon did not update

Android caches launcher icons aggressively. Uninstall Madad from the phone, then
`npm run android:run` again.

### Starting completely fresh

Nothing in the Android project is precious except a release keystore, if you
made one:

```
rmdir /s /q client\android
npm run android:run
```

It recreates the project from scratch.

---

## Signed release APK

A debug APK is fine for the presentation. For a smaller, signed build that
installs without warnings:

**1. Create your signing key** (once):

```
npm run android:keystore
```

> Back up `client/android/madad-release.jks` and `keystore.properties`. Android
> identifies an app by its signature — lose the key and you can never update
> the app on a phone that already has it.

**2.** Paste the signing block the keystore script prints into
`client/android/app/build.gradle`, inside `android { }`.

**3. Build:**

```
npm run android:apk:release
```

Lands at `client\android\app\build\outputs\apk\release\app-release.apk`.

The release build leaves out the Guide and Demo switcher, and talks to whatever
`VITE_API_URL` is in `client/.env` — set that to a deployed backend for an APK
that works anywhere.

---

## Before your presentation

In the room, on the day:

```
npm start                 (Terminal 1)
npm run android:run       (Terminal 2, phone plugged in)
```

Because the phone uses the USB tunnel, the venue's Wi-Fi does not matter at
all. Bring a known-good **data** cable.
