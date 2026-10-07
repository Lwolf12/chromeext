// Safety net for when the flag override in flags.js stops working (for
// example after YouTube deletes the old layout code path). Watches the watch
// page and moves the two sections back to their classic positions:
//
//   #related            -> #secondary > #secondary-inner  (right column)
//   ytd-comments#comments -> #primary > #primary-inner > #below (under video)
//
// While the flag override works, these elements are already where they belong
// and this script does nothing. It only acts in two-column mode, because in a
// narrow single-column window YouTube itself legitimately stacks
// recommendations under the video.

(() => {
  'use strict';

  const DEBOUNCE_MS = 250;
  let timer = null;

  function restore() {
    if (location.pathname !== '/watch') return;

    const flexy = document.querySelector('ytd-watch-flexy');
    if (!flexy || !flexy.hasAttribute('is-two-columns_')) return;

    const primary = flexy.querySelector('#primary');
    const below = flexy.querySelector('#primary #below');
    const secondaryInner =
      flexy.querySelector('#secondary #secondary-inner') ||
      flexy.querySelector('#secondary');
    if (!primary || !below || !secondaryInner) return;

    const comments = flexy.querySelector('ytd-comments#comments');
    if (comments && !primary.contains(comments)) {
      below.appendChild(comments);
    }

    const related = flexy.querySelector('#related');
    if (related && !secondaryInner.contains(related)) {
      secondaryInner.appendChild(related);
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(restore, DEBOUNCE_MS);
  }

  // YouTube is a single-page app: these fire on in-page navigation.
  window.addEventListener('yt-navigate-finish', schedule);
  window.addEventListener('yt-page-data-updated', schedule);

  // Catch lazy rendering (comments load only once scrolled into view).
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  schedule();
})();
