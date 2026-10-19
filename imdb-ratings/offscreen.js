// Runs inside offscreen.html. The service worker can't do minutes of
// streaming work itself (Chrome stops idle workers), so it opens this hidden
// page, which runs the build in a web worker and relays progress back.

let worker = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.target !== 'offscreen') return;
  if (msg.type === 'build') {
    if (worker) return; // already building
    worker = new Worker('build-worker.js');
    worker.onmessage = (e) => {
      chrome.runtime.sendMessage({ target: 'background', ...e.data });
      if (e.data.type === 'done' || e.data.type === 'error') {
        worker.terminate();
        worker = null;
      }
    };
    worker.onerror = (e) => {
      chrome.runtime.sendMessage({ target: 'background', type: 'error', message: e.message || 'build worker failed' });
      worker.terminate();
      worker = null;
    };
    worker.postMessage({ type: 'start', minVotes: msg.minVotes });
  }
});
