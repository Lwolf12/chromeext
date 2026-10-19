# Chrome Web Store listing: IMDb Ratings for Streaming

Everything to paste into the developer dashboard
(<https://chrome.google.com/webstore/devconsole>). The upload ZIP is built
with `store/imdb-ratings/build-zip.ps1` and lands in `dist/`.

## Store listing tab

**Name** (from the manifest): IMDb Ratings for Streaming

**Summary** (132 characters max):

> Shows the IMDb user rating on every title card while you browse Netflix, Prime Video, Hulu and HBO Max.

**Category:** Entertainment · **Language:** English

**Description:**

> See IMDb ratings without leaving the streaming site. While you browse
> Netflix, Prime Video, Hulu or HBO Max, every title card gets a small badge
> with the IMDb user rating. Hover a title and the site's own preview gets
> an IMDb line with the year and vote count; click it to open the IMDb page.
> Banners and title pages get a rating chip too.
>
> HOW IT WORKS
> The extension builds its own ratings database in your browser from IMDb's
> public data (about 240 MB downloaded from IMDb, a few minutes, once a
> week; the weekly refresh can be switched off for metered connections).
> Lookups then happen locally, on your device, with no requests to anyone.
> Nothing downloads until you click Update now on the settings panel.
>
> OPTIONAL: NEW RELEASES
> Brand-new titles are not in IMDb's data yet. If you want those too, get a
> free OMDb API key (1,000 lookups a day) and paste it into the settings
> panel. Only then are title names sent to OMDb, and only for titles the
> local database does not have.
>
> PRIVACY
> No accounts, no analytics, no server. The extension reads only the title
> names on the cards it decorates and sends nothing about you anywhere.
> Full policy: https://github.com/Lwolf12/chromeext/blob/main/imdb-ratings/PRIVACY.md
>
> OPEN SOURCE
> https://github.com/Lwolf12/chromeext
>
> IMDb is a trademark of IMDb.com, Inc. This extension is an independent
> project, not affiliated with or endorsed by IMDb, OMDb, Netflix, Amazon,
> Hulu or HBO Max.

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
| Content scripts on `www.netflix.com`, `www.primevideo.com`, `www.amazon.com`, `www.hulu.com`, `play.hbomax.com` | Reads the title names shown on each site's title cards, banners and previews and draws the rating badge next to them. amazon.com is matched because Prime Video is served from amazon.com in the US. |

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

- **Trademark in the name.** "IMDb" is a registered trademark; the store's
  impersonation policy is enforced unevenly, and many "IMDb …" extensions
  are listed, but a rejection is possible. If it is rejected on those
  grounds, rename to something like "Ratings for Streaming" and keep "shows
  IMDb user ratings" in the summary, which is a descriptive use.
- **Broad host match on amazon.com.** Content scripts on `www.amazon.com/*`
  count as a broad host permission, which slows review (days rather than
  hours). The justification above explains it; narrowing to
  `https://www.amazon.com/gp/video/*` and the Prime Video paths would speed
  it up, if the adapter still works there.
- **Large download.** Reviewers sometimes ask why an extension pulls 240 MB.
  The description and the settings panel already explain it and nothing
  downloads without a click.
