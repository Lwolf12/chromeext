// The local ratings database, kept in IndexedDB. Shared by the service worker
// (lookups), the build worker (writes) and the options page (status). Loaded
// with importScripts() in workers.
//
// Layout:
//   meta      key 'info' -> { built, builtAt, minVotes, titles, keys, store }
//   titles_a  keyPath 'k' -> { k: normalised title, e: [entry, ...] }
//   titles_b  same; a build writes into whichever store is NOT live, then
//             flips meta.store, so lookups never see a half-written database.
//   episodes_a, episodes_b  keyPath 'k' -> { k: series imdbID,
//             s: { "<season>": [[episode, rating, votes], ...] } }; paired
//             with titles_a/_b and flipped with them.
//
// entry = [imdbID, type ('m' movie | 's' series), startYear|null, rating,
//          votes, primaryTitle], sorted most-voted first.

const RatingsDB = (() => {
  'use strict';

  const NAME = 'imdbext-ratings';
  const VERSION = 2; // 2 added the episode stores
  let conn = null;

  // What the stored keys were built with. A database of an older format is
  // rebuilt once after an update (background.js maybeRefresh).
  //   1  movies, TV films and series; plain normalise
  //   2  also direct-to-video, TV specials, TV shorts and shorts (builder.js
  //      TYPE), and abbreviations joined in normalise
  const FORMAT = 2;

  // Used for both building and lookup. Keep in one place.
  // Dotted or starred abbreviations come out as single letters ("Car S.O.S."
  // -> "car s o s"); two or more single letters in a row are joined, so
  // "Car SOS" and "Car S.O.S." (or "SWAT" and "S.W.A.T.", "MASH" and
  // "M*A*S*H") give the same key. A lone letter stays ("i robot").
  function normalise(title) {
    return (title || '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\b[a-z](?: [a-z]\b)+/g, (run) => run.replace(/ /g, ''));
  }

  function open() {
    if (conn) return Promise.resolve(conn);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of ['titles_a', 'titles_b', 'episodes_a', 'episodes_b']) {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'k' });
        }
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      };
      req.onsuccess = () => {
        conn = req.result;
        conn.onclose = () => { conn = null; };
        conn.onversionchange = () => { conn.close(); conn = null; };
        resolve(conn);
      };
      req.onerror = () => reject(req.error);
    });
  }

  const result = (r) => new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const complete = (tx) => new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error || new Error('transaction aborted'));
  });

  async function getMeta() {
    const db = await open();
    return (await result(db.transaction('meta').objectStore('meta').get('info'))) || null;
  }

  async function status() {
    const m = await getMeta();
    return m
      ? {
          present: true,
          built: m.built,
          builtAt: m.builtAt,
          minVotes: m.minVotes,
          titles: m.titles,
          episodes: m.episodes,
          outdated: (m.format || 1) < FORMAT,
        }
      : { present: false };
  }

  // Same result shape as the OMDb path, plus source: 'local'. Null when the
  // title is not in the database.
  // kind ('movie' | 'series' | null) filters; year (string | null) prefers
  // the entry released that year, give or take one, among several of the
  // same name (the 2026 series "East of Eden" over the 1955 film). Entries
  // are most-voted first, so without a year match the popular one wins.
  async function lookup(title, kind, year) {
    const m = await getMeta();
    if (!m) return null;
    const db = await open();
    const rec = await result(db.transaction(m.store).objectStore(m.store).get(normalise(title)));
    if (!rec || !rec.e.length) return null;
    const want = kind === 'movie' ? 'm' : kind === 'series' ? 's' : null;
    const pool = want ? rec.e.filter((e) => e[1] === want) : rec.e;
    const y = year ? Number(year) : NaN;
    const hit = (Number.isFinite(y) && pool.find((e) => e[2] != null && Math.abs(e[2] - y) <= 1)) || pool[0];
    if (!hit) return null;
    const [imdbID, type, startYear, rating, votes, primaryTitle] = hit;
    return {
      rating,
      votes: votes.toLocaleString('en-US'),
      year: startYear == null ? null : String(startYear),
      imdbID,
      kind: type === 'm' ? 'movie' : 'series',
      matchedTitle: primaryTitle || title,
      source: 'local',
      built: m.built,
    };
  }

  const episodeStore = (titleStore) => titleStore.replace('titles', 'episodes');

  // Ratings of one season of a series: { episode number: [rating, votes] },
  // or null when the database has none (no database, a database built before
  // episodes were added, or a season too new or too little voted on).
  async function lookupEpisodes(imdbID, season) {
    const m = await getMeta();
    if (!m || !m.episodes) return null;
    const db = await open();
    const store = episodeStore(m.store);
    const rec = await result(db.transaction(store).objectStore(store).get(imdbID));
    const list = rec && rec.s[String(season)];
    if (!list || !list.length) return null;
    const out = {};
    for (const [ep, rating, votes] of list) out[ep] = [rating, votes];
    return out;
  }

  // Writes a freshly built index (Map of normalised title -> entries) and the
  // episodes (Map of series imdbID -> { season: [[ep, rating, votes]] }) into
  // the stores that are not live, then makes them live. onProgress(done, total).
  async function writeIndex(index, episodes, info, onProgress) {
    const db = await open();
    const old = await getMeta();
    const target = old && old.store === 'titles_a' ? 'titles_b' : 'titles_a';
    const epTarget = episodeStore(target);

    let tx = db.transaction([target, epTarget], 'readwrite');
    tx.objectStore(target).clear();
    tx.objectStore(epTarget).clear();
    await complete(tx);

    const keys = [...index.keys()];
    const series = [...episodes.keys()];
    const total = keys.length + series.length;
    const BATCH = 2000;
    for (let i = 0; i < keys.length; i += BATCH) {
      tx = db.transaction(target, 'readwrite');
      const store = tx.objectStore(target);
      for (const k of keys.slice(i, i + BATCH)) store.put({ k, e: index.get(k) });
      await complete(tx);
      if (onProgress) onProgress(Math.min(i + BATCH, keys.length), total);
    }
    for (let i = 0; i < series.length; i += BATCH) {
      tx = db.transaction(epTarget, 'readwrite');
      const store = tx.objectStore(epTarget);
      for (const k of series.slice(i, i + BATCH)) store.put({ k, s: episodes.get(k) });
      await complete(tx);
      if (onProgress) onProgress(keys.length + Math.min(i + BATCH, series.length), total);
    }

    tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put({ ...info, store: target, keys: keys.length }, 'info');
    await complete(tx);

    if (old && old.store !== target) {
      tx = db.transaction([old.store, episodeStore(old.store)], 'readwrite');
      tx.objectStore(old.store).clear();
      tx.objectStore(episodeStore(old.store)).clear();
      await complete(tx);
    }
  }

  // Empties every store and the meta record: the state of a fresh install.
  // The next Update now builds from scratch.
  async function clear() {
    const db = await open();
    const stores = ['meta', 'titles_a', 'titles_b', 'episodes_a', 'episodes_b'];
    const tx = db.transaction(stores, 'readwrite');
    for (const s of stores) tx.objectStore(s).clear();
    await complete(tx);
  }

  return { FORMAT, normalise, open, getMeta, status, lookup, lookupEpisodes, writeIndex, clear };
})();
