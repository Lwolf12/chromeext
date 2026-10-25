# chromeext

Small Chrome extensions, one per folder. imdb-ratings is also on the Chrome
Web Store; the others you load straight from this repository.

| Extension | What it does |
| --- | --- |
| [youtube-old-layout](youtube-old-layout/) | Brings back the classic YouTube watch page: recommended videos on the right, comments under the video. |
| [imdb-ratings](imdb-ratings/) | Overlays the IMDb user rating on title cards while browsing Netflix, Prime Video, Hulu, HBO Max, Apple TV, Disney+, Paramount+ and Tubi, with episode ratings in each show's episode list. [Install from the Chrome Web Store](https://chromewebstore.google.com/detail/biopmnlghmgjoloionocinndfopncelh). |

## Installing from this repository

1. Open the [Releases page](https://github.com/Lwolf12/chromeext/releases)
   and download the ZIP for the extension you want (each release is named
   after its extension, for example `imdb-ratings v0.4.0`). Extract it
   somewhere you'll keep it: Chrome loads the extension from that folder
   every time it starts, so don't delete it afterwards.
2. In Chrome, open `chrome://extensions`.
3. Turn on **Developer mode** (toggle in the top right).
4. Click **Load unpacked** and pick the extracted folder, for example
   `youtube-old-layout`.

To update later, download the newer release's ZIP, replace the folder, and
click the reload icon on the extension's card in `chrome://extensions`.
