# Suggested pull request: XASMA desktop v2

Adds a Windows Tauri host while preserving the static web/PWA app. Users can prepare release snapshots, import immutable managed MP3/PCM WAV + PNG/JPEG sources, render validated H.264/AAC MP4s, review/export outputs and keep release history. Native commands are capability-restricted and ID-based; no shell/fs plugin, telemetry, cloud AI, OAuth or automatic publication is added.

Dexie v2 is additive and accepts genuine v1 backups. New JSON exports are metadata-only. Portable desktop archives contain managed source bytes and use staged validation/promotion before database transactions, with retained recovery metadata and immutable files.

Windows CI builds pinned FFmpeg/x264 source with checksums, license texts and corresponding source, runs real conversion/cancellation tests, then packages an unsigned per-user NSIS installer, checks real silent install/uninstall and synthetic data retention, and uploads a 14-day workflow artifact. These steps require a successful final run; interactive GUI checks remain separate. Website deployment and public Releases are unchanged/disabled for this feature branch.

See DESKTOP-ARCHITECTURE.md, BACKUP-AND-RECOVERY.md, FFMPEG-LICENSING.md and WINDOWS-VERIFICATION.md for the verification boundaries and limitations. Do not merge or call this production-ready until the final Windows artifact and relevant manual runtime checks are confirmed.

PR creation is blocked until this environment can reach/authenticate to GitHub API/GraphQL. This file is a reviewable description, not a claim that a PR exists.
