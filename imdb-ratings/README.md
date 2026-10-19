# IMDb Ratings for Streaming

Chrome extension that overlays the IMDb user rating on every title card
while browsing Netflix, Prime Video, Hulu and HBO Max. Each card gets a small
badge with the rating; hovering a title adds the year and vote count to the
site's own preview where it has one; clicking a badge opens the IMDb page.
Each site is a small adapter file, so more services can be added.

| Site | Card badge | Hover details | Notes |
| --- | --- | --- | --- |
| Netflix | top-right of each tile | line under the preview popup's buttons | title only, no year or type available |
| Prime Video | top-right of each tile; hidden while the card is expanded | chip in the expanded card's metadata row | season suffixes stripped; movie/series type passed to OMDb |
| Hulu | top-right of each tile | line under the preview panel's metadata; also in the top banner | movie/series type from the link path |
| HBO Max | bottom-right of each poster | none (HBO Max has no hover preview); the badge tooltip works | title parsed from the tile's accessibility label, including episode tiles; movie/series type from the link path |

## Setup

1. Get a free OMDb API key at <https://www.omdbapi.com/apikey.aspx> (1,000
   lookups a day) and activate it from the email they send. The key comes
   from OMDb, not IMDb: IMDb itself doesn't issue keys, and OMDb is a
   separate service that mirrors IMDb's ratings. Without a key the
   extension loads but shows no badges.
2. Download the latest `imdb-ratings` ZIP from the
   [Releases page](https://github.com/Lwolf12/chromeext/releases) and
   extract it somewhere permanent (Chrome loads the extension from that
   folder every time it starts). In Chrome open `chrome://extensions`, turn
   on **Developer mode**, click **Load unpacked** and pick the
   `imdb-ratings` folder.
3. The settings panel opens on first install (later: click the extension's
   toolbar icon). Paste the key, **Save**, and use **Test key** to confirm
   OMDb accepts it.
4. Open any of the four sites (reload if it was already open).

## Layout

| File | Role |
| --- | --- |
| `manifest.json` | Manifest V3. One content-script entry per site, each loading that site's adapter and then `content.js`; host permission for omdbapi.com only. |
| `sites/netflix.js`, `sites/primevideo.js`, `sites/hulu.js`, `sites/hbomax.js` | Site adapters: which elements are title cards and hover previews, how to read the title (and movie/series type where available), and where the badge goes. |
| `content.js` | Generic: watches the page, looks up titles as cards come near the viewport, draws badges, refreshes stale ones in the background. |
| `background.js` | Service worker: OMDb lookups with a concurrency limit, permanent store in `chrome.storage.local`, daily request count, pause after a limit error. |
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
