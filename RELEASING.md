# Releasing an extension

Each extension is published as its own GitHub Release with a ZIP attached, so
downloads are counted per extension. A workflow
(`.github/workflows/release.yml`) does the work when a tag is pushed.

## Cut a release

1. Bump `"version"` in the extension's `manifest.json` and commit it.
2. Tag the commit `<folder>-v<version>` and push the tag:

   ```bash
   git tag imdb-ratings-v0.5.0
   git push origin imdb-ratings-v0.5.0
   ```

   The tag's version must match the manifest, or the workflow stops.
3. A minute later the release appears at
   <https://github.com/Lwolf12/chromeext/releases> with
   `imdb-ratings-v0.5.0.zip` attached. The ZIP never includes
   `imdb-ratings/data/`: that database is built by each user from IMDb's
   dumps, which IMDb licenses for personal use only, so it must not be
   redistributed.

## Download counts

```bash
gh api repos/Lwolf12/chromeext/releases --paginate \
  --jq '.[] | "\(.tag_name)\t\([.assets[].download_count] | add // 0)"'
```

Views, unique visitors and clones for the whole repository are under
**Insights → Traffic** on GitHub (last 14 days only). Forks and stars are per
repository and cannot be split by extension.
