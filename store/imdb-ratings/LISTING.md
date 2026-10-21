# Chrome Web Store listing: Show IMDb Ratings on Streaming Services

Everything to paste into the developer dashboard
(<https://chrome.google.com/webstore/devconsole>). The upload ZIP is built
with `store/imdb-ratings/build-zip.ps1` and lands in `dist/`.

## Store listing tab

**Name** (from the manifest): Show IMDb Ratings on Streaming Services

**Summary** (132 characters max):

> Shows the IMDb user rating on every title card while you browse Netflix, Prime Video, Hulu and HBO Max.

**Category:** Entertainment · **Language:** English

**Description:**

> See IMDb ratings without leaving the streaming site. While you browse
> Netflix, Prime Video, Hulu or HBO Max, every title card gets a small
> rating badge. Hovering a title adds the year and vote count to the site's
> own preview, with a link to the title's page. Banners and title pages get
> a rating chip too.
>
> HOW IT WORKS
> The extension builds its own ratings database in your browser from IMDb's
> public data (about 240 MB, a few minutes, refreshed weekly; the refresh
> can be switched off for metered connections). Lookups then happen on your
> device, with no requests to anyone. Nothing downloads until you click
> Update now in the settings. Only use some of the services? Untick the
> others in the settings and the extension stays idle there.
>
> OPTIONAL: NEW RELEASES
> Brand-new titles are not in the public data yet. To cover those, get a
> free API key from omdbapi.com (1,000 lookups a day) and paste it into the
> settings. Only then are title names sent to that service, and only for
> titles the local database does not have.
>
> PRIVACY
> No accounts, no analytics, no server. The extension reads only the title
> names on the cards it decorates and sends nothing about you anywhere.
> Full policy: https://github.com/Lwolf12/chromeext/blob/main/imdb-ratings/PRIVACY.md
>
> OPEN SOURCE
> https://github.com/Lwolf12/chromeext
>
> Independent project, not affiliated with or endorsed by IMDb or any
> streaming service.

0.8.1 was rejected as "Keyword Spam" (Yellow Argon) for the earlier closing
line, which listed IMDb, OMDb, Netflix, Amazon, Hulu and HBO Max in a row.
The description was then trimmed to name each streaming service once and
IMDb three times plus the notice. Keep brand names out of lists and
repetition.

**Icon:** `imdb-ratings/icons/icon128.png` (taken from the ZIP automatically).

**Screenshots** (required, at least one; 1280×800 or 640×400 PNG/JPEG, no
alpha): take them yourself with the extension loaded, since they must show
the real thing. Suggested set:

1. Netflix browse row with badges on the tiles.
2. A Netflix hover preview showing the IMDb line with year and votes.
3. Prime Video or HBO Max title page with the rating chip in the metadata row.
4. The settings panel after a build (title count and build date visible).

Size a Chrome window to 1280×800 (DevTools → device toolbar → Responsive →
1280×800 and take the capture from there, or Win+Shift+S and crop) and avoid
anything personal in the frame (profile name, continue-watching row).

**Small promo tile** (440×280, optional; it makes the listing eligible for
featuring): skip for the first submission.

**Official URL / Homepage:** https://github.com/Lwolf12/chromeext
**Support URL:** https://github.com/Lwolf12/chromeext/issues

## Privacy practices tab

**Single purpose description:**

> Overlays the IMDb user rating on title cards, banners and preview panels
> while the user browses Netflix, Prime Video, Hulu and HBO Max.

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| `storage` | Keeps the user's settings (weekly refresh on/off, OMDb fallback on/off, optional OMDb API key) and the ratings already looked up, so each title is fetched once. |
| `unlimitedStorage` | The ratings database built from IMDb's data (about 365,000 titles) is stored in IndexedDB and exceeds the default extension quota. |
| `alarms` | A periodic alarm checks whether the local database is over a week old and, if the user left automatic refresh on, rebuilds it. |
| `offscreen` | Building the database (downloading and parsing IMDb's dumps) takes minutes and runs in a Web Worker, which the service worker cannot host; an offscreen document hosts the worker. |
| Host permission `https://datasets.imdbws.com/` | Downloads IMDb's public ratings data dumps to build the local database. |
| Host permission `https://www.omdbapi.com/` | Optional fallback lookups for titles not in the local database, only when the user has entered an OMDb API key. |
| Content scripts on `www.netflix.com`, `www.primevideo.com`, `www.amazon.com/gp/video/`, `www.hulu.com`, `play.hbomax.com` | Reads the title names shown on each site's title cards, banners and previews and draws the rating badge next to them. In the US Prime Video is served from amazon.com under /gp/video/, so only that path is matched; the rest of amazon.com is never touched. Each service can be switched off on the settings panel, after which the script does nothing on that site beyond one settings read. |

**Are you using remote code?** No. All code is in the package; `importScripts` loads only packaged files.

**Data usage** (what the extension collects). Recommended answers:

- Tick **Authentication information**: the user's OMDb API key is stored in
  synced extension storage and sent to omdbapi.com with each fallback
  request. (Only if the user enters one.)
- Tick **Website content**: the title names read from the streaming site are
  sent to omdbapi.com for fallback lookups. (Only if the user enables the
  fallback.)
- Leave everything else unticked: no personal info, health, financial,
  communications, location, web history or user activity is collected.
- Tick all three certifications: not sold to third parties; not used for
  purposes unrelated to the single purpose; not used to determine
  creditworthiness or for lending.

**Privacy policy URL:**
https://github.com/Lwolf12/chromeext/blob/main/imdb-ratings/PRIVACY.md
(the file must be committed and pushed before the reviewer can open it).

## Distribution tab

Visibility **Public**, all regions, free.

## Things the reviewer may raise

- **Trademark in the name.** "IMDb" is a registered trademark. The name
  uses it descriptively ("Show IMDb Ratings on …") rather than as a brand,
  many "IMDb Ratings for Netflix"-style extensions are listed, and the
  description ends with a non-affiliation notice.
- **amazon.com match.** Content scripts run only on
  `www.amazon.com/gp/video/*`, where Prime Video's storefront and title
  pages live. Prime title pages reached through `/dp/<ASIN>` links (from
  Google or Amazon search) render the same page but get no chip; matching
  `/dp/*` would mean every Amazon product page, which is not worth the
  broader permission.
- **Large download.** Reviewers sometimes ask why an extension pulls 240 MB.
  The description and the settings panel already explain it and nothing
  downloads without a click.
