# Privacy policy: Show IMDb Ratings on Streaming Services

Last updated: 2026-10-24

This extension shows IMDb user ratings on title cards while you browse
Netflix, Prime Video, Hulu, HBO Max, Apple TV, Disney+, Paramount+ and Tubi.
It has no accounts, no analytics and no server of its own. Everything below
runs in your browser.

## What the extension stores

All of this stays on your device, in Chrome's extension storage and
IndexedDB, and is removed when you uninstall the extension:

- **The ratings database**: a copy of IMDb's public ratings data (titles,
  years, ratings, vote counts) that the extension downloads from IMDb and
  builds in your browser. It contains no information about you.
- **Stored answers**: for each title you have scrolled past, the rating that
  was found (or that nothing was found), with a timestamp, so it does not
  have to be looked up again.
- **Settings**: whether the weekly database refresh is on, whether the OMDb
  fallback is on, and, if you entered one, your OMDb API key. Settings are
  kept in Chrome's synced extension storage, so if Chrome sync is on they
  follow your Chrome profile to your other devices through your Google
  account, as with any extension's settings.

## What leaves your browser

- **To IMDb (datasets.imdbws.com)**: when you click Update now, or weekly if
  the automatic refresh is on, the extension downloads IMDb's public data
  dumps. The request carries no information about you beyond what any
  download carries (your IP address).
- **To OMDb (omdbapi.com)**: only if you turn on the OMDb fallback and enter
  an API key. Then, for titles the local database does not have, the
  extension sends that title's name (and, where the site provides it, its
  year and whether it is a movie or series) together with your API key, so
  OMDb can answer. If you also tick any of the extra scores (Rotten
  Tomatoes, Metacritic, awards), then for each title whose preview, banner
  or title page you look at (and, with "On cards too", each title card you
  scroll past), the extension sends that title's IMDb ID with your key,
  once a month at most. OMDb's own privacy policy applies to
  those requests. With the fallback off, nothing is ever sent to OMDb.
- **To Netflix (netflix.com)**: Netflix's episode cards (rows like "Hooked
  from the First Episode") don't say which show they belong to. For each
  such card, once, the extension asks Netflix for that episode's public
  page, signed out (without your Netflix cookies), and reads the show's ID
  and name from it. That is the same page anyone can open; it tells Netflix
  nothing beyond what browsing Netflix already does.

Nothing else is sent anywhere. The extension does not send your browsing
activity, your watch history, the pages you visit or anything you type to
anyone, including the developer. It does not read anything on the streaming
sites other than the title names, years and movie/series type shown on the
cards, banners and preview panels it decorates.

## Data sharing and sale

No data is sold, shared with third parties or used for advertising. The
only third parties that receive anything are IMDb and OMDb (and Netflix,
for its own public episode pages), as described above, and only to do what
the extension does.

## Changes and contact

If this policy changes, the new version will be published at the same
address and the extension's store listing will link to it. Questions:
open an issue at <https://github.com/Lwolf12/chromeext/issues>.

IMDb is a trademark of IMDb.com, Inc. This extension is an independent
project and is not affiliated with, endorsed by or sponsored by IMDb, OMDb,
Netflix, Amazon, Hulu, Warner Bros. Discovery, Apple, Disney, Paramount or Tubi.
