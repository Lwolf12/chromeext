// Site adapter for HBO Max (play.hbomax.com). Defines window.IMDBEXT_SITE,
// which content.js uses.
//
// HBO Max's 2026 web app (verified in Chrome): tiles are
// <a data-testid="<uuid>_tile" data-sonic-type="show|video|...">, 206x308
// portrait posters, position:static inside a position:relative wrapper. The
// title is only reliably available in the link's aria-label, which uses
// Unicode bidi isolate marks and reads like
// "⁦⁨⁨War⁩⁩. ⁨1 of 20⁩. ⁨⁨New Episode⁩⁩. ⁨Top Ten⁩⁩": the first sentence is
// the title. data-sonic-type is "show" for movies too; the link path
// (/movie/, /show/, /video/watch/) gives the real type.
//
// There is no hover preview. Hovering reveals a 32px "..." menu button in
// the tile's top-right corner, and HBO's own "New" tags sit top-left, so the
// badge goes bottom-right (see badge.css). The badge's tooltip works here
// since nothing pops up over it.
//
// Showcase tiles (<div data-testid="<uuid>_showcaseTile">, 248x417) in the
// "coming soon" rail carry the title in a <span>.

(() => {
  function strip(s) {
    return (s || '').replace(/[⁦-⁩‎‏]/g, '').replace(/\s+/g, ' ').trim();
  }

  // Segments that end the title in an aria-label (fallback parser).
  const STOP = /^((row |column )?\d+ of \d+.*|season \d+.*|episode \d+.*|s\d+ e\d+.*|new|new episode|new season|top ten|leaving soon|coming soon|last chance|final season)$/i;

  // HBO wraps each piece of the label in Unicode isolate marks:
  //   U+2066 U+2068 U+2068 Title U+2069 U+2069 ". " U+2068 1 of 20 U+2069 ...
  // The first isolated group is the title, whatever follows it ("1 of 20",
  // "Row 1 of 5, Column 1 of 6", "Season 1, Episode 2: ..."). Returns null
  // when the label carries no marks.
  function firstIsolatedGroup(raw) {
    const start = raw.indexOf('⁨');
    if (start < 0) return null;
    let depth = 0;
    for (let i = start; i < raw.length; i++) {
      const c = raw[i];
      if (c === '⁨' || c === '⁦' || c === '⁧') depth++;
      else if (c === '⁩') {
        depth--;
        if (depth === 0) return strip(raw.slice(start, i));
      }
    }
    return null;
  }

  // Cut at the first segment that looks like a counter, a season/episode
  // marker or a known tag rather than at the first period, since titles can
  // contain ". " themselves.
  function cutAtStop(text) {
    const parts = text.split(/\.\s+/);
    const out = [];
    for (const part of parts) {
      if (STOP.test(part)) break;
      out.push(part);
    }
    return out.join('. ');
  }

  function titleFromAria(el) {
    const raw = el.getAttribute('aria-label') || '';
    // Prefer the isolated group; still run the segment cut over it in case
    // an outer group wraps the whole label.
    const title = cutAtStop(firstIsolatedGroup(raw) || strip(raw))
      // Episode tiles: "Watch Lanterns. Season 1, Episode 2: Trust Fall."
      .replace(/^watch\s+/i, '')
      .replace(/\.$/, '')
      .trim();
    // Episode tiles on a show's own page carry no show name at all
    // ("Watch Season 1, Episode 1: The One Way Trip"); the page's hero has
    // the rating, so these get nothing.
    if (/^(season|episode|s\d+\s*e\d+)\b/i.test(title)) return null;
    return title || null;
  }

  // "Add to My List: Fired On Mars" / "Remove from My List: ..." gives the
  // clean title on both the home banner and a title's own page.
  function titleFromMyList(el) {
    const add = el.querySelector('[data-testid="myList_button"]');
    const t = strip((add && add.getAttribute('aria-label')) || '').replace(/^(add to|remove from) my list:\s*/i, '');
    if (t) return t;
    const img = el.querySelector('img[alt]');
    return strip(img && img.alt) || null;
  }

  // data-sonic-type is "show" for movies too, but the link path is honest:
  // /movie/<id>, /show/<id>, /video/watch/<id> (an episode).
  function typeFromHref(el) {
    const href = el.getAttribute('href') || '';
    if (/^\/movie\//.test(href)) return 'movie';
    if (/^\/(show|video)\//.test(href)) return 'series';
    return null;
  }

  window.IMDBEXT_SITE = {
    name: 'hbomax',

    targets: [
      {
        // Top banner: <section data-testid="<uuid>_immersiveHero">, one per
        // featured title, rotating. The "Add to My List: Youth" button gives
        // the clean title; the play button's label ("Watch Youth, Season 1,
        // Episode 1: ...") and a seasons count mark series. A full-size
        // overlay link (z-index 10) covers the banner; the buttons sit at 11,
        // and so does the chip (badge.css).
        kind: 'detail',
        selector: 'section[data-testid$="_immersiveHero"]',
        titleOf: titleFromMyList,
        typeOf(el) {
          if (el.querySelector('[data-testid="metadata_total_seasons_hero"]')) return 'series';
          const play = el.querySelector('[data-testid="play_button"]');
          if (play && /season \d+|episode \d+/i.test(strip(play.getAttribute('aria-label')))) return 'series';
          return null;
        },
        host(el) {
          const play = el.querySelector('[data-testid="play_button"]');
          return play ? play.parentElement : null;
        },
        place(host, badge) {
          host.appendChild(badge);
        },
      },
      {
        // A title's own page (/show/<id> or /movie/<id>): the hero is
        // <section data-testid="details-hero-container">. Resume and Restart
        // fill their row, so the chip joins the My List / Rate / Trailer row.
        kind: 'detail',
        selector: 'section[data-testid="details-hero-container"]',
        titleOf: titleFromMyList,
        typeOf() {
          if (/^\/movie\//.test(location.pathname)) return 'movie';
          if (/^\/show\//.test(location.pathname)) return 'series';
          return null;
        },
        host(el) {
          const add = el.querySelector('[data-testid="myList_button"]');
          return add ? add.parentElement : null;
        },
        place(host, badge) {
          host.appendChild(badge);
        },
      },
      {
        kind: 'card',
        selector: 'a[data-testid$="_tile"]',
        titleOf: titleFromAria,
        typeOf: typeFromHref,
        host(el) {
          // The link is position:static; its image container is relative.
          return el.querySelector('[data-testid$="_tileImage"]') || el.parentElement;
        },
      },
      {
        kind: 'card',
        selector: '[data-testid$="_showcaseTile"]',
        titleOf(el) {
          const span = [...el.querySelectorAll('span')].find((s) => strip(s.textContent));
          return span ? strip(span.textContent) : null;
        },
        host(el) {
          return el;
        },
      },
    ],

    watchAttributes: ['aria-label'],
  };
})();
