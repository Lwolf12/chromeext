// Site adapter for Paramount+ (www.paramountplus.com, which includes
// Showtime). Defines window.IMDBEXT_SITE, which content.js uses.
//
// Paramount+'s web app (verified signed in, 2026-10-24). Tiles are
// <a class="link" title="Tulsa King" aria-label="..."> (position:static)
// around a .thumb-wrapper (relative, clipped; the tall "Now Featuring"
// cards have a .prominent-thumb-wrapper instead), where the badge goes. Shows
// link to /shows/<slug>/, movies to /movies/video/<id>/; brand, collection
// and live-TV tiles link elsewhere and are skipped, and so are the rows of
// live games (rows carry data-ci="schedule-<id>", whose games link to
// /shows/ too). On the home page rows are [data-ci="showMovieHybrid-..."],
// "keepWatching-...", "watchlist"; on /movies/ and /shows/ the tiles sit
// outside such rows.
//
// A show's page (/shows/<slug>/): .hero__grid with the title in
// "h1 img[alt]" and .showBadging reading "Comedy 2022 4 TV-MA" (the year
// is the first season's), where the chip goes. Episodes:
// section[data-ci="latest-episodes"], one article.grid-view-item each, with
// <abbr class="season-inline" title="Season 1">S1</abbr> and title="Episode
// 1"; the rating joins the "41M · Nov 13, 2022" line in .info-wrapper.
// A movie opens straight into the player, so movies are rated on tiles only.
//
// Home page banner: .hero__grid slides with the title in "h1 img[alt]"
// ("Tulsa King "), no year, and right after the h1 a call-out ("NEW EPISODE
// NOW STREAMING", "NEW MOVIE ...") that gives the type. Slides whose call-out names neither
// (sports events like "UFC 333") are skipped.

(() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

  function linkType(a) {
    let path = '';
    try {
      path = new URL(a.getAttribute('href') || '', location.href).pathname;
    } catch (e) {
      return null;
    }
    if (/^\/movies\/video\//.test(path)) return 'movie';
    if (/^\/shows\/[^/]+\/?$/.test(path)) return 'series';
    return null;
  }

  // "Season 1" / "Episode 1" from an episode's abbr titles.
  function abbrNumber(el, word) {
    for (const a of el.querySelectorAll('abbr.season-inline[title]')) {
      const m = a.getAttribute('title').match(new RegExp('^' + word + '\\s+(\\d+)$', 'i'));
      if (m) return Number(m[1]);
    }
    return null;
  }

  // A title as Paramount+ spells it in a link: "Mayor of Kingstown" ->
  // "mayor-of-kingstown".
  const slugOf = (s) =>
    (s || '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/['’.]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

  // A show page's first year, from "Drama 2024 2 Seasons TV-MA".
  function showYear(grid) {
    for (const d of grid.querySelectorAll('.showBadging div')) {
      const t = clean(d.textContent);
      if (/^(19|20)\d\d$/.test(t)) return t;
    }
    return null;
  }

  const onShowPage = () => /^\/shows\/[^/]+\/?$/.test(location.pathname);

  // The call-out right after the banner's logo heading.
  const bannerCall = (el) => el.querySelector(':scope > h1')?.nextElementSibling || null;

  function bannerType(el) {
    const call = clean(bannerCall(el)?.textContent);
    if (/\b(season|episode|series)\b/i.test(call)) return 'series';
    if (/\bmovie\b/i.test(call)) return 'movie';
    return null;
  }

  window.IMDBEXT_SITE = {
    name: 'paramountplus',

    targets: [
      {
        kind: 'card',
        selector: 'a.link[title][href*="/shows/"], a.link[title][href*="/movies/video/"]',
        titleOf(el) {
          if (el.closest('[data-ci^="schedule"]') || !linkType(el)) return null;
          // Tall "Now Featuring" cards carry a genre line; sports ones
          // (UFC, college football) aren't titles IMDb rates.
          if (/^sports$/i.test(clean(el.querySelector('.prominent-metadata')?.textContent))) return null;
          return clean(el.getAttribute('title')) || null;
        },
        typeOf: linkType,
        host(el) {
          return el.querySelector('.thumb-wrapper, .prominent-thumb-wrapper');
        },
      },
      {
        // "You May Also Like" on a show page: the same tiles without a title
        // attribute. The only name is the image's alt, which for a show adds
        // a caption ("Marshals - Piya Wiconi"), so the leading part that
        // matches the link's slug (/shows/marshals) is the title; no match
        // (UFC fight cards, renamed shows) means no badge. A movie's alt is
        // its title ("The Running Man (2025)").
        kind: 'card',
        selector: 'a.link:not([title])[href*="/shows/"], a.link:not([title])[href*="/movies/video/"]',
        titleOf(el) {
          const type = linkType(el);
          const alt = clean(el.querySelector('.thumb-wrapper img[alt]')?.alt);
          if (!type || !alt) return null;
          if (type === 'movie') return alt;
          const slug = (new URL(el.href).pathname.match(/^\/shows\/([^/]+)/) || [])[1] || '';
          const want = slug.replace(/_/g, '-');
          const parts = alt.split(' - ');
          for (let n = parts.length; n >= 1; n--) {
            const candidate = clean(parts.slice(0, n).join(' - '));
            if (slugOf(candidate) === want) return candidate;
          }
          return null;
        },
        typeOf: linkType,
        host(el) {
          return el.querySelector('.thumb-wrapper');
        },
      },
      {
        // A show's own page; the chip follows the genre / year / seasons line.
        kind: 'detail',
        selector: '.hero__grid:has(.showBadging)',
        titleOf(el) {
          return onShowPage() ? clean(el.querySelector('h1 img[alt]')?.alt) || null : null;
        },
        typeOf() {
          return 'series';
        },
        yearOf: showYear,
        host(el) {
          return el;
        },
        place(host, badge) {
          const after = host.querySelector(':scope > .showBadging');
          if (after) after.after(badge);
          else host.appendChild(badge);
        },
      },
      {
        // Home page banner slides.
        kind: 'detail',
        selector: '.hero__grid:not(:has(.showBadging)):has(> h1)',
        titleOf(el) {
          if (!bannerType(el)) return null;
          return clean(el.querySelector('img[alt]')?.alt) || null;
        },
        typeOf: bannerType,
        host(el) {
          return el;
        },
        place(host, badge) {
          const after = bannerCall(host);
          if (after) after.after(badge);
          else host.appendChild(badge);
        },
      },
      {
        // A show page's episode grid; each episode names its own season.
        kind: 'episodes',
        selector: 'section[data-ci="latest-episodes"]',
        showOf() {
          const grid = document.querySelector('.hero__grid:has(.showBadging)');
          return onShowPage() && grid ? clean(grid.querySelector('h1 img[alt]')?.alt) || null : null;
        },
        yearOf() {
          const grid = document.querySelector('.hero__grid:has(.showBadging)');
          return grid ? showYear(grid) : null;
        },
        seasonOf(el) {
          const first = this.items(el)[0];
          return first ? first.season : null;
        },
        items(el) {
          return [...el.querySelectorAll('article.grid-view-item')]
            .map((item) => {
              const season = abbrNumber(item, 'season');
              const number = abbrNumber(item, 'episode');
              const row = item.querySelector('.info-wrapper');
              return season != null && number != null && row ? { season, number, row } : null;
            })
            .filter(Boolean);
        },
      },
    ],

    watchAttributes: ['aria-label', 'title', 'href', 'alt'],
  };
})();
