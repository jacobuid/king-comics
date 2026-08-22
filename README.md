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

## Profile sync

Profiles remain local-first, so reading and bookmarking work offline. When sync
is configured, each profile's history and bookmarks are merged into one private
JSON object under `s3://king-comics-jacobuid/profiles/`. A profile can be opened
on another device with the same name and four-digit PIN.

Deploy or update the sync Lambda and its access policy with:

```sh
npm run deploy:sync
```

The deployment script restricts the comics CloudFront distribution to the
`comics/` and `generated/` folders, deploys the `king-comics-sync` CloudFormation
stack in `us-east-2`, and sets the repository's `VITE_SYNC_API_URL` Actions
variable. Push the site changes to `main` afterward to publish the sync UI.
