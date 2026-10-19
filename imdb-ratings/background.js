// Service worker: looks up IMDb ratings, first in the local database that
// the extension builds in the browser from IMDb's data dumps (db.js,
// builder.js), then through the OMDb API for titles the database lacks, and
// keeps a permanent store of answers in chrome.storage.local.
//
// Also owns the database build: it runs in a hidden offscreen page
// (offscreen.html -> build-worker.js), started by the Update button on the
// settings panel, on first install, and automatically once the database is
// over a week old (checked a few times a day by an alarm).
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

// ---------------------------------------------------------------- events

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.runtime.onInstalled.addListener((details) => {
  chrome.alarms.create('db-refresh', { periodInMinutes: DB_CHECK_MINUTES });
  if (details.reason === 'install') {
    // Show the panel so the first build's progress is visible, then build.
    chrome.runtime.openOptionsPage();
    startBuild('install');
  } else {
    maybeRefresh();
  }
});

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
    lookup(msg.title, kind, !!msg.refresh).then(sendResponse, (e) => sendResponse({ error: String(e) }));
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

async function onBuildMessage(msg) {
  if (msg.type === 'progress') {
    const state = await getBuildState();
    await setBuildState({ ...state, status: 'running', phase: msg.phase, pct: msg.pct, detail: msg.detail });
  } else if (msg.type === 'done') {
    await setBuildState({ status: 'done', at: Date.now(), info: msg.info });
    await closeOffscreen();
  } else if (msg.type === 'error') {
    await setBuildState({ status: 'error', message: msg.message, at: Date.now() });
    await closeOffscreen();
  }
}

// Rebuild when there is no database, or it is older than a week, and the
// automatic refresh hasn't been switched off.
async function maybeRefresh() {
  const { autoRefresh = true } = await chrome.storage.sync.get('autoRefresh');
  if (!autoRefresh) return;
  const state = await getBuildState();
  if (state.status === 'running') return;
  // Don't hammer IMDb if builds keep failing: wait a day after an error.
  if (state.status === 'error' && Date.now() - (state.at || 0) < 24 * 60 * 60 * 1000) return;
  const meta = await RatingsDB.getMeta();
  if (!meta || Date.now() - (meta.builtAt || 0) > DB_MAX_AGE_MS) await startBuild('auto');
}

// ----------------------------------------------------------------- lookups

// Entries looked up with a type hint are stored separately from untyped
// ones, since the match can differ.
function storeKey(title, kind) {
  return 'r:' + (kind ? kind + ':' : '') + title.trim().toLowerCase().replace(/\s+/g, ' ');
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

async function lookup(title, kind, refresh) {
  const key = storeKey(title, kind);
  if (!title.trim()) return { rating: null };

  const stored = (await chrome.storage.local.get(key))[key];
  if (stored && (!refresh || !isStale(stored))) {
    return { ...stored, stale: isStale(stored) };
  }

  // Nothing stored, or a stale entry we've been asked to refresh. The local
  // database answers first; it costs no requests.
  const local = await RatingsDB.lookup(title, kind);
  if (local) {
    const entry = { ...local, ts: Date.now() };
    const writes = { [key]: entry };
    if (kind) writes[storeKey(title, null)] = entry;
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
  const p = schedule(() => fetchRating(title, kind))
    .then(async (result) => {
      if (result.error) {
        return stored ? { ...stored, stale: false } : result; // keep the old answer
      }
      const entry = { ...result, ts: Date.now() };
      const writes = { [key]: entry };
      // A typed lookup that found something is more trustworthy than the
      // untyped one for the same title (e.g. a 2026 series vs a 2002 film),
      // so let it replace the untyped entry that cards use.
      if (kind && entry.rating != null) writes[storeKey(title, null)] = entry;
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

async function fetchRating(title, kind) {
  const { omdbKey } = await chrome.storage.sync.get('omdbKey');
  if (!omdbKey) return { error: 'nokey' };

  const { limitPauseUntil = 0 } = await chrome.storage.local.get('limitPauseUntil');
  if (Date.now() < limitPauseUntil) return { error: 'limit' };

  const url = new URL('https://www.omdbapi.com/');
  url.searchParams.set('apikey', omdbKey);
  url.searchParams.set('t', title);
  if (kind) url.searchParams.set('type', kind);

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
  if (/invalid api key/i.test(errText)) return { error: 'nokey' };
  if (res.status === 401 || /limit/i.test(errText)) {
    // Pause for an hour, then try again: cheap, and self-healing if the
    // 401 was really something else.
    await chrome.storage.local.set({ limitPauseUntil: Date.now() + LIMIT_PAUSE_MS });
    return { error: 'limit' };
  }
  if (!res.ok || !data) return { error: 'http' };
  if (data.Response !== 'True') return { rating: null };

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
