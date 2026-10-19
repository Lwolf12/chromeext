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
      // with aria-label "Featured Content: East of Eden, Limited Series".
      // Its logo image has no usable alt, so the title comes from that label.
      // The chip goes in the Play / More Info button row.
      kind: 'detail',
      selector: '[data-uia="billboard"]',
      titleOf(el) {
        let t = (el.getAttribute('aria-label') || '').replace(/^featured content:\s*/i, '').trim();
        t = t.replace(/,\s*(limited series|mini-?series|series|show|movie|film|special|documentary)\s*$/i, '');
        return t || null;
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
      // Cards carry no type, but the popup shows "S1:E3" for series. A series
      // hint fixes titles that OMDb would otherwise match to a same-named
      // film. Movies get no hint (we can't tell them from unknowns).
      typeOf(el) {
        return /\bS\d+:E\d+\b/.test(el.textContent) ? 'series' : null;
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
