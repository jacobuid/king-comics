# King Comics

A family comic archive built with Preact and Vite. Each account has multiple reader profiles with separate progress, bookmarks, avatars, and themes.

Live site: <https://jacobuid.github.io/king-comics/>

## Storage and delivery

- Comic archives and covers: private Backblaze B2 bucket `king-comics-jacobuid`.
- API: Cloudflare Worker at `https://king-comics-api.jacobuid-king-videos.workers.dev`.
- Profile documents: Cloudflare D1 database `king-comics-prod`.
- Website: GitHub Pages. The live app has no AWS dependency.

The Worker verifies King Auth sessions and issues limited-lifetime media tickets, streams B2 archives with byte-range support, and caches covers after checking access. Media tickets are separate from authentication credentials; auth credentials never appear in URLs. Only `comics/` and `generated/covers/` are exposed by the media gateway. Profile documents and backups stay private. D1 conditional updates protect against concurrent device writes, and account UUIDs scope every profile operation.

## Development

Use Node.js 24+ and Git:

```sh
npm ci
npm run dev
npm test
npm run build
```

With empty media/sync variables, assets come from `public/`. For the deployed backend, set `VITE_MEDIA_API_URL` and `VITE_SYNC_API_URL` to the Worker URL in ignored `.env.local`. Browser sessions are origin-bound; sign in separately on localhost.

## Publishing comics

Place CBZ/CBR files under `public/comics/<Series Name>/`, then run:

```sh
npm run publish:comic
npm run publish:comic -- --series "Series Name" --dry-run
npm run deploy:comic
```

Publishing regenerates the catalog and covers, compares SHA-1 checksums, uploads changed assets to B2, and verifies uploaded bytes. It never deletes remote files. Catalog deployment builds the site and pushes the generated catalog. Archive and cover files remain excluded from Git.

## Backend deployment

Bootstrap credentials must be supplied through environment variables, following the King-videos setup:

```sh
npm run provision:b2
npm run deploy:api
```

Provisioning creates the private bucket, a bucket-scoped read-only Worker key, a publishing key, and a D1 database. Secrets are saved only in ignored `.env.b2.local`; public resource IDs are recorded in `services/api/wrangler.json`. Provisioning refuses to rotate an existing local configuration. `npm run deploy:sync` is a backwards-compatible Cloudflare deployment command.

The API workflow requires GitHub secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `B2_READ_KEY_ID`, `B2_READ_APPLICATION_KEY`, and `MEDIA_SIGNING_SECRET`. Preserve the signing secret across deployments. The frontend workflow uses repository variables `VITE_MEDIA_API_URL` and `VITE_SYNC_API_URL`. Never put storage credentials in `VITE_*` variables.

## Profile sync and backups

Profiles and reading data sync automatically after sign-in. The picker refreshes on focus, reconnect, and every 30 seconds. Background sync merges the newest per-comic changes. PINs remain confirmation for renaming and deletion; ordinary sync needs no PIN. Explicit local-only profiles stay on the original browser until sync is enabled.

Authentication requires a connection. Cached reading data can be used after authentication; unverified offline sessions cannot open the library. Media tickets refresh hourly and expire after three hours.

Export all profile documents from D1 into an ignored local JSON backup:

```sh
node scripts/backup-profiles.mjs
```

## AWS migration tools

`migrate-assets-b2.mjs` verifies local source files against AWS ETags, downloads authoritative copies if necessary, and verifies B2 SHA-1 and size for each object. Reports and source backups are under ignored `.archive-backups/b2-migration/`. `migrate-profiles-d1.mjs` preserves IDs, rename markers, and newer progress. `bridge-legacy-sync.mjs` forwards old clients to Cloudflare during cutover. `backup-profiles-aws.mjs` reads only the legacy source. Original AWS infrastructure files are retained as migration/rollback references and are not used by deployment workflows.
