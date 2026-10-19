// The local ratings database, kept in IndexedDB. Shared by the service worker
// (lookups), the build worker (writes) and the options page (status). Loaded
// with importScripts() in workers.
//
// Layout:
//   meta      key 'info' -> { built, builtAt, minVotes, titles, keys, store }
//   titles_a  keyPath 'k' -> { k: normalised title, e: [entry, ...] }
//   titles_b  same; a build writes into whichever store is NOT live, then
//             flips meta.store, so lookups never see a half-written database.
//
// entry = [imdbID, type ('m' movie | 's' series), startYear|null, rating,
//          votes, primaryTitle], sorted most-voted first.

const RatingsDB = (() => {
  'use strict';

  const NAME = 'imdbext-ratings';
  const VERSION = 1;
  let conn = null;

  // Used for both building and lookup. Keep in one place.
  function normalise(title) {
    return (title || '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function open() {
    if (conn) return Promise.resolve(conn);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of ['titles_a', 'titles_b']) {
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
      ? { present: true, built: m.built, builtAt: m.builtAt, minVotes: m.minVotes, titles: m.titles }
      : { present: false };
  }

  // Same result shape as the OMDb path, plus source: 'local'. Null when the
  // title is not in the database.
  async function lookup(title, kind) {
    const m = await getMeta();
    if (!m) return null;
    const db = await open();
    const rec = await result(db.transaction(m.store).objectStore(m.store).get(normalise(title)));
    if (!rec || !rec.e.length) return null;
    const want = kind === 'movie' ? 'm' : kind === 'series' ? 's' : null;
    const hit = (want && rec.e.find((e) => e[1] === want)) || (want ? null : rec.e[0]);
    if (!hit) return null;
    const [imdbID, type, year, rating, votes, primaryTitle] = hit;
    return {
      rating,
      votes: votes.toLocaleString('en-US'),
      year: year == null ? null : String(year),
      imdbID,
      kind: type === 'm' ? 'movie' : 'series',
      matchedTitle: primaryTitle || title,
      source: 'local',
      built: m.built,
    };
  }

  // Writes a freshly built index (Map of normalised title -> entries) into
  // the store that is not live, then makes it live. onProgress(done, total).
  async function writeIndex(index, info, onProgress) {
    const db = await open();
    const old = await getMeta();
    const target = old && old.store === 'titles_a' ? 'titles_b' : 'titles_a';

    let tx = db.transaction(target, 'readwrite');
    tx.objectStore(target).clear();
    await complete(tx);

    const keys = [...index.keys()];
    const BATCH = 2000;
    for (let i = 0; i < keys.length; i += BATCH) {
      tx = db.transaction(target, 'readwrite');
      const store = tx.objectStore(target);
      for (const k of keys.slice(i, i + BATCH)) store.put({ k, e: index.get(k) });
      await complete(tx);
      if (onProgress) onProgress(Math.min(i + BATCH, keys.length), keys.length);
    }

    tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put({ ...info, store: target, keys: keys.length }, 'info');
    await complete(tx);

    if (old && old.store !== target) {
      tx = db.transaction(old.store, 'readwrite');
      tx.objectStore(old.store).clear();
      await complete(tx);
    }
  }

  return { normalise, open, getMeta, status, lookup, writeIndex };
})();
