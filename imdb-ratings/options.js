const $ = (id) => document.getElementById(id);
const status = $('status');

function say(text) {
  status.textContent = text;
}

const STALE_WORKER =
  'The extension’s background worker is out of date. On chrome://extensions, click the reload icon on this extension’s card, then reopen this panel.';

async function refreshStats() {
  let u;
  try {
    u = await chrome.runtime.sendMessage({ type: 'usage' });
  } catch (e) {
    u = null;
  }
  if (!u) {
    say(STALE_WORKER);
    return;
  }
  $('stored').textContent = u.stored.toLocaleString();
  $('today').textContent = u.today.toLocaleString();
  $('limit').textContent = u.limitHit ? '(limit reached; paused for now)' : '';
  const l = u.local || {};
  $('localStatus').textContent = l.present
    ? l.titles.toLocaleString() + ' titles with at least ' + l.minVotes + ' votes, built ' + l.built + '.'
    : 'Not present: no data/ratings.json.gz in the extension folder, so every lookup goes to OMDb.';
}

chrome.storage.sync.get('omdbFallback').then(({ omdbFallback = true }) => {
  $('fallback').checked = omdbFallback;
});
$('fallback').addEventListener('change', async () => {
  await chrome.storage.sync.set({ omdbFallback: $('fallback').checked });
  say($('fallback').checked ? 'OMDb fallback on.' : 'OMDb fallback off: titles missing locally show n/a.');
});

async function ratingEntries() {
  const all = await chrome.storage.local.get(null);
  const out = {};
  for (const [k, v] of Object.entries(all)) if (k.startsWith('r:')) out[k] = v;
  return out;
}

chrome.storage.sync.get('omdbKey').then(({ omdbKey }) => {
  if (omdbKey) $('key').value = omdbKey;
});
refreshStats();

$('save').addEventListener('click', async () => {
  const omdbKey = $('key').value.trim();
  await chrome.storage.sync.set({ omdbKey });
  // A new key means an earlier "limit reached" pause no longer applies.
  await chrome.storage.local.remove(['limitHitDay', 'limitPauseUntil']);
  say(omdbKey ? 'Saved. Reload Netflix to see ratings.' : 'Key cleared.');
  refreshStats();
});

$('test').addEventListener('click', async () => {
  const out = $('testResult');
  out.className = '';
  out.textContent = 'Testing…';
  // Test whatever is in the box, saving it first so the worker sees it.
  const omdbKey = $('key').value.trim();
  await chrome.storage.sync.set({ omdbKey });
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

$('export').addEventListener('click', async () => {
  const entries = await ratingEntries();
  const blob = new Blob([JSON.stringify(entries, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'imdb-ratings-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  say('Exported ' + Object.keys(entries).length + ' titles.');
});

$('import').addEventListener('click', () => $('file').click());

$('file').addEventListener('change', async () => {
  const file = $('file').files[0];
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (e) {
    say('That file is not valid JSON.');
    return;
  }
  const existing = await ratingEntries();
  const toSet = {};
  let added = 0;
  let updated = 0;
  for (const [k, v] of Object.entries(data)) {
    if (!k.startsWith('r:') || !v || typeof v !== 'object') continue;
    const cur = existing[k];
    if (!cur) added++;
    else if ((v.ts || 0) > (cur.ts || 0)) updated++;
    else continue; // keep the newer one we already have
    toSet[k] = v;
  }
  await chrome.storage.local.set(toSet);
  $('file').value = '';
  say('Imported: ' + added + ' new, ' + updated + ' updated.');
  refreshStats();
});

$('clear').addEventListener('click', async () => {
  const keys = Object.keys(await ratingEntries());
  await chrome.storage.local.remove(keys);
  say('Cleared ' + keys.length + ' stored ratings.');
  refreshStats();
});
