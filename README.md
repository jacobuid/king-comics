# King Comics

A family comic archive built with Preact and Vite.

Profiles, bookmarks, history, and reading progress are stored in the browser.
They do not sync between devices.

Live site: <https://jacobuid.github.io/king-comics/>

## Local development

```bash
npm install
npm run dev
```

## Adding comics

1. Put each CBZ or CBR file in its series folder:

   ```text
   public/comics/
     Series Name/
       Comic 001.cbz
       Comic 002.cbr
   ```

2. Generate the catalog and covers, then upload the new files to S3:

   ```bash
   npm run publish:comic
   ```

3. Build, commit the generated catalog, and trigger the GitHub Pages deploy:

   ```bash
   npm run deploy:comic
   ```

To publish only one series or preview an upload:

```bash
npm run publish:comic -- --series "Series Name"
npm run publish:comic -- --dry-run
```

The publish command requires the local AWS CLI profile `king-comics`. The
deploy command requires Git access to `jacobuid/king-comics`.

## Storage

Comic archives and generated covers are excluded from Git. Production assets
are stored in the private `king-comics-jacobuid` S3 bucket and served through
CloudFront. Do not put AWS credentials in this repository.
