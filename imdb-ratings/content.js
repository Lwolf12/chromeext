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
  const warned = new Set();
  const MESSAGES = {
    nokey: 'No OMDb API key set, or the key is invalid/not activated. Click the extension icon to add one.',
    limit: 'OMDb daily request limit reached. Stored ratings still show; new lookups resume later.',
    http: 'Could not reach OMDb (network error or unexpected response).',
  };

  function warnOnce(kind, detail) {
    if (warned.has(kind)) return;
    warned.add(kind);
    console.warn('[imdbext] ' + (MESSAGES[kind] || 'Lookup failed: ' + kind), detail || '');
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

  function scan(root) {
    for (const target of site.targets) {
      for (const el of root.querySelectorAll(target.selector)) {
        const title = titlesOf(target, el)[0];
        if (!title) continue;
        const host = target.host(el);
        if (!host) continue;
        // Same title and badge still present: nothing to do. Sites reuse
        // nodes (Netflix's popup is one node shown for many titles), so
        // re-badge whenever the title or the host changed under us.
        if (el.getAttribute(PROCESSED) === title && host.querySelector('.imdbext-badge')) continue;
        el.setAttribute(PROCESSED, title);
        host.querySelector('.imdbext-badge')?.remove();
        if (target.kind === 'card') io.observe(el);
        else decorate(el, target);
      }
    }
  }

  async function decorate(el, target) {
    const key = el.getAttribute(PROCESSED);
    if (!key) return;
    const candidates = titlesOf(target, el);
    if (candidates[0] !== key) return;

    // Optional hint from the site: 'movie' or 'series', to sharpen the match.
    const kind = typeof target.typeOf === 'function' ? target.typeOf(el) || null : null;

    // Try each candidate until one has a rating; keep the last answer otherwise.
    let title = key;
    let result;
    for (const candidate of candidates) {
      title = candidate;
      try {
        result = await chrome.runtime.sendMessage({ type: 'rating', title, kind });
      } catch (e) {
        // Usually "Extension context invalidated" after a reload of the
        // extension; a page reload picks things up again.
        warnOnce('context', String(e));
        return;
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
    host.querySelector('.imdbext-badge')?.remove();
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

    // Stored answer was old: show it now, refresh quietly, update if changed.
    if (result.stale) {
      let fresh;
      try {
        fresh = await chrome.runtime.sendMessage({ type: 'rating', title, kind, refresh: true });
      } catch (e) {
        return;
      }
      if (fresh && !fresh.error && badge.isConnected && el.getAttribute(PROCESSED) === key) {
        render(badge, title, fresh, target.kind);
        if (target.kind === 'detail' && kind) syncCards(title, fresh);
      }
    }
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
        if (badge) render(badge, title, result, 'card');
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
      badge.title = 'No IMDb match for "' + title + '"';
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
    badge.title = parts.join(' · ');
    if (result.imdbID) badge.dataset.imdbId = result.imdbID;
    else delete badge.dataset.imdbId;

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

  // Initial pass, then follow the single-page app as it adds rows and popups.
  scan(document);
  let pending = null;
  new MutationObserver(() => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      scan(document);
    }, 200);
  }).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: site.watchAttributes || ['aria-label'],
  });
})();
