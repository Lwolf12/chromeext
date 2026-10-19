// Local ratings database, built from IMDb's public dumps by
// tools/build-local-db.mjs into data/ratings.json.gz. Loaded by
// background.js via importScripts(). Answers come from here first; OMDb is
// only asked for titles the local file doesn't have.
//
// The file is gzipped JSON (see the build script for the shape). It is
// decompressed and parsed once per service-worker lifetime; Chrome stops an
// idle worker after about 30 s, so this repeats now and then, which costs a
// few hundred milliseconds.

const LocalDB = (() => {
  'use strict';

  let db = null; // { built, minVotes, titles, index }
  let loading = null;
  let missing = false; // true once we know there is no data file

  // Same normalisation as tools/build-local-db.mjs. Keep them in sync.
  function normalise(title) {
    return title
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  async function load() {
    if (db || missing) return db;
    if (!loading) {
      loading = (async () => {
        try {
          const res = await fetch(chrome.runtime.getURL('data/ratings.json.gz'));
          if (!res.ok) {
            missing = true;
            return null;
          }
          const text = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).text();
          db = JSON.parse(text);
        } catch (e) {
          missing = true;
          db = null;
        } finally {
          loading = null;
        }
        return db;
      })();
    }
    return loading;
  }

  // Returns a result in the same shape fetchRating() produces, plus
  // source: 'local' and built: <dump date>. Returns null when the title is
  // not in the local file (so the caller can fall back to OMDb).
  async function lookup(title, kind) {
    const d = await load();
    if (!d) return null;
    const list = d.index[normalise(title)];
    if (!list || !list.length) return null;

    const want = kind === 'movie' ? 'm' : kind === 'series' ? 's' : null;
    // Lists are sorted most-voted first by the build script.
    const hit = (want && list.find((e) => e[1] === want)) || (want ? null : list[0]);
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
      built: d.built,
    };
  }

  async function status() {
    const d = await load();
    return d ? { present: true, built: d.built, titles: d.titles, minVotes: d.minVotes } : { present: false };
  }

  return { lookup, status, normalise };
})();
