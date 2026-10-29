# Backups, migration and recovery

## Compatibility

| Format                                                       | Contents                                                                                                     | Supported import targets   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | -------------------------- |
| Genuine v1 JSON                                              | Beats, metadata, templates, preferences; no binaries                                                         | v1 web, v2 web, v2 desktop |
| v2 JSON (`schemaVersion: 2`, `attachments: references-only`) | Above plus media descriptors, release snapshots, render/export records and history; no audio/image/MP4 bytes | v2 web and desktop only    |
| XASMA portable ZIP (archive version 1 containing v2 JSON)    | v2 metadata plus every listed managed audio/artwork file; generated MP4 bytes explicitly excluded            | v2 desktop only            |

The old v1 app does not understand v2 backups. Web and installed-app data are separate. Export genuine v1 JSON from the browser to transfer an existing catalog into desktop Settings. v2 web continues to work without native tools and can carry media descriptors/history, but it cannot read native files or restore ZIP archives. Nothing syncs between PC, iPhone, browsers or installations automatically.

Backups are unencrypted and may contain personal notes/contact details and audio. Keep copies privately; the app does not upload them. App-managed originals and generated videos are separate from your original DAW/filesystem assets.

## JSON safety and semantics

Before writing, imports check schema, types, IDs, duplicate IDs, media metadata, dates, state values, record references and coverage declarations. Unknown versions/record collections are rejected. The file/UI limit is 25 MB, up to 50,000 beats, 10,000 templates, 50,000 new-record entries per table and 200,000 events. Current preferences must be present. Invalid imports do not clear anything.

Merge keeps existing IDs and preferences and adds new records. Replace restores the validated database snapshot in a transaction. Before destructive desktop replacement, a metadata recovery file is flushed into the native `recovery` directory. Existing managed media/output files are retained, so recovery references are not destroyed. Imported active attempts become Interrupted; they are never treated as resumed native processes. JSON imports do not claim media bytes exist: missing copies are shown and can be reimported from originals. An imported output is only playable/exportable if its provenance matches an actual local native job/file.

Removing a beat from the active library retains its metadata/history/source references in backups. There is no automatic purge of old managed versions or completed outputs. This prevents accidental deletion of files used by another draft, old attempt or recovery snapshot.

## Portable restore protocol

1. A native picker selects the archive. Rust validates unique safe entry names, known manifests, versions, exact attachment membership, regular files, checksums and sizes before main data changes.
2. Extraction goes to `restores/<transaction-id>`. Media is signature/probe validated there. No archive paths are trusted for extraction, and no source paths/Windows drive paths are accepted from archive entries.
3. The frontend validates the contained v2 database and displays counts plus merge/replace mode. Cancel removes staging.
4. For replacement, first write a recovery JSON of the current DB. Then native promotion checks all existing-ID/content collisions and copies immutable files into `media/`. Different content never overwrites an existing ID.
5. Only after native promotion succeeds does the validated IndexedDB transaction commit. Complete the transaction by removing staging.

Filesystems and IndexedDB have no shared transaction. If promotion or the DB transaction fails, the DB stays unchanged; some safe extra immutable files can remain. They are deliberately retained instead of deleted in compensation, since deletion could race another reference. If the process stops before DB commit, the DB transaction rolls back. If it stops after DB commit, promoted files already exist. Startup clears abandoned staging/partials, retains promoted files, and marks interrupted render attempts. Hardware loss/storage eviction still requires an independent backup; no application can guarantee recovery from arbitrary disk failure.

Archive limits: 2 GB compressed/expanded, 10,002 entries (metadata + manifest + at most 10,000 media), 25 MB metadata, 300 MB per audio file and 20 MB per artwork. Path traversal, absolute/drive paths, backslashes, symlinks, duplicate names, missing/unexpected attachments and unsupported video-inclusive formats are rejected. A failed backup/export is not reported successful. Native probes/decoders use execution time limits and bounded output.

## Missing/corrupt state

- Missing managed copy: select the beat in Release Studio and Replace/reimport its original audio/artwork. Other fields and saved metadata are preserved; old outputs stay associated with old source IDs.
- Missing generated video: its history remains; retry from the draft to create a new attempt. Portable/JSON backups do not include MP4 bytes.
- Failed/interrupted restore: the existing database remains transactionally safe. Free disk space, restart and retry the validated archive. Extra owned copies may remain; they do not modify originals.
- Browser/WebView storage loss: restore JSON, then portable media or originals. A native catalog alone is not a full database backup.
- Corrupt native `catalog.json`: close the app and copy the entire app data directory somewhere safe first. Preserve the corrupt file (rename it rather than deleting it) and restart to create a new native catalog. Restore a portable backup to repopulate verified managed media, or reimport originals; keep old outputs for manual recovery. Metadata-only recovery does not reconstruct a lost native output registry. This manual recovery path has no automatic repair/GUI wizard and needs cautious user intervention.

Keep independent portable backups before upgrades, uninstalling, moving data directories or changing deployment origins. Do not manually remove the app-data directory as a troubleshooting step.
