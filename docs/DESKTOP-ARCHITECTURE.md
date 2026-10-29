# Desktop v2 architecture and security boundary

## Targets and trust

The original React app remains a static web/PWA target. Tauri 2 adds a Windows 10/11 x64 host; it does not replace the frontend or introduce a server. The desktop Vite mode uses `/`, writes `desktop-dist`, and aliases PWA registration to an inert adapter. The web mode retains hash routing, configurable repository subpaths and Workbox precaching, including lazy release screens.

The stable application identifier is `io.xasmabeats.release-manager`. Native state is in Tauri's app-specific local-data directory, on Windows normally `%LOCALAPPDATA%\io.xasmabeats.release-manager`. Its subdirectories are `media`, `outputs`, `temporary`, `restores` and `recovery`; `catalog.json` records native media, jobs and successful exports. Do not change the identifier between upgrades. IndexedDB stays in the stable Tauri/WebView2 origin; it is separate from browser-origin IndexedDB. The app does not automatically access the browser's data.

`src/platform` owns IPC and asset URLs. Components receive typed results and never construct process commands. Native import pickers establish access to original files. Native drag/drop issues a one-use token for at most two approved paths; frontend IPC receives that token, not a general filesystem API. Export pickers are native. Render, playback, export and cancellation operate on IDs resolved against the native catalog. Frontend-supplied executable names, filters, command arguments and arbitrary paths are not accepted.

The sole main-window capability enables only event subscription and enumerated custom commands. There is no shell/fs/http plugin or remote-origin capability. `AppManifest::commands` opts application commands into ACL checking. The CSP limits assets/media to bundled files and controlled asset-protocol directories. No remote artwork, fonts, telemetry or inference endpoint is used. Windows media tools have compiled-in SHA-256 pins checked before native use; unverified development builds disable media tools. Production compilation fails without verified tool hashes.

## Managed media and rendering

Imports copy to owned temporary files, enforce size/signature/codec/dimension/duration limits, fully decode with bounded execution time, hash bytes and then promote to immutable UUID-named files. Original source files are never modified. A replacement receives a new ID; `version` describes the media record format, while the immutable ID/checksum distinguishes source generations. No destructive media cleanup is exposed; old versions can be referenced by historical releases. Startup removes only owned partial files and abandoned restore staging, never committed media or outputs.

One render can be active. Rust spawns the fixed bundled executable with an argument array and no shell. Networking is disabled in the redistributed build; input protocols are also restricted to `file,pipe`. FFprobe and full decoding validate inputs. Native process handles are bounded and, on Windows, assigned to a kill-on-close Job Object so probes/encoders cannot outlive the app. Closing an active render asks the user, signals cancellation and waits for shutdown. Cancellation kills and waits for the actual process. Terminal transitions are idempotent; retries create new job IDs/attempt numbers.

Rendering uses an immutable request/media/metadata snapshot, 1920×1080, 30 FPS, aspect-preserving scale/pad, square pixels, yuv420p, libx264 and AAC, plus MP4 fast-start. Source-embedded metadata/chapters are stripped; the release metadata snapshot is exported explicitly as JSON/text. Two encoder threads bound resource use. Progress comes from FFmpeg `out_time_us` and the probed audio duration; it is not a timer animation. Output remains temporary until FFprobe verifies H.264 + AAC, dimensions, pixel format, frame rate and duration within `max(0.25 seconds, 1%)`. Diagnostics are bounded. Native job state persists through probing/preparing/encoding/validating/terminal stages; restart marks nonterminal attempts Interrupted and never pretends to resume an encode.

Completed outputs are immutable `outputs/<job-id>.mp4`. Missing sources/outputs produce recoverable errors rather than a false success. Native asset URLs support playback; WebView2/Windows codec support still needs real-device verification. Source IDs/hashes are checked against local native records before displaying an imported backup's media/output; a conflicting ID cannot silently attach the wrong local file.

Release-folder export stages a unique directory, writes video, JSON, UTF-8 text and the job provenance manifest, flushes and then promotes the directory. Video Save As confirms replacement and verifies bytes. A cancelled dialog returns no export record. Native state records success only after destination writes. Generated videos are never silently overwritten.

## Database, events and facts

Dexie v2 adds `media`, `releases`, `jobs`, `exports` and `events` without replacing the v1 stores or changing planned date semantics. Beat records retain optional media IDs and a removal marker. Removing a beat hides it from the active library while retaining records needed for historical provenance and backups; the confirmation explains this retention. It does not erase managed files.

Production status remains Idea → Producing → Mixing → Mastering → Ready → Scheduled → Published. Release readiness, immutable attempts, successful exports and manual-publication reports are distinct facts. Rendering/export never changes production status. Manual confirmation records `confirmedAt` + `userReported`, not an invented YouTube upload time. It updates the beat's user-managed status explicitly. Refreshing draft snapshots makes older outputs outdated without deleting history.

Saved beat edits, imports/replacements, metadata generation/save, draft actions, render start/terminal states, exports and publication confirmations produce bounded history events. Related IndexedDB changes/events share transactions. Terminal events use deterministic IDs so polling/retried callbacks do not duplicate them. Event instants display in local time; YYYY-MM-DD planning dates remain date-only. Native catalog writes and IndexedDB cannot share a transaction; polling reconciles only native records whose source references are present and consistent, preserving the native job as the authority for actual processing/export results.

## Providers and optional AI

The default `MetadataProvider` is deterministic, complete, offline and labelled template-based, not AI. Existing counters remain publishing guidance, not server-side validation. Partial regeneration and title suggestions ask before overwriting affected manual text.

A Windows-compatible optional runtime evaluated was llama.cpp's local server: it can run without a GPU, but speed/RAM depend on model size/quantization and hardware. Model licenses are separate from the runtime's license. No runtime/model is bundled or downloaded, no hardware capacity is assumed, and no local-AI adapter/control is advertised as working. A future implementation must restrict explicitly configured destinations to loopback, enforce timeout/cancellation, validate structured output and fall back to templates. None of that may block the current core.

`PublishingProvider` defines validation, authentication capability, progress, cancellation and structured results. Current `manual-local` network publishing returns UNSUPPORTED, with no video ID/URL/timestamp. There are no OAuth flows, uploads, API keys or fake-success responses. Future credentials belong in native secure storage, never frontend source, preferences or backups.
