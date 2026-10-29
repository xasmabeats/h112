# XASMA Beat Release Manager v2

A free, private, local-first music production command center for Drill, Dark Trap and Supertrap. The original React web/PWA application remains available; an additive **Windows 10/11 x64 Tauri 2 desktop target** adds managed media, native MP4 rendering and portable backups. No server, account, API key, cloud database, telemetry, subscription or YouTube OAuth is required to run the app.

Desktop implementation and automated verification are separate from a verified installer/real Windows GUI session. Consult [verification](docs/WINDOWS-VERIFICATION.md) and the [implementation journal](docs/DESKTOP-IMPLEMENTATION.md) for actual results and outstanding checks. Do not treat an unverified build as production-ready.

## Main workflows

- Dashboard calculated from real records; searchable/filterable/sortable beat library; create/edit/duplicate/remove; notes, tags, genres, artist references and dates.
- Production pipeline: Idea → Producing → Mixing → Mastering → Ready → Scheduled → Published. Calendar scheduling uses local YYYY-MM-DD dates and never automatically publishes.
- Local template-based metadata: title, description, tags, hashtags, filename and pinned comment. Editable results, exact accessible labels, counters, title suggestions and selected-field regeneration protect manual edits. Templates and licensing terms remain user-controlled; no artist affiliation/rights or SEO outcome is invented.
- Release Studio: select beat → import audio/artwork → save/review metadata → create/refresh draft snapshot → mark Ready → render → review → export MP4 + JSON/text/manifest → optionally report manual publication.
- Persistent release history, independent preparation/render/export/publication facts and immutable source/render provenance. A changed source marks old outputs outdated without deleting their history.
- Preferences, storage information, metadata JSON backups and desktop portable media archives.
- Dark responsive UI, keyboard/focus support, reduced motion, iPhone safe areas, offline web shell and desktop-bundled assets.

## Install on Windows — no local development toolchain

1. Open the **Windows desktop installer (free public runners)** run for the desired feature-branch commit in the repository's Actions tab. Use only a successful run for that exact SHA.
2. Download its `XASMA-2.0.0-windows-x64-<sha>` artifact while retained (14 days). GitHub normally requires signing in to download workflow artifacts, even for a public repository. This is a download-platform requirement; the installed app has no login.
3. Extract the artifact. Compare `SHA256SUMS.txt` with:

   ```powershell
   Get-FileHash .\XASMA-2.0.0-windows-x64-setup.exe -Algorithm SHA256
   ```

4. Run the unsigned NSIS installer. It targets your user account, without unnecessary system-wide elevation. Windows may show an unsigned/unknown-publisher warning; verify the repository, commit and checksum before proceeding. No signing certificate purchase is required.
5. If WebView2 is absent, the installer checks/downloads Microsoft's bootstrapper. **Internet is required for that first runtime installation**. Managed-PC runtime policies may require administrator assistance. Once WebView2 and the app are installed, core work is offline.
6. Launch **XASMA Beat Release Manager**. Import a browser backup in Settings if needed. The user does not need Node, Rust, Visual Studio or a separate FFmpeg install.

The actual installer artifact/run link and execution status must be confirmed in the current verification report; this README does not assert a package exists merely because a workflow is configured. No public GitHub Release or website deployment is performed by the desktop workflow. Uninstall through Windows Apps; back up first and do not select removal of app data if such an option is offered. Uninstall/data-retention behavior still requires a real Windows smoke test.

## Managed media and outputs

Supported audio: MP3 and common PCM WAV (16/24/32-bit signed little-endian and 32-bit float in the pinned build). Audio limit: 300 MB / 120 minutes. Artwork: PNG/JPEG, at most 20 MB, 12,000px on either side and 32 megapixels. WebP, SVG, GIF and arbitrary videos are not supported imports.

Pick files or drop one audio and/or artwork onto **Release Studio** after selecting a beat. Native validation checks signatures, probe metadata and decoding, then creates managed copies. Original files remain untouched. Original filename, MIME/format, size, duration/dimensions and managed-copy identity are displayed. Replacements preserve unrelated notes/manual metadata and use new immutable IDs. Missing copies are visible: relink the exact original by SHA-256 to repair a current or historical version, or import a replacement as a new version.

Rendering uses the installer's verified FFmpeg/FFprobe, not user-installed tools: H.264 + AAC, 1920×1080, 30 FPS, fit with padding (no crop), yuv420p and fast-start MP4. Progress is read from FFmpeg; one attempt runs at a time. Cancellation stops the real process. Outputs are checked with FFprobe for streams, dimensions, pixel format, FPS and duration (`max(0.25s, 1%)` tolerance). Interrupted attempts become Interrupted on restart; retry creates a new attempt, not a resumed encode.

Completed MP4s can be previewed, saved as a video, or exported with their metadata snapshot as a collision-safe release folder. A cancelled picker is not a successful export. Playback depends on the Windows/WebView2 media stack (N/KN editions may need Windows media components); actual GUI playback needs device verification.

Native data normally lives under `%LOCALAPPDATA%\io.xasmabeats.release-manager`:

- `media/`: immutable imported copies, indexed by `catalog.json`.
- `outputs/`: validated MP4s by job ID.
- `temporary/`: owned partial imports/renders, cleaned after interruption.
- `restores/`: staged portable restore, never a committed database reference.
- `recovery/`: metadata snapshots made before destructive desktop replacement.

Do not remove/move this directory to troubleshoot. Removing a beat hides it from the active library but retains history/source references for provenance and backups. Managed source versions and completed outputs are not automatically purged.

## Data migration, backups and privacy

Browser-origin data does not automatically appear in Tauri. On the old web app, export JSON; on desktop, choose **Settings & Backups → Choose backup to import**. Genuine schema-v1 backups remain supported. Dexie v1→v2 migration adds tables without resetting existing beats, templates, manual metadata, production statuses or dates.

- **v2 JSON** is metadata-only: catalog, media descriptors, release/render/export/history records and preferences. **No audio, artwork or MP4 bytes are included.** Both v2 web and desktop can import it; the old v1 app cannot.
- **Portable desktop ZIP** contains v2 database metadata and every listed managed audio/artwork file, with checksums. Generated MP4 bytes are explicitly excluded. A missing/changed file aborts the backup. ZIP restoration requires desktop.
- Merge adds unknown IDs and keeps existing IDs/preferences. Replace imports the validated database snapshot atomically. Validation/preview and confirmation happen before any destructive DB operation. Desktop replacement first retains a recovery JSON; old managed files stay intact.
- Native portable extraction is staged and checks entry paths, duplicate IDs/names, checksums, sizes and references. It rejects traversal, symlinks, unexpected/missing attachments and unsupported formats. Files are promoted before the IndexedDB transaction, so a failed transaction can leave safe extra copies rather than dangling committed references.
- JSON import limit: 25 MB. Portable archive limit: 2 GB compressed/expanded, 10,000 managed files plus metadata/manifest. Per-file media limits still apply.

Data is tied to the device, browser profile and origin. Browser storage may be cleared/evicted; request persistent storage where supported and keep independent backups. No automatic PC/iPhone/browser/desktop sync exists. Transfer backup files manually. Backups are unencrypted and can contain personal notes/contact details/audio; keep them privately. See [backup and recovery](docs/BACKUP-AND-RECOVERY.md) for failure behavior and manual corrupt-catalog recovery.

## Development and verification

Use Node 22.12+ / 24 and npm. Rust stable is needed only for native development; Windows GUI development/packaging additionally requires the supported Windows MSVC toolchain. CI prepares those prerequisites so end users do not need them.

```sh
npm ci
npm run dev                  # Original web app
npm test                     # Vitest, RTL, fake IndexedDB migrations/services
npm run build                # Web/PWA production build
npm run preview
npx playwright install --with-deps chromium
npm run test:e2e              # Production app under a /h112/ subpath fixture
npm run build:desktop        # Separate native frontend; no PWA registration
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --locked --manifest-path src-tauri/Cargo.toml -- --test-threads=1
```

Native integration tests require real FFmpeg/FFprobe. Linux development defaults to `/usr/bin/ffmpeg` and `/usr/bin/ffprobe`; on Windows set `XASMA_TEST_FFMPEG` and `XASMA_TEST_FFPROBE` to the bundled build. Tests fail rather than silently skip if tools are absent. They use a generated synthetic MP3 and application icon, never user media. The Windows workflow tests the exact binaries it packages.

If Chromium is already available:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e
```

On Windows development, first build media tools in the MSYS2 UCRT64 shell using `bash scripts/build-media-tools.sh`, then `npm run desktop:dev` or `npm run desktop:build`. The dedicated workflow is the supported no-local-toolchain delivery path. Production native compilation requires verified media-tool hashes; binaries, build output, source archives and local user data are excluded from Git.

Architecture: `src/features` (UI), `src/db` (Dexie v2), `src/lib` (rules/backups/providers), `src/platform` (web/native boundary), `src-tauri/src` (restricted native services). See [architecture/security](docs/DESKTOP-ARCHITECTURE.md), [FFmpeg licensing](docs/FFMPEG-LICENSING.md), and [verification boundaries](docs/WINDOWS-VERIFICATION.md).

## Web/PWA and GitHub Pages

The web target remains independently buildable and usable without native media tools. It supports the catalog, metadata, planning, release/history records and metadata JSON backups; native import/conversion/ZIP controls explain the desktop requirement and are disabled on web. No FFmpeg/WASM converter is downloaded.

```sh
VITE_BASE_PATH=/your-repository/ npm run build
```

Deploy `dist`, not source. Hash routes avoid Pages deep-link 404s. The existing Pages workflow derives the base from the repository name (or optional Actions `VITE_BASE_PATH`) and validates pushes to `main`; actual Pages deployment still requires explicit manual dispatch after configuring **Settings → Pages → GitHub Actions**. Desktop feature work does not dispatch it, merge to main, publish Releases, change visibility or enable billing. GitHub Free Pages requires a public repository. Desktop CI uses only standard public hosted runners, with 14-day artifacts and normal free-platform limits.

For iPhone PWA use Safari → Share → Add to Home Screen on the HTTPS deployment, then open online once to finish caching. Offline behavior is tested on the production build, not Vite dev. Save edits before accepting updates. iOS install/storage/clipboard behavior varies; Chromium viewport checks do not prove actual Safari/device behavior. PWA updates do not intentionally clear IndexedDB.

## Deliberate limits

- No YouTube upload, OAuth, automatic publication/scheduling, cloud sync or remote AI. Manual confirmation records a user report, not a verified upload timestamp.
- Optional local AI is **unavailable**. A provider interface is reserved; no model/runtime is bundled/downloaded and no GPU/RAM assumption is made. Templates are the complete default. llama.cpp's Windows local server was evaluated as a possible future loopback-only adapter, subject to model licensing and hardware limits.
- Metadata counters are guidance inherited from the web app, not current platform API validation. Review licensing/artist claims and YouTube requirements yourself. The official discovery schema was consulted; actual publishing validation is deferred with publishing itself.
- No resume of a terminated encode, no destructive managed-file purge, no WebP import, no automatic corrupt-catalog repair, and no generated MP4 bytes in backups.
- Windows package creation, actual installer execution, GUI/file pickers/drag-drop/playback and uninstall/data-retention checks are distinct outcomes. Consult the current verification record; never infer them from a successful browser test or cross-check.
- Current npm audit reports four low-severity PWA build-chain advisories with no patched release reported; runtime dependencies have no reported advisories. Recheck as upstream releases change.
