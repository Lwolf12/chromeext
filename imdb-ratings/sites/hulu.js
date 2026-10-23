// Site adapter for Hulu (hulu.com). Defines window.IMDBEXT_SITE, which
// content.js uses.
//
// Hulu's 2026 web app (verified in Chrome): standard tiles are
// [data-testid="seh-tile"], 327x200, position:relative. The title is in the
// tile link's aria-label ("Grey's Anatomy, Item 2 of many") and the image
// alt ("Cover art for Grey's Anatomy."). The link path says /series/ or
// /movie/. Hovering a tile opens an absolutely positioned
// [data-testid="preview-panel"] whose [data-testid="preview-panel-info-panel"]
// holds an action row, a metadata line ("TV14 • 2005 • Medical • 23 Seasons")
// and a description. The page-top banner is [data-testid="high-emphasis-tile"].

(() => {
  function clean(s) {
    return (s || '').replace(/\s+/g, ' ').trim() || null;
  }

  function fromAria(label) {
    // "Title, Item 2 of many" -> "Title"
    return clean((label || '').replace(/,\s*Item\s+\d+\s+of\s+\w+\s*$/i, ''));
  }

  function fromAlt(alt) {
    // "Cover art for Title." -> "Title"
    const m = /^cover art for\s+(.+?)\.?\s*$/i.exec(alt || '');
    return clean(m ? m[1] : '');
  }

  // Episode tiles on a series page use the same seh-tile as show tiles, but
  // their title is "S2 E1 - My First Time in a While" (alt "Cover art for S2
  // E1 • …"). Those belong to the episode list below, not to title lookups.
  const EPISODE_TITLE = /^S(\d+)\s*E(\d+)\b/i;

  function titleFromLinksAndImages(el) {
    const a = el.querySelector('a[aria-label]');
    const img = el.querySelector('img[alt^="Cover art for"]');
    const title = (a && fromAria(a.getAttribute('aria-label'))) || (img && fromAlt(img.alt)) || null;
    return title && EPISODE_TITLE.test(title) ? null : title;
  }

  // A series or movie page is an overlay ([role="dialog"]) whose masthead
  // names the title ([data-testid="simple-modal-nav-title"], or the alt of
  // its title art) above a metadata list, [data-testid="masthead-metadata"]:
  // "TV14", "Medical, Comedy", "TV Series", "2026", the year being the first
  // year, which tells a revival ("Scrubs" 2026) from the original (2001).
  function mastheadTitle(scope) {
    const nav = scope.querySelector('[data-testid="simple-modal-nav-title"]');
    const art = scope.querySelector('[data-testid="masthead-title-container"] img[alt]');
    return clean(nav && nav.textContent) || clean(art && art.alt);
  }

  function mastheadItems(scope) {
    return [...scope.querySelectorAll('[data-testid="masthead-metadata"] li')].map((li) => li.textContent.trim());
  }

  function mastheadYear(scope) {
    return mastheadItems(scope).find((t) => /^(19|20)\d\d$/.test(t)) || null;
  }

  // An episode tile's title element and its season and episode numbers.
  function episodeOf(tile) {
    const row = tile.querySelector('[data-testid="seh-tile-content-title"]');
    const m = row && EPISODE_TITLE.exec(row.textContent.trim());
    return m ? { season: Number(m[1]), number: Number(m[2]), row } : null;
  }

  function typeFromLinks(el) {
    const a = el.querySelector('a[href*="/series/"], a[href*="/movie/"]');
    if (!a) return null;
    return /\/movie\//.test(a.getAttribute('href')) ? 'movie' : 'series';
  }

  // Insert after the bullet-separated metadata line when there is one, so the
  // chip gets its own line between the metadata and the description.
  function placeAfterMetadata(host, badge) {
    const meta = [...host.children].find((c) => /•/.test(c.textContent));
    if (meta) meta.after(badge);
    else host.prepend(badge);
  }

  window.IMDBEXT_SITE = {
    name: 'hulu',

    targets: [
      {
        kind: 'card',
        selector: '[data-testid="seh-tile"]',
        titleOf: titleFromLinksAndImages,
        typeOf: typeFromLinks,
        host(el) {
          return el;
        },
      },
      {
        // Tall "Because you watched …" cards (rows like "Inspired By What
        // You Watch"): [data-testid="medium-emphasis-vertical-tile"],
        // 301x523, position:relative, with the same browse link (aria-label
        // "The Shards, Item 1 of many", /series/ or /movie/ path) as the
        // standard tiles, and a "TVMA • Mystery, Drama • 2026" line. That
        // year can be the latest season's (Futurama says 2026), which as a
        // hint is harmless: the lookup only prefers a match within a year.
        // Hulu's brand logo sits top-right, so the badge goes top-left.
        kind: 'card',
        selector: '[data-testid="medium-emphasis-vertical-tile"]',
        titleOf: titleFromLinksAndImages,
        typeOf: typeFromLinks,
        yearOf(el) {
          const meta = [...el.querySelectorAll('p')].find((p) => /•/.test(p.textContent));
          const m = meta && meta.textContent.match(/\b(19|20)\d\d\b/);
          return m ? m[0] : null;
        },
        host(el) {
          return el;
        },
      },
      {
        kind: 'detail',
        selector: '[data-testid="preview-panel"]',
        titleOf: titleFromLinksAndImages,
        typeOf: typeFromLinks,
        host(el) {
          return el.querySelector('[data-testid="preview-panel-info-panel"]');
        },
        place: placeAfterMetadata,
      },
      {
        // Full-width banner at the top of a hub page.
        kind: 'detail',
        selector: '[data-testid="high-emphasis-tile"]',
        titleOf(el) {
          const art = el.querySelector('[data-testid="high-emphasis-tile-title-art"] img[alt], img[alt^="Cover art for"]');
          return (art && fromAlt(art.alt)) || null;
        },
        typeOf: typeFromLinks,
        host(el) {
          return el.querySelector('[data-testid="high-emphasis-tile-content"]');
        },
        place(host, badge) {
          const sub = host.querySelector('[data-testid="high-emphasis-tile-subtitle"]');
          if (sub) sub.after(badge);
          else host.prepend(badge);
        },
      },
      {
        // The series / movie page overlay itself: a chip after the
        // masthead's metadata list, with type and first year as hints.
        kind: 'detail',
        selector: '[data-testid="masthead-content"]',
        titleOf(el) {
          return mastheadTitle(el.closest('[role="dialog"]') || el);
        },
        typeOf(el) {
          const items = mastheadItems(el).join('|');
          if (/\b(tv series|series)\b/i.test(items)) return 'series';
          if (/\bmovie\b/i.test(items)) return 'movie';
          return null;
        },
        yearOf(el) {
          return mastheadYear(el);
        },
        host(el) {
          return el.querySelector('[data-testid="masthead-metadata-container"]');
        },
        place(host, badge) {
          host.appendChild(badge);
        },
      },
      {
        // Episode list on a series page (an overlay, [role="dialog"]): a
        // "Season 2" dropdown and a grid ([data-testid="all-up-grid"]) of
        // episode tiles titled "S2 E1 - …", so the tiles carry their own
        // season and episode numbers. The show's name is the overlay's
        // title ([data-testid="simple-modal-nav-title"]) or the alt of its
        // title art. Other grids (extras, "You may also like") have no
        // S/E titles and are skipped.
        kind: 'episodes',
        selector: '[data-testid="all-up-grid"]',
        showOf(el) {
          return mastheadTitle(el.closest('[role="dialog"]') || document);
        },
        yearOf(el) {
          return mastheadYear(el.closest('[role="dialog"]') || document);
        },
        seasonOf(el) {
          for (const tile of el.querySelectorAll('[data-testid="seh-tile"]')) {
            const ep = episodeOf(tile);
            if (ep) return ep.season;
          }
          return null;
        },
        items(el) {
          const eps = [...el.querySelectorAll('[data-testid="seh-tile"]')].map(episodeOf).filter(Boolean);
          const season = eps.length ? eps[0].season : null;
          return eps.filter((e) => e.season === season).map(({ number, row }) => ({ number, row }));
        },
        place(row, badge) {
          row.appendChild(badge);
        },
      },
    ],

    watchAttributes: ['aria-label', 'alt'],
  };
})();
