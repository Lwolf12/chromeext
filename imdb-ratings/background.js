// Service worker: looks up IMDb ratings through the OMDb API and keeps a
// permanent store of answers in chrome.storage.local.
//
// Content scripts send {type: 'rating', title} and get back
//   {rating, votes, year, imdbID, kind, matchedTitle, ts, stale}  from the store
//   {rating: null, ...}                                           no OMDb match
//   {error: 'nokey' | 'http' | 'limit'}                           nothing stored and lookup failed
//
// Policy:
//   - A stored answer is returned immediately, however old it is.
//   - If it is older than the refresh window it is flagged `stale`; the
//     content script then sends {type: 'rating', title, refresh: true} and
//     the worker re-fetches. A failed refresh keeps the old answer.
//   - Once OMDb reports the daily limit, no more requests go out until the
//     next UTC day; stored answers keep being served.
//   - Every outgoing request is counted per day so the options page can show
//     usage against the 1,000/day free tier.

const HIT_REFRESH_MS = 30 * 24 * 60 * 60 * 1000; // ratings barely move
const MISS_REFRESH_MS = 3 * 24 * 60 * 60 * 1000; // new titles show up on IMDb within days
const MAX_IN_FLIGHT = 4;
const LIMIT_PAUSE_MS = 60 * 60 * 1000; // after OMDb reports the limit

const inFlight = new Map(); // storeKey -> Promise
let active = 0;
const queue = [];

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

// First install: nothing works without an OMDb key, so show the settings
// panel right away rather than leaving the user with blank cards.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'rating' && typeof msg.title === 'string') {
    const kind = msg.kind === 'movie' || msg.kind === 'series' ? msg.kind : null;
    lookup(msg.title, kind, !!msg.refresh).then(sendResponse, (e) => sendResponse({ error: String(e) }));
    return true; // keep the channel open for the async reply
  }
  if (msg && msg.type === 'usage') {
    usage().then(sendResponse);
    return true;
  }
  if (msg && msg.type === 'test') {
    testKey().then(sendResponse, (e) => sendResponse({ ok: false, detail: String(e) }));
    return true;
  }
  return false;
});

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

// Entries looked up with a type hint are stored separately from untyped
// ones, since OMDb can return a different title for each.
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
  const day = utcDay();
  const all = await chrome.storage.local.get(null);
  const stored = Object.keys(all).filter((k) => k.startsWith('r:')).length;
  return { day, today: usage.day === day ? usage.count : 0, limitHit: Date.now() < limitPauseUntil, stored };
}

async function lookup(title, kind, refresh) {
  const key = storeKey(title, kind);
  if (!title.trim()) return { rating: null };

  const stored = (await chrome.storage.local.get(key))[key];
  if (stored && (!refresh || !isStale(stored))) {
    return { ...stored, stale: isStale(stored) };
  }

  // Nothing stored, or a stale entry we've been asked to refresh.
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

async function countRequest() {
  const day = utcDay();
  const { usage = {} } = await chrome.storage.local.get('usage');
  const count = usage.day === day ? usage.count + 1 : 1;
  await chrome.storage.local.set({ usage: { day, count } });
}

async function fetchRating(title, kind) {
  const { omdbKey } = await chrome.storage.sync.get('omdbKey');
  if (!omdbKey) return { error: 'nokey' };

  const day = utcDay();
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
  };
}
