# King Comics

A browser-based family comic archive built with Preact, Vite, and preact-iso.

The sign-up page creates local profiles, and the profile picker starts a
seven-day browser session for the selected reader. This is not authentication,
and profiles do not sync between browsers. Each profile keeps its own per-comic
Bookmarks and History in local storage. The most recently updated History comic
appears in the profile hero. The active reader can change their display name
without losing that progress.

## Development

```bash
npm install
npm run dev
```

Create a production build with `npm run build`.

## Adding comics

Put each series in its own folder under `public/comics`. Both CBZ (ZIP) and CBR
(RAR) archives are supported:

```text
public/comics/
  Sonic The Hedgehog (1993)/
    Sonic The Hedgehog 001.cbz
    Sonic The Hedgehog 002.cbr
```

`npm run dev` scans that folder and generates the comic catalog. Run
`npm run catalog` after adding or renaming archives when the development server
is already open. Publish one new or updated series with:

```bash
npm run publish:comics -- --series "My little Pony (2013)"
```

Use `--dry-run` to preview the S3 changes, or omit `--series` to synchronize all
changed comics. The command prints the series page and CloudFront archive/cover
URLs. The first image in each ZIP- or RAR-based comic archive is
also extracted as its cover, even when the file extension does not match its
internal archive format. Commit `src/data/comics.generated.js`; production
builds use that committed catalog instead of rescanning the local-only files.

The home page lists one card per series folder. Selecting a card opens that
series at a generated route such as `/sonic-the-hedgehog-1993`, where its
individual issues can be opened or bookmarked.
Comic archives and generated covers are excluded from Git. Local development
reads them from `public/`. Production reads the same paths from the object
storage URL configured with `VITE_COMICS_BASE_URL`. Reading page, History, and
Bookmarks remain separate for each browser profile.

## Comic storage on AWS

The production site expects these object keys in an Amazon S3 bucket:

```text
comics/Series Name/Comic.cbz
generated/covers/generated-cover.jpg
```

Keep the S3 bucket private and serve it through an Amazon CloudFront
distribution configured with Origin Access Control. The AWS CLI can regenerate
the catalog and synchronize the local assets with:

```bash
npm run publish:comics
```

`npm run upload:comics` remains an alias for the same command. It regenerates
the catalog, cleans stale generated covers, and uses the local
`king-comics` AWS CLI profile to synchronize assets into
`s3://king-comics-jacobuid`. It does not delete remote objects. Never put AWS
credentials in this repository or in a `VITE_` variable.

Local development is configured in the ignored `.env.local` file with:

```text
VITE_COMICS_BASE_URL=https://d1ktco3tjlf7cv.cloudfront.net
```

The CloudFront distribution ID is `E3C2G8VW4ZZM4W`. It uses Origin Access
Control to read the private `king-comics-jacobuid` bucket and returns CORS
headers for the GitHub Pages origin and `http://localhost:5173`.

The production output is written to `dist/`. When built by GitHub Actions, the
app uses `/king-comics/` as its base path for GitHub Pages. The deployment
workflow already supplies the CloudFront asset URL.

To publish, select **GitHub Actions** under **Settings → Pages → Build and
deployment**. Every push to `main` will then build and deploy the site.
