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

  function titleFromLinksAndImages(el) {
    const a = el.querySelector('a[aria-label]');
    const img = el.querySelector('img[alt^="Cover art for"]');
    return (a && fromAria(a.getAttribute('aria-label'))) || (img && fromAlt(img.alt)) || null;
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
    ],

    watchAttributes: ['aria-label', 'alt'],
  };
})();
