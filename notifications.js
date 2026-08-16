/* ============================================================
   Tallens Riches — Notification Control Panel

   Registers the service worker, owns the notification settings,
   and fires the once-a-day TallenBot roast. Reads bill data through
   the window.TallensRichesData bridge published by app.js.
   ============================================================ */

/* global TallenBot */
(function () {
  'use strict';

  const STORAGE_KEY = 'tallens_notify';
  const SYNC_TAG    = 'tallenbot-check';

  const DEFAULTS = {
    enabled:          false,
    time:             '09:00',
    leadDays:         3,
    savage:           false,
    announceAllClear: false,
    nagAfterDays:     3,
    lastDigestDay:    null,
    lastOpened:       null
  };

  // ---- Environment ----

  const supported    = 'serviceWorker' in navigator && 'Notification' in window;
  const isIOS        = /iP(hone|ad|od)/.test(navigator.userAgent) ||
                       (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                       window.navigator.standalone === true;

  let settings    = load();
  let swReg       = null;
  let dailyTimer  = null;
  let installPrompt = null;
  const previousOpen = settings.lastOpened;

  // ---- DOM ----

  const $ = (sel) => document.querySelector(sel);
  const btnNotify   = $('#btnNotify');
  const overlay     = $('#notifyModal');
  const statusEl    = $('#notifyStatus');
  const hintEl      = $('#notifyHint');
  const btnEnable   = $('#btnNotifyEnable');
  const btnTest     = $('#btnNotifyTest');
  const btnInstall  = $('#btnNotifyInstall');
  const btnClose    = $('#btnNotifyClose');
  const optsEl      = $('#notifyOptions');
  const inputTime   = $('#notifyTime');
  const inputLead   = $('#notifyLead');
  const inputSavage = $('#notifySavage');
  const inputClear  = $('#notifyAllClear');

  // ---- Settings persistence ----

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return Object.assign({}, DEFAULTS, raw ? JSON.parse(raw) : {});
    } catch {
      return Object.assign({}, DEFAULTS);
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* private mode — settings just will not stick */
    }
  }

  function permission() {
    return supported ? Notification.permission : 'unsupported';
  }

  function active() {
    return supported && settings.enabled && permission() === 'granted';
  }

  // ---- Data bridge ----

  function bills() {
    const api = window.TallensRichesData;
    return api ? api.bills() : [];
  }

  function shortfall() {
    const api = window.TallensRichesData;
    return api ? api.shortfall() : 0;
  }

  // ---- Talking to the service worker ----

  /** Mirror everything the worker needs into the shared cache state. */
  function pushState() {
    if (!swReg || !navigator.serviceWorker.controller) return;
    navigator.serviceWorker.controller.postMessage({
      type: 'state',
      state: {
        enabled:          active(),
        leadDays:         settings.leadDays,
        savage:           settings.savage,
        announceAllClear: settings.announceAllClear,
        nagAfterDays:     settings.nagAfterDays,
        lastDigestDay:    settings.lastDigestDay,
        lastOpened:       settings.lastOpened,
        shortfall:        shortfall(),
        bills:            bills().map((b) => ({
          id: b.id, name: b.name, amount: b.amount, dueDate: b.dueDate, paid: !!b.paid
        }))
      }
    });
  }

  /**
   * Pull the worker's copy of lastDigestDay so a roast fired in the
   * background is not repeated the next time he opens the app.
   */
  function reconcileWithWorker() {
    const controller = navigator.serviceWorker.controller;
    if (!controller) return Promise.resolve();

    return new Promise((resolve) => {
      const channel = new MessageChannel();
      const bail    = setTimeout(resolve, 1500);
      channel.port1.onmessage = (event) => {
        clearTimeout(bail);
        const state = event.data || {};
        if (state.lastDigestDay && state.lastDigestDay > (settings.lastDigestDay || '')) {
          settings.lastDigestDay = state.lastDigestDay;
          save();
        }
        resolve();
      };
      controller.postMessage({ type: 'get-state' }, [channel.port2]);
    });
  }

  /** Show a notification, preferring the worker (required on Android). */
  function notify(title, body, tag, data) {
    const options = {
      body: body,
      tag: tag || 'tallenbot',
      renotify: true,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      vibrate: [80, 40, 80],
      data: data || {}
    };

    if (swReg && swReg.showNotification) {
      return swReg.showNotification(title, options).catch(() => fallback(title, options));
    }
    return Promise.resolve(fallback(title, options));
  }

  function fallback(title, options) {
    try {
      return new Notification(title, options);
    } catch {
      return null;
    }
  }

  // ---- The daily roast ----

  function fireDigest(force) {
    if (!active()) return;

    const todayKey = TallenBot.dayKey(Date.now());
    if (!force && settings.lastDigestDay === todayKey) return;

    const digest = TallenBot.buildDigest(bills(), {
      leadDays:         settings.leadDays,
      savage:           settings.savage,
      announceAllClear: settings.announceAllClear,
      shortfall:        shortfall(),
      // He is looking at the app right now, so never nag him to open it.
      lastOpened:       null
    });
    if (!digest) return;

    settings.lastDigestDay = todayKey;
    save();
    notify(digest.title, digest.body, digest.tag, { kind: digest.kind });
    pushState();
  }

  /** Milliseconds until the next occurrence of the configured HH:MM. */
  function msUntilRoastTime() {
    const parts  = String(settings.time || '09:00').split(':');
    const target = new Date();
    target.setHours(Number(parts[0]) || 0, Number(parts[1]) || 0, 0, 0);
    if (target.getTime() <= Date.now()) target.setTime(target.getTime() + 86400000);
    return target.getTime() - Date.now();
  }

  function roastTimePassedToday() {
    const parts  = String(settings.time || '09:00').split(':');
    const target = new Date();
    target.setHours(Number(parts[0]) || 0, Number(parts[1]) || 0, 0, 0);
    return Date.now() >= target.getTime();
  }

  /**
   * Catch up on a missed roast, then arm a timer for today's.
   * Timers only survive while the page is open, which is exactly why
   * the catch-up half exists.
   */
  function scheduleDaily() {
    if (dailyTimer) { clearTimeout(dailyTimer); dailyTimer = null; }
    if (!active()) return;

    if (roastTimePassedToday()) fireDigest(false);

    dailyTimer = setTimeout(() => {
      fireDigest(false);
      scheduleDaily();
    }, msUntilRoastTime() + 1000);
  }

  /** Ask for background checks. Chrome/Android only; harmless elsewhere. */
  function registerPeriodicSync() {
    if (!swReg || !('periodicSync' in swReg)) return;
    const query = navigator.permissions && navigator.permissions.query
      ? navigator.permissions.query({ name: 'periodic-background-sync' })
      : Promise.resolve({ state: 'granted' });

    query
      .then((status) => {
        if (status.state !== 'granted') return null;
        return swReg.periodicSync.register(SYNC_TAG, { minInterval: 12 * 60 * 60 * 1000 });
      })
      .catch(() => null);
  }

  // ---- UI ----

  function statusInfo() {
    if (!supported) {
      return isIOS && !isStandalone
        ? { cls: 'warn', text: 'Add to Home Screen first',
            hint: 'On iPhone, notifications only work once the app is installed. Open this page in Safari, tap the Share button, then "Add to Home Screen" — and open it from that icon.' }
        : { cls: 'off', text: 'Not supported in this browser',
            hint: 'This browser does not support web notifications. Try Chrome on Android, or Safari on iPhone with the app added to your Home Screen.' };
    }
    if (permission() === 'denied') {
      return { cls: 'off', text: 'Blocked in browser settings',
               hint: 'You (or Tallen) hit Block. Re-allow notifications for this site in your browser settings, then come back.' };
    }
    if (permission() !== 'granted') {
      return { cls: 'off', text: 'Off',
               hint: 'TallenBot will send you one roast a day about whatever bill is closest to eating you.' };
    }
    if (!settings.enabled) {
      return { cls: 'warn', text: 'Paused',
               hint: 'Permission is granted but the roasts are paused. Turn them back on whenever you are ready for the abuse.' };
    }
    return { cls: 'on', text: 'Armed — daily roast at ' + settings.time,
             hint: isStandalone
               ? 'Installed and armed. TallenBot checks your bills in the background where your phone allows it, and always when you open the app.'
               : 'Working. For the most reliable reminders, install this app to your Home Screen and open it from there.' };
  }

  function syncUI() {
    if (!btnNotify) return;

    const info = statusInfo();
    btnNotify.classList.toggle('notify-on', info.cls === 'on');
    btnNotify.setAttribute('title', 'Notifications: ' + info.text);
    btnNotify.setAttribute('aria-label', 'Notifications: ' + info.text);

    if (statusEl) {
      statusEl.textContent = info.text;
      statusEl.className = 'notify-status notify-' + info.cls;
    }
    if (hintEl) hintEl.textContent = info.hint;

    if (btnEnable) {
      btnEnable.hidden = !supported || permission() === 'denied';
      btnEnable.textContent = active() ? 'Pause Roasts' : 'Enable Roasts';
      btnEnable.className = active() ? 'btn btn-secondary' : 'btn btn-primary';
    }
    if (btnTest)    btnTest.hidden = !active();
    if (optsEl)     optsEl.hidden = !active();
    if (btnInstall) btnInstall.hidden = !installPrompt;

    if (inputTime)   inputTime.value   = settings.time;
    if (inputLead)   inputLead.value   = settings.leadDays;
    if (inputSavage) inputSavage.checked = settings.savage;
    if (inputClear)  inputClear.checked  = settings.announceAllClear;
  }

  function openPanel()  { if (overlay) { overlay.hidden = false; syncUI(); } }
  function closePanel() { if (overlay) overlay.hidden = true; }

  function enable() {
    if (!supported) return;

    const proceed = (result) => {
      if (result !== 'granted') { syncUI(); return; }
      settings.enabled = true;
      save();
      registerPeriodicSync();
      pushState();
      scheduleDaily();
      syncUI();
      const roast = TallenBot.pickRoast('test', {}, settings.savage);
      notify(roast.title, roast.body, 'tallenbot-test-' + Date.now());
    };

    if (permission() === 'granted') { proceed('granted'); return; }

    // Must be called from the user gesture that got us here.
    const request = Notification.requestPermission();
    if (request && typeof request.then === 'function') request.then(proceed).catch(() => syncUI());
    else Notification.requestPermission(proceed);
  }

  function pause() {
    settings.enabled = false;
    save();
    if (dailyTimer) { clearTimeout(dailyTimer); dailyTimer = null; }
    pushState();
    syncUI();
  }

  // ---- Wiring ----

  if (btnNotify) btnNotify.addEventListener('click', openPanel);
  if (btnClose)  btnClose.addEventListener('click', closePanel);
  if (overlay) {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closePanel(); });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay && !overlay.hidden) closePanel();
  });

  if (btnEnable) {
    btnEnable.addEventListener('click', () => { active() ? pause() : enable(); });
  }

  if (btnTest) {
    btnTest.addEventListener('click', () => {
      const digest = TallenBot.buildDigest(bills(), {
        leadDays:         settings.leadDays,
        savage:           settings.savage,
        announceAllClear: true,
        shortfall:        shortfall(),
        lastOpened:       null
      }) || TallenBot.pickRoast('test', {}, settings.savage);
      notify(digest.title, digest.body, 'tallenbot-test-' + Date.now(), { kind: 'test' });
    });
  }

  if (inputTime) {
    inputTime.addEventListener('change', () => {
      settings.time = inputTime.value || '09:00';
      save(); pushState(); scheduleDaily(); syncUI();
    });
  }

  if (inputLead) {
    inputLead.addEventListener('change', () => {
      const n = parseInt(inputLead.value, 10);
      settings.leadDays = isNaN(n) ? 3 : Math.max(0, Math.min(30, n));
      save(); pushState(); syncUI();
    });
  }

  if (inputSavage) {
    inputSavage.addEventListener('change', () => {
      settings.savage = inputSavage.checked;
      save(); pushState();
    });
  }

  if (inputClear) {
    inputClear.addEventListener('change', () => {
      settings.announceAllClear = inputClear.checked;
      save(); pushState();
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    syncUI();
  });

  if (btnInstall) {
    btnInstall.addEventListener('click', () => {
      if (!installPrompt) return;
      installPrompt.prompt();
      installPrompt.userChoice.finally(() => { installPrompt = null; syncUI(); });
    });
  }

  window.addEventListener('appinstalled', () => { installPrompt = null; syncUI(); });

  // Bills changed → the worker's snapshot is stale.
  if (window.TallensRichesData) window.TallensRichesData.subscribe(pushState);

  // Coming back to the tab is the most reliable catch-up point we get.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    settings.lastOpened = new Date().toISOString();
    save();
    pushState();
    scheduleDaily();
  });

  // ---- Boot ----

  settings.lastOpened = new Date().toISOString();
  save();
  syncUI();

  if (supported) {
    navigator.serviceWorker.register('sw.js')
      .then((reg) => {
        swReg = reg;
        return navigator.serviceWorker.ready;
      })
      .then(() => reconcileWithWorker())
      .then(() => {
        pushState();
        registerPeriodicSync();
        scheduleDaily();
        syncUI();
      })
      .catch(() => {
        // No worker (file://, or registration blocked). Page-level
        // notifications still work while the app is open.
        scheduleDaily();
        syncUI();
      });
  }

  // Expose a little surface for the console and for app.js.
  window.TallenNotify = {
    open:   openPanel,
    fire:   () => fireDigest(true),
    state:  () => Object.assign({}, settings, { permission: permission(), previousOpen: previousOpen })
  };

})();
