const $ = (id) => document.getElementById(id);

function say(text, cls) {
  const s = $('status');
  s.textContent = text;
  s.className = cls || 'ok';
}

const STALE_WORKER =
  'The extension’s background worker is out of date. On chrome://extensions, click the reload icon on this extension’s card, then reopen this panel.';

const PHASES = {
  starting: 'Starting…',
  ratings: 'Downloading ratings',
  basics: 'Downloading title list',
  episodes: 'Downloading episode list',
  writing: 'Saving to the database',
};

function ago(ts) {
  const days = Math.floor((Date.now() - ts) / 86400000);
  return days === 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago';
}

// ------------------------------------------------------------ database

// The green "All set" box is for a build that just finished; the session
// keeps the done state until the browser restarts, and an hours-old one is
// already covered by the "built today" line above.
const DONE_RECENT_MS = 10 * 60 * 1000;

function showBuild(build) {
  const box = $('buildProgress');
  const btn = $('build');
  $('buildDone').hidden = true;
  if (!build || build.status === 'idle') {
    box.hidden = true;
    btn.disabled = false;
    return;
  }
  if (build.status === 'done') {
    box.hidden = true;
    btn.disabled = false;
    if (Date.now() - (build.at || 0) < DONE_RECENT_MS) {
      $('doneText').textContent =
        build.info.titles.toLocaleString() + ' titles. Ratings now show on the streaming sites ' +
        '(reload any that are already open).';
      $('buildDone').hidden = false;
    }
    return;
  }
  if (build.status === 'running') {
    box.hidden = false;
    btn.disabled = true;
    $('buildBar').value = build.pct || 0;
    const unit = { basics: ' titles', episodes: ' episodes' }[build.phase];
    const detail = unit && build.detail ? ' (' + build.detail.toLocaleString() + unit + ' so far)' : '';
    $('buildText').textContent = (PHASES[build.phase] || build.phase) + ' ' + Math.round((build.pct || 0) * 100) + '%' + detail;
    return;
  }
  box.hidden = false;
  btn.disabled = false;
  $('buildBar').value = 0;
  $('buildText').textContent = 'Failed: ' + build.message + ' (will retry automatically in a day)';
}

// In its own window (the usual way it opens) or a tab, the panel offers to
// close itself; closing the window's only tab closes the window. Inside
// Chrome's embedded options dialog there is no tab, so the button stays hidden.
chrome.tabs.getCurrent((tab) => {
  if (!tab) return;
  $('closeTab').hidden = false;
  $('closeTab').addEventListener('click', () => chrome.tabs.remove(tab.id));
});

async function refreshStats() {
  let u;
  try {
    u = await chrome.runtime.sendMessage({ type: 'usage' });
  } catch (e) {
    u = null;
  }
  if (!u) {
    say(STALE_WORKER, 'bad');
    return;
  }
  const l = u.local || {};
  builtAt = l.present ? l.builtAt || 0 : 0;
  // A database built before episode ratings existed has titles only; the
  // next weekly refresh (or Update now) adds the episodes.
  $('localStatus').textContent = !l.present
    ? 'Not built yet. Click Update now; it takes a few minutes.'
    : l.episodes
      ? l.titles.toLocaleString() + ' titles and ' + l.episodes.toLocaleString() + ' episodes, built ' + l.built + ' (' + ago(l.builtAt) + ').'
      : l.titles.toLocaleString() + ' titles, built ' + l.built + ' (' + ago(l.builtAt) + '). Episode ratings arrive with the next update.';
  $('auto').checked = u.autoRefresh !== false;
  showBuild(u.build);
  $('stored').textContent = u.stored.toLocaleString();
  $('today').textContent = u.today.toLocaleString();
  $('limit').textContent = u.limitHit ? '(limit reached; paused for now)' : '';
}

// Update now rebuilds regardless of age, but a database under a day old is
// almost certainly current, so ask for a second click before re-downloading
// 280 MB.
let builtAt = 0;
let confirmUntil = 0;

function sinceBuild() {
  const mins = Math.round((Date.now() - builtAt) / 60000);
  if (mins < 60) return mins + ' minute' + (mins === 1 ? '' : 's') + ' ago';
  const hours = Math.round(mins / 60);
  return hours + ' hour' + (hours === 1 ? '' : 's') + ' ago';
}

function showNote(text) {
  const n = $('buildNote');
  n.textContent = text;
  n.hidden = !text;
}

$('build').addEventListener('click', async () => {
  const fresh = builtAt && Date.now() - builtAt < 24 * 60 * 60 * 1000;
  if (fresh && Date.now() > confirmUntil) {
    confirmUntil = Date.now() + 8000;
    showNote('Built ' + sinceBuild() + ', so it is current and there’s nothing to do; you can close this page. Click again to rebuild anyway.');
    setTimeout(() => { if (Date.now() >= confirmUntil) showNote(''); }, 8200);
    return;
  }
  confirmUntil = 0;
  showNote('');
  $('build').disabled = true;
  showBuild(await chrome.runtime.sendMessage({ type: 'build' }));
});

$('auto').addEventListener('change', async () => {
  await chrome.storage.sync.set({ autoRefresh: $('auto').checked });
  say($('auto').checked ? 'Automatic weekly refresh on.' : 'Automatic refresh off; use Update now when you want.');
});

// Live progress while a build runs: the worker writes its state to session
// storage, which fires this for every update.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.buildState) {
    const s = changes.buildState.newValue;
    showBuild(s);
    if (s && (s.status === 'done' || s.status === 'error')) refreshStats();
  }
});

// --------------------------------------------------------------- sites

// Which services the content script runs on. Stored as one object keyed by
// the adapter's name; a missing key means on, so new sites default to on.
const SITE_BOXES = [...document.querySelectorAll('input.site')];

async function loadSites() {
  const { sites = {} } = await chrome.storage.sync.get('sites');
  for (const box of SITE_BOXES) box.checked = sites[box.dataset.site] !== false;
}

for (const box of SITE_BOXES) {
  box.addEventListener('change', async () => {
    const sites = {};
    for (const b of SITE_BOXES) sites[b.dataset.site] = b.checked;
    await chrome.storage.sync.set({ sites });
    const label = box.parentElement.textContent.trim().split(' (')[0];
    say(label + (box.checked ? ' on.' : ' off.'));
  });
}

// -------------------------------------------------------------- badges

// How card badges show: cardBadges 'always' | 'hover' | 'off', and hideNA
// to drop the grey "n/a" ones. Previews, banners and title pages always
// show the rating. Read by the content script, which applies changes live.
const MODE_BOXES = [...document.querySelectorAll('input[name=cardBadges]')];
const MODE_SAID = {
  always: 'Card badges always show.',
  hover: 'Card badges show when the mouse is over a card.',
  off: 'Card badges off; previews, banners and title pages still show ratings.',
};

// badgeLabel: 'star' (default) or 'imdb', the tag shown before the score.
const LABEL_BOXES = [...document.querySelectorAll('input[name=badgeLabel]')];

async function loadBadges() {
  const { cardBadges = 'always', hideNA = false, badgeLabel = 'star' } =
    await chrome.storage.sync.get(['cardBadges', 'hideNA', 'badgeLabel']);
  for (const box of MODE_BOXES) box.checked = box.value === cardBadges;
  $('hideNA').checked = hideNA;
  for (const box of LABEL_BOXES) box.checked = box.value === badgeLabel;
}

for (const box of LABEL_BOXES) {
  box.addEventListener('change', async () => {
    if (!box.checked) return;
    await chrome.storage.sync.set({ badgeLabel: box.value });
    say(box.value === 'imdb' ? 'Badges show the IMDb tag.' : 'Badges show a star.');
  });
}

for (const box of MODE_BOXES) {
  box.addEventListener('change', async () => {
    if (!box.checked) return;
    await chrome.storage.sync.set({ cardBadges: box.value });
    say(MODE_SAID[box.value]);
  });
}

$('hideNA').addEventListener('change', async () => {
  await chrome.storage.sync.set({ hideNA: $('hideNA').checked });
  say($('hideNA').checked ? '“n/a” badges hidden on cards.' : '“n/a” badges shown on cards.');
});

// ---------------------------------------------------------------- OMDb

// The checkbox means "OMDb is in use": fallback enabled and a key saved.
// Ticking it reveals the key fields; unticking disables the fallback but
// keeps the key so it can be turned back on without re-entering it.
async function loadOmdb() {
  const { omdbKey = '', omdbFallback = true } = await chrome.storage.sync.get(['omdbKey', 'omdbFallback']);
  $('key').value = omdbKey;
  const on = !!omdbKey && omdbFallback;
  $('useOmdb').checked = on;
  $('omdbBox').hidden = !on;
}

$('useOmdb').addEventListener('change', async () => {
  const on = $('useOmdb').checked;
  $('omdbBox').hidden = !on;
  await chrome.storage.sync.set({ omdbFallback: on });
  if (on && !$('key').value.trim()) $('key').focus();
  else say(on ? 'OMDb lookups on.' : 'OMDb lookups off.');
});

$('save').addEventListener('click', async () => {
  const omdbKey = $('key').value.trim();
  await chrome.storage.sync.set({ omdbKey, omdbFallback: !!omdbKey });
  // A new key means an earlier "limit reached" pause no longer applies.
  await chrome.storage.local.remove(['limitHitDay', 'limitPauseUntil']);
  say(omdbKey ? 'Key saved.' : 'Key cleared.');
  refreshStats();
});

$('test').addEventListener('click', async () => {
  const out = $('testResult');
  out.className = '';
  out.textContent = 'Testing…';
  // Test whatever is in the box, saving it first so the worker sees it.
  const omdbKey = $('key').value.trim();
  await chrome.storage.sync.set({ omdbKey, omdbFallback: !!omdbKey });
  let r;
  try {
    r = await chrome.runtime.sendMessage({ type: 'test' });
  } catch (e) {
    r = null;
  }
  if (!r) {
    out.className = 'bad';
    out.textContent = STALE_WORKER;
    return;
  }
  out.className = r.ok ? 'ok' : 'bad';
  out.textContent = (r.ok ? 'OK: ' : 'Failed: ') + r.detail;
  refreshStats();
});

// ------------------------------------------------------------ advanced

async function ratingEntries() {
  const all = await chrome.storage.local.get(null);
  const out = {};
  for (const [k, v] of Object.entries(all)) if (k.startsWith('r:')) out[k] = v;
  return out;
}

$('clear').addEventListener('click', async () => {
  const keys = Object.keys(await ratingEntries());
  await chrome.storage.local.remove(keys);
  say('Cleared ' + keys.length + ' remembered ratings.');
  refreshStats();
});

$('deleteDb').addEventListener('click', async () => {
  if (!confirm('Delete the local ratings database? Ratings then come from OMDb only (if set up) until you click Update now, which downloads about 280 MB again.')) return;
  // Emptying ~365,000 titles takes a few seconds; keep Update now from
  // acting on the old build time meanwhile (it would say "current").
  $('build').disabled = true;
  $('deleteDb').disabled = true;
  say('Deleting the database…');
  let r;
  try {
    r = await chrome.runtime.sendMessage({ type: 'delete-db' });
  } catch (e) {
    r = { ok: false, message: String(e) };
  }
  $('deleteDb').disabled = false;
  $('build').disabled = false;
  if (r && r.ok) {
    builtAt = 0;
    confirmUntil = 0;
    showNote('');
    say('Database deleted' + (r.forgotten ? ', with ' + r.forgotten.toLocaleString() + ' ratings remembered from it' : '') + '. Reload open streaming tabs to see the change.');
  } else say('Could not delete the database: ' + ((r && r.message) || 'no answer from the extension') + '.', 'bad');
  refreshStats();
});

// ------------------------------------------------------------------ go

loadSites();
loadBadges();
loadOmdb();
refreshStats();
