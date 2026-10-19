# IMDb Ratings for Streaming

Chrome extension that overlays the IMDb user rating on every title card
while browsing Netflix, Prime Video, Hulu and HBO Max. Each card gets a small
badge with the rating. On Netflix, Prime Video and Hulu, hovering a title
opens the site's own preview, which gets an IMDb line with the year and vote
count; click that line to open the IMDb page. HBO Max has no preview, so
there the badge on the card is the link. Each site is a small adapter file,
so more services can be added.

| Site | Card badge | Hover details | Notes |
| --- | --- | --- | --- |
| Netflix | top-right of each tile | line under the preview popup's buttons | no year or type on cards; the popup's episode marker gives a series hint that also corrects the card |
| Prime Video | top-right of each tile; hidden while the card is expanded | chip in the expanded card's metadata row | season suffixes stripped; movie/series type passed to OMDb |
| Hulu | top-right of each tile | line under the preview panel's metadata; also in the top banner | movie/series type from the link path |
| HBO Max | bottom-right of each poster | none (HBO Max has no hover preview); the badge tooltip works | title parsed from the tile's accessibility label, including episode tiles; movie/series type from the link path |

## Setup

1. Download the latest `imdb-ratings` ZIP from the
   [Releases page](https://github.com/Lwolf12/chromeext/releases) and
   extract it somewhere permanent (Chrome loads the extension from that
   folder every time it starts). In Chrome open `chrome://extensions`, turn
   on **Developer mode**, click **Load unpacked** and pick the
   `imdb-ratings` folder.
2. Open any of the four sites (reload if it was already open). The ZIP
   includes a local ratings database (next section), so badges appear
   without any further setup.
3. Optional: an OMDb API key fills in titles the local database lacks,
   such as brand-new releases. Get a free one at
   <https://www.omdbapi.com/apikey.aspx> (1,000 lookups a day), activate
   it from the email they send, then open the settings panel (click the
   extension's toolbar icon), paste the key, **Save**, and use **Test key**.
   The key comes from OMDb, not IMDb: IMDb itself doesn't issue keys, and
   OMDb is a separate service that mirrors IMDb's ratings.

## Local database

IMDb publishes its ratings as daily data dumps. The extension can answer from
a local copy of them, which uses no OMDb requests and works without a key:

```bash
node tools/build-local-db.mjs
```

That downloads about 240 MB from IMDb, keeps movies and series with at least
25 votes (about 365,000 titles), and writes `data/ratings.json.gz` (about
10 MB) inside the extension folder. Click the reload icon on the extension's
card afterwards. The settings panel shows the database's size and build date.
Run it again whenever you like; weekly is plenty, since ratings move slowly.
Release ZIPs include a database built on the release date.

Lookups go: stored answers, then the local database, then OMDb for titles
the local file doesn't have (brand-new releases, titles under 25 votes). The
OMDb fallback can be switched off on the settings panel. `--min-votes N`
changes the cutoff; lower means more titles and a bigger file.

## Layout

| File | Role |
| --- | --- |
| `manifest.json` | Manifest V3. One content-script entry per site, each loading that site's adapter and then `content.js`; host permission for omdbapi.com only. |
| `sites/netflix.js`, `sites/primevideo.js`, `sites/hulu.js`, `sites/hbomax.js` | Site adapters: which elements are title cards and hover previews, how to read the title (and movie/series type where available), and where the badge goes. |
| `content.js` | Generic: watches the page, looks up titles as cards come near the viewport, draws badges, refreshes stale ones in the background. |
| `background.js` | Service worker: answers from the store, then the local database, then OMDb (with a concurrency limit); permanent store in `chrome.storage.local`, daily request count, pause after a limit error. |
| `local.js` | Loads `data/ratings.json.gz` and looks titles up in it. |
| `tools/build-local-db.mjs` | Builds `data/ratings.json.gz` from IMDb's data dumps. |
| `data/` | The built database. Not in git; release ZIPs include one. |
| `badge.css` | Badge styling, including per-site placement tweaks. |
| `options.html/js` | Key entry and test, usage counter, export/import/clear of the stored ratings. |

## Adding another streaming site

Create `sites/<name>.js` defining `window.IMDBEXT_SITE` in the same shape as
the existing adapters: a `targets` list where each entry has a `kind`
(`card` or `detail`), a `selector`, `titleOf(el)`, `host(el)`, and
optionally `typeOf(el)` (returns `movie` or `series`) and
`place(host, badge)`. Add a `content_scripts` entry in the manifest matching
that site's URLs that loads the adapter before `content.js`, and put any
site-specific badge positioning in `badge.css`. The existing adapters'
header comments record what each site's markup looks like.

Or point Claude Code at this folder, paste the site's URL, and say "add
this one."

## Known limits

- **Title-only matching on Netflix.** Netflix cards expose only the title,
  so lookups are by title with no year or type. Remakes and shared titles
  can match the wrong entry; the badge tooltip shows what was matched. The
  other three sites supply a movie/series hint, which helps.
- **OMDb coverage.** Brand-new or obscure titles sometimes have no OMDb
  entry yet and show `n/a`. Misses are re-checked after three days.
- **OMDb quota.** Only cards within about one screen of the viewport are
  looked up. Every answer is stored permanently and shown immediately; hits
  are re-checked after 30 days and misses after 3, in the background. If
  OMDb reports the daily limit, requests pause for an hour and stored
  ratings keep showing. The settings panel shows today's request count and
  can export/import the store as JSON.
- **Site markup changes.** Selectors rely on each site's stable test
  attributes rather than their hashed class names, but a redesign can still
  break an adapter. Only that site's adapter file needs updating.
