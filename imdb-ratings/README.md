# IMDb Ratings for Streaming

Chrome extension that overlays the IMDb user rating on each title card while
browsing Netflix and Prime Video. Hovering a card shows the rating with year
and vote count inside the site's own preview; clicking it opens the IMDb page.
Planned: Hulu and others, each as a small site adapter.

| Site | Card badge | Hover details | Notes |
| --- | --- | --- | --- |
| Netflix | top-right of each tile | line under the preview popup's buttons | title only, no year or type available |
| Prime Video | top-right of each tile; hidden while the card is expanded | chip in the expanded card's metadata row | season suffixes stripped; movie/series type passed to OMDb |
| Hulu | top-right of each tile | line under the preview panel's metadata; also in the top banner | movie/series type from the link path |
| HBO Max | bottom-right of each poster | none (HBO Max has no hover preview); the badge tooltip works | title parsed from the tile's accessibility label, including episode tiles; movie/series type from the link path |

## Setup

1. Get a free OMDb API key at <https://www.omdbapi.com/apikey.aspx> (1,000
   lookups a day) and activate it from the email they send.
2. Download this repository (green **Code** button, **Download ZIP**) and
   extract it, or clone it. In Chrome open `chrome://extensions`, turn on
   **Developer mode**, click
   **Load unpacked** and pick the `imdb-ratings` folder.
3. Click the extension's toolbar icon, paste the key, **Save**.
4. Open <https://www.netflix.com/browse> (reload if it was already open).

## Layout

| File | Role |
| --- | --- |
| `manifest.json` | Manifest V3. Content scripts on netflix.com, host permission for omdbapi.com only. |
| `sites/netflix.js` | Site adapter: how to find a card and read its title on Netflix. |
| `content.js` | Generic: watches the page, looks up titles as cards near the viewport, draws badges. |
| `background.js` | Service worker: OMDb lookups, 7-day cache in `chrome.storage.local`, concurrency limit. |
| `badge.css` | Badge styling. |
| `options.html/js` | Key entry and cache clearing. |

## Adding another streaming site

Create `sites/<name>.js` defining `window.IMDBEXT_SITE` with the same three
members as the Netflix one (`cardSelector`, `titleOf(card)`,
`badgeHost(card)`), add a `content_scripts` entry in the manifest matching
that site's URLs that loads the adapter before `content.js`, and add any CSS
the badge host needs to `badge.css`.

## Known limits

- **Title-only matching.** Netflix cards expose only the title, so lookups
  are by title with no year. Remakes and shared titles can match the wrong
  entry; the badge tooltip shows what was matched. A later version could pull
  the year from Netflix's title page.
- **OMDb quota.** Only cards within about one screen of the viewport are
  looked up. Every answer is stored permanently in `chrome.storage.local`
  and shown immediately; hits are re-checked after 30 days and misses after
  3, in the background. If OMDb reports the daily limit, requests stop until
  the next UTC day and stored ratings keep showing. The options page shows
  today's request count and can export/import the store as JSON.
- **Netflix markup.** Selectors rely on Netflix's `data-uia` attributes
  (`standard-card`, `ranked-card`, `progress-card`), which are stable across
  their hashed class names but can still change.
