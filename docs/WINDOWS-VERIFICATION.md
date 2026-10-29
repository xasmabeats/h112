# Verification boundaries and installer workflow

Baseline at d62c0f1: `npm ci`, 17 JS tests, 5 browser tests, and production web build passed. No pre-existing failures were found.

Implementation verification includes:

- `npm test`: migration, v1/v2 backup, release facts, atomic history/media failure, manual metadata protection, provider fallback/unsupported boundary and original tests.
- `npm run build`: production web/PWA with repository-base compatibility.
- `npm run build:desktop`: bundled desktop frontend; no manifest/SW registration.
- `CI=true PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e`: real browser flows/offline/subpath coverage.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml -- --test-threads=1`: real Linux FFmpeg/FFprobe conversion, cancellation, export, ZIP safety and restart tests. These are not mocks and are not Windows runtime verification.
- `cargo check --locked --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-msvc`: Windows Rust/ACL/configuration type checking from Linux using the signed Debian LLVM resource compiler. This does not create an installer or execute a Windows GUI.

## Windows workflow

`.github/workflows/windows-desktop.yml` validates feature-branch pushes and PRs to main. New workflows do not need merging to run on their allowed branch push. Manual dispatch discovery may depend on the workflow existing on the default branch; never merge just to enable it.

The Windows job is gated to public repositories, where standard GitHub-hosted runners are free. It intentionally skips private repositories because available included minutes/billing settings cannot be inferred. It does not change visibility or billing. Public repository status was verified through GitHub's repository page metadata. Artifact storage/retention and other GitHub free limits still apply; no paid runner or service is enabled.

The workflow uses Windows 2022 x64, locked npm/Rust dependencies, tests/builds, signed MSYS2 packages, verified source-built FFmpeg/x264, actual conversion/cancellation tests with those exact binaries, and a Tauri NSIS build. It uploads private/local workflow artifacts rather than publishing a GitHub Release or website. On a public repository, workflow artifacts are accessible according to GitHub's artifact authentication rules; they contain synthetic fixtures/code products, never user media. Artifact retention is 14 days.

Expected artifact: `XASMA-2.0.0-windows-x64-<tested-sha>`. Inside: `XASMA-2.0.0-windows-x64-setup.exe`, `SHA256SUMS.txt`, `BUILD-INFO.txt`, FFmpeg configuration and licensing notes. The run summary records the exact tested SHA, filename and checksum. An artifact from another commit is not final verification.

The first feature-branch run is https://github.com/xasmabeats/h112/actions/runs/40955329319 (commit 6b59d4b). Do not assume its success or artifact availability from this link; consult actual run status and the current implementation journal/final report. GitHub API/GraphQL currently fails at the environment network CONNECT boundary. Public GitHub pages can be read, but authenticated PR creation, detailed logs and artifact downloads can remain blocked until `api.github.com` access/authentication is usable. No token should be pasted into chat.

## Unperformed acceptance checks

Actual NSIS artifact creation must be confirmed for the final tested commit. Actual installer execution, silent uninstall/retention smoke checks, WebView2 first-install behavior and real desktop GUI/file picker/drag-drop/playback behavior are distinct checks; neither cross-compilation nor browser tests proves them. They have not yet been performed on a Windows desktop. iPhone/Safari device checks likewise remain separate from Chromium mobile-viewport tests.

The workflow additionally executes the actual NSIS installer silently in a unique RUNNER_TEMP directory, checks the x64 payload, installed tool hashes and source/license resources, then performs an in-place silent uninstall. It creates an app-data retention marker only if the application profile does not already exist; otherwise it refuses to touch it. Marker preservation is asserted. This tests actual installation/uninstallation in a disposable runner, not interactive GUI, file pickers, first-install WebView2 download or desktop playback. A successful final workflow is required before claiming the smoke step passed.
