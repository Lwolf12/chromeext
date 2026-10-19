// Builds the local ratings database inside the browser from IMDb's public
// data dumps (https://developer.imdb.com/non-commercial-datasets/), which
// IMDb licenses for each person's own use. Runs in build-worker.js (a web
// worker inside the offscreen document). Needs RatingsDB from db.js.
//
// Streams title.ratings.tsv.gz (~9 MB) and title.basics.tsv.gz (~230 MB)
// through gzip decompression line by line, keeps movies and series with at
// least minVotes votes, and hands the index to RatingsDB.writeIndex().

const RatingsBuilder = (() => {
  'use strict';

  const BASE = 'https://datasets.imdbws.com/';
  const TYPE = { movie: 'm', tvMovie: 'm', tvSeries: 's', tvMiniSeries: 's' };

  // Yields decompressed lines; reports compressed bytes read for progress.
  async function* lines(url, onBytes) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(url + ': HTTP ' + res.status);
    const total = Number(res.headers.get('content-length')) || 0;
    let read = 0;
    const counter = new TransformStream({
      transform(chunk, ctrl) {
        read += chunk.byteLength;
        if (onBytes) onBytes(read, total);
        ctrl.enqueue(chunk);
      },
    });
    const reader = res.body
      .pipeThrough(counter)
      .pipeThrough(new DecompressionStream('gzip'))
      .pipeThrough(new TextDecoderStream())
      .getReader();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += value;
      let start = 0;
      let nl;
      while ((nl = buf.indexOf('\n', start)) >= 0) {
        yield buf.slice(start, nl);
        start = nl + 1;
      }
      buf = buf.slice(start);
    }
    if (buf) yield buf;
  }

  function add(index, key, entry) {
    if (!key) return;
    const list = index.get(key);
    if (!list) index.set(key, [entry]);
    else if (!list.some((e) => e[0] === entry[0])) list.push(entry);
  }

  // onProgress({ phase: 'ratings'|'basics'|'writing', pct: 0..1, detail })
  async function build({ minVotes = 25, onProgress } = {}) {
    const progress = (phase, pct, detail) => onProgress && onProgress({ phase, pct, detail });

    // 1. tconst -> [rating, votes] for titles over the vote floor.
    const ratings = new Map();
    let first = true;
    for await (const line of lines(BASE + 'title.ratings.tsv.gz', (r, t) => progress('ratings', t ? r / t : 0))) {
      if (first) { first = false; continue; }
      const t1 = line.indexOf('\t');
      const t2 = line.indexOf('\t', t1 + 1);
      const votes = Number(line.slice(t2 + 1));
      if (votes >= minVotes) ratings.set(line.slice(0, t1), [Number(line.slice(t1 + 1, t2)), votes]);
    }

    // 2. Walk basics, keep rated movies/series, index by normalised title.
    const index = new Map();
    let kept = 0;
    first = true;
    for await (const line of lines(BASE + 'title.basics.tsv.gz', (r, t) => progress('basics', t ? r / t : 0, kept))) {
      if (first) { first = false; continue; }
      const t1 = line.indexOf('\t');
      const r = ratings.get(line.slice(0, t1));
      if (!r) continue;
      const f = line.split('\t');
      const type = TYPE[f[1]];
      if (!type) continue;
      const entry = [f[0], type, f[5] === '\\N' ? null : Number(f[5]), r[0], r[1], f[2]];
      kept++;
      add(index, RatingsDB.normalise(f[2]), entry);
      if (f[3] !== f[2]) add(index, RatingsDB.normalise(f[3]), entry);
    }
    for (const list of index.values()) list.sort((a, b) => b[4] - a[4]);

    // 3. Write to IndexedDB and make it live.
    progress('writing', 0);
    const info = {
      built: new Date().toISOString().slice(0, 10),
      builtAt: Date.now(),
      minVotes,
      titles: kept,
    };
    await RatingsDB.writeIndex(index, info, (done, total) => progress('writing', total ? done / total : 1));
    return info;
  }

  return { build };
})();
