// Site adapter for Apple TV (tv.apple.com). Defines window.IMDBEXT_SITE,
// which content.js uses. Opt-in: it only runs once the user ticks Apple TV
// in the settings and allows tv.apple.com (OPTIONAL_SITES in background.js).
//
// Apple TV's web app (Svelte; verified 2026-10-24 signed out, since the
// catalogue pages are public). Every tile is an
// <a data-testid="lockup" href="https://tv.apple.com/us/show/<slug>/<id>">
// (also /movie/, /episode/, /clip/, /movie-bundle/, /sporting-event/ ...),
// clipped to rounded corners (overflow:hidden, position:static) around a
// position:relative [data-testid="lockup-grid"]. Poster tiles carry the
// title only in a <span class="visually-hidden">; landscape tiles show it
// in a .title div. The link path gives the type. Tiles of other channels'
// shows (Apple TV Channels, store rentals) look the same and get ratings too.
//
// Banners: a room page's rotating stage has one [data-testid="epic-stage-item"]
// per title, aria-label = title, and a title's own page has
// [data-testid="product-header"] data-type="Show|Movie" with the title in a
// hidden <h1>. Both hold a [data-testid="superhero-metadata"] row
// ("TV Show · Sci-Fi · Adventure", TV-MA badge) where the chip goes. The
// page's second metadata list reads "2023 · 59m": the first year.
//
// Episodes: a section under a "Season 1" heading (a <select> with a
// [data-testid="accessory-button-select-text"] label when there are several
// seasons), one /episode/ lockup per episode with a .tag "EPISODE 3" over a
// .title line.

(() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

  // An element's text without the episode badge appended to it.
  function ownText(el) {
    return clean(
      [...el.childNodes]
        .filter((n) => !(n.classList && n.classList.contains('imdbext-badge')))
        .map((n) => n.textContent)
        .join('')
    );
  }

  function typeFromHref(el) {
    let path = '';
    try {
      path = new URL(el.getAttribute('href') || '', location.href).pathname;
    } catch (e) {
      return null;
    }
    if (/\/movie\//.test(path)) return 'movie';
    if (/\/show\//.test(path)) return 'series';
    return null;
  }

  // Poster tiles: hidden text. Top 10 tiles: only the title logo's alt
  // (their visible text is the rank and a genre). Landscape tiles: .title.
  function lockupTitle(el) {
    const hidden = el.querySelector('.visually-hidden');
    if (hidden && clean(hidden.textContent)) return clean(hidden.textContent);
    const logo = el.querySelector('[data-testid="logo"] img[alt]');
    if (logo && clean(logo.alt)) return clean(logo.alt);
    return clean(el.querySelector('.title')?.textContent) || null;
  }

  // "TV Show · Thriller · Drama" (banner and title page) or data-type.
  function headerType(el) {
    const t = (el.dataset.type || clean(el.querySelector('[data-testid="metadata-list"] span')?.textContent)).toLowerCase();
    if (t === 'movie') return 'movie';
    if (t === 'show' || t === 'tv show') return 'series';
    return null;
  }

  function headerYear(el) {
    for (const span of el.querySelectorAll('[data-testid="metadata-list"] span')) {
      const t = clean(span.textContent);
      if (/^(19|20)\d\d$/.test(t)) return t;
    }
    return null;
  }

  const productHeader = () => document.querySelector('[data-testid="product-header"]');

  function headerTitle(el) {
    return clean(el.querySelector('[data-testid="content-title"] h1')?.textContent) || null;
  }

  const EPISODE_LOCKUP = 'a[data-testid="lockup"][href*="/episode/"]';

  const seasonNumber = (text) => {
    const m = clean(text).match(/^season\s*(\d+)$/i);
    return m ? Number(m[1]) : null;
  };

  // The season picker's label ("Season 2"), or the plain heading of a
  // one-season show.
  function seasonLabel(el) {
    const head = el.querySelector('[data-testid="accessory-button-select-text"]') || el.querySelector('h2');
    const text = clean(head && head.textContent);
    return seasonNumber(text) ?? (/^episodes$/i.test(text) ? 1 : null);
  }

  // Every season's episodes sit in ONE horizontal shelf (li data-index 0,
  // 1, 2, ... across seasons, only a window of them rendered at a time);
  // the picker just scrolls it, and its label follows the scroll. A tile
  // only says "EPISODE 3", so its season is worked out: index - (episode -
  // 1) is where its season starts in the shelf, and a start is tied to a
  // season by
  //   - the shelf's first tile, which starts the picker's first season;
  //   - a season starting right after a known one's last tile, which is the
  //     picker's next season (and the reverse, its previous one);
  //   - the leftmost visible tile when it is an episode 1: it starts the
  //     season the label names (picking a season jumps there at once).
  // Each start gets one season and seasons stay in the picker's order, so
  // a label that lags behind the scroll can't mislabel a season. Tiles
  // whose season isn't known yet get no rating until it is.
  const learned = new WeakMap(); // section -> { show, starts: Map(start -> season) }

  function episodeTiles(el, show) {
    const select = el.querySelector('[data-testid="accessory-button-select"]');
    const label = seasonLabel(el);
    const order = select ? [...select.options].map((o) => seasonNumber(o.textContent)) : label != null ? [label] : [];
    const tiles = [...el.querySelectorAll(EPISODE_LOCKUP)]
      .map((a, i) => {
        const tag = a.querySelector('.tag');
        const m = (tag ? ownText(tag) : '').match(/^episode\s*(\d+)$/i);
        if (!m) return null;
        const li = a.closest('li');
        const index = li && li.dataset.index != null ? Number(li.dataset.index) : i;
        const number = Number(m[1]);
        return { number, index, start: index - number + 1, visible: !li || li.getAttribute('aria-hidden') !== 'true', row: tag };
      })
      .filter(Boolean)
      .sort((a, b) => a.index - b.index);
    if (!tiles.length || !order.length) return [];

    let memo = learned.get(el);
    if (!memo || memo.show !== show) {
      memo = { show, starts: new Map() };
      learned.set(el, memo);
    }
    const starts = memo.starts;
    const add = (start, season) => {
      if (season == null || starts.has(start) || [...starts.values()].includes(season)) return false;
      const pos = order.indexOf(season);
      for (const [s, known] of starts) if ((s < start) !== (order.indexOf(known) < pos)) return false;
      starts.set(start, season);
      return true;
    };
    add(0, order[0]);
    const lead = tiles.find((t) => t.visible);
    if (lead && lead.number === 1) add(lead.start, label);
    const at = new Map(tiles.map((t) => [t.index, t]));
    for (let changed = true; changed; ) {
      changed = false;
      for (const t of tiles) {
        const prev = t.number === 1 && at.get(t.index - 1);
        if (!prev) continue;
        const before = starts.get(prev.start);
        const self = starts.get(t.start);
        if (before != null && self == null) changed = add(t.start, order[order.indexOf(before) + 1]) || changed;
        if (self != null && before == null) changed = add(prev.start, order[order.indexOf(self) - 1]) || changed;
      }
    }
    return tiles
      .filter((t) => starts.has(t.start))
      .map((t) => ({ season: starts.get(t.start), number: t.number, row: t.row }));
  }

  window.IMDBEXT_SITE = {
    name: 'appletv',

    targets: [
      {
        // Shows and movies only: episodes have their own target, and clips,
        // bundles, people and sports get nothing.
        kind: 'card',
        selector: 'a[data-testid="lockup"][href*="/show/"], a[data-testid="lockup"][href*="/movie/"]',
        titleOf: lockupTitle,
        typeOf: typeFromHref,
        host(el) {
          return el.querySelector('[data-testid="lockup-grid"]') || null;
        },
      },
      {
        // Continue Watching (signed in): a <div>, not a link, whose hidden
        // text reads "Silo, Hanna, S1, E8, 47 min left" (show, episode,
        // season and episode, time left) or, for a film, "<title>, 1 hr 5
        // min left". An episode tile gets its show's rating; the show is
        // the part before the first comma, as Apple's show titles rarely
        // have one (film titles can, so those keep the whole name).
        kind: 'card',
        selector: '[data-testid="continue-watching-lockup"]',
        titleOf(el) {
          const text = clean(el.querySelector('.visually-hidden')?.textContent);
          if (/,\s*S\d+,\s*E\d+\b/.test(text)) return clean(text.split(',')[0]) || null;
          return clean(text.replace(/,\s*(\d+\s*hr\s*)?(\d+\s*min\s*)?left$/i, '')) || null;
        },
        typeOf(el) {
          return /,\s*S\d+,\s*E\d+\b/.test(el.querySelector('.visually-hidden')?.textContent || '') ? 'series' : null;
        },
        host(el) {
          return el.querySelector('[data-testid="lockup-grid"]');
        },
      },
      {
        // Big showcase cards (the channel page's "Dark Destinations" row,
        // loaded as you scroll): a <button>, not a link, with the title only
        // in the logo's and artwork's alt and a "TV Show · Mystery" line.
        // The button is position:relative and clips, like a tile.
        kind: 'card',
        selector: '[data-testid="epic-showcase-item"]',
        titleOf(el) {
          const img = el.querySelector('[data-testid="epic-showcase-content-logo"] img[alt]') || el.querySelector('.artwork-container img[alt]');
          return clean(img && img.alt) || null;
        },
        typeOf: headerType,
        host(el) {
          return el;
        },
      },
      {
        // A room page's rotating banner, one item per featured title.
        kind: 'detail',
        selector: '[data-testid="epic-stage-item"]',
        titleOf(el) {
          return clean(el.getAttribute('aria-label')) || null;
        },
        typeOf: headerType,
        host(el) {
          return el.querySelector('[data-testid="superhero-metadata"]');
        },
      },
      {
        // A show's or movie's own page.
        kind: 'detail',
        selector: '[data-testid="product-header"]',
        titleOf: headerTitle,
        typeOf: headerType,
        yearOf: headerYear,
        host(el) {
          return el.querySelector('[data-testid="superhero-metadata"]');
        },
      },
      {
        // The episode shelf of a show page (see episodeTiles). The rating
        // joins the "EPISODE 3" tag line, which never truncates (the title
        // can).
        kind: 'episodes',
        selector: '[data-testid="section-container"]',
        showOf() {
          const h = productHeader();
          return h && headerType(h) === 'series' ? headerTitle(h) : null;
        },
        yearOf() {
          const h = productHeader();
          return h ? headerYear(h) : null;
        },
        seasonOf(el) {
          return el.querySelector(EPISODE_LOCKUP) ? seasonLabel(el) : null;
        },
        items(el) {
          return episodeTiles(el, this.showOf(el));
        },
      },
    ],

    // Shelves reuse tiles by swapping their href; a Top 10 tile's title
    // arrives with its logo's alt.
    watchAttributes: ['aria-label', 'href', 'alt'],
  };
})();
