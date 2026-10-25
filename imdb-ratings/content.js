// Generic content script. Finds title elements on the page (as described by
// the site adapter in window.IMDBEXT_SITE), asks the background worker for
// each title's IMDb rating, and overlays a badge.
//
// Two kinds of target:
//   card    small corner badge on a tile; only looked up when near the viewport
//   detail  a line with rating, year and vote count inside a hover/detail popup
//
// Only cards near the viewport are looked up, to stay well inside OMDb's
// daily request limit on pages with hundreds of tiles.

(() => {
  'use strict';

  const site = window.IMDBEXT_SITE;
  if (!site || !Array.isArray(site.targets)) return;

  const PROCESSED = 'data-imdbext-title';
  // A title's own badge, not the episode badges an episode list inside the
  // same host may carry (Netflix's detail modal holds both).
  const OWN_BADGE = '.imdbext-badge:not(.imdbext-badge--episode)';
  let cardMode = 'always'; // card badges: 'always' | 'hover' | 'off'
  let extraWant = {}; // OMDb extras the user ticked: {rt, mc, awards}
  const warned = new Set();
  const MESSAGES = {
    nokey: 'No ratings database yet and no working OMDb key; build the database from the settings (Update now).',
    limit: 'OMDb daily request limit reached. Stored ratings still show; new lookups resume later.',
    http: 'Could not reach OMDb (network error or unexpected response).',
  };

  function warnOnce(kind, detail) {
    if (warned.has(kind)) return;
    warned.add(kind);
    // console.info, not warn: Chrome lists a content script's warnings under
    // the extension's Errors button, and these are expected states (no key
    // yet, OMDb limit, extension just reloaded), not bugs. The page's setup
    // notice is what tells users; this is for anyone debugging.
    console.info('[imdbext] ' + (MESSAGES[kind] || 'Lookup failed: ' + kind), detail || '');
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        io.unobserve(entry.target);
        const target = site.targets.find((t) => entry.target.matches(t.selector));
        if (target) decorate(entry.target, target);
      }
    },
    { rootMargin: '300px 600px' }
  );

  // An adapter's titleOf may return one title or a list of candidates to try
  // in order (Netflix's banner label is "title, season name", and the season
  // name is free text, so "One Piece, East Blue" is tried before "One Piece").
  function titlesOf(target, el) {
    return [].concat(target.titleOf(el)).filter((t) => typeof t === 'string' && t);
  }

  // One target's error (a site redesign, a bug in its adapter) only costs
  // that target: the others still get scanned.
  function scan(root) {
    for (const target of site.targets) {
      try {
        scanTarget(root, target);
      } catch (e) {
        warnOnce('adapter:' + target.kind + ':' + target.selector, String(e));
      }
    }
  }

  function scanTarget(root, target) {
    if (target.kind === 'episodes') {
      for (const el of root.querySelectorAll(target.selector)) scanEpisodes(el, target);
      return;
    }
    if (target.kind === 'card' && cardMode === 'off') return; // no lookups either
    for (const el of root.querySelectorAll(target.selector)) {
      const title = titlesOf(target, el)[0];
      const host = title && target.host(el);
      if (!title || !host) {
        // Nothing to look up now. A reused node (Netflix's one preview for
        // every card) may still carry the previous title's badge: drop it.
        if (el.hasAttribute(PROCESSED)) {
          el.removeAttribute(PROCESSED);
          (host || el).querySelector(OWN_BADGE)?.remove();
        }
        continue;
      }
      // Same title and badge still present: nothing to do. Sites reuse
      // nodes (Netflix's popup is one node shown for many titles), so
      // re-badge whenever the title or the host changed under us.
      if (el.getAttribute(PROCESSED) === title && host.querySelector(OWN_BADGE)) continue;
      el.setAttribute(PROCESSED, title);
      host.querySelector(OWN_BADGE)?.remove();
      if (target.kind === 'card') io.observe(el);
      else decorate(el, target);
    }
  }

  async function decorate(el, target) {
    const key = el.getAttribute(PROCESSED);
    if (!key) return;
    const candidates = titlesOf(target, el);
    if (candidates[0] !== key) return;

    // Optional hints from the site: 'movie' or 'series', and the release
    // year, to pick the right one among same-named titles.
    const kind = typeof target.typeOf === 'function' ? target.typeOf(el) || null : null;
    const year = typeof target.yearOf === 'function' ? target.yearOf(el) || null : null;

    // Try each candidate until one has a rating; keep the last answer otherwise.
    let title = key;
    let result;
    for (const candidate of candidates) {
      title = candidate;
      try {
        result = await chrome.runtime.sendMessage({ type: 'rating', title, kind, year });
      } catch (e) {
        // Usually "Extension context invalidated" after a reload of the
        // extension; a page reload picks things up again.
        warnOnce('context', String(e));
        return;
      }
      if (!setupChecked) {
        setupChecked = true;
        checkSetup();
      }
      if (el.getAttribute(PROCESSED) !== key) return;
      if (!result) {
        warnOnce('empty', 'background worker sent no reply for "' + title + '"');
        return;
      }
      if (result.error) {
        warnOnce(result.error, title);
        return;
      }
      if (result.rating != null) break;
    }

    const host = target.host(el);
    if (!host) return;
    host.querySelector(OWN_BADGE)?.remove();
    const badge = document.createElement('span');
    badge.className = 'imdbext-badge imdbext-badge--' + target.kind;
    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = badge.dataset.imdbId;
      if (id) window.open('https://www.imdb.com/title/' + id + '/', '_blank', 'noopener');
    });
    render(badge, title, result, target.kind);
    if (typeof target.place === 'function') target.place(host, badge);
    else host.appendChild(badge);
    if (target.kind === 'detail' && kind) syncCards(title, result);
    addExtras(badge, target.kind);

    // Stored answer was old: show it now, refresh quietly, update if changed.
    if (result.stale) {
      let fresh;
      try {
        fresh = await chrome.runtime.sendMessage({ type: 'rating', title, kind, year, refresh: true });
      } catch (e) {
        return;
      }
      if (fresh && !fresh.error && badge.isConnected && el.getAttribute(PROCESSED) === key) {
        render(badge, title, fresh, target.kind);
        if (target.kind === 'detail' && kind) syncCards(title, fresh);
        addExtras(badge, target.kind);
      }
    }
  }

  // Optional scores from OMDb after a detail chip's IMDb line: Rotten
  // Tomatoes, Metacritic and an awards headline, whichever the user ticked
  // (extraWant, from the settings) and OMDb has. Card badges get them only
  // with "On cards too", and only the two short scores. The worker decides
  // whether it may ask OMDb at all (key confirmed, lookups on) and
  // remembers answers.
  async function addExtras(badge, kind) {
    const imdbID = badge.dataset.imdbId;
    const onCard = kind === 'card';
    if (!imdbID || (kind !== 'detail' && !onCard)) return;
    if (onCard ? !extraWant.cards || !(extraWant.rt || extraWant.mc) : !(extraWant.rt || extraWant.mc || extraWant.awards)) return;
    let r;
    try {
      r = await chrome.runtime.sendMessage({ type: 'extras', imdbID });
    } catch (e) {
      return;
    }
    const x = r && r.extras;
    if (!x || !badge.isConnected || badge.dataset.imdbId !== imdbID) return;
    badge.querySelector('.imdbext-extras')?.remove();
    const wrap = document.createElement('span');
    wrap.className = 'imdbext-extras';
    // A score with a link opens that site instead of IMDb (the rest of the
    // badge still opens IMDb): Rotten Tomatoes' page for the title when OMDb
    // gave it, otherwise that site's search for the title.
    const add = (cls, text, tip, url) => {
      const s = document.createElement('span');
      s.className = cls;
      s.textContent = text;
      if (tip) s.title = tip;
      if (url) {
        s.classList.add('imdbext-link');
        s.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.open(url, '_blank', 'noopener');
        });
      }
      wrap.appendChild(s);
    };
    const name = x.title || badge.dataset.title || '';
    if (extraWant.rt && x.rt) {
      add('imdbext-rt' + (parseInt(x.rt, 10) >= 60 ? ' imdbext-rt--fresh' : ''), x.rt,
        'Rotten Tomatoes critics score (via OMDb)\nClick to open Rotten Tomatoes',
        x.rtUrl || (name && 'https://www.rottentomatoes.com/search?search=' + encodeURIComponent(name)));
    }
    if (extraWant.mc && x.mc != null) {
      add('imdbext-mc ' + (x.mc >= 61 ? 'imdbext-mc--good' : x.mc >= 40 ? 'imdbext-mc--mixed' : 'imdbext-mc--bad'), String(x.mc),
        'Metacritic score (via OMDb)\nClick to search Metacritic',
        name && 'https://www.metacritic.com/search/' + encodeURIComponent(name) + '/');
    }
    if (extraWant.awards && x.awards && !onCard) add('imdbext-awards', x.awards, x.awards + ' (via OMDb)');
    if (wrap.childElementCount) badge.appendChild(wrap);
  }

  // Episode lists (target kind 'episodes'): the adapter names the show
  // (showOf), the season on screen (seasonOf) and the episode rows (items:
  // [{number, row}]), and may give the show's first year (yearOf), which
  // tells a revival from the original ("Scrubs" 2026 vs 2001). A list that
  // mixes seasons (Apple TV's one shelf for all of them) gives each item its
  // own season ({season, number, row}). The show's IMDb ID comes from an
  // ordinary series lookup, then one 'episodes' request per season. The
  // marker key is the show plus every row's season and number, so switching
  // seasons, scrolling new rows in, or the site redrawing the list decorates
  // it again. Episodes without a rating get no badge.
  //
  // A site may also redraw the rows in place after the badges went in
  // (Paramount+ does as its page finishes loading): same list, badges gone.
  // That list is decorated again, up to MAX_REDRAWS times, in case a site
  // wipes them on every change. data-imdbext-done marks a list that was
  // looked up and had nothing to rate, so it isn't looked up again.
  const MAX_REDRAWS = 5;
  const episodeState = new WeakMap(); // list element -> { key, pending, redraws }

  function scanEpisodes(el, target) {
    const show = target.showOf(el);
    const season = target.seasonOf(el);
    const items = show && season != null ? target.items(el) : [];
    if (!items.length) return;
    const key = show + '|' + items.map((i) => (i.season ?? season) + ':' + i.number).join(',');
    const same = el.getAttribute(PROCESSED) === key;
    if (same && el.querySelector('.imdbext-badge--episode')) return;
    if (same && el.hasAttribute('data-imdbext-done')) return; // looked up, nothing rated
    let state = episodeState.get(el);
    if (same && state && state.key === key) {
      if (state.pending) return; // still looking up
      if (++state.redraws > MAX_REDRAWS) return; // the site keeps wiping them
    } else {
      state = { key, pending: false, redraws: 0 };
      episodeState.set(el, state);
    }
    el.setAttribute(PROCESSED, key);
    el.removeAttribute('data-imdbext-done');
    const seasons = [...new Set(items.map((i) => i.season ?? season))];
    state.pending = true;
    decorateEpisodes(el, target, key, show, season, seasons).finally(() => {
      state.pending = false;
    });
  }

  async function decorateEpisodes(el, target, key, show, season, seasons) {
    let series;
    const bySeason = {};
    try {
      const year = typeof target.yearOf === 'function' ? target.yearOf(el) || null : null;
      series = await chrome.runtime.sendMessage({ type: 'rating', title: show, kind: 'series', year });
      if (el.getAttribute(PROCESSED) !== key) return;
      if (!series || !series.imdbID) {
        el.setAttribute('data-imdbext-done', ''); // show not found: nothing to rate
        return;
      }
      for (const s of seasons) {
        const result = await chrome.runtime.sendMessage({ type: 'episodes', imdbID: series.imdbID, season: s });
        bySeason[s] = (result && result.episodes) || {};
      }
    } catch (e) {
      warnOnce('context', String(e));
      return;
    }
    if (el.getAttribute(PROCESSED) !== key) return; // season switched meanwhile
    let placed = 0;
    for (const item of target.items(el)) {
      const { number, row } = item;
      const s = item.season ?? season;
      row.querySelector('.imdbext-badge--episode')?.remove();
      const ep = (bySeason[s] || {})[number];
      if (!ep) continue;
      const [rating, votes] = ep;
      const badge = document.createElement('span');
      badge.className = 'imdbext-badge imdbext-badge--episode';
      const score = document.createElement('span');
      score.className = 'imdbext-score';
      score.textContent = rating.toFixed(1);
      badge.appendChild(score);
      badge.title = 'IMDb rating ' + rating.toFixed(1) + ' · S' + s + ' E' + number +
        (votes ? ' · ' + votes.toLocaleString('en-US') + ' votes' : '') + '\nClick to open the season on IMDb';
      badge.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.open('https://www.imdb.com/title/' + series.imdbID + '/episodes/?season=' + s, '_blank', 'noopener');
      });
      if (typeof target.place === 'function') target.place(row, badge);
      else row.appendChild(badge);
      placed++;
    }
    if (!placed) el.setAttribute('data-imdbext-done', ''); // nothing rated in this list
  }

  // A detail popup may know the title's type when the cards didn't (Netflix
  // shows "S1:E3" only for series), so its typed match can be better than
  // what the cards got. Redraw any card badges for the same title with it.
  function syncCards(title, result) {
    if (result.rating == null) return;
    const attr = '[' + PROCESSED + '="' + title.replace(/["\\]/g, '\\$&') + '"]';
    for (const target of site.targets) {
      if (target.kind !== 'card') continue;
      // The selector may be a comma list; the attribute filter goes on each part.
      const sel = target.selector.split(',').map((s) => s.trim() + attr).join(', ');
      for (const el of document.querySelectorAll(sel)) {
        const badge = (target.host(el) || el).querySelector('.imdbext-badge--card');
        if (badge) {
          render(badge, title, result, 'card');
          addExtras(badge, 'card');
        }
      }
    }
  }

  function render(badge, title, result, kind) {
    badge.textContent = '';
    const score = document.createElement('span');
    score.className = 'imdbext-score';
    badge.appendChild(score);

    if (result.rating == null) {
      badge.classList.add('imdbext-badge--none');
      score.textContent = 'n/a';
      badge.title =
        'No IMDb match for "' + title + '"' + (result.offered ? ' (OMDb offered "' + result.offered + '", not the same title)' : '');
      delete badge.dataset.imdbId;
      if (kind === 'detail') {
        const info = document.createElement('span');
        info.className = 'imdbext-info';
        info.textContent = 'no IMDb match';
        badge.appendChild(info);
      }
      return;
    }

    badge.classList.remove('imdbext-badge--none');
    score.textContent = result.rating.toFixed(1);
    const parts = [result.matchedTitle, result.year, result.votes && result.votes + ' votes'].filter(Boolean);
    // Says where the number comes from, which the default star label doesn't.
    badge.title = 'IMDb rating ' + result.rating.toFixed(1) + ' · ' + parts.join(' · ') +
      (result.imdbID ? '\nClick to open the IMDb page' : '');
    if (result.imdbID) badge.dataset.imdbId = result.imdbID;
    else delete badge.dataset.imdbId;
    badge.dataset.title = result.matchedTitle || title;

    if (kind === 'detail') {
      const info = document.createElement('span');
      info.className = 'imdbext-info';
      const bits = [];
      if (result.year) bits.push(result.year);
      if (result.votes) bits.push(result.votes + ' votes');
      if (result.matchedTitle && result.matchedTitle.toLowerCase() !== title.toLowerCase()) {
        bits.push('matched “' + result.matchedTitle + '”');
      }
      info.textContent = bits.join(' · ');
      badge.appendChild(info);
    }
  }

  // With no local database and no usable OMDb key every lookup comes back
  // empty, and the page looks as if the extension did nothing. After the
  // first lookup on a page, ask the worker; if setup is needed, show one
  // small notice that opens the settings. It polls while visible and goes
  // away by itself once the database is built (or a key works), then the
  // page is rescanned so the cards get their badges.
  const HIDE_KEY = 'setupNoticeHiddenUntil';
  const HIDE_MS = 24 * 60 * 60 * 1000;
  const POLL_MS = 4000;
  let setupChecked = false;
  let notice = null;
  let pollTimer = null;

  async function checkSetup() {
    let s;
    try {
      s = await chrome.runtime.sendMessage({ type: 'setup' });
    } catch (e) {
      return;
    }
    if (!mo) return; // the site was switched off meanwhile
    if (!s || !s.needed) {
      if (notice) {
        removeNotice();
        stop();
        start();
      }
      return;
    }
    if (!notice) {
      const { [HIDE_KEY]: until = 0 } = await chrome.storage.local.get(HIDE_KEY);
      if (Date.now() < until || !mo || notice) return;
      showNotice();
    }
    // Only touch the DOM on a real change: every mutation makes scan() look
    // up the badge-less cards again.
    const text = s.building ? 'Building the IMDb ratings database…' : 'Click to set up IMDb ratings';
    const span = notice.querySelector('.imdbext-setup-text');
    if (span.textContent !== text) span.textContent = text;
    clearTimeout(pollTimer);
    pollTimer = setTimeout(checkSetup, POLL_MS);
  }

  function showNotice() {
    notice = document.createElement('div');
    notice.className = 'imdbext-setup';
    notice.title = 'Opens the settings, where Update now builds the ratings database (a few minutes, once)';
    const text = document.createElement('span');
    text.className = 'imdbext-setup-text';
    const close = document.createElement('span');
    close.className = 'imdbext-setup-close';
    close.textContent = '×';
    close.title = 'Hide for a day';
    notice.append(text, close);
    notice.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.target === close) {
        chrome.storage.local.set({ [HIDE_KEY]: Date.now() + HIDE_MS });
        removeNotice();
        return;
      }
      chrome.runtime.sendMessage({ type: 'open-settings' }).catch(() => {});
    });
    document.body.appendChild(notice);
  }

  function removeNotice() {
    clearTimeout(pollTimer);
    pollTimer = null;
    notice?.remove();
    notice = null;
  }

  // Initial pass, then follow the single-page app as it adds rows and popups.
  let mo = null;
  let pending = null;

  // An adapter that learns something later (Netflix working out which show
  // an episode card belongs to) asks for another pass with this event.
  document.addEventListener('imdbext-rescan', () => {
    if (mo) scan(document);
  });

  function start() {
    if (mo) return;
    scan(document);
    mo = new MutationObserver(() => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        scan(document);
      }, 200);
    });
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: site.watchAttributes || ['aria-label'],
    });
  }

  // Remove every badge and forget what was processed, so turning the site
  // back on starts clean. A lookup still in flight finds its PROCESSED
  // marker gone and draws nothing.
  function stop() {
    if (mo) {
      mo.disconnect();
      mo = null;
    }
    if (pending) {
      clearTimeout(pending);
      pending = null;
    }
    io.disconnect();
    removeNotice();
    setupChecked = false;
    for (const b of document.querySelectorAll('.imdbext-badge')) b.remove();
    for (const el of document.querySelectorAll('[' + PROCESSED + ']')) el.removeAttribute(PROCESSED);
  }

  // The settings panel keeps {sites: {netflix: true, ...}} in sync storage;
  // a site missing from it is on. One read on a disabled site, then nothing.
  const enabled = (sites) => !sites || sites[site.name] !== false;

  // Badge settings: cardBadges 'always' | 'hover' | 'off', hideNA drops the
  // grey "n/a" card badges, badgeLabel 'star' (default) | 'imdb' picks the
  // tag before the score. Hover, n/a and the label are pure CSS (classes on
  // <html>, see badge.css); 'off' also stops card lookups, so it rescans.
  // extraRatings {rt, mc, awards} (with OMDb lookups on) adds OMDb's extra
  // scores to detail chips; changing it rescans so open chips follow.
  const PREF_KEYS = ['cardBadges', 'hideNA', 'badgeLabel', 'extraRatings', 'omdbFallback'];

  function applyBadgePrefs({ cardBadges, hideNA, badgeLabel, extraRatings, omdbFallback }) {
    cardMode = cardBadges === 'hover' || cardBadges === 'off' ? cardBadges : 'always';
    extraWant = omdbFallback === false ? {} : { ...(extraRatings || {}) };
    const cl = document.documentElement.classList;
    cl.toggle('imdbext-cards-hover', cardMode === 'hover');
    cl.toggle('imdbext-hide-na', !!hideNA);
    cl.toggle('imdbext-label-imdb', badgeLabel === 'imdb');
  }

  chrome.storage.sync.get(['sites', ...PREF_KEYS]).then((prefs) => {
    applyBadgePrefs(prefs);
    if (enabled(prefs.sites)) start();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (PREF_KEYS.some((k) => changes[k])) {
      const wasOff = cardMode === 'off';
      const extrasChanged = !!(changes.extraRatings || changes.omdbFallback);
      chrome.storage.sync.get(PREF_KEYS).then((prefs) => {
        applyBadgePrefs(prefs);
        if (mo && (extrasChanged || wasOff !== (cardMode === 'off'))) {
          stop();
          start();
        }
      });
    }
    if (!changes.sites) return;
    if (enabled(changes.sites.newValue)) start();
    else stop();
  });
})();
