# chromeext

Small Chrome extensions, one per folder, loaded straight from this
repository.

| Extension | What it does |
| --- | --- |
| [youtube-old-layout](youtube-old-layout/) | Brings back the classic YouTube watch page: recommended videos on the right, comments under the video. |
| [Show IMDb Ratings on Streaming Services](https://github.com/Lwolf12/show-imdb-ratings) | Overlays the IMDb user rating on title cards while browsing Netflix, Prime Video, Hulu, HBO Max and more, with episode ratings in each show's episode list. Moved to [its own repository](https://github.com/Lwolf12/show-imdb-ratings); [install from the Chrome Web Store](https://chromewebstore.google.com/detail/biopmnlghmgjoloionocinndfopncelh). Its releases up to 1.0.0 stay on this repository's Releases page. |

## Installing from this repository

1. Open the [Releases page](https://github.com/Lwolf12/chromeext/releases)
   and download the ZIP for the extension you want (each release is named
   after its extension, for example `youtube-old-layout v1.0.0`). Extract it
   somewhere you'll keep it: Chrome loads the extension from that folder
   every time it starts, so don't delete it afterwards.
2. In Chrome, open `chrome://extensions`.
3. Turn on **Developer mode** (toggle in the top right).
4. Click **Load unpacked** and pick the extracted folder, for example
   `youtube-old-layout`.

To update later, download the newer release's ZIP, replace the folder, and
click the reload icon on the extension's card in `chrome://extensions`.

## Credits

Built with Claude Code (Anthropic's AI coding assistant), which wrote the
code; I designed, tested and published the extensions.

## License

MIT, see [LICENSE](LICENSE). It covers the code in this repository.
