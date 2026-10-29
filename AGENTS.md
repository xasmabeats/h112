# XASMA engineering instructions

- Build with free, open-source tools only. No paid APIs, AI services, API keys, accounts, subscriptions, or required external services.
- Preserve the static, local-first React web/PWA target. An additive Tauri 2 Windows desktop layer is authorized for managed local media, bundled FFmpeg rendering, and portable backups. No backend, Firebase, Supabase, cloud database, or telemetry. Never upload personal data or fetch artwork references automatically. Native commands must be capability-restricted and resolve IDs to controlled paths, never accept arbitrary shell commands.
- Do not install or depend on Everything Claude Code (ECC), Claude Code, or related tooling.
- Use strict TypeScript, reusable accessible components, and clear feature boundaries. Keep persistence and deterministic generation separate from UI.
- IndexedDB is the source of truth. Use Dexie transactions for related writes and add versioned migrations for future schema changes. Never delete or reset user data to fix an upgrade.
- Validate inputs and backups before writing. Preserve atomic restore, explicit merge collision semantics, and destructive-action confirmations. Surface quota failures.
- Store release dates as local YYYY-MM-DD values. Do not parse them as UTC instants. Never automatically publish; require explicit confirmation.
- Preserve editable metadata and ask before overwriting manual edits. Never invent artist associations, contact details, licensing rights, or growth guarantees.
- Ensure keyboard access, visible focus, semantic labels, readable contrast, responsive layouts, reduced-motion support, and iPhone safe areas.
- Preserve GitHub Pages hash routing and configurable VITE_BASE_PATH. Test assets, manifest, service worker scope, and offline persistence under a repository subpath.
- Run npm test, npm run build, and npm run test:e2e before claiming completion. Report executed checks, failures, and untested device limits accurately.
- Use the existing isolated checkout. Do not create a worktree unless explicitly requested.
- Keep README workflows and deployment instructions current. Never assume local data syncs or that browser storage is permanent.

- Desktop changes must preserve additive migrations and v1 imports. Test native core and real conversion, and distinguish compilation/packaging from Windows GUI or installer execution. Never merge, publish a Release, or deploy the website as part of desktop feature work.
