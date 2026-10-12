/* eslint-env serviceworker */
/* global self, clients */

/**
 * Push notification handling, imported into the generated service worker.
 *
 * Workbox's `generateSW` mode writes the whole service worker for us, so
 * there is nowhere to add our own event listeners — except `importScripts`,
 * which is exactly what this file is for (see `workbox.importScripts` in
 * vite.config.js). The alternative, `injectManifest`, would mean hand-writing
 * and maintaining the entire precache/routing layer to gain two listeners.
 *
 * Two events matter:
 *
 *   push             — a notification arrived; show it
 *   notificationclick— the user tapped it; focus the app on the right screen
 *
 * The server already sends web-push via VAPID (see services/notify.js); this
 * is the half that was missing, which is why push subscriptions were being
 * stored and then never resulting in a visible notification.
 */

self.addEventListener('push', (event) => {
  // A push with no usable payload still deserves something, rather than the
  // browser's own "This site has been updated in the background" notice.
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Madad', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Madad';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/badge-72.png',
    // Tapping should open the task it is about, not just the app.
    data: { url: data.url || '/' },
    // Collapse repeats about the same thing: three chat messages should not
    // stack into three notifications on a phone.
    tag: data.tag || data.url || 'madad',
    renotify: true,
    // A nearby task is worth a buzz; it is time-limited and easily missed.
    vibrate: [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';

  event.waitUntil(
    (async () => {
      const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });

      // Prefer focusing a tab that is already open and navigating it, rather
      // than opening a second copy of the app.
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            try {
              await client.navigate(target);
            } catch {
              /* cross-origin or blocked — focusing is still better than nothing */
            }
          }
          return;
        }
      }

      if (clients.openWindow) await clients.openWindow(target);
    })()
  );
});
