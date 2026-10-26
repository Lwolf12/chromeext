# Releasing an extension

Each extension is published as its own GitHub Release with a ZIP attached, so
downloads are counted per extension. A workflow
(`.github/workflows/release.yml`) does the work when a tag is pushed.

The IMDb extension moved to <https://github.com/Lwolf12/show-imdb-ratings>
on 2026-10-26 and is released there. Its releases up to 1.0.0
(`imdb-ratings-v…`) stay on this repository's Releases page.

## Cut a release

1. Bump `"version"` in the extension's `manifest.json` and commit it.
2. Tag the commit `<folder>-v<version>` and push the tag:

   ```bash
   git tag youtube-old-layout-v1.0.1
   git push origin youtube-old-layout-v1.0.1
   ```

   The tag's version must match the manifest, or the workflow stops.
3. A minute later the release appears at
   <https://github.com/Lwolf12/chromeext/releases> with
   `youtube-old-layout-v1.0.1.zip` attached, with the repository's LICENSE
   inside the folder.
4. Add a short "What's new" to that release's notes, above the install
   text the workflow wrote: a few bullets covering this release only, never
   a running history (older notes stay on older releases).

   ```bash
   gh release edit youtube-old-layout-v1.0.1 --notes-file notes.md
   ```

   where `notes.md` holds the What's new bullets followed by the existing
   install text (`gh release view youtube-old-layout-v1.0.1 --json body`).

## Download counts

```bash
gh api repos/Lwolf12/chromeext/releases --paginate \
  --jq '.[] | "\(.tag_name)\t\([.assets[].download_count] | add // 0)"'
```

Views, unique visitors and clones for the whole repository are under
**Insights → Traffic** on GitHub (last 14 days only). Forks and stars are per
repository and cannot be split by extension.
