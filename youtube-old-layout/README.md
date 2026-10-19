# YouTube Old Layout

Brings back the classic YouTube watch page: recommended videos in the
right-hand column, comments underneath the video.

In October 2026 YouTube started switching people to a new arrangement with
comments on the right and recommendations in a grid under the video. This
extension turns the experiment off for you, so YouTube renders the page the
way it always did. It is not a restyle: the result is YouTube's own old
layout, including theater mode.

## Install

The extension isn't on the Chrome Web Store, so it's loaded "unpacked":

1. Download the latest `youtube-old-layout` ZIP from the
   [Releases page](https://github.com/Lwolf12/chromeext/releases) and
   extract it somewhere permanent; Chrome loads the extension from that
   folder every time it starts.
2. In Chrome, open `chrome://extensions`.
3. Turn on **Developer mode** (toggle in the top right).
4. Click **Load unpacked** and pick the `youtube-old-layout` folder from the
   extracted ZIP.
5. Open any YouTube video and hard-reload it (Ctrl+Shift+R).

There's no icon, popup, or settings page. To get the new layout back, switch
the extension off on `chrome://extensions`.

If you also use uBlock Origin with the custom filters for this layout, you
only need one of the two. They don't conflict, but there's no point running
both.

## How it works

YouTube ships both the old and the new watch-page code and picks one based on
experiment flags in the page's config (`yt.config_.EXPERIMENT_FLAGS`). This
extension has two layers:

1. **`flags.js`** runs in the page's own JavaScript world before any YouTube
   script. It intercepts the config object as YouTube fills it in and pins
   the layout flags to `false`. YouTube then behaves as if your account were
   never in the experiment. The flag list is the same one used by the uBlock
   Origin filters that circulated when the change rolled out.

2. **`fallback.js`** runs after the page settles. If the flag override ever
   stops working, it moves the recommendations back into the right column
   and the comments back under the video, and re-runs after YouTube's
   in-page navigation. This is an approximation and only kicks in when
   needed.

`style.css` hides the new layout's side-rail container as a precaution.

## Will it keep working?

For as long as YouTube keeps the old layout code in the page. Experiments
usually run for weeks or months before the losing version is deleted. Once
that happens, the flags do nothing and only the fallback remains, which will
look close but not identical. If a flag is simply renamed first, adding the
new name to the `FLAGS` table in `flags.js` fixes it.

To see the current flag names, open a watch page, press F12, and run:

```js
Object.keys(ytcfg.get('EXPERIMENT_FLAGS')).filter(k => /watch|rail|grid/.test(k))
```

Or point Claude Code at this folder and say "YouTube moved things again."

## Permissions

The extension asks for nothing beyond running on `www.youtube.com`. It makes
no network requests and stores no data.
