// Site adapter for Tubi (tubitv.com). Defines window.IMDBEXT_SITE, which
// content.js uses. Opt-in: it only runs once the user ticks Tubi in the
// settings and allows the site (OPTIONAL_SITES in background.js).
//
// Tubi's web app (verified 2026-10-24; free, no sign-in needed). Most class
// names are hashed, but the tiles use readable BEM classes: a
// .web-content-tile (position:relative) with .web-content-tile__poster,
// .web-content-tile__title, .web-content-tile__year and a poster link to
// /movies/<id> or /series/<id>. A movie's year is its release year; a
// series' year is a recent season's (Columbo shows 2003, Midsomer Murders
// 2024), so it is only passed along for movies.
//
// A title's own page (/movies/<id>/<slug>, /series/<id>/<slug>) has the
// title in an h1.sr-only next to the logo image; its parent's parent holds
// the metadata line and description, where the chip goes. A movie's year
// is in the tab title ("Romancing the Stone (1984) - Stream Free | Tubi").
//
// Episodes on a series page: h3 headings "S01:E01 - The Killings at
// Badgers Drift" in a [data-test-id="web-ui-grid-container"], one season
// at a time (a "Season 1" dropdown switches). The page itself sits in an
// outer grid container, so each list only claims the headings whose
// nearest grid container it is. The heading clips its text, so the rating
// goes in the heading's parent, after it.
//
// Home page banner: a[title] around an h2 with the title; the
// .web-attributes line ("Mystery · 1973 · 1 hr 53 min") sits a few levels
// up, and the chip joins it.

(() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const firstYear = (text) => (clean(text).match(/\b(19|20)\d\d\b/) || [null])[0];

  const pathType = (path) => (/^\/movies\//.test(path) ? 'movie' : /^\/series\//.test(path) ? 'series' : null);
  const hrefPath = (a) => {
    try {
      return new URL(a.getAttribute('href') || '', location.href).pathname;
    } catch (e) {
      return '';
    }
  };

  function tileLink(el) {
    return el.querySelector('a[href^="/movies/"], a[href^="/series/"]');
  }

  const EPISODE = /^S(\d+):E(\d+)\s+-\s+/i;
  const GRID = '[data-test-id="web-ui-grid-container"]';

  // A title page's own metadata line ("Mystery · 2024 · 23 Seasons",
  // "Action · 1984 · 1 hr 46 min"): the first element near the h1 title
  // (within three levels up: one on movie pages, two on series pages)
  // whose text has "· <year> ·" and none of whose children do, outside
  // links (the side list and episodes are links) and tiles. Its classes
  // are hashed on movie pages, so it is found by its text.
  const META = /·\s*(19|20)\d\d\s*·/;
  function titleMeta(h1) {
    for (let box = h1.parentElement, i = 0; box && i < 3; box = box.parentElement, i++) {
      for (const e of box.querySelectorAll('*')) {
        if (e.textContent.length > 120 || !META.test(e.textContent)) continue;
        if ([...e.children].some((c) => META.test(c.textContent))) continue;
        if (e.closest('a, .web-content-tile')) continue;
        return e;
      }
    }
    return null;
  }

  // The banner's .web-attributes line, a few levels above its title link.
  function bannerAttrs(link) {
    let box = link;
    for (let i = 0; i < 4 && box; i++) {
      box = box.parentElement;
      const attrs = box && box.querySelector('.web-attributes');
      if (attrs && !attrs.closest('.web-content-tile')) return attrs;
    }
    return null;
  }

  window.IMDBEXT_SITE = {
    name: 'tubi',

    targets: [
      {
        kind: 'card',
        selector: '.web-content-tile',
        titleOf(el) {
          const t = el.querySelector('.web-content-tile__title') || el.querySelector('img[alt]');
          return clean(t && (t.textContent || t.alt)) || null;
        },
        typeOf(el) {
          const a = tileLink(el);
          return a ? pathType(hrefPath(a)) : null;
        },
        yearOf(el) {
          const a = tileLink(el);
          if (!a || pathType(hrefPath(a)) !== 'movie') return null;
          return firstYear(el.querySelector('.web-content-tile__year')?.textContent);
        },
        host(el) {
          return el.querySelector('.web-content-tile__poster') || el;
        },
      },
      {
        // Home page banner.
        kind: 'detail',
        selector: 'a[title][href^="/movies/"]:has(> h2), a[title][href^="/series/"]:has(> h2)',
        titleOf(el) {
          return clean(el.getAttribute('title')) || null;
        },
        typeOf(el) {
          return pathType(hrefPath(el));
        },
        yearOf(el) {
          return pathType(hrefPath(el)) === 'movie' ? firstYear(bannerAttrs(el)?.textContent) : null;
        },
        host(el) {
          return bannerAttrs(el)?.parentElement || null;
        },
      },
      {
        // A title's own page.
        kind: 'detail',
        selector: 'h1.sr-only',
        titleOf(el) {
          return pathType(location.pathname) ? clean(el.textContent) || null : null;
        },
        typeOf() {
          return pathType(location.pathname);
        },
        yearOf() {
          if (pathType(location.pathname) !== 'movie') return null;
          const m = document.title.match(/\((\d{4})\)/);
          return m ? m[1] : null;
        },
        // The chip goes right after the metadata line, inside its parent.
        host(el) {
          return titleMeta(el)?.parentElement || null;
        },
        place(host, badge) {
          const meta = [...host.children].find((c) => META.test(c.textContent));
          if (meta) meta.after(badge);
          else host.appendChild(badge);
        },
      },
      {
        // "You may also like" list beside a title page: links with a
        // thumbnail (img alt = title) and an h3 title over a metadata line.
        kind: 'card',
        selector: 'a[href^="/movies/"]:has(.web-attributes), a[href^="/series/"]:has(.web-attributes)',
        titleOf(el) {
          if (el.closest('.web-content-tile')) return null;
          const t = el.querySelector('h3') || el.querySelector('img[alt]');
          return clean(t && (t.textContent || t.alt)) || null;
        },
        typeOf(el) {
          return pathType(hrefPath(el));
        },
        yearOf(el) {
          return pathType(hrefPath(el)) === 'movie' ? firstYear(el.querySelector('.web-attributes')?.textContent) : null;
        },
        host(el) {
          // The thumbnail's box is unpositioned; the corner badge needs it.
          const thumb = el.querySelector('img[alt]')?.parentElement;
          if (thumb && getComputedStyle(thumb).position === 'static') thumb.style.position = 'relative';
          return thumb || null;
        },
      },
      {
        // A series page's episode list, one season at a time.
        kind: 'episodes',
        selector: GRID,
        showOf() {
          return pathType(location.pathname) === 'series' ? clean(document.querySelector('h1.sr-only')?.textContent) || null : null;
        },
        seasonOf(el) {
          const first = this.items(el)[0];
          return first ? first.season : null;
        },
        items(el) {
          return [...el.querySelectorAll('h3')]
            .filter((h) => h.closest(GRID) === el)
            .map((h) => {
              const m = clean(h.textContent).match(EPISODE);
              return m && h.parentElement ? { season: Number(m[1]), number: Number(m[2]), row: h.parentElement } : null;
            })
            .filter(Boolean);
        },
        // Into the "1 hr 46 min TV-14" line under the heading.
        place(row, badge) {
          const meta = row.querySelector(':scope > h3 + div .web-attributes__meta') || row.querySelector(':scope > h3 + div');
          (meta || row).appendChild(badge);
        },
      },
    ],

    watchAttributes: ['aria-label', 'href', 'title'],
  };
})();
