# Free Fake Boarding Pass Apple Wallet

Create free fake boarding passes for Apple Wallet and LARP your next first-class trip. Five airline styles, searchable airports, cabin selection, previews, and signed .pkpass downloads.

Quick generate only needs a passenger name in `LASTNAME/FIRSTNAME` format and a quantity from 1–5. It generates different airports and boarding times, always in First Class. Choose an airline and color, preview each journey, or shuffle for new journeys. Custom pass keeps the manual editor available.

One pass downloads as `.pkpass`; multiple passes download together as an Apple Wallet `.pkpasses` bundle. Each signed pass uses one daily generation. If a batch stops partway through, completed passes can be downloaded and the remaining passes retried without generating the completed ones again.

## Run

```sh
npm install
npm run dev
```

Open http://localhost:5173. For a production build, run `npm run build`, then `npm start`.

## Apple Wallet export

Download .pkpass uses the free WalletMCPPass service by default. No Apple Developer membership, API key, or certificate setup is needed. The server sends your pass details and logo to the service, then verifies the returned manifest, signature, Apple-rooted certificate chain, identity, dates, fields, colors, barcode, and logo before returning the download.

The service is free during its open beta, with a limit of 30 passes per caller per day and 500 globally. Availability and pricing are controlled by the service. Signing failures and quota limits appear in the download dialog; the app never returns an unsigned ZIP as a signed pass. The template ZIP remains available locally without contacting the service.

### Optional: use your own Apple certificate

When all local signing settings are configured, the app uses your own certificate instead of the free service.

1. Create a Pass Type ID certificate in your Apple Developer account: https://developer.apple.com/help/account/capabilities/create-wallet-identifiers-and-certificates
2. Export your signing certificate and RSA private key as PEM files. Keep these server-side and outside `public/`.
3. Obtain the appropriate Apple WWDR intermediate certificate as PEM.
4. Copy `.env.example` to `.env`, set the Pass Type ID, Team ID, and absolute PEM file paths, then restart the app.

The server checks certificate identity and dates, builds the pass, hashes its files into `manifest.json`, and creates a detached PKCS#7 signature that includes the WWDR certificate. Wallet controls the final visual layout; the website preview is illustrative.

The default QR is a design sample, not an airline credential. The export dialog lets you supply your own barcode text. Generated passes do not create a flight booking.

Airports: bundled snapshot of https://github.com/mwgg/Airports (MIT). Logos: supplied by the user; originals are preserved in `public/logos/` alongside resized display assets. Drafts are stored in this browser's local storage. Export sends data to the local server; free signing also sends it to WalletMCPPass.

## Checks

```sh
npm test
npm run build
```

## Check the free signing service

Double-click `Verify Free Pass.command`, or run:

```sh
node scripts/verify-free-service.mjs
```

This sends anonymous test details to the public WalletMCPPass service and requests a boarding pass with a custom logo and color. No account, API key, Apple membership, or payment details are supplied. The script downloads the resulting pass to `verification/free-test.pkpass` and writes `verification/report.json`.

Verification checks every manifest hash, the detached signature, certificate-chain trust against Apple roots, certificate dates, Pass Type ID / Team ID matching, boarding fields, barcode payload, custom color, and custom logo pixels. Apple roots come from the macOS system keychain or the public Apple PKI endpoints. The verifier has local tests for a valid fixture, an untrusted issuer, and tampered pass data; these fixtures do not demonstrate that the remote service works.

A successful report means the downloaded file passed those checks. It does not prove installation on iOS or check certificate revocation. AirDrop the generated pass to an iPhone and add it to Wallet for the final device check.

Live verification succeeded on 2026-10-01 when the command was run from the user’s Mac Terminal. The generated anonymous boarding pass was then independently rechecked in the Codex session: manifest hashes, signature, Apple-rooted trust chain, certificate dates, signing identity, custom color, and boarding fields passed. The signing certificate expires on 2027-09-27. Installation on an iPhone and revocation status remain untested. The website now uses this service for .pkpass downloads when local certificates are not configured.

## GitHub Pages deployment

The included `.github/workflows/pages.yml` builds, tests, and deploys the frontend on pushes to `main`. It uses the Pages repository path automatically, including the airline logos, airport directory, and favicon.

Double-click `Publish GitHub Pages.command` to sign into GitHub, create a public `boarding-pass-studio` repository in your account, push the prepared commit, enable GitHub Pages, and start deployment. It stops if the repository name already exists before the initial upload. The deployment status is in the repository's Actions tab.

**GitHub Pages hosts the frontend; the deployed Cloudflare Worker handles downloads.** The repository variable `VITE_API_BASE` points at `https://passport-signing.tobralla.workers.dev`. The Worker uses the same free signing service and verifies its signature and Apple certificate chain with Web Crypto before returning a pass. No Apple signing keys are deployed.

1. Deploy this project's `Dockerfile` to a Node/container host, or run `npm ci`, `npm run build`, then `npm start` on a server with Node 24 and OpenSSL installed. No Apple certificates are needed for the default free signing service.
2. Set the backend environment variable `ALLOWED_ORIGINS` to `https://YOUR_USERNAME.github.io` (without the repository path). Set `PORT` to the port required by your host. Production listens on `0.0.0.0` by default. Confirm `https://YOUR_BACKEND/api/status` returns JSON.
3. In GitHub → repository Settings → Secrets and variables → Actions → Variables, add `VITE_API_BASE` with the HTTPS origin of the backend, e.g. `https://YOUR_BACKEND` (no `/api` suffix). This is a public URL, not a secret.
4. Rerun the Pages workflow or push a change to rebuild. Check a real `.pkpass` download on the deployed site, then import it on an iPhone.

For a local check of the Pages build:

```sh
BASE_PATH=/boarding-pass-studio/ VITE_STATIC_HOSTING=true npm run build
```

The backend still verifies each remotely signed pass before returning it. CORS permits only the configured frontend origins and same-origin browser requests. No certificate keys, verification artifacts, `.env` values, or local draft data are included in the Pages artifact or Git commit.

## Daily free-pass allowance

The site shares an allowance of 30 signed pass downloads each UTC day. The counter beside Download pass is fetched from the backend, refreshes every minute and after each attempt, and resets at 00:00 UTC. Cloudflare Durable Object storage makes reservations atomic and persistent; template ZIPs do not consume the allowance. Failed exports release their reservation, and an upstream rate-limit error marks the allowance unavailable until the next UTC day. The local Node server uses a persistent counter in ignored `.data/`.

This counter measures the site's allowance. WalletMCPPass does not expose an exact per-caller remaining-quota endpoint; its own caller/global quotas can still limit availability.

To update the deployed Worker using the connected Cloudflare account:

```sh
npm run build:worker
npx --yes wrangler@4.145.0 deploy
```

The Worker source, public Apple trust roots, and prebuilt logo assets are bundled by `scripts/build-worker.mjs`. `wrangler.toml` holds public deployment settings; no access tokens are committed. To test a real hosted export and independently check its signature and quota decrement (consumes one free pass):

```sh
node scripts/check-live-export.mjs
```

To verify a real two-pass batch, its Apple-trusted signatures, First Class fields, descriptions, archive layout, and daily counter (consumes two generations):

```sh
node scripts/check-live-batch.mjs
```

## Search engine discovery

The published page permits indexing and declares its canonical URL. `public/sitemap.xml` lists the page. `public/robots.txt` is copied to the project site; the effective host-level robots file is also published at `https://tobralla.github.io/robots.txt` by the `Tobralla/Tobralla.github.io` repository. It allows crawling and references the project's sitemap. Search engines choose whether and when to index the page.
