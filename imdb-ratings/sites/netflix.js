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

// The detail modal's "2013 5 Seasons" line, or ''.
function videoMeta(el) {
  return (el.querySelector('[data-uia="videoMetadata--container"]')?.textContent || '').trim();
}

// "Episodes & info" on an episode card's preview opens the show's detail
// modal in episode view: the episode list is the show's, but the box art,
// story art and tab title all name the episode ("Pilot") and the metadata
// line gives the episode's running time ("2008 58m") instead of "5 Seasons".
// SHOW_LENGTH is a show's length in that line: "5 Seasons", "8 Episodes",
// "Limited Series", "2 Parts". No word boundaries: textContent runs the
// pieces together ("20135 SeasonsHD").
const SHOW_LENGTH = /\d+\s*(seasons?|episodes|parts?|volumes?)|limited series/i;

function isEpisodeView(modal) {
  return (
    !!modal &&
    !!modal.querySelector('[data-uia="episode-selector"]') &&
    !SHOW_LENGTH.test(videoMeta(modal))
  );
}

// ------------------------------------------------- episodes -> their show
//
// Episode cards (a[data-uia="episodic-card"], rows like "Hooked from the
// First Episode") name only the episode ("Pilot"), and so do their preview
// and the "Episodes & info" view; nothing on the page names the show. They
// do carry the episode's Netflix id (href "/browse?jbv=70196252"), and
// Netflix redirects /title/<episode id> to /title/<show id>. Netflix's
// signed-out version of that show page names the show in its <h1>, about
// 600 KB in, so the page is read only up to there. The answers are kept
// for good (storage.local nfShows: show id -> name, nfEpisodes: episode id
// -> show id), so each episode costs one request ever. Show cards
// (href "/browse?jbv=<show id>", aria-label = name) and show detail modals
// fill in names on the way, so a known show needs no page read at all.

const nf = {
  shows: {}, // Netflix show id -> name
  episodes: {}, // Netflix episode id -> show id
  pending: new Set(),
  failed: {}, // episode id -> time of the last failed attempt
  queue: [],
  active: 0,
  lastEpisodeCard: null, // { id, label } of the episode card last hovered
};
const RETRY_FAILED_MS = 10 * 60 * 1000;

function jbvOf(s) {
  return ((s || '').match(/[?&]jbv=(\d+)/) || [])[1] || null;
}

// Netflix id of the title a detail modal shows, from the address bar
// (/browse?jbv=<id> or /title/<id>).
function modalId() {
  return jbvOf(location.search) || (location.pathname.match(/^\/title\/(\d+)/) || [])[1] || null;
}

function nfRescan() {
  document.dispatchEvent(new Event('imdbext-rescan'));
}

let nfSaveTimer = null;
function nfSave() {
  if (nfSaveTimer) return;
  nfSaveTimer = setTimeout(async () => {
    nfSaveTimer = null;
    try {
      const cur = await chrome.storage.local.get(['nfShows', 'nfEpisodes']);
      await chrome.storage.local.set({
        nfShows: { ...(cur.nfShows || {}), ...nf.shows },
        nfEpisodes: { ...(cur.nfEpisodes || {}), ...nf.episodes },
      });
    } catch (e) {
      /* extension reloaded; the next page load starts over */
    }
  }, 2000);
}

function rememberShow(id, name) {
  if (id && name && nf.shows[id] !== name) {
    nf.shows[id] = name;
    nfSave();
  }
}

// The show an episode belongs to, or null while that is being worked out
// (a rescan follows once it is known).
function showOfEpisode(episodeId) {
  if (!episodeId) return null;
  const showId = nf.episodes[episodeId];
  if (showId && nf.shows[showId]) return nf.shows[showId];
  if (!nf.pending.has(episodeId) && !(Date.now() - (nf.failed[episodeId] || 0) < RETRY_FAILED_MS)) {
    nf.pending.add(episodeId);
    nf.queue.push(episodeId);
    nfPump();
  }
  return null;
}

function nfPump() {
  while (nf.active < 2 && nf.queue.length) {
    const id = nf.queue.shift();
    nf.active++;
    resolveEpisode(id).finally(() => {
      nf.active--;
      nf.pending.delete(id);
      nfPump();
    });
  }
}

async function resolveEpisode(episodeId) {
  const ctrl = new AbortController();
  try {
    const res = await fetch('/title/' + episodeId, { credentials: 'omit', signal: ctrl.signal });
    const showId = (res.url.match(/\/title\/(\d+)/) || [])[1];
    if (!res.ok || !showId) throw new Error('no show page');
    nf.episodes[episodeId] = showId;
    if (!nf.shows[showId]) {
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = '';
      for (let read = 0; read < 3e6; ) {
        const { done, value } = await reader.read();
        if (done) break;
        read += value.length;
        buf += value;
        const m = buf.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        if (m) {
          const name = new DOMParser().parseFromString(m[1], 'text/html').body.textContent.trim();
          if (name) nf.shows[showId] = name;
          break;
        }
        buf = buf.slice(-8192); // an <h1> split across chunks still matches next time
      }
    }
    if (!nf.shows[showId]) throw new Error('no name');
    nfSave();
    nfRescan();
  } catch (e) {
    nf.failed[episodeId] = Date.now();
  } finally {
    ctrl.abort(); // stop downloading the rest of the page
  }
}

chrome.storage.local.get(['nfShows', 'nfEpisodes']).then(
  ({ nfShows, nfEpisodes }) => {
    nf.shows = { ...(nfShows || {}), ...nf.shows };
    nf.episodes = { ...(nfEpisodes || {}), ...nf.episodes };
    nfRescan();
  },
  () => {}
);

// Which episode card a preview popup belongs to: the one last hovered.
document.addEventListener(
  'mouseover',
  (e) => {
    const card = e.target instanceof Element && e.target.closest('a[data-uia="episodic-card"]');
    if (card) nf.lastEpisodeCard = { id: jbvOf(card.getAttribute('href')), label: (card.getAttribute('aria-label') || '').trim() };
  },
  true
);

// The title a preview popup or detail modal is about. Episode previews and
// the episode view name the episode, so those are resolved to their show.
function modalTitle(el) {
  const img = el.querySelector('img.previewModal--boxart, img.playerModel--player__storyArt');
  const title = (img && img.alt.trim()) || null;
  if (isEpisodeView(el)) return showOfEpisode(jbvOf(location.search));
  // An episode preview: box art "Days Gone Bye" and the line S1:E1 "Days
  // Gone Bye". A show's preview with a watched episode also has an S1:E3
  // line, but there the box art names the show, so the two differ. No \b
  // before the S: textContent runs words together ('…matchS1:E1').
  const ep = el.textContent.match(/S\d+:E\d+\s*["“]([^"”]+)["”]/);
  if (title && ep && ep[1].trim().toLowerCase() === title.toLowerCase()) {
    const card = nf.lastEpisodeCard;
    return card && card.label.toLowerCase() === title.toLowerCase() ? showOfEpisode(card.id) : null;
  }
  if (title && el.classList.contains('detail-modal')) rememberShow(modalId(), title);
  return title;
}

window.IMDBEXT_SITE = {
  name: 'netflix',

  targets: [
    {
      // Small badge in the corner of each tile. Only looked up near the viewport.
      // Also where show names are learned: href "/browse?jbv=<show id>".
      kind: 'card',
      selector: [
        'a[data-uia="standard-card"]',
        'a[data-uia="ranked-card"]',
        'a[data-uia="progress-card"]',
      ].join(', '),
      titleOf(el) {
        const name = (el.getAttribute('aria-label') || '').trim() || null;
        rememberShow(jbvOf(el.getAttribute('href')), name);
        return name;
      },
      host(el) {
        return el;
      },
    },
    {
      // New & Popular (/latest) still uses the older card:
      // [data-uia="title-card-container"] > .title-card > a.slider-refocus
      // with the title in its aria-label and the image in .boxart-container
      // (already position: relative). Its "Coming This Week", "Coming Next
      // Week" and "Worth the Wait" rows ([data-list-context=
      // "windowedComingSoon"]) list titles not out yet, often sharing a name
      // with an older film ("Inside", "Champions"); with no year on the
      // card, those would show the older film's rating, so they get none.
      // Their hover preview has a year and is handled as usual.
      kind: 'card',
      selector: '[data-uia="title-card-container"]',
      titleOf(el) {
        if (el.closest('[data-list-context="windowedComingSoon"]')) return null;
        return (el.querySelector('a.slider-refocus')?.getAttribute('aria-label') || '').trim() || null;
      },
      host(el) {
        return el.querySelector('.boxart-container');
      },
    },
    {
      // Episode cards: the show's rating, once the episode's show is known.
      kind: 'card',
      selector: 'a[data-uia="episodic-card"]',
      titleOf(el) {
        return showOfEpisode(jbvOf(el.getAttribute('href')));
      },
      typeOf() {
        return 'series';
      },
      host(el) {
        return el.querySelector('[data-uia="episodic-card+still"]') || el;
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
      // Detail line (rating, year, votes) inside the hover preview / detail
      // modal. The hover preview names the title in img.previewModal--boxart;
      // the full detail modal (from "More info" or a /title/ link) in its
      // story art, img.playerModel--player__storyArt. See modalTitle for
      // episode previews and the episode view.
      kind: 'detail',
      selector: '.previewModal--wrapper',
      titleOf: modalTitle,
      // Cards carry no type or year, but the popup does: a "Show|Drama" or
      // "Movie|Action" line ([data-uia="makeover-content-type-genre"]) and a
      // "2026•7 Episodes•TV-MA•HD" line ([data-uia="makeover-metadata"]).
      // Both hints fix titles that would otherwise match a same-named older
      // film (East of Eden, 2026 series vs 1955 film). Watched shows show
      // "S1:E3" instead of the type line.
      // The detail modal has neither line; its "2013 5 Seasons" line
      // ([data-uia="videoMetadata--container"]) says series, and for a series
      // that year is the latest season's, so it is not used as a hint.
      typeOf(el) {
        const line = el.querySelector('[data-uia="makeover-content-type-genre"]');
        const first = line ? line.textContent.split('|')[0].trim() : '';
        if (/^(show|series)$/i.test(first)) return 'series';
        if (/^(movie|film)$/i.test(first)) return 'movie';
        if (SHOW_LENGTH.test(videoMeta(el))) return 'series';
        if (el.querySelector('[data-uia="episode-selector"]')) return 'series';
        return /S\d+:E\d+/.test(el.textContent) ? 'series' : null;
      },
      // An episode's year (preview or episode view) is not the show's, so
      // only titles without an S:E line or episode list give a year hint.
      yearOf(el) {
        if (/S\d+:E\d+/.test(el.textContent) && el.classList.contains('mini-modal')) return null;
        const meta = el.querySelector('[data-uia="makeover-metadata"]');
        let m = meta && meta.textContent.match(/\b(19|20)\d\d\b/);
        if (!m && !el.querySelector('[data-uia="episode-selector"]')) m = videoMeta(el).match(/\b(19|20)\d\d\b/);
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
    {
      // Episode list in the detail modal: [data-uia="episode-selector"], a
      // season dropdown ("Season 2") and one .episode-item per episode with
      // its number in .titleCard-title_index and a .titleCardList-title row
      // ("<title> <duration>") where the rating goes. Matched to IMDb by
      // series + season + episode number, so titles don't have to agree.
      kind: 'episodes',
      selector: '[data-uia="episode-selector"]',
      showOf(el) {
        const modal = el.closest('.previewModal--wrapper');
        return modal ? modalTitle(modal) : null;
      },
      // "Season 2" -> 2. Some shows name seasons after themselves
      // ("Stranger Things 5" -> 5). No dropdown (one season) or "Limited
      // Series" -> 1. Anything else ("Part 2", "Volume 1") doesn't map onto
      // IMDb's seasons reliably, so those lists get no ratings.
      seasonOf(el) {
        const toggle = el.querySelector('[data-uia="dropdown-toggle"]');
        const text = ((toggle ? toggle.textContent : el.querySelector('.episodeSelector-header')?.textContent) || '').trim();
        const m = text.match(/season\s*(\d+)/i);
        if (m) return Number(m[1]);
        const named = text.match(/^(.*\S)\s+(\d+)$/);
        const show = named && this.showOf(el);
        const key = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
        if (named && show && key(named[1]) === key(show)) return Number(named[2]);
        if (!toggle || /limited series|miniseries/i.test(text)) return 1;
        return null;
      },
      items(el) {
        return [...el.querySelectorAll('.episode-item')]
          .map((item) => ({
            number: Number((item.querySelector('.titleCard-title_index')?.textContent || '').trim()),
            row: item.querySelector('.titleCardList-title'),
          }))
          .filter((i) => Number.isInteger(i.number) && i.number > 0 && i.row);
      },
      // Between the episode title and its duration.
      place(row, badge) {
        const title = row.querySelector('.titleCard-title_text');
        if (title) title.after(badge);
        else row.appendChild(badge);
      },
    },
  ],

  // Attributes whose changes mean a title may have changed.
  watchAttributes: ['aria-label', 'alt'],
};
