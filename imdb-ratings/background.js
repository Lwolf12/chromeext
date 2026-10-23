// Service worker: looks up IMDb ratings, first in the local database that
// the extension builds in the browser from IMDb's data dumps (db.js,
// builder.js), then through the OMDb API for titles the database lacks, and
// keeps a permanent store of answers in chrome.storage.local.
//
// Also owns the database build: it runs in a hidden offscreen page
// (offscreen.html -> build-worker.js), started by the Update button on the
// settings panel and automatically once the database is over a week old
// (checked a few times a day by an alarm). Until the first build, the
// toolbar icon carries a "!" badge.
//
// Content scripts send {type: 'rating', title, kind?, refresh?} and get back
//   {rating, votes, year, imdbID, kind, matchedTitle, ts, stale, source}
//   {rating: null, ...}                       no match anywhere
//   {error: 'nokey' | 'http' | 'limit'}       nothing stored and OMDb failed

importScripts('db.js');

const HIT_REFRESH_MS = 30 * 24 * 60 * 60 * 1000; // ratings barely move
const MISS_REFRESH_MS = 3 * 24 * 60 * 60 * 1000; // new titles show up within days
const MAX_IN_FLIGHT = 4;
const LIMIT_PAUSE_MS = 60 * 60 * 1000; // after OMDb reports the limit
const DB_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // rebuild the database weekly
const DB_CHECK_MINUTES = 360; // how often the alarm looks at the age
const MIN_VOTES = 25;

const inFlight = new Map(); // storeKey -> Promise
let active = 0;
const queue = [];
let omdbKeyRejected = false; // OMDb called the saved key invalid

// ---------------------------------------------------------------- events

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

// The settings panel in a plain tab. The embedded options dialog that
// openOptionsPage() shows is easy to miss, and users who skip it don't know
// the toolbar icon (hidden in the puzzle-piece menu until pinned) opens it.
function openSettings() {
  return chrome.tabs.create({ url: chrome.runtime.getURL('options.html') })
    .catch(() => chrome.runtime.openOptionsPage());
}

chrome.runtime.onInstalled.addListener((details) => {
  chrome.alarms.create('db-refresh', { periodInMinutes: DB_CHECK_MINUTES });
  if (details.reason === 'install') {
    // Open the panel and let the user start the first (240 MB) build
    // themselves. Nothing downloads until they click Update now.
    openSettings();
  } else {
    maybeRefresh();
  }
});

// A "!" on the toolbar icon until the first database build, so a user who
// closed the panel still sees that setup isn't finished.
updateBadge();

async function updateBadge() {
  const built = !!(await RatingsDB.getMeta().catch(() => null));
  await chrome.action.setBadgeText({ text: built ? '' : '!' });
  await chrome.action.setBadgeBackgroundColor({ color: '#f5c518' });
  await chrome.action.setBadgeTextColor({ color: '#000' });
  await chrome.action.setTitle({
    title: built ? 'IMDb Ratings: settings' : 'IMDb Ratings: click to build the ratings database',
  });
}

// Whether pages should show the "set up" notice: no local database and no
// way to reach OMDb either (no key, a rejected key, or the fallback off), so
// every lookup comes back empty. building: a build is running right now.
async function setupStatus() {
  const { omdbFallback = true, omdbKey } = await chrome.storage.sync.get(['omdbFallback', 'omdbKey']);
  const present = (await RatingsDB.status().catch(() => ({ present: false }))).present;
  const needed = !present && (!omdbFallback || !omdbKey || omdbKeyRejected);
  const state = await getBuildState();
  return { needed, building: state.status === 'running' };
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.omdbKey) omdbKeyRejected = false;
});

// Stored answers from before OMDb's fuzzy matches were rejected may carry
// some other title's rating for up to 30 days. Drop those once, on the first
// run of this worker version; they get looked up again on demand.
purgeMismatchedAnswers();

const PURGE_VERSION = 2;

async function purgeMismatchedAnswers() {
  const { purgedFuzzy = 0 } = await chrome.storage.local.get('purgedFuzzy');
  if (purgedFuzzy >= PURGE_VERSION) return;
  const all = await chrome.storage.local.get(null);
  const drop = [];
  for (const [k, v] of Object.entries(all)) {
    // Local-database answers legitimately differ from the asked title (the
    // site may use the original title); everything else came from OMDb,
    // including early entries that carry no source field.
    if (!k.startsWith('r:') || !v || v.source === 'local' || !v.matchedTitle) continue;
    const asked = k.slice(2).replace(/^(movie|series):/, '').replace(/^\d{4}:/, '');
    if (!sameTitle(asked, v.matchedTitle)) drop.push(k);
  }
  if (drop.length) await chrome.storage.local.remove(drop);
  await chrome.storage.local.set({ purgedFuzzy: PURGE_VERSION });
}

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('db-refresh', { periodInMinutes: DB_CHECK_MINUTES });
  maybeRefresh();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'db-refresh') maybeRefresh();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return false;
  if (msg.target === 'offscreen') return false; // for the offscreen page

  if (msg.target === 'background') {
    onBuildMessage(msg);
    return false;
  }
  if (msg.type === 'rating' && typeof msg.title === 'string') {
    const kind = msg.kind === 'movie' || msg.kind === 'series' ? msg.kind : null;
    const year = /^(19|20)\d\d$/.test(String(msg.year || '')) ? String(msg.year) : null;
    lookup(msg.title, kind, !!msg.refresh, year).then(sendResponse, (e) => sendResponse({ error: String(e) }));
    return true; // keep the channel open for the async reply
  }
  if (msg.type === 'usage') {
    usage().then(sendResponse);
    return true;
  }
  if (msg.type === 'test') {
    testKey().then(sendResponse, (e) => sendResponse({ ok: false, detail: String(e) }));
    return true;
  }
  if (msg.type === 'build') {
    startBuild('manual').then(sendResponse);
    return true;
  }
  if (msg.type === 'setup') {
    setupStatus().then(sendResponse);
    return true;
  }
  if (msg.type === 'open-settings') {
    openSettings();
    return false;
  }
  return false;
});

// ---------------------------------------------------------- database build

async function getBuildState() {
  return (await chrome.storage.session.get('buildState')).buildState || { status: 'idle' };
}

async function setBuildState(state) {
  await chrome.storage.session.set({ buildState: state });
}

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['WORKERS'],
      justification: 'Builds the ratings database from IMDb data dumps in a web worker',
    });
  } catch (e) {
    if (!/already exists|single offscreen/i.test(String(e))) throw e;
  }
}

async function closeOffscreen() {
  try {
    if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument();
  } catch (e) {
    /* nothing to close */
  }
}

// Returns the build state after starting (or the current one if already running).
async function startBuild(trigger) {
  const state = await getBuildState();
  if (state.status === 'running') return state;
  const next = { status: 'running', trigger, phase: 'starting', pct: 0, startedAt: Date.now() };
  await setBuildState(next);
  try {
    await ensureOffscreen();
    const start = { target: 'offscreen', type: 'build', minVotes: MIN_VOTES };
    try {
      await chrome.runtime.sendMessage(start);
    } catch (e) {
      // A just-created offscreen page can miss the very first message.
      await new Promise((r) => setTimeout(r, 500));
      await chrome.runtime.sendMessage(start);
    }
  } catch (e) {
    const failed = { status: 'error', message: String((e && e.message) || e), at: Date.now() };
    await setBuildState(failed);
    await closeOffscreen();
    return failed;
  }
  return next;
}

// Messages from the build are handled one at a time, in arrival order. A
// progress update reads the state and writes it back; run concurrently, the
// last "100%" could land after "done" and leave the state stuck on running
// (Update now greyed out, no done message) until the browser restarts.
let buildMessages = Promise.resolve();

function onBuildMessage(msg) {
  buildMessages = buildMessages.then(() => handleBuildMessage(msg)).catch(() => {});
}

async function handleBuildMessage(msg) {
  if (msg.type === 'progress') {
    const state = await getBuildState();
    if (state.status !== 'running') return; // a late update after done/error
    await setBuildState({ ...state, phase: msg.phase, pct: msg.pct, detail: msg.detail });
  } else if (msg.type === 'done') {
    await setBuildState({ status: 'done', at: Date.now(), info: msg.info });
    await closeOffscreen();
    updateBadge();
  } else if (msg.type === 'error') {
    await setBuildState({ status: 'error', message: msg.message, at: Date.now() });
    await closeOffscreen();
  }
}

// Best effort: Chrome only reports this on Android and ChromeOS. On desktop
// it is always "unknown", so this never blocks there.
function looksMetered() {
  const c = typeof navigator !== 'undefined' && navigator.connection;
  return !!c && (c.saveData === true || c.type === 'cellular');
}

// Rebuild once the database is older than a week, if the user built one in
// the first place and hasn't switched the automatic refresh off. The first
// build is always the user's own click, so nothing downloads unasked.
async function maybeRefresh() {
  const { autoRefresh = true } = await chrome.storage.sync.get('autoRefresh');
  if (!autoRefresh) return;
  const state = await getBuildState();
  if (state.status === 'running') return;
  // Don't hammer IMDb if builds keep failing: wait a day after an error.
  if (state.status === 'error' && Date.now() - (state.at || 0) < 24 * 60 * 60 * 1000) return;
  const meta = await RatingsDB.getMeta();
  if (!meta) return;
  if (Date.now() - (meta.builtAt || 0) < DB_MAX_AGE_MS) return;
  if (looksMetered()) return; // try again at the next check
  await startBuild('auto');
}

// ----------------------------------------------------------------- lookups

// Entries looked up with a type hint are stored separately from untyped
// ones, since the match can differ.
// 'r:<title>', 'r:series:<title>', 'r:series:2026:<title>': the more the
// site told us, the more specific the key.
function storeKey(title, kind, year) {
  return 'r:' + (kind ? kind + ':' : '') + (year ? year + ':' : '') + title.trim().toLowerCase().replace(/\s+/g, ' ');
}

function utcDay() {
  return new Date().toISOString().slice(0, 10);
}

function isStale(entry) {
  const window = entry.rating == null ? MISS_REFRESH_MS : HIT_REFRESH_MS;
  return Date.now() - (entry.ts || 0) > window;
}

async function usage() {
  const { usage = {}, limitPauseUntil = 0 } = await chrome.storage.local.get(['usage', 'limitPauseUntil']);
  const { autoRefresh = true } = await chrome.storage.sync.get('autoRefresh');
  const day = utcDay();
  const all = await chrome.storage.local.get(null);
  const stored = Object.keys(all).filter((k) => k.startsWith('r:')).length;
  const local = await RatingsDB.status();
  const build = await getBuildState();
  return { day, today: usage.day === day ? usage.count : 0, limitHit: Date.now() < limitPauseUntil, stored, local, build, autoRefresh };
}

async function lookup(title, kind, refresh, year) {
  const key = storeKey(title, kind, year);
  if (!title.trim()) return { rating: null };

  // A hit found with a type or year hint is better than whatever the less
  // specific lookups (which the cards use) settled on for the same title,
  // so it replaces those entries too.
  const broaderKeys = [];
  if (year) broaderKeys.push(storeKey(title, kind, null));
  if (kind) broaderKeys.push(storeKey(title, null, null));

  const stored = (await chrome.storage.local.get(key))[key];
  if (stored && (!refresh || !isStale(stored))) {
    return { ...stored, stale: isStale(stored) };
  }

  // Nothing stored, or a stale entry we've been asked to refresh. The local
  // database answers first; it costs no requests.
  const local = await RatingsDB.lookup(title, kind, year);
  if (local) {
    const entry = { ...local, ts: Date.now() };
    const writes = { [key]: entry };
    for (const k of broaderKeys) writes[k] = entry;
    await chrome.storage.local.set(writes);
    return { ...entry, stale: false };
  }

  // Without a key, or with the fallback switched off, a local miss is simply
  // a miss. (If there is no local database either, fetchRating() reports
  // 'nokey' so the page can warn.)
  const { omdbFallback = true, omdbKey } = await chrome.storage.sync.get(['omdbFallback', 'omdbKey']);
  const localPresent = (await RatingsDB.status()).present;
  if (!omdbFallback || (!omdbKey && localPresent)) {
    return stored ? { ...stored, stale: false } : { rating: null, source: 'local' };
  }

  if (inFlight.has(key)) return inFlight.get(key);
  const p = schedule(() => fetchRating(title, kind, year))
    .then(async (result) => {
      if (result.error) {
        return stored ? { ...stored, stale: false } : result; // keep the old answer
      }
      const entry = { ...result, ts: Date.now() };
      const writes = { [key]: entry };
      if (entry.rating != null) for (const k of broaderKeys) writes[k] = entry;
      await chrome.storage.local.set(writes);
      return { ...entry, stale: false };
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

// Concurrency limiter so a page with 200 cards doesn't fire 200 requests at once.
function schedule(task) {
  return new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    pump();
  });
}

function pump() {
  while (active < MAX_IN_FLIGHT && queue.length) {
    const { task, resolve, reject } = queue.shift();
    active++;
    task()
      .then(resolve, reject)
      .finally(() => {
        active--;
        pump();
      });
  }
}

// -------------------------------------------------------------------- OMDb

async function countRequest() {
  const day = utcDay();
  const { usage = {} } = await chrome.storage.local.get('usage');
  const count = usage.day === day ? usage.count + 1 : 1;
  await chrome.storage.local.set({ usage: { day, count } });
}

async function fetchRating(title, kind, year) {
  const { omdbKey } = await chrome.storage.sync.get('omdbKey');
  if (!omdbKey) return { error: 'nokey' };

  const { limitPauseUntil = 0 } = await chrome.storage.local.get('limitPauseUntil');
  if (Date.now() < limitPauseUntil) return { error: 'limit' };

  const url = new URL('https://www.omdbapi.com/');
  url.searchParams.set('apikey', omdbKey);
  url.searchParams.set('t', title);
  if (kind) url.searchParams.set('type', kind);
  if (year) url.searchParams.set('y', year);

  await countRequest();
  let res;
  try {
    res = await fetch(url.toString());
  } catch (e) {
    return { error: 'http' };
  }

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    /* non-JSON body; handled below */
  }
  const errText = (data && data.Error) || '';

  // OMDb uses 401 for both a bad/unactivated key and the daily limit, so
  // read the message before deciding.
  if (/invalid api key/i.test(errText)) {
    omdbKeyRejected = true;
    return { error: 'nokey' };
  }
  if (res.status === 401 || /limit/i.test(errText)) {
    // Pause for an hour, then try again: cheap, and self-healing if the
    // 401 was really something else.
    await chrome.storage.local.set({ limitPauseUntil: Date.now() + LIMIT_PAUSE_MS });
    return { error: 'limit' };
  }
  if (!res.ok || !data) return { error: 'http' };
  if (data.Response !== 'True') return { rating: null };

  // OMDb's title search is fuzzy: asked for "Youth" it can answer with
  // "Hwarang: The Poet Warrior Youth". The local database only matches whole
  // titles, so hold OMDb to the same standard and treat anything else as a
  // miss (recorded, so the badge tooltip can say what was offered).
  if (!sameTitle(title, data.Title)) {
    return { rating: null, source: 'omdb', offered: data.Title || null };
  }

  const rating = parseFloat(data.imdbRating);
  return {
    rating: Number.isFinite(rating) ? rating : null,
    votes: data.imdbVotes && data.imdbVotes !== 'N/A' ? data.imdbVotes : null,
    year: data.Year || null,
    imdbID: data.imdbID || null,
    kind: data.Type || null,
    matchedTitle: data.Title || null,
    source: 'omdb',
  };
}

// Same title once accents, case, punctuation and a leading article are
// ignored, so "The Pitt" and "Pitt" agree but "Youth" and "Hwarang: The Poet
// Warrior Youth" do not.
function sameTitle(a, b) {
  const clean = (t) => RatingsDB.normalise(t).replace(/^(the|a|an) /, '');
  const x = clean(a);
  const y = clean(b);
  return !!x && x === y;
}

// One request, bypassing the pause, so the options page can show exactly what
// OMDb says about the saved key. A success clears any pause.
async function testKey() {
  const { omdbKey } = await chrome.storage.sync.get('omdbKey');
  if (!omdbKey) return { ok: false, detail: 'No key saved.' };
  const url = new URL('https://www.omdbapi.com/');
  url.searchParams.set('apikey', omdbKey);
  url.searchParams.set('i', 'tt0111161'); // The Shawshank Redemption
  await countRequest();
  let res;
  try {
    res = await fetch(url.toString());
  } catch (e) {
    return { ok: false, detail: 'Network error: ' + e };
  }
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch (e) {
    /* leave null */
  }
  if (res.ok && data && data.Response === 'True') {
    await chrome.storage.local.remove('limitPauseUntil');
    return { ok: true, detail: data.Title + ' (' + data.Year + ') rated ' + data.imdbRating };
  }
  return { ok: false, detail: 'HTTP ' + res.status + ': ' + ((data && data.Error) || text.slice(0, 200)) };
}
