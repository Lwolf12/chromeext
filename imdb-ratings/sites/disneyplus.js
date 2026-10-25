// Site adapter for Disney+ (www.disneyplus.com). Defines window.IMDBEXT_SITE,
// which content.js uses. Opt-in: it only runs once the user ticks Disney+ in
// the settings and allows the site (OPTIONAL_SITES in background.js).
//
// Disney+'s web app (verified signed in, 2026-10-24; class names are
// hashed, data-testid attributes are stable). Every tile is an
// <a data-testid="set-item" href="/browse/entity-<id>"> (position:relative)
// inside <section data-testid="set-section" data-set-style="...">. Its
// aria-label mixes in badges and brands ("New Series Badge Phony Hulu
// Original Series Select for details on this title."), so the title comes
// from the poster's images instead: [data-testid="poster-vertical-title-art"]
// or [data-testid="poster-set-item-background"] img alt ("Charmed (1998)";
// content.js's lookup turns a trailing "(1998)" into a year hint). Poster
// rows' labels add "Released 2006." and a "New Movie"/"New Series" badge
// may give the type. Continue Watching tiles have empty alts; their label
// reads "The Rookie 2 hours 6 minutes remaining" or "Shark Tank Season 1
// Episode 13 Week 13 30 minutes remaining". Live sports tiles get nothing.
// Collection and franchise tiles ("Halloween", "Playlists") link to
// /browse/page-<id> instead of /browse/entity-<id>, so they are skipped by
// their link (their row style, "poster_art", also holds real titles).
//
// A title's page: [data-testid="explore-details-view"], title in
// [data-testid="details-title-treatment"] img alt, and
// [data-testid="masthead-metadata"] reading "1998 – 2005 • 8 Seasons •
// Drama" for a series, "2006 • 1h 50m • Comedy" for a movie. The Episodes
// tab lists set-items labelled "Season 1 Episode 1 Something Wicca ...",
// with the title line "1. Something Wicca ..." in
// [data-testid="standard-regular-list-item-title"].
//
// The home page's rotating banner: [data-testid="hero-immersive-set-item"],
// title in [data-testid="hero-immersive-title-treatment"] alt,
// "1989 • Comedy, Animation" in [data-testid="undefined-metadata-text"],
// and a promo line ("Season 37 Now Streaming") that marks most series.

(() => {
  // Also drops ™ and ®: "Spider-Man™: Homecoming" would otherwise
  // normalise to "spider mantm homecoming".
  const clean = (s) => (s || '').replace(/[™®℠]/g, '').replace(/\s+/g, ' ').trim();
  const firstYear = (text) => (clean(text).match(/\b(19|20)\d\d\b/) || [null])[0];

  const EPISODE = /\bseason\s+(\d+)\s+episode\s+(\d+)\b/i;

  // The title inside a tile's label, which wraps it in a badge prefix
  // ("New Movie Badge", "This is a badge highlighting the content is newly
  // added.") and a brand suffix ("Disney+ Original", "Hulu Original
  // Series", "National Geographic", "ESPN+"), then "Select for details on
  // this title." Continue Watching: "<title> [Season 1 Episode 13 ...]
  // 2 hours 6 minutes remaining". Episode rows and live sports: null.
  function titleFromLabel(label) {
    // An episode row ("ABC Season 1 Episode 1 Series Premiere ...": some
    // start with the network) is not a title; Continue Watching's episode
    // tiles end in "remaining" and name the show first.
    if (/^live\b/i.test(label) || (EPISODE.test(label) && !/\bremaining$/i.test(label))) return null;
    let t = label
      .replace(/\s+(select for details on this title|select to watch this|choose feed entry)\.?$/i, '')
      .replace(/\s+(\d+\s+hours?\s*)?(\d+\s+minutes?\s*)?remaining$/i, '')
      .replace(/\s+season\s+\d+\s+episode\s+\d+\b.*$/i, '')
      .replace(/\s+rated\s+\S+\s+released\s+(19|20)\d\d\..*$/i, '')
      .replace(/\s+released\s+(19|20)\d\d\..*$/i, '')
      .replace(/^(this is a badge[^.]*\.|(\S+\s+){0,2}badge)\s+/i, '')
      .replace(/^new (season|episodes?|series|movie)\s+/i, '')
      .replace(/^espn\+\s+/i, '')
      .replace(/\s+((disney\+|hulu|fx|abc|freeform|star|espn\+?|nat geo|national geographic)\s+originals?(\s+(series|movie|film|special))?|national geographic|espn\+)$/i, '');
    t = clean(t);
    return t || null;
  }

  // "Star Wars: The Force Awakens (Episode VII)" is IMDb's "Star Wars:
  // Episode VII - The Force Awakens"; as read, it would match a RiffTrax
  // commentary instead.
  function withStarWars(titles) {
    const m = titles.length && titles[0].match(/^star wars:\s+(.+?)\s+\(episode\s+([ivx]+)\)$/i);
    return m ? ['Star Wars: Episode ' + m[2].toUpperCase() + ' - ' + m[1], ...titles] : titles;
  }

  function tileTitle(el) {
    return withStarWars([].concat(tileCandidates(el) || [])).filter(Boolean);
  }

  function tileCandidates(el) {
    // Title art first: in poster rows the background image comes earlier
    // in the tile and has an empty alt.
    for (const sel of ['[data-testid="poster-vertical-title-art"] img', '[data-testid="poster-set-item-background"] img']) {
      const alt = clean(el.querySelector(sel)?.alt);
      if (alt) return alt;
    }
    const title = titleFromLabel(clean(el.getAttribute('aria-label')));
    if (!title) return null;
    // Some rows end the label with the network ("Grey's Anatomy ABC",
    // "Teen Titans Go! Cartoon Network"), and Marvel films start with
    // "Marvel Studios'". The label as read is tried first (a title can end
    // in "Fox"), then without those.
    const bare = title.replace(NETWORK, '').replace(/^marvel studios[’']\s+/i, '');
    return bare && bare !== title ? [title, bare] : title;
  }

  const NETWORK = new RegExp(
    '\\s+(ABC|CBS|NBC|FOX|FX|FXX|A&E|Lifetime|History|TLC|HGTV|Bravo|Freeform|Hulu|Disney XD|Disney Junior|' +
      'Disney Channel|Cartoon Network|Adult Swim|ESPN\\d?|ESPNU|ESPN Global|SEC Network|ACC Network|' +
      'Nat Geo( Wild)?|Food Network|Investigation Discovery|Discovery|Oxygen|Syfy|PBS)$'
  );

  function tileType(el) {
    const label = clean(el.getAttribute('aria-label'));
    if (/\bseason\s+\d+\s+episode\s+\d+\b/i.test(label) || /^new (series|episode|season)\b/i.test(label)) return 'series';
    if (/^new movie\b/i.test(label)) return 'movie';
    return null;
  }

  // "1998 – 2005 • 8 Seasons • Drama" or "2006 • 1h 50m • Comedy".
  function mastheadType(el) {
    const text = clean(el.querySelector('[data-testid="masthead-metadata"]')?.textContent);
    if (/\b\d+\s+seasons?\b|\bseason\s+\d+\b|\bepisodes?\b/i.test(text)) return 'series';
    if (/\b\d+h\b|\b\d+m\b/.test(text)) return 'movie';
    return null;
  }

  const detailsView = () => document.querySelector('[data-testid="explore-details-view"]');
  const detailsTitle = (el) => clean(el.querySelector('[data-testid="details-title-treatment"] img')?.alt) || null;


  window.IMDBEXT_SITE = {
    name: 'disneyplus',

    targets: [
      {
        kind: 'card',
        // Titles link to /browse/entity-<id>, and Continue Watching to
        // /play/<id> (so do episode rows, hence only that row style).
        // Collections and franchise hubs go to /browse/page-<id> and
        // playlists ("Comedy Movies") to /play.
        selector:
          'section[data-testid="set-section"] a[data-testid="set-item"][href^="/browse/entity-"], ' +
          'section[data-testid="set-section"][data-set-style="continue_watching"] a[data-testid="set-item"][href^="/play/"]',
        titleOf: tileTitle,
        typeOf: tileType,
        yearOf(el) {
          const m = clean(el.getAttribute('aria-label')).match(/\breleased\s+((19|20)\d\d)\b/i);
          return m ? m[1] : null;
        },
        host(el) {
          return el.querySelector('[data-testid="set-item-tile"]') || el;
        },
      },
      {
        // Home page banner; the chip joins the rating / year / genre line.
        kind: 'detail',
        selector: '[data-testid="hero-immersive-set-item"]',
        titleOf(el) {
          const t = clean(el.querySelector('[data-testid="hero-immersive-title-treatment"]')?.alt);
          return t ? withStarWars([t]) : null;
        },
        typeOf(el) {
          const promo = clean(el.querySelector('[data-testid="hero-promo-label"]')?.textContent);
          return /\b(season|episode|series)\b/i.test(promo) ? 'series' : null;
        },
        yearOf(el) {
          return firstYear(el.querySelector('[data-testid="undefined-metadata-text"]')?.textContent);
        },
        host(el) {
          return el.querySelector('[data-testid="undefined-metadata-text"]')?.parentElement || null;
        },
      },
      {
        // A title's own page; the chip goes under the metadata line.
        kind: 'detail',
        selector: '[data-testid="explore-details-view"]',
        titleOf(el) {
          const t = detailsTitle(el);
          return t ? withStarWars([t]) : null;
        },
        typeOf: mastheadType,
        yearOf(el) {
          return firstYear(el.querySelector('[data-testid="masthead-metadata"]')?.textContent);
        },
        host(el) {
          return el.querySelector('[data-testid="masthead-metadata"]');
        },
      },
      {
        // The Episodes tab. Each row says its own season and number.
        kind: 'episodes',
        selector: '[data-testid="tab-panel--active"]',
        showOf() {
          const view = detailsView();
          return view && mastheadType(view) === 'series' ? detailsTitle(view) : null;
        },
        yearOf() {
          const view = detailsView();
          return view ? firstYear(view.querySelector('[data-testid="masthead-metadata"]')?.textContent) : null;
        },
        seasonOf(el) {
          const first = this.items(el)[0];
          return first ? first.season : null;
        },
        items(el) {
          return [...el.querySelectorAll('a[data-testid="set-item"]')]
            .map((a) => {
              const m = clean(a.getAttribute('aria-label')).match(EPISODE);
              const row = a.querySelector('[data-testid="standard-regular-list-item-title"] > div');
              return m && row ? { season: Number(m[1]), number: Number(m[2]), row } : null;
            })
            .filter(Boolean);
        },
      },
    ],

    // Tiles are reused for other titles as rows scroll and the banner
    // rotates; their labels and image alts change with them.
    watchAttributes: ['aria-label', 'alt'],
  };
})();
