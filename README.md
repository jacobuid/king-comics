# King Comics

A family comic archive built with Preact and Vite.

Sign in with King Auth, then choose a reader profile. Each King Auth account
can own multiple profiles with separate bookmarks, history, avatars, and themes.
Reading data stays local-first and can sync between devices.

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

King Auth uses the browser SDK from `jacobuid/king-auth#sdk`, pinned by the
lockfile. Preact's React compatibility layer runs its embedded sign-in,
signup, password recovery, and account management components. No client
secret or consuming-site registration is needed. New accounts require email
verification and owner approval. Use Node.js 24+ and Git for installation.

Browser profiles, active reader sessions, progress, and saved PINs are scoped
to the permanent King Auth `user.id`. The sync Lambda verifies the bearer
credential centrally on every request and stores data under
`profiles/users/<user-id>/`. Another account cannot read or change these
profiles even if it knows a profile's name, ID, and PIN. The account menu
manages King Auth settings; switching reader profiles keeps the account signed in.

The profile picker discovers your synced profiles on another device. Enter
the profile's PIN once to connect its reading data on that device. Local-only
profiles stay on the browser where they were created.

To bring forward profiles from before King Auth, sign in on the original
browser and choose **Copy previous browser profiles**. This copies the
browser's profiles and cached reading progress into your account as local
profiles; open each profile and set up sync to upload it into your account.
Original browser records and legacy S3 objects are preserved. Legacy S3-only
profiles are not automatically assigned to an account.

Deploy the updated sync backend **before** publishing the frontend; the new
frontend requires the authenticated API and its Authorization CORS header.
The allowed origins in the Lambda and CORS configuration must match the site
origin (GitHub Pages uses `https://jacobuid.github.io`). This authentication
protects profile API data; the existing CloudFront comic asset URLs remain
accessible independently of the frontend sign-in gate.

Profiles remain local-first after authentication, so reading and bookmarking
can use cached data. Signing in or revalidating a session requires a connection;
the sign-in gate does not grant access from an unverified offline session. When sync
is configured, each profile's history and bookmarks are merged into one private
JSON object under `s3://king-comics-jacobuid/profiles/`. A profile can be opened
on another device by signing in to the owning King Auth account and entering
the profile's four-digit PIN.

Deploy or update the sync Lambda and its access policy with:

```sh
npm run deploy:sync
```

The deployment script restricts the comics CloudFront distribution to the
`comics/` and `generated/` folders, deploys the `king-comics-sync` CloudFormation
stack in `us-east-2`, and sets the repository's `VITE_SYNC_API_URL` Actions
variable. Push the site changes to `main` afterward to publish the sync UI.
