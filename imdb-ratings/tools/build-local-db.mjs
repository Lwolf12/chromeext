#!/usr/bin/env node
// Builds the extension's local ratings database from IMDb's public data
// dumps (https://developer.imdb.com/non-commercial-datasets/).
//
//   node tools/build-local-db.mjs [--min-votes N] [--out data/ratings.json.gz]
//
// Downloads title.basics.tsv.gz (~250 MB) and title.ratings.tsv.gz (~7 MB)
// into a temp folder, keeps movies and series with at least --min-votes
// votes (default 25), and writes a gzipped JSON lookup keyed by normalised
// title. Run it weekly or so; ratings move slowly. Needs Node 18+.
//
// Output shape (data/ratings.json.gz):
//   {
//     "built": "2026-10-19",          // dump date (UTC) when this ran
//     "minVotes": 25,
//     "titles": 412345,
//     "index": {
//       "the office": [["tt0386676","s",2005,9.0,700000,"The Office"], ...],
//       ...                            // [imdbID, type, startYear, rating, votes, primaryTitle]
//     }
//   }
// Lists are sorted most-voted first.
// type: "m" movie (incl. tvMovie), "s" series (incl. tvMiniSeries).

import { createReadStream, createWriteStream, mkdirSync, statSync } from 'node:fs';
import { mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGunzip, gzipSync } from 'node:zlib';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const MIN_VOTES = Number(opt('--min-votes', 25));
const OUT = join(here, '..', opt('--out', 'data/ratings.json.gz'));
const BASE = 'https://datasets.imdbws.com/';

// Same normalisation as local.js in the worker. Keep them in sync.
function normalise(title) {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function download(name, dir) {
  const dest = join(dir, name);
  process.stderr.write(`downloading ${name} ... `);
  const res = await fetch(BASE + name);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  process.stderr.write(`${(statSync(dest).size / 1e6).toFixed(0)} MB\n`);
  return dest;
}

async function* tsvRows(file) {
  const rl = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
  let header = null;
  for await (const line of rl) {
    if (!header) {
      header = line.split('\t');
      continue;
    }
    yield line.split('\t');
  }
}

const dir = await mkdtemp(join(tmpdir(), 'imdb-dump-'));
try {
  const ratingsFile = await download('title.ratings.tsv.gz', dir);
  const basicsFile = await download('title.basics.tsv.gz', dir);

  // tconst -> [rating, votes] for titles that clear the vote floor.
  process.stderr.write('reading ratings ... ');
  const ratings = new Map();
  for await (const [tconst, avg, votes] of tsvRows(ratingsFile)) {
    const n = Number(votes);
    if (n >= MIN_VOTES) ratings.set(tconst, [Number(avg), n]);
  }
  process.stderr.write(`${ratings.size} titles with >= ${MIN_VOTES} votes\n`);

  const TYPE = { movie: 'm', tvMovie: 'm', tvSeries: 's', tvMiniSeries: 's' };
  process.stderr.write('reading basics ... ');
  const index = new Map();
  let kept = 0;
  const add = (key, entry) => {
    if (!key) return;
    const list = index.get(key);
    if (!list) index.set(key, [entry]);
    else if (!list.some((e) => e[0] === entry[0])) list.push(entry);
  };
  for await (const row of tsvRows(basicsFile)) {
    const [tconst, titleType, primaryTitle, originalTitle, , startYear] = row;
    const type = TYPE[titleType];
    if (!type) continue;
    const r = ratings.get(tconst);
    if (!r) continue;
    const entry = [tconst, type, startYear === '\\N' ? null : Number(startYear), r[0], r[1], primaryTitle];
    kept++;
    add(normalise(primaryTitle), entry);
    if (originalTitle !== primaryTitle) add(normalise(originalTitle), entry);
  }
  process.stderr.write(`${kept} titles, ${index.size} keys\n`);

  // Most-voted first within each key, so the worker's default pick is cheap.
  for (const list of index.values()) list.sort((a, b) => b[4] - a[4]);

  const out = {
    built: new Date().toISOString().slice(0, 10),
    minVotes: MIN_VOTES,
    titles: kept,
    index: Object.fromEntries(index),
  };
  mkdirSync(dirname(OUT), { recursive: true });
  const json = JSON.stringify(out);
  const gz = gzipSync(Buffer.from(json), { level: 9 });
  const tmpOut = OUT + '.tmp';
  await writeFile(tmpOut, gz);
  await rename(tmpOut, OUT);
  process.stderr.write(`wrote ${OUT}: ${(json.length / 1e6).toFixed(1)} MB JSON, ${(gz.length / 1e6).toFixed(1)} MB gzipped\n`);
} finally {
  await rm(dir, { recursive: true, force: true });
}
