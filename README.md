# XASMA Beat Release Manager

A private, local-first command center for independent Drill, Dark Trap, and Supertrap producers. Manage a catalog, plan releases, and prepare YouTube metadata without a backend, login, API key, AI API, or subscription.

## Features

- Dashboard calculated from your actual catalog: totals, upcoming releases, recently edited beats, and workflow counts.
- Beat library with create, edit, duplicate, confirmed delete, search, genre/status/tag filters, and title/BPM/date/status sorting. Custom genres are welcome.
- Beat editor for musical details, artist references, notes, tags, artwork references, video URLs, and release dates. Unsaved beat edits trigger navigation warnings.
- Accessible workflow board: Idea → Producing → Mixing → Mastering → Ready → Scheduled → Published. Stage controls work with keyboard and touch. Publishing requires explicit confirmation; dates never publish automatically.
- Monthly release calendar, date selection, assignment, rescheduling, status filters, upcoming list, and all-day `.ics` export. Date-only values follow your local calendar.
- Deterministic metadata generation: title patterns, descriptions, tags, hashtags, filenames, and pinned comments. Editable output, counters, copy buttons, saved metadata, live template preview, and regeneration confirmation.
- Local template CRUD, duplication, defaults by type, previews, starter templates for three genres, and licensing disclaimer templates. Use a licensing template in Settings to apply it to generated descriptions.
- Persistent preferences for producer name, contact details, social links, licensing, default genre/title pattern, preferred schedule note, and layout density.
- Versioned JSON backups with validation, preview, atomic restore, merge/replace modes, and duplicate-ID handling.
- Installable PWA with offline app shell, local assets, update prompt, iPhone home-screen icon, and safe-area support. No external fonts, analytics, or third-party content requests.

## Stack and architecture

React 19, strict TypeScript, Vite, Tailwind CSS 4 plus a custom design system, React Router hash routing, Dexie/IndexedDB, Lucide icons, vite-plugin-pwa/Workbox, Vitest, React Testing Library, and Playwright. The app operates entirely in your browser.

```
src/app/          Router, shell, reactive data context
src/components/   Shared accessible controls and UI
src/db/           IndexedDB v1 schema, initialization, mutations
src/features/     Dashboard, library/editor, calendar, pipeline,
                  metadata, templates, settings/backups
src/lib/          Pure metadata generation, backup validation, ICS
src/types/        Domain types and workflow definitions
```

Dexie schema version 1 is declared explicitly. Future schema changes must add a new version with a non-destructive migration. Service worker updates do not clear IndexedDB.

## Local installation

Use Node.js 22.12+ (Node 24 also works) and npm. No environment variables or secrets are required.

```sh
npm ci
npm run dev
```

Open the address printed by Vite. Use `npm ci` to preserve the lockfile. Dependencies are only needed for development/build; the deployed app makes no package-registry requests.

```sh
npm test                 # Vitest, RTL, and fake IndexedDB tests
npm run build            # Strict type check + production/PWA build
npm run preview          # Serve dist locally
npx playwright install --with-deps chromium
npm run test:e2e          # Production-browser tests, including offline
```

On a machine with Chromium already installed, skip downloading it:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e
```

Browser tests build and serve the app under `/h112/` as a deliberate repository-subpath test fixture. Deployment derives the real repository name separately. Browser tests cover CRUD, search/filtering, workflow, scheduling/rescheduling, manual metadata persistence, backup download/restore, corrupted import, mobile viewport, offline reload, and manifest assets. Unit tests cover validation, duplicate IDs, merge preservation, quota errors, metadata rules, and calendar escaping. Real iPhone installation is a manual check.

## GitHub Pages deployment

The site uses free static hosting. GitHub Pages availability depends on your GitHub plan and repository visibility; use a public repository for a no-cost Pages deployment. Actions usage must remain within GitHub's free limits. No secrets or backend deployment are required.

1. Push this project to your repository's `main` branch.
2. In **Settings → Pages → Build and deployment**, choose **GitHub Actions** as the source.
3. Ensure Actions are enabled for the repository. The included `.github/workflows/deploy.yml` runs tests, browser checks, and a production build on pushes to `main`. The deployment job runs only when you explicitly start the workflow manually; pushing source does not publish Pages. Deployment uses the repository's built-in token.
4. After configuring Pages, explicitly publish via **Actions → Test and manually deploy to GitHub Pages → Run workflow** on `main`. A push to `main` runs validation only.
5. Open the deployment URL reported by the Pages job. HTTPS is required for service workers. Wait for the app to finish caching before testing offline.

The workflow sets `VITE_BASE_PATH` to `/<repository-name>/`, or `/` for a `*.github.io` repository. It does not assume an owner name. For a custom domain or path, set a repository Actions variable named `VITE_BASE_PATH`, including leading and trailing slashes (usually `/` for a custom domain). Adjust the workflow branch trigger if your default branch differs.

For a manual build under any path:

```sh
VITE_BASE_PATH=/your-repository/ npm run build
```

Deploy the contents of `dist`, not the source tree. Hash routes such as `/#/beats` avoid GitHub Pages deep-link 404s. Manifest, icons, service worker, and assets use the configured base. Changing the site origin or base path can separate browser storage or PWA scope: export a backup before moving deployments.

This repository is prepared for deployment. Publishing requires your repository settings/permissions; local builds do not publish the site.

## Install and offline use

**Desktop / Android:** open the HTTPS deployment, allow the app to finish caching, then use the browser install option or XASMA's install button when offered. Browser install prompts depend on browser support and eligibility.

**iPhone:** open the HTTPS site in Safari → Share → **Add to Home Screen** → Add. Open it from the home screen while online once before relying on offline mode. The app uses standalone display mode and safe areas. Safari does not offer Chromium's install prompt; standalone/browser contexts and OS versions can differ in storage behavior. Real-device installation and eviction behavior must be checked on your iPhone.

After the first successful service-worker installation, the app shell and all local data workflows work offline. Installation alone is not a guarantee caching finished. A new version displays an update prompt; save edits before reloading. App updates do not intentionally erase local data. Offline caching is not enabled in the Vite dev server; test it through a production build/preview or HTTPS deployment.

## Backups and device transfer

Data is tied to this browser profile and origin on this device. Browser storage can be cleared, evicted, or unavailable in restricted/private browsing. Request persistent storage in Settings where supported, but keep independent backups anyway. There is no automatic sync between iPhone and PC.

1. Open **Settings & Backups → Export all data**. Save the JSON file somewhere safe.
2. Transfer the file manually to another device (for example via Files, AirDrop, or USB).
3. Open XASMA on that device and choose the file under **Choose backup to import**.
4. Review the validated record counts and import mode.
5. **Merge** adds unknown IDs and keeps existing records/preferences on collisions. **Replace** removes current data and restores the validated backup exactly. Confirmation is required, and all writes happen in one transaction. Export your current data before replacing.

Backup schema version is `1`. Invalid schema/records, repeated IDs inside a backup, invalid dates, and unsupported versions are rejected before data is changed. Imports are limited to 25 MB, 50,000 beats, 10,000 templates, and one preferences record. Storage failures are reported instead of silently treating a write as successful.

Backups contain metadata and artwork **references**, not binary files. Audio attachments and artwork uploads are deliberately not implemented. Keep your WAVs, DAW projects, and artwork files in your own storage; XASMA never uploads or fetches those references. A future attachment feature would require a portable archive and explicit quota handling.

## Templates

Supported placeholders: `{beatTitle}`, `{genre}`, `{bpm}`, `{key}`, `{mood}`, `{artists}`, `{producer}`, `{year}`, `{licensing}`, `{contact}`, `{socials}`. The year is generated from the current local date. Unknown placeholders remain visible for review. Artist and licensing fields are user-provided; no associations or rights are invented. Metadata does not promise search rankings or growth. Check YouTube's current publishing requirements before posting; character counters are guidance, not an external validation service.

## Known limitations

- Planning only: no automatic YouTube publishing, distribution, calendar subscription, cloud sync, or account system.
- No audio/image binary storage, playback, waveform analysis, or remote artwork loading. The dashboard waveform is decorative, not derived from your music.
- Preferred release schedule is a reusable planning note, not an automation engine.
- IndexedDB quotas and persistent-storage permissions vary by browser. File import/export, clipboard permissions, installation, and offline behavior vary on iOS. Copy manually if clipboard permission is unavailable.
- Calendar exports contain all-day planning events, not timed publishing appointments.
- Template preview uses the first saved beat or clearly labelled placeholder inputs. Starter templates remain editable and deletable; deleting all templates does not silently recreate them.
- Browser automation verifies Chromium with an iPhone-sized viewport; it does not substitute for real Safari/iPhone testing.
- The current dependency audit reports four low-severity advisories in the PWA build-tool chain (`deepmerge` / Workbox), with no patched release reported. Production dependencies have no reported advisories. Recheck with `npm audit` as upstream releases change.
- No deployment or GitHub Actions execution is implied by local test results.
