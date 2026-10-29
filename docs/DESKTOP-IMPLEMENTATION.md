# Desktop v2 implementation journal

Starting commit: d62c0f1eeb1b2030f3cc132c24851200d82539c7.

## Checklist

- [x] Baseline: npm ci, 17 unit/component tests, 5 E2E tests, production build passed.
- [x] Safely created feature/xasma-desktop-v2; main preserved.
- [x] Additive Tauri 2 build, restricted native boundary and Windows MSVC-target cargo check passed (cross-check only, not an executable or GUI run).
- [x] Managed imports, native asset playback UI and immutable media provenance implemented. Native GUI playback remains unverified.
- [x] Real native rendering/validation/cancellation/export/restart recovery verified with Linux FFmpeg; Windows source-built tools still need CI.
- [x] Release records/events, non-destructive v1→v2 migration, v1/v2 JSON and staged portable backups implemented. 26 JS tests and 4 real native integration tests pass.
- [ ] Regression verification, Windows CI installer, licensing, PR.

## Decisions and infrastructure

- Preserve the web target; no browser FFmpeg or backend.
- Native commands accept IDs, not shell arguments or arbitrary file paths. Pickers and native drop events establish file access.
- Windows media tools will be compiled from checksum-pinned FFmpeg and x264 sources, with networking/nonfree components disabled. Include corresponding source and build scripts in installer resources.
- Rust core is independently testable on Linux; Tauri runtime is a Windows target dependency.
- Official Tauri docs inspected from tauri-apps/tauri-docs (capabilities, app command permissions, Windows installer, resources); public docs site was denied by network policy.
- Git read/push works. Public GitHub HTML confirms repository_public=true, so standard hosted Windows runners are free. Workflow is gated to public repositories and cannot deploy the website or publish Releases. GitHub API currently returns Forbidden; PR/artifact API access remains blocked. Do not report an installer or PR until independently confirmed.
