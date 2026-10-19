// Site adapter for Netflix. Defines window.IMDBEXT_SITE, which content.js uses.
//
// Netflix's 2026 UI uses hashed class names, but marks each card anchor with a
// stable data-uia attribute and puts the title in its aria-label. Cards are
// 262x147 landscape tiles inside horizontal carousels. Hovering a card opens a
// preview popup (.previewModal--wrapper.mini-modal); clicking "more" opens the
// full detail modal (.previewModal--wrapper.detail-modal). Both carry the
// title as the alt text of their box-art image.
//
// To support another service, add a sibling file that defines the same shape
// and list it in manifest.json for that site's URLs.

window.IMDBEXT_SITE = {
  name: 'netflix',

  targets: [
    {
      // Small badge in the corner of each tile. Only looked up near the viewport.
      kind: 'card',
      selector: [
        'a[data-uia="standard-card"]',
        'a[data-uia="ranked-card"]',
        'a[data-uia="progress-card"]',
      ].join(', '),
      titleOf(el) {
        return (el.getAttribute('aria-label') || '').trim() || null;
      },
      host(el) {
        return el;
      },
    },
    {
      // Featured banner at the top of the home page: [data-uia="billboard"]
      // with aria-label "Featured Content: <title>[, <season name>][, Show]".
      // The season name is free text ("Season 1", "East Blue", "Limited
      // Series") and the logo image has no usable alt, so the label is the
      // only title source. Candidates are tried in order: the whole label
      // first (titles can contain commas), then with trailing comma segments
      // dropped one at a time. The chip goes in the Play / More Info row.
      kind: 'detail',
      selector: '[data-uia="billboard"]',
      titleOf(el) {
        let t = (el.getAttribute('aria-label') || '').replace(/^featured content:\s*/i, '').trim();
        t = t.replace(/,\s*(show|movie|film)\s*$/i, '').trim();
        if (!t) return null;
        const parts = t.split(/\s*,\s*/);
        const out = [];
        for (let n = parts.length; n >= 1; n--) out.push(parts.slice(0, n).join(', '));
        return out;
      },
      // The attribute row starts with "Show" or "Movie".
      typeOf(el) {
        const first = (el.querySelector('[data-uia="attributes-elements"]')?.textContent || '').trim();
        if (/^(show|series)/i.test(first)) return 'series';
        if (/^(movie|film)/i.test(first)) return 'movie';
        return null;
      },
      host(el) {
        return el.querySelector('[data-uia="billboard-actions"]');
      },
      place(host, badge) {
        host.appendChild(badge);
      },
    },
    {
      // Detail line (rating, year, votes) inside the hover preview / detail modal.
      kind: 'detail',
      selector: '.previewModal--wrapper',
      titleOf(el) {
        const img = el.querySelector('img.previewModal--boxart');
        return (img && img.alt.trim()) || null;
      },
      // Cards carry no type or year, but the popup does: a "Show|Drama" or
      // "Movie|Action" line ([data-uia="makeover-content-type-genre"]) and a
      // "2026•7 Episodes•TV-MA•HD" line ([data-uia="makeover-metadata"]).
      // Both hints fix titles that would otherwise match a same-named older
      // film (East of Eden, 2026 series vs 1955 film). Watched shows show
      // "S1:E3" instead of the type line.
      typeOf(el) {
        const line = el.querySelector('[data-uia="makeover-content-type-genre"]');
        const first = line ? line.textContent.split('|')[0].trim() : '';
        if (/^(show|series)$/i.test(first)) return 'series';
        if (/^(movie|film)$/i.test(first)) return 'movie';
        return /\bS\d+:E\d+\b/.test(el.textContent) ? 'series' : null;
      },
      yearOf(el) {
        const meta = el.querySelector('[data-uia="makeover-metadata"]');
        const m = meta && meta.textContent.match(/\b(19|20)\d\d\b/);
        return m ? m[0] : null;
      },
      host(el) {
        return (
          el.querySelector('.previewModal--metadatAndControls-container') ||
          el.querySelector('.previewModal--info')
        );
      },
      // Own line directly under the play / add / rate buttons.
      place(host, badge) {
        const controls = host.querySelector('[data-uia$="-controls"]');
        if (controls && controls.parentElement === host) controls.after(badge);
        else host.prepend(badge);
      },
    },
  ],

  // Attributes whose changes mean a title may have changed.
  watchAttributes: ['aria-label', 'alt'],
};
