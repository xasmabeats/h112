# Desktop v2 implementation journal

Starting commit: d62c0f1eeb1b2030f3cc132c24851200d82539c7.

## Checklist

- [x] Baseline: npm ci, 17 unit/component tests, 5 E2E tests, production build passed.
- [x] Safely created feature/xasma-desktop-v2; main preserved.
- [x] Additive Tauri 2 build, restricted native boundary and Windows MSVC-target cargo check passed (cross-check only, not an executable or GUI run).
- [x] Managed imports, native asset playback UI and immutable media provenance implemented. Native GUI playback remains unverified.
- [x] Real native rendering/validation/cancellation/export/restart recovery verified with Linux FFmpeg; Windows source-built tools still need CI.
- [x] Release records/events, non-destructive v1→v2 migration, v1/v2 JSON and staged portable backups implemented. 32 JS tests and 6 real native integration tests pass.
- [x] Web/desktop frontend regression builds, 32 JS tests and 6 CI-like Chromium E2E tests.
- [x] Pinned media-source integrity and redistribution documentation/resources.
- [ ] Final Windows CI installer/silent smoke, interactive runtime checks, PR API access.

## Decisions and infrastructure

- Preserve the web target; no browser FFmpeg or backend.
- Native commands accept IDs, not shell arguments or arbitrary file paths. Pickers and native drop events establish file access.
- Windows media tools will be compiled from checksum-pinned FFmpeg and x264 sources, with networking/nonfree components disabled. Include corresponding source and build scripts in installer resources.
- Rust core is independently testable on Linux; Tauri runtime is a Windows target dependency.
- Official Tauri docs inspected from tauri-apps/tauri-docs (capabilities, app command permissions, Windows installer, resources); public docs site was denied by network policy.
- Git read/push works. Public GitHub HTML confirms repository_public=true, so standard hosted Windows runners are free. Workflow is gated to public repositories and cannot deploy the website or publish Releases. GitHub API currently returns Forbidden; PR/artifact API access remains blocked. Do not report an installer or PR until independently confirmed.

## First Windows run result

- Run 40955329319 / commit 6b59d4b: npm/unit/browser/build checks passed on Windows; source-built verified media tools and native cargo check passed.
- Native conversion/cancellation/archive/recovery test step failed; no NSIS installer was created. Public annotations only expose exit code, and authenticated log API is blocked at CONNECT.
- Next run adds bounded native-test diagnostics to the public job summary (preserving exit status) so the actual failure can be isolated. This is a diagnostic state change, not a blind rerun.
- Kernel Job Objects now constrain Windows child-process lifetime, backup schemas reject unknown records, provenance collisions are checked, and web v1→v2/offline release E2E was added.
- Cloud draft now adds api.github.com only; running network remains unchanged until user applies settings. Do not ask for a token in chat.

## Confirmed Windows-specific failure and fix

- Run 40958265089 / commit 635de88 exposed the actual diagnostic through a bounded public annotation. Three native tests passed, and the render/FFprobe assertions also passed before failure at the release-folder export.
- The export failed with Access denied (Windows error 5) while promoting a folder whose video/metadata handles had been flushed but remained open. Explicitly closing all contained file handles before promotion addresses Windows rename semantics; analogous file promotions now close handles first. No assertion was weakened.
- A locally source-built minimal FFmpeg/x264 with the same codec selection passed real conversion, cancellation, export, ZIP and recovery tests. Current native tests additionally exercise exact-version relinking, cancellable bounded processes and Unicode/space-containing managed data paths.
- Build toolchain moves from deprecated MSYS2 MINGW64 to UCRT64; compiler/package notices and exact package versions are retained.

## Final verification milestone in progress

- Explicit immutable 1080p30 render-settings snapshots are persisted per job, included in backups, checked for native-output provenance, and displayed per attempt. Earlier v2 development records use the documented identical fixed preset.
- Added actual silent NSIS install/uninstall smoke verification in a uniquely owned runner directory, including x64 payload, bundled tool hashes, required source/license resources, and a synthetic application-data retention marker. It refuses to touch any existing profile. No GUI launch is claimed.
- Local current-source checks: 32 JS tests, 6 real native integration tests using the source-built minimal FFmpeg/x264 codec set, Rust formatting and Windows-target cargo check passed. Both production frontend builds passed.
- Initial unconfigured Playwright launch failed because its default downloaded browser was absent after environment restart. The configured system-Chromium run (`CI=true PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e`) passed all 6 tests in 17.6 seconds; no application assertion was weakened.
- Source scan found no real credentials; its sole match is the deliberate `not-a-real-secret` validation fixture. Generated build products, tool binaries/sources, backups and machine configuration remain ignored. Only synthetic audio/artwork fixtures are tracked.
- Run 40962692129 (aea7c7b) contains the Windows file-handle fix and UCRT64 source build; status must be inspected before claiming package success. A later final-source run must include the new settings/silent smoke checks before it is accepted as the final artifact.

- Run 40962692129 confirmed all six native tests pass on Windows with the source-built bundled binaries. NSIS packaging then failed (exit 1), with no readable guest logs or useful annotation. Added bounded packaging diagnostics preserving failure status and Rust-cache-on-failure; this is a targeted diagnostic rerun, not a success claim. No installer artifact exists for that run.
