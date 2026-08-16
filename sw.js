/* ============================================================
   Tallens Riches — Service Worker

   Does three jobs:
     1. Caches the app shell so it opens offline from the home screen.
     2. Shows TallenBot notifications on request from the page.
     3. Runs the daily bill check in the background where the browser
        supports Periodic Background Sync (Chrome / Android, installed).
   ============================================================ */

/* global TallenBot */
importScripts('./tallenbot.js');

const VERSION     = 'v3';
const SHELL_CACHE = 'tallens-shell-' + VERSION;
const STATE_CACHE = 'tallens-state';
const STATE_URL   = './__tallenbot-state__';
const SYNC_TAG    = 'tallenbot-check';

const SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './tallenbot.js',
  './notifications.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// ---- Lifecycle ----

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // Individual puts so one 404 cannot fail the whole install.
      .then((cache) => Promise.all(
        SHELL.map((url) => cache.add(url).catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k.startsWith('tallens-shell-') && k !== SHELL_CACHE)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ---- Fetch: stale-while-revalidate for same-origin GETs ----

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('__tallenbot-state__') !== -1) return;

  event.respondWith(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);

        // Serve cache instantly when we have it, refresh in the background.
        return cached || network;
      })
    )
  );
});

// ---- Shared state (the page cannot reach localStorage from here) ----

function readState() {
  return caches.open(STATE_CACHE)
    .then((cache) => cache.match(STATE_URL))
    .then((res) => (res ? res.json() : null))
    .catch(() => null);
}

function writeState(state) {
  return caches.open(STATE_CACHE)
    .then((cache) => cache.put(STATE_URL, new Response(JSON.stringify(state), {
      headers: { 'Content-Type': 'application/json' }
    })))
    .catch(() => null);
}

// ---- Notifications ----

function show(title, body, tag, data) {
  return self.registration.showNotification(title, {
    body: body,
    tag: tag || 'tallenbot',
    renotify: true,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    data: data || {},
    vibrate: [80, 40, 80],
    requireInteraction: false
  });
}

/**
 * Run the daily check against the last snapshot the page saved.
 * Fires at most one notification per calendar day.
 */
function runDailyCheck(force) {
  return readState().then((state) => {
    if (!state || state.enabled === false) return null;

    const todayKey = TallenBot.dayKey(Date.now());
    if (!force && state.lastDigestDay === todayKey) return null;

    const digest = TallenBot.buildDigest(state.bills || [], {
      leadDays:         state.leadDays,
      savage:           state.savage,
      announceAllClear: state.announceAllClear,
      shortfall:        state.shortfall,
      lastOpened:       state.lastOpened,
      nagAfterDays:     state.nagAfterDays
    });
    if (!digest) return null;

    state.lastDigestDay = todayKey;
    return writeState(state).then(() => show(digest.title, digest.body, digest.tag, { kind: digest.kind }));
  });
}

// ---- Messages from the page ----

self.addEventListener('message', (event) => {
  const msg = event.data || {};

  if (msg.type === 'notify') {
    event.waitUntil(show(msg.title, msg.body, msg.tag, msg.data));
    return;
  }

  if (msg.type === 'state') {
    event.waitUntil(
      readState().then((prev) => writeState(Object.assign({}, prev || {}, msg.state)))
    );
    return;
  }

  if (msg.type === 'check') {
    event.waitUntil(runDailyCheck(!!msg.force));
    return;
  }

  // The page reconciles its own "already roasted today" marker against
  // this one, so a background fire is not repeated on next open.
  if (msg.type === 'get-state') {
    const port = event.ports && event.ports[0];
    event.waitUntil(
      readState().then((state) => { if (port) port.postMessage(state || {}); })
    );
    return;
  }

  if (msg.type === 'skip-waiting') {
    self.skipWaiting();
  }
});

// ---- Background check (Chrome / Android, installed PWA only) ----

self.addEventListener('periodicsync', (event) => {
  if (event.tag === SYNC_TAG) event.waitUntil(runDailyCheck(false));
});

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) event.waitUntil(runDailyCheck(false));
});

// ---- Real web push, if a push server is ever wired up ----

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const roast = TallenBot.pickRoast(payload.kind || 'nag', payload.ctx || {}, !!payload.savage);
  event.waitUntil(show(
    payload.title || roast.title,
    payload.body  || roast.body,
    payload.tag   || 'tallenbot-push',
    { kind: payload.kind || 'nag' }
  ));
});

// ---- Tapping a notification opens the app ----

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL('./index.html', self.location.href).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.indexOf(self.registration.scope) === 0 && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : null;
    })
  );
});
