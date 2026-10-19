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
| Netflix | top-right of each tile | line under the preview popup's buttons; in the featured banner, a chip beside Play / More Info | no year or type on cards; the popup's type and year lines pick the right same-named title and also correct the card |
| Prime Video | top-right of each tile; hidden while the card is expanded | chip in the expanded card's metadata row; in the top banner, a chip beside the Watch now button; on a title's own page, a chip in the metadata row after the year | season suffixes stripped; movie/series type and, on title pages, the year passed along |
| Hulu | top-right of each tile | line under the preview panel's metadata; also in the top banner | movie/series type from the link path |
| HBO Max | bottom-right of each poster | none (HBO Max has no hover preview); the badge tooltip works; in the top banner, a chip beside the Watch button; on a title's own page, a chip in the My List / Rate / Trailer row | title parsed from the tile's accessibility label, including episode tiles; movie/series type from the link path; episode tiles on a title's own page name no show, so they get no badge |

## Setup

1. Download the latest `imdb-ratings` ZIP from the
   [Releases page](https://github.com/Lwolf12/chromeext/releases) and
   extract it somewhere permanent (Chrome loads the extension from that
   folder every time it starts). In Chrome open `chrome://extensions`, turn
   on **Developer mode**, click **Load unpacked** and pick the
   `imdb-ratings` folder.
2. The settings panel opens. Click **Update now** to build the ratings
   database (next section): about 240 MB downloaded from IMDb, a few
   minutes, with a progress bar. When it says done, open any of the four
   sites. That's it.
3. Optional: a free OMDb API key fills in titles the database doesn't
   have, such as brand-new releases. Get one at
   <https://www.omdbapi.com/apikey.aspx> (1,000 lookups a day), activate it
   from the email they send, paste it into the settings panel (click the
   extension's toolbar icon), **Save**, and use **Test key**. The key comes
   from OMDb, not IMDb: IMDb itself doesn't issue keys, and OMDb is a
   separate service that mirrors IMDb's ratings.
4. Optional: under **Sites** on the same panel, untick any service you
   don't use. The extension then stays idle on that site (on Prime Video
   that includes all of amazon.com). Changes apply to open tabs at once.

## Local database

IMDb publishes its ratings as daily data dumps, licensed for each person's
own non-commercial use. The extension builds its database from them in your
browser: it downloads about 240 MB from IMDb, keeps movies and series with
at least 25 votes (about 365,000 titles), and stores the result in the
browser's IndexedDB. Lookups then happen locally, with no requests to anyone.

Nothing downloads until you click **Update now** on the settings panel the
first time. After that the database is rebuilt automatically once it is a
week old (another 240 MB each time); the panel shows the title count, build
date and progress, and the weekly refresh can be switched off there, which
is the thing to do on a metered connection. A failed build (offline, say) is
retried a day later.

No ratings data ships with the extension and none is in this repository: the
data is IMDb's, and their licence covers your own copy, not redistribution.

Lookups go: stored answers, then the local database, then OMDb for titles
the database doesn't have (brand-new releases, titles under 25 votes), if a
key is set. The OMDb fallback can be switched off on the settings panel.

## Layout

| File | Role |
| --- | --- |
| `manifest.json` | Manifest V3. One content-script entry per site, each loading that site's adapter and then `content.js`; host permissions for datasets.imdbws.com (the dumps) and omdbapi.com only. |
| `sites/netflix.js`, `sites/primevideo.js`, `sites/hulu.js`, `sites/hbomax.js` | Site adapters: which elements are title cards and hover previews, how to read the title (and movie/series type where available), and where the badge goes. |
| `content.js` | Generic: watches the page, looks up titles as cards come near the viewport, draws badges, refreshes stale ones in the background. |
| `background.js` | Service worker: answers from the store, then the local database, then OMDb (with a concurrency limit); permanent store in `chrome.storage.local`, daily request count, pause after a limit error. |
| `local.js` | Loads `data/ratings.json.gz` and looks titles up in it. |
| `tools/build-local-db.mjs` | Builds `data/ratings.json.gz` from IMDb's data dumps. |
| `data/` | The built database. Not in git and not in release ZIPs; each user builds their own. |
| `badge.css` | Badge styling, including per-site placement tweaks. |
| `options.html/js` | Per-site on/off, key entry and test, usage counter, export/import/clear of the stored ratings. |

## Adding another streaming site

Create `sites/<name>.js` defining `window.IMDBEXT_SITE` in the same shape as
the existing adapters: a `targets` list where each entry has a `kind`
(`card` or `detail`), a `selector`, `titleOf(el)` (a title, or a list of
candidates tried in order), `host(el)`, and
optionally `typeOf(el)` (returns `movie` or `series`), `yearOf(el)` (a
four-digit release year) and `place(host, badge)`. Add a `content_scripts` entry in the manifest matching
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
  entry yet and show `n/a`. OMDb's title search is loose, so an answer
  whose title isn't the one asked for (ignoring case, punctuation and a
  leading "The") is treated as a miss rather than shown; the badge tooltip
  says what OMDb offered. Misses are re-checked after three days, and the
  weekly database rebuild picks new titles up once they have 25 votes.
- **OMDb quota.** Only cards within about one screen of the viewport are
  looked up. Every answer is stored permanently and shown immediately; hits
  are re-checked after 30 days and misses after 3, in the background. If
  OMDb reports the daily limit, requests pause for an hour and stored
  ratings keep showing. The settings panel shows today's request count and
  can export/import the store as JSON.
- **Site markup changes.** Selectors rely on each site's stable test
  attributes rather than their hashed class names, but a redesign can still
  break an adapter. Only that site's adapter file needs updating.
