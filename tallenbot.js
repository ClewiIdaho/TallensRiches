/* ============================================================
   Tallens Riches — TallenBot Brain
   The roast pool AND the "what is worth a notification" logic.

   Loaded by the page via <script> and by the service worker via
   importScripts(), so both fire identical notifications from
   identical rules. Keep this file free of DOM / window access.

   Placeholders: {bill} {amount} {days} {count} {total}
   ============================================================ */

(function (root) {
  'use strict';

  // ---- Notification titles, by kind ----
  const TITLES = {
    overdue:  ['☠ Past Due, Tallen', '☠ It Is Late', '☠ TallenBot Is Disappointed'],
    dueToday: ['☠ Due Today', '☠ Today Is The Day', '☠ Pay It'],
    dueSoon:  ['☠ Incoming Bill', '☠ Heads Up', '☠ Bill Approaching'],
    digest:   ['☠ Bills Need You', '☠ The List', '☠ Multiple Threats Detected'],
    payday:   ['☠ Payday', '☠ Money Detected', '☠ Funds Have Landed'],
    broke:    ['☠ Financial Emergency', '☠ Uh Oh', '☠ Negative Balance'],
    nag:      ['☠ Remember Me?', '☠ TallenBot Misses You', '☠ Still Here'],
    allClear: ['☠ Nothing Due', '☠ All Clear', '☠ Shockingly, Fine'],
    test:     ['☠ TallenBot Online']
  };

  // ---- Standard roasts ----
  const ROASTS = {
    overdue: [
      '{bill} is {days} days past due. Even Frieza pays on time.',
      '{bill} was due {days} days ago. You had one job, and it was not painting minis.',
      '{amount} for {bill}, {days} days late. Shenron cannot fix this one.',
      'Your {bill} bill is {days} days overdue. Your Civic is judging you from the driveway.',
      '{bill} is late. Again. This is more consistent than your gym attendance.',
      '{days} days late on {bill}. Somewhere, Vegeta just powered down in disappointment.',
      '{bill} — {amount} — {days} days overdue. Late fees are the real final boss.',
      'Still no payment on {bill}. The Emperor protects, but He does not cover your utilities.',
      '{bill} is {days} days past due, but sure, buy more Warhammer paint.',
      'Overdue: {bill}. Your credit score is taking more damage than a white-tier weapon.'
    ],
    dueToday: [
      '{bill} is due TODAY. {amount}. Move.',
      '{amount} for {bill}, due today. This is not a drill, Tallen.',
      '{bill} due today. Pay it before you open Diablo. I know you.',
      'Today: {bill}, {amount}. Your Space Marines cannot cover this.',
      '{bill} — {amount} — due today. Real world boss fight, no respawns.',
      'Due today: {bill}. Yes, today. The whole day. Not tomorrow.',
      '{amount} due today for {bill}. Power level required: adult.',
      'It is {bill} day. {amount}. Do it now, not after one more episode.'
    ],
    dueSoon: [
      '{bill} hits in {days} days. {amount}. Start emotionally preparing.',
      'Heads up: {bill}, {amount}, {days} days out. Maybe skip the eBay figures this week.',
      '{days} days until {bill} takes {amount} from you. The prophecy is unfolding.',
      '{bill} incoming in {days} days. That is roughly two Diablo sessions.',
      '{amount} for {bill} in {days} days. Your Honda fund will have to wait.',
      'In {days} days, {bill} wants {amount}. Charging up is advised.',
      '{bill} in {days} days. Enough time to NOT buy another Warhammer box.',
      'Radar contact: {bill}, {amount}, {days} days out.'
    ],
    digest: [
      '{count} bills want {total} from you. I made a list, since you clearly will not.',
      '{count} bills need attention. {total} total. Your minis can wait.',
      'Incoming: {count} bills, {total}. This is a raid, not a solo dungeon.',
      '{total} across {count} bills. Even a Saiyan would train for this.',
      '{count} bills, {total}. Your Civic fund is about to feel this one.',
      'Threat assessment: {count} bills, {total}. Power level: concerning.',
      '{count} bills totaling {total}. The Emperor demands tribute.'
    ],
    payday: [
      'Payday. {amount} landed. Try to make it last longer than a Krillin fight scene.',
      '{amount} received. That is not "new mods for the Civic" money. That is bills money.',
      'Money detected: {amount}. TallenBot is watching how you spend it.',
      'Paycheck in: {amount}. The Warhammer store does not need to know about this.',
      '{amount} deposited. Your bills also noticed, by the way.',
      'Funds landed: {amount}. Historically this is where things go wrong.'
    ],
    broke: [
      'You are {amount} in the hole this period. Not very Super Saiyan of you.',
      'Bills exceed income by {amount}. Even Diablo loot has better margins.',
      '{amount} short this pay period. Time to sell some minis, champ.',
      'Negative {amount}. VTEC does not kick in on your bank account.',
      'You are down {amount}. Your ex took half your stuff and somehow this is still worse.'
    ],
    nag: [
      '{count} bills sitting unpaid, totaling {total}. Just thought you should know.',
      'You have not opened me in a while. {count} unpaid bills are waiting. So am I.',
      'Still {count} unpaid bills ({total}). I have infinite patience and zero chill.',
      'Reminder that you have {count} unpaid bills. And a Warhammer army. Priorities.',
      '{total} in unpaid bills. Meanwhile your backlog of unpainted minis grows too.',
      'Long time no see. {count} bills, {total}, still unpaid. No pressure. Lots of pressure.'
    ],
    allClear: [
      'Nothing due. Nothing overdue. Genuinely proud of you, and slightly suspicious.',
      'All bills paid. Who are you and what did you do with Tallen?',
      'Zero bills due. This is the most Super Saiyan thing you have ever done.',
      'Nothing owed today. Go paint something. You earned it.',
      'Clean slate. Do not ruin it at the Warhammer store.'
    ],
    test: [
      'Notifications are live. You can no longer claim you forgot.',
      'TallenBot is online. There is no escape now.',
      'Test successful. I live in your phone now. Sleep well.',
      'It works. Your excuses are officially expired.'
    ]
  };

  // ---- Extra-mean pool, merged in when Savage Mode is on ----
  const SAVAGE = {
    overdue: [
      '{bill} is {days} days late. At this point the late fee is a subscription.',
      '{days} days overdue on {bill}. Your financial plan is "hope."',
      '{bill}, {amount}, {days} days late. Your ex saw this coming.',
      'Still not paid: {bill}. Your Warhammer shelf has better asset management than you.'
    ],
    dueToday: [
      '{bill} due today, {amount}. Statistically you will forget. Prove me wrong.',
      '{amount} due today. Your body pillow is still not a tax write-off, by the way.'
    ],
    dueSoon: [
      '{bill} in {days} days. Yes, you will still be broke then.',
      '{days} days to {bill}. Plenty of time to make a worse financial decision first.'
    ],
    digest: [
      '{count} bills, {total}. One of these is going to be late. We both know it.',
      '{total} owed across {count} bills. Your spending habits have a body count.'
    ],
    payday: [
      '{amount} in. Countdown to it being gone: approximately 36 hours.',
      'Payday: {amount}. We both know where this is going. eBay.'
    ],
    broke: [
      'Down {amount}. Your Honda is worth more than your entire financial strategy.',
      '{amount} in the red. Goku has a job now. Maybe consider a second one.'
    ],
    nag: [
      '{count} unpaid bills, {total}. I will keep doing this forever, Tallen.',
      'Ignoring me will not work. {count} bills. {total}. Still there.'
    ],
    allClear: ['Nothing due. Do not get cocky.'],
    test: ['Savage Mode confirmed. This was your idea, remember that.']
  };

  // ---- Formatting / date helpers ----

  function usd(n) {
    return '$' + Math.abs(Number(n) || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  /** Parse a 'YYYY-MM-DD' string as a LOCAL midnight date. */
  function parseDate(str) {
    const parts = String(str).split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  /** Local midnight for a given moment (defaults to now). */
  function startOfDay(when) {
    const d = when ? new Date(when) : new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /** 'YYYY-MM-DD' key for a moment, used for once-per-day dedupe. */
  function dayKey(when) {
    const d = startOfDay(when);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  /** Whole days from today until a 'YYYY-MM-DD' due date. Negative = overdue. */
  function daysUntil(dueDateStr, when) {
    const diff = parseDate(dueDateStr) - startOfDay(when);
    return Math.round(diff / 86400000);
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function fill(template, ctx) {
    return template.replace(/\{(\w+)\}/g, function (match, key) {
      return Object.prototype.hasOwnProperty.call(ctx, key) ? String(ctx[key]) : match;
    });
  }

  /**
   * Build a notification title/body for a roast kind.
   * @param {string}  kind    key in ROASTS
   * @param {object}  ctx     placeholder values
   * @param {boolean} savage  include the extra-mean pool
   */
  function pickRoast(kind, ctx, savage) {
    ctx = ctx || {};
    const base = ROASTS[kind] || ROASTS.nag;
    const pool = savage && SAVAGE[kind] ? base.concat(SAVAGE[kind]) : base;
    return {
      title: fill(pick(TITLES[kind] || TITLES.nag), ctx),
      body:  fill(pick(pool), ctx)
    };
  }

  /** Days since a stored ISO timestamp, or null if never recorded. */
  function daysSince(isoString, when) {
    if (!isoString) return null;
    const then = new Date(isoString);
    if (isNaN(then)) return null;
    return Math.floor((startOfDay(when) - startOfDay(then)) / 86400000);
  }

  /**
   * Decide what today's single notification should say.
   *
   * Deliberately returns at most ONE notification per day — a storm of
   * six separate bill alerts is how an app gets muted forever.
   *
   * Returns null when nothing is worth interrupting him for, otherwise
   * { title, body, tag, kind, count } ready to hand to showNotification.
   *
   * @param {Array}  bills  bill entries ({ name, amount, dueDate, paid })
   * @param {object} opts   { now, leadDays, savage, announceAllClear,
   *                          shortfall, lastOpened, nagAfterDays }
   */
  function buildDigest(bills, opts) {
    opts = opts || {};
    const now      = opts.now || Date.now();
    const leadDays = typeof opts.leadDays === 'number' ? opts.leadDays : 3;
    const savage   = !!opts.savage;
    const list     = Array.isArray(bills) ? bills : [];
    const tag      = 'tallen-daily-' + dayKey(now);

    const unpaid  = list.filter((b) => b && !b.paid && b.dueDate);
    const pending = unpaid
      .map((b) => ({ bill: b, days: daysUntil(b.dueDate, now) }))
      .filter((x) => x.days <= leadDays)
      .sort((a, b) => a.days - b.days);

    const sum = (items) => items.reduce((t, x) => t + (Number(x.bill ? x.bill.amount : x.amount) || 0), 0);

    // A second line for when he is genuinely underwater.
    const shortfall = Number(opts.shortfall) || 0;
    const brokeLine = shortfall > 0
      ? '\n' + pickRoast('broke', { amount: usd(shortfall) }, savage).body
      : '';

    const out = (kind, roast, count) => ({
      title: roast.title,
      body:  roast.body + (kind === 'allClear' ? '' : brokeLine),
      tag:   tag,
      kind:  kind,
      count: count
    });

    // He has not opened the app in days — that is the actual problem here.
    const idle = daysSince(opts.lastOpened, now);
    const nagAfter = typeof opts.nagAfterDays === 'number' ? opts.nagAfterDays : 3;
    if (idle !== null && idle >= nagAfter && unpaid.length > 0) {
      return out('nag', pickRoast('nag', {
        count: unpaid.length,
        total: usd(sum(unpaid))
      }, savage), unpaid.length);
    }

    // Nothing pressing.
    if (pending.length === 0) {
      if (!opts.announceAllClear || list.length === 0) return null;
      return out('allClear', pickRoast('allClear', {}, savage), 0);
    }

    // Exactly one thing to say — name the bill directly.
    if (pending.length === 1) {
      const item = pending[0];
      const kind = item.days < 0 ? 'overdue' : item.days === 0 ? 'dueToday' : 'dueSoon';
      return out(kind, pickRoast(kind, {
        bill:   item.bill.name,
        amount: usd(item.bill.amount),
        days:   Math.abs(item.days)
      }, savage), 1);
    }

    // Several bills — one summary rather than a notification storm.
    return out('digest', pickRoast('digest', {
      count: pending.length,
      total: usd(sum(pending))
    }, savage), pending.length);
  }

  root.TallenBot = {
    pickRoast:  pickRoast,
    buildDigest: buildDigest,
    usd:        usd,
    dayKey:     dayKey,
    daysUntil:  daysUntil,
    daysSince:  daysSince,
    startOfDay: startOfDay,
    ROASTS:     ROASTS,
    TITLES:     TITLES
  };

})(typeof self !== 'undefined' ? self : this);
