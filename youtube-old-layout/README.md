# YouTube Old Layout

Restores the classic YouTube watch page: recommended videos on the right,
comments underneath the video.

## Install (load unpacked)

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick this folder (`youtube-old-layout`).
4. Open any YouTube video and hard-reload it (Ctrl+Shift+R).

The extension has no icon, popup, or settings. Toggle it from the
`chrome://extensions` page if you want the new layout back.

## How it works

Two layers, in order of preference:

1. **`flags.js`** (runs first, in the page's own JS world). YouTube picks the
   layout from experiment flags in `yt.config_.EXPERIMENT_FLAGS`. The script
   traps that object before YouTube's scripts fill it and pins the layout
   flags to `false`, so YouTube renders its own old layout. This is the same
   mechanism as the uBlock Origin filters circulating in October 2026 and gives
   a pixel-identical result while YouTube still ships the old code path.

2. **`fallback.js`** (runs after the page settles). If the flag override ever
   stops working, this watches the page and physically moves `#related` back
   into the right column and `ytd-comments#comments` back under the video. It
   re-runs after YouTube's in-page navigation. It is an approximation and may
   need selector updates when YouTube changes its markup.

`style.css` hides the new layout's side rail container as a belt-and-braces
measure.

## Updating

If YouTube renames a flag, add the new name to the `FLAGS` table in
`flags.js`. You can see the current flag names on any watch page with:

```js
Object.keys(ytcfg.get('EXPERIMENT_FLAGS')).filter(k => /watch|rail|grid/.test(k))
```

After editing, click the reload icon for this extension on `chrome://extensions`.
