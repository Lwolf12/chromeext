# Show IMDb Ratings on Streaming Services

Chrome extension that overlays the IMDb user rating on every title card
while browsing Netflix, Prime Video, Hulu, HBO Max, Apple TV, Disney+,
Paramount+ and Tubi. Each card gets a small badge with the rating. On
Netflix, Prime Video and Hulu, hovering a title opens the site's own
preview, which gets an IMDb line with the year and vote count; click that
line to open the IMDb page. HBO Max has no preview, so there the badge on
the card is the link. A show's episode list gets a rating next to every
episode, season by season (click one to open that season on IMDb). Each site
is a small adapter file, so more services can be added.

| Site | Card badge | Hover details / title pages | Episode lists | Notes |
| --- | --- | --- | --- | --- |
| Netflix | top-right of each tile, also on New & Popular (not on its "coming soon" rows) and on episode cards ("Hooked from the First Episode"); top-left of the show window's "More Like This" cards (the running time is top-right) | line under the preview popup's buttons; in the featured banner, a chip beside Play / More Info; in the full show window, a line under the buttons | in the show window's episode list, after each title | episode cards and their preview name only the episode: the show is worked out once per episode from Netflix's own page; the popup's type and year lines pick the right same-named title and also correct the card |
| Prime Video | top-right of each tile; hidden while the card is expanded | chip in the expanded card's metadata row; in the top banner, a chip beside the Watch now button; on a title's own page, a chip in the metadata row after the year | on a series page (one page per season), after each episode heading | season suffixes stripped; movie/series type and, on title pages, the year passed along |
| Hulu | top-right of each tile; top-left of the tall "Because you watched" cards | line under the preview panel's metadata; also in the top banner; on a series page, a chip after its metadata | on a series page, after each "S2 E1 - …" tile title | movie/series type from the link path; a series page's year tells a revival from the original |
| HBO Max | bottom-right of each poster | none (HBO Max has no hover preview); the badge tooltip works; in the top banner, a chip beside the Watch button; on a title's own page, a chip in the My List / Rate / Trailer row | on a show page, after each episode title | title parsed from the tile's accessibility label; movie/series type from the link path |
| Apple TV | top-right of each poster; Continue Watching tiles get their show's rating top-left (Apple's logo is top-right) | none (no hover preview); in a room's top banner and on a title's own page, a chip in the metadata line ("TV Show · Drama", age rating) | on a show page, on each tile's "EPISODE 3" line; all seasons share one scrolling row, and each tile's season is worked out from its position and the season picker | movie/series type from the link path, year from the title page |
| Disney+ | top-right of each poster and Continue Watching tile | none (no hover preview); in the home page banner, a chip in the rating / year / genre line; on a title's own page, a chip under the "1998 – 2005 • 8 Seasons" line | in the Episodes tab, after each episode title | titles from the poster art's alt text or the tile's label (badges, "Hulu Original Series" and network names stripped); year from "Released 2006" where the row gives it; live sports, playlists and collections skipped |
| Paramount+ (includes Showtime) | top-right of each tile | none (no hover preview); in the home page banner, a chip under the title; on a show's own page, a chip under the genre / year / seasons line | on a show page, after each episode's "41M · Nov 13, 2022" line | movie/series type from the link path (/movies/video/, /shows/); a show page's year is the first season's; movies open straight into the player, so they are rated on tiles only; live-game rows, brand and collection tiles skipped |
| Tubi | top-right of each poster, and of each thumbnail in a title page's "You May Also Like" list | Tubi's own banner already shows an IMDb score; on a title's own page, a chip in the "Crime · 2003 · 16 Seasons" line | on a series page, in each episode's "1 hr 40 min" line | movie/series type from the link path; year passed only for movies (a series' year is a recent season's) |

## Setup

1. Install it from the
   [Chrome Web Store](https://chromewebstore.google.com/detail/biopmnlghmgjoloionocinndfopncelh).
   (Or, without the store: download the latest `imdb-ratings` ZIP from the
   [Releases page](https://github.com/Lwolf12/chromeext/releases), extract
   it somewhere permanent, open `chrome://extensions`, turn on **Developer
   mode**, click **Load unpacked** and pick the `imdb-ratings` folder.)
2. The settings open in their own small window. Click **Update now** to build the
   ratings database (next section): about 280 MB downloaded from IMDb, a
   few minutes, with a progress bar. When it says done, open any of the
   streaming sites. That's it. If you closed the window first: the extension's star
   icon sits in Chrome's puzzle-piece menu (pin it to keep it in the
   toolbar, where it shows a yellow **!** until the database is built), and
   the sites themselves show a small "Click to set up ratings" notice in
   the bottom-right corner. Either one opens the settings.
3. Optional: a free OMDb API key fills in titles the database doesn't
   have, such as brand-new releases. Get one at
   <https://www.omdbapi.com/apikey.aspx> (1,000 lookups a day), activate it
   from the email they send, paste it into the settings panel (click the
   extension's toolbar icon), **Save**, and use **Test key**. The key comes
   from OMDb, not IMDb: IMDb itself doesn't issue keys, and OMDb is a
   separate service that mirrors IMDb's ratings. Once the key works, the
   OMDb section also offers **Also show**: Rotten Tomatoes, Metacritic and
   an awards headline next to the IMDb rating in previews, banners and
   title pages (one request per title, remembered for 30 days), and with
   **On cards too** the two scores on card badges as well, which uses more
   of the 1,000 lookups a day. Mostly films: OMDb rarely has these scores
   for series. Clicking the tomato score opens Rotten Tomatoes and the MC
   score Metacritic (the title's page when OMDb knows it, else that site's
   search); the rest of the badge opens IMDb. Until the key works those
   boxes are greyed out.
4. Optional: every service is on from the start, and the extension does
   nothing on a site you don't visit. To stop seeing ratings on one, untick
   it under **Sites** on the same panel; the extension then stays idle
   there. Changes apply to open tabs at once.
5. Optional: under **Badges on title cards**, show card badges always,
   only when the mouse is over a card, or not at all (previews, banners
   and title pages keep their rating either way); hide the grey "n/a"
   badges; and pick the label before the score, a star (default) or the
   yellow IMDb tag. Hovering any badge says it is the IMDb rating.

## Local database

IMDb publishes its ratings as daily data dumps, licensed for each person's
own non-commercial use. The extension builds its database from them in your
browser: it downloads about 280 MB from IMDb, keeps films and series with at
least 25 votes (about 420,000 titles; films include TV films, TV specials,
direct-to-video releases and shorts, shorts only from 100 votes) and the
episodes of those series, and stores the result in the browser's IndexedDB.
Lookups then happen locally, with no requests to anyone.

Nothing downloads until you click **Update now** on the settings panel the
first time. After that the database is rebuilt automatically once it is a
week old (another 280 MB each time); the panel shows the title count, build
date and progress, and the weekly refresh can be switched off there, which
is the thing to do on a metered connection. A failed build (offline, say) is
retried a day later. An update that changes how the database is stored
(`FORMAT` in `db.js`) also rebuilds it once, whatever its age; with the
weekly refresh off, the panel asks for Update now instead.

No ratings data ships with the extension and none is in this repository: the
data is IMDb's, and their licence covers your own copy, not redistribution.

Lookups go: stored answers, then the local database, then OMDb for titles
the database doesn't have (brand-new releases, titles under 25 votes), if a
key is set. The OMDb fallback can be switched off on the settings panel.

## Layout

| File | Role |
| --- | --- |
| `manifest.json` | Manifest V3. One content-script entry per site, each loading that site's adapter and then `content.js`; host permissions for datasets.imdbws.com (the dumps) and omdbapi.com only. |
| `sites/netflix.js`, `sites/primevideo.js`, `sites/hulu.js`, `sites/hbomax.js`, `sites/appletv.js`, `sites/disneyplus.js`, `sites/paramountplus.js`, `sites/tubi.js` | Site adapters: which elements are title cards and hover previews, how to read the title (and movie/series type where available), and where the badge goes. |
| `content.js` | Generic: watches the page, looks up titles as cards come near the viewport, draws badges, refreshes stale ones in the background. |
| `background.js` | Service worker: answers from the store, then the local database, then OMDb (with a concurrency limit); permanent store in `chrome.storage.local`, daily request count, pause after a limit error. |
| `local.js` | Loads `data/ratings.json.gz` and looks titles up in it. |
| `tools/build-local-db.mjs` | Builds `data/ratings.json.gz` from IMDb's data dumps. |
| `data/` | The built database. Not in git and not in release ZIPs; each user builds their own. |
| `badge.css` | Badge styling, including per-site placement tweaks. |
| `options.html/js` | Database build and status, per-site on/off, badge options, OMDb key entry and test, usage counter, clearing remembered ratings, deleting the database. |

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
  other sites supply a movie/series hint, which helps. Apple TV's cards
  give the type but no year, so a card for a remake can show the older
  film's rating until its title page (which has the year) is opened once.
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
  ratings keep showing. The settings panel shows today's request count.
- **Site markup changes.** Selectors rely on each site's stable test
  attributes rather than their hashed class names, but a redesign can still
  break an adapter. Only that site's adapter file needs updating.

## Credits

Information courtesy of IMDb (<https://www.imdb.com>). Used with permission.
The ratings come from IMDb's non-commercial datasets, which IMDb allows for
personal and non-commercial use with this attribution.
