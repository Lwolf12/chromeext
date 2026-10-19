// Web worker that runs the database build off the main thread. Spawned by
// offscreen.js; reports progress, completion and errors with postMessage.

importScripts('db.js', 'builder.js');

self.onmessage = async (e) => {
  if (!e.data || e.data.type !== 'start') return;
  let last = 0;
  try {
    const info = await RatingsBuilder.build({
      minVotes: e.data.minVotes,
      onProgress: (p) => {
        // Byte-level progress fires very often; a few updates a second is plenty.
        const now = Date.now();
        if (p.phase === 'writing' || now - last > 250) {
          last = now;
          self.postMessage({ type: 'progress', ...p });
        }
      },
    });
    self.postMessage({ type: 'done', info });
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.message) || err) });
  }
};
