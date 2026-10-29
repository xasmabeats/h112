import type {
  ManagedMedia,
  ReleaseDraft,
  RenderJob,
  ExportRecord,
  HistoryEvent,
} from '../types/desktop';
import { jobStates, defaultRenderSettings } from '../types/desktop';
import { db } from '../db';
import { statuses, templateKinds, type Beat, type Settings, type Template } from '../types';
interface LegacyBackup {
  schemaVersion: 1;
  exportedAt: string;
  attachments: 'not-supported';
  beats: Beat[];
  templates: Template[];
  settings: Settings[];
}
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const strings = (o: Record<string, unknown>, fields: string[]) =>
  fields.every((k) => typeof o[k] === 'string');
const date = (v: unknown) =>
  v === '' ||
  (typeof v === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !isNaN(new Date(v + 'T12:00:00').getTime()) &&
    [
      new Date(v + 'T12:00:00').getFullYear(),
      String(new Date(v + 'T12:00:00').getMonth() + 1).padStart(2, '0'),
      String(new Date(v + 'T12:00:00').getDate()).padStart(2, '0'),
    ].join('-') === v);
function validateLegacyBackup(raw: unknown): LegacyBackup {
  if (
    !object(raw) ||
    raw.schemaVersion !== 1 ||
    raw.attachments !== 'not-supported' ||
    typeof raw.exportedAt !== 'string' ||
    isNaN(Date.parse(raw.exportedAt))
  )
    throw new Error('Unsupported or invalid XASMA backup.');
  for (const key of ['beats', 'templates', 'settings'])
    if (!Array.isArray(raw[key])) throw new Error(`Missing ${key} collection.`);
  const b = raw as unknown as LegacyBackup;
  if (b.settings.length !== 1)
    throw new Error('Backup must contain exactly one preferences record.');
  if (b.beats.length > 50000 || b.templates.length > 10000)
    throw new Error('Backup exceeds supported record limits.');
  for (const collection of [b.beats, b.templates, b.settings]) {
    const ids = new Set();
    for (const row of collection) {
      if (!object(row) || typeof row.id !== 'string' || !row.id || ids.has(row.id))
        throw new Error('Invalid or duplicate record IDs in backup.');
      ids.add(row.id);
    }
  }
  for (const row of b.beats) {
    const r = row as unknown as Record<string, unknown>;
    if (
      !strings(r, [
        'title',
        'genre',
        'key',
        'mood',
        'artists',
        'productionNotes',
        'customNotes',
        'createdAt',
        'updatedAt',
        'youtubeUrl',
        'artwork',
      ]) ||
      !row.title.trim() ||
      !statuses.includes(row.status) ||
      !Number.isFinite(row.bpm) ||
      row.bpm < 1 ||
      row.bpm > 400 ||
      !Array.isArray(row.tags) ||
      !row.tags.every((t) => typeof t === 'string') ||
      !date(row.plannedDate) ||
      !date(row.actualDate) ||
      isNaN(Date.parse(row.createdAt)) ||
      isNaN(Date.parse(row.updatedAt)) ||
      (row.metadata !== null &&
        (!object(row.metadata) ||
          !strings(row.metadata, [
            'title',
            'description',
            'tags',
            'hashtags',
            'filename',
            'pinnedComment',
          ])))
    )
      throw new Error('Invalid beat record.');
  }
  for (const row of b.templates)
    if (
      !strings(row as unknown as Record<string, unknown>, ['name', 'content']) ||
      !templateKinds.includes(row.kind) ||
      typeof row.isDefault !== 'boolean'
    )
      throw new Error('Invalid template record.');
  for (const row of b.settings)
    if (
      row.id !== 'preferences' ||
      !strings(row as unknown as Record<string, unknown>, [
        'producer',
        'defaultGenre',
        'defaultTemplate',
        'schedule',
        'contact',
        'socials',
        'licensing',
      ]) ||
      !['comfortable', 'compact'].includes(row.appearance)
    )
      throw new Error('Invalid settings record.');
  return b;
}
export interface Backup extends Omit<LegacyBackup, 'schemaVersion' | 'attachments'> {
  schemaVersion: 2;
  attachments: 'references-only';
  media: ManagedMedia[];
  releases: ReleaseDraft[];
  jobs: RenderJob[];
  exports: ExportRecord[];
  events: HistoryEvent[];
}
const extraTables = ['media', 'releases', 'jobs', 'exports', 'events'] as const;
const hasOnlyKeys = (value: unknown, keys: readonly string[]) =>
  object(value) && Object.keys(value).every((key) => keys.includes(key));
const metadataKeys = [
  'title',
  'description',
  'tags',
  'hashtags',
  'filename',
  'pinnedComment',
] as const;
const beatKeys = [
  'id',
  'title',
  'genre',
  'bpm',
  'key',
  'mood',
  'artists',
  'tags',
  'productionNotes',
  'customNotes',
  'createdAt',
  'updatedAt',
  'status',
  'plannedDate',
  'actualDate',
  'youtubeUrl',
  'artwork',
  'metadata',
  'audioId',
  'artworkId',
  'deletedAt',
] as const;
const mediaKeys = [
  'id',
  'kind',
  'originalName',
  'format',
  'mime',
  'bytes',
  'duration',
  'width',
  'height',
  'sha256',
  'version',
  'createdAt',
  'managed',
] as const;
const baseKeys = [
  'schemaVersion',
  'exportedAt',
  'attachments',
  'beats',
  'templates',
  'settings',
] as const;
const metadataValid = (v: unknown) =>
  object(v) &&
  strings(v, ['title', 'description', 'tags', 'hashtags', 'filename', 'pinnedComment']);
const instant = (v: unknown) => typeof v === 'string' && v.length <= 40 && !isNaN(Date.parse(v));
const reference = (id: unknown, ids: Set<string>) => typeof id === 'string' && ids.has(id);
export function validateBackup(raw: unknown): Backup {
  if (!object(raw)) throw new Error('Invalid backup object.');
  if (new TextEncoder().encode(JSON.stringify(raw)).length > 25 * 1024 * 1024)
    throw new Error('Backup metadata exceeds 25 MB.');
  if (!hasOnlyKeys(raw, raw.schemaVersion === 1 ? baseKeys : [...baseKeys, ...extraTables]))
    throw new Error('Unsupported records or fields in backup; no data was imported.');
  if (raw.schemaVersion === 1) {
    const legacy = validateLegacyBackup(raw);
    if (
      legacy.beats.some((beat) => !hasOnlyKeys(beat, beatKeys) || beat.audioId || beat.artworkId) ||
      legacy.settings.some(
        (row) =>
          !hasOnlyKeys(row, [
            'id',
            'producer',
            'defaultGenre',
            'defaultTemplate',
            'schedule',
            'contact',
            'socials',
            'licensing',
            'appearance',
          ]),
      )
    )
      throw new Error('Unsupported v1 fields; import a genuine v1 export.');
    return {
      ...legacy,
      schemaVersion: 2,
      attachments: 'references-only',
      media: [],
      releases: [],
      jobs: [],
      exports: [],
      events: [],
    };
  }
  if (raw.schemaVersion !== 2 || raw.attachments !== 'references-only')
    throw new Error('Unsupported backup version or binary coverage declaration.');
  // Reuse the genuine v1 field validation before validating all additive records.
  const base = validateLegacyBackup({ ...raw, schemaVersion: 1, attachments: 'not-supported' });
  const backup = raw as unknown as Backup;
  for (const key of extraTables) {
    if (!Array.isArray(raw[key]) || raw[key].length > (key === 'events' ? 200000 : 50000))
      throw new Error(`Invalid ${key} collection.`);
    const ids = new Set();
    for (const item of raw[key]) {
      if (
        !object(item) ||
        typeof item.id !== 'string' ||
        !item.id ||
        item.id.length > 160 ||
        ids.has(item.id)
      )
        throw new Error(`Invalid or duplicate ${key} IDs.`);
      ids.add(item.id);
    }
  }
  for (const beat of base.beats)
    if (!hasOnlyKeys(beat, beatKeys)) throw new Error('Unsupported beat fields.');
  for (const row of base.settings)
    if (
      !hasOnlyKeys(row, [
        'id',
        'producer',
        'defaultGenre',
        'defaultTemplate',
        'schedule',
        'contact',
        'socials',
        'licensing',
        'appearance',
      ])
    )
      throw new Error('Unsupported preferences; credentials are never imported.');
  const beatIds = new Set(base.beats.map((b) => b.id)),
    mediaIds = new Set(backup.media.map((m) => m.id)),
    releaseIds = new Set(backup.releases.map((r) => r.id)),
    jobIds = new Set(backup.jobs.map((j) => j.id));
  for (const m of backup.media) {
    if (
      !hasOnlyKeys(m, mediaKeys) ||
      !['audio', 'artwork'].includes(m.kind) ||
      !['mp3', 'wav', 'png', 'jpg'].includes(m.format) ||
      m.managed !== true ||
      m.version !== 1 ||
      typeof m.originalName !== 'string' ||
      m.originalName.length > 1024 ||
      typeof m.mime !== 'string' ||
      !Number.isSafeInteger(m.bytes) ||
      m.bytes <= 0 ||
      m.bytes > (m.kind === 'audio' ? 300 : 20) * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/.test(m.sha256) ||
      !instant(m.createdAt) ||
      (m.kind === 'audio' &&
        (!['mp3', 'wav'].includes(m.format) ||
          typeof m.duration !== 'number' ||
          !Number.isFinite(m.duration) ||
          m.duration <= 0 ||
          m.duration > 7200)) ||
      (m.kind === 'artwork' &&
        (!['png', 'jpg'].includes(m.format) ||
          !Number.isInteger(m.width) ||
          !Number.isInteger(m.height) ||
          (m.width ?? 0) <= 0 ||
          (m.height ?? 0) <= 0 ||
          (m.width ?? 0) > 12000 ||
          (m.height ?? 0) > 12000 ||
          (m.width ?? 0) * (m.height ?? 0) > 32000000))
    )
      throw new Error('Invalid managed media record.');
  }
  for (const beat of backup.beats) {
    if (
      (beat.audioId && !mediaIds.has(beat.audioId)) ||
      (beat.artworkId && !mediaIds.has(beat.artworkId)) ||
      (beat.deletedAt && !instant(beat.deletedAt))
    )
      throw new Error('Beat references missing media or an invalid deletion date.');
  }
  for (const release of backup.releases) {
    if (
      !hasOnlyKeys(release, [
        'id',
        'beatId',
        'name',
        'audioId',
        'artworkId',
        'metadata',
        'ready',
        'createdAt',
        'updatedAt',
        'manualPublication',
      ]) ||
      !reference(release.beatId, beatIds) ||
      typeof release.name !== 'string' ||
      !metadataValid(release.metadata) ||
      typeof release.ready !== 'boolean' ||
      !instant(release.createdAt) ||
      !instant(release.updatedAt) ||
      (release.audioId !== '' && !reference(release.audioId, mediaIds)) ||
      (release.artworkId !== '' && !reference(release.artworkId, mediaIds)) ||
      (release.manualPublication !== null &&
        (!object(release.manualPublication) ||
          release.manualPublication.userReported !== true ||
          !instant(release.manualPublication.confirmedAt) ||
          typeof release.manualPublication.url !== 'string'))
    )
      throw new Error('Invalid release or missing release references.');
  }
  const mediaById = new Map(backup.media.map((m) => [m.id, m]));
  for (const job of backup.jobs) {
    if (
      !hasOnlyKeys(job, [
        'id',
        'attempt',
        'settings',
        'request',
        'audio',
        'artwork',
        'state',
        'progress',
        'createdAt',
        'updatedAt',
        'error',
        'outputBytes',
        'outputSha256',
      ]) ||
      (job.settings !== undefined &&
        (!hasOnlyKeys(job.settings, Object.keys(defaultRenderSettings)) ||
          !(Object.keys(defaultRenderSettings) as (keyof typeof defaultRenderSettings)[]).every(
            (key) => job.settings?.[key] === defaultRenderSettings[key],
          ))) ||
      !object(job.request) ||
      !hasOnlyKeys(job.request, ['beatId', 'releaseId', 'audioId', 'artworkId', 'metadata']) ||
      !reference(job.request.beatId, beatIds) ||
      !reference(job.request.releaseId, releaseIds) ||
      !reference(job.request.audioId, mediaIds) ||
      !reference(job.request.artworkId, mediaIds) ||
      !metadataValid(job.request.metadata) ||
      !object(job.audio) ||
      !object(job.artwork) ||
      job.audio.id !== job.request.audioId ||
      job.artwork.id !== job.request.artworkId ||
      !mediaKeys.every((key) => job.audio[key] === mediaById.get(job.request.audioId)?.[key]) ||
      !mediaKeys.every((key) => job.artwork[key] === mediaById.get(job.request.artworkId)?.[key]) ||
      !jobStates.includes(job.state) ||
      !Number.isInteger(job.attempt) ||
      job.attempt < 1 ||
      !Number.isFinite(job.progress) ||
      job.progress < 0 ||
      job.progress > 1 ||
      !instant(job.createdAt) ||
      !instant(job.updatedAt) ||
      (job.error !== null && typeof job.error !== 'string') ||
      (job.outputBytes !== null &&
        (!Number.isSafeInteger(job.outputBytes) || job.outputBytes < 0)) ||
      (job.outputSha256 !== null && !/^[a-f0-9]{64}$/.test(job.outputSha256))
    )
      throw new Error('Invalid render job or source references.');
  }
  for (const record of backup.exports) {
    if (
      !hasOnlyKeys(record, [
        'id',
        'jobId',
        'releaseId',
        'beatId',
        'createdAt',
        'kind',
        'destinationName',
        'bytes',
      ]) ||
      !reference(record.jobId, jobIds) ||
      !reference(record.releaseId, releaseIds) ||
      !reference(record.beatId, beatIds) ||
      !['video', 'release-folder'].includes(record.kind) ||
      !instant(record.createdAt) ||
      typeof record.destinationName !== 'string' ||
      !Number.isSafeInteger(record.bytes) ||
      record.bytes <= 0
    )
      throw new Error('Invalid export record.');
  }
  for (const e of backup.events) {
    if (
      !hasOnlyKeys(e, ['id', 'beatId', 'releaseId', 'jobId', 'type', 'status', 'at', 'detail']) ||
      !reference(e.beatId, beatIds) ||
      (e.releaseId && !releaseIds.has(e.releaseId)) ||
      (e.jobId && !jobIds.has(e.jobId)) ||
      typeof e.type !== 'string' ||
      typeof e.detail !== 'string' ||
      e.detail.length > 4096 ||
      !instant(e.at) ||
      (e.status !== undefined && typeof e.status !== 'string')
    )
      throw new Error('Invalid history event or references.');
  }
  return backup;
}
export async function exportBackup(): Promise<Backup> {
  return db.transaction(
    'r',
    [db.beats, db.templates, db.settings, db.media, db.releases, db.jobs, db.exports, db.events],
    async () => ({
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      attachments: 'references-only',
      beats: await db.beats.toArray(),
      templates: await db.templates.toArray(),
      settings: await db.settings.toArray(),
      media: await db.media.toArray(),
      releases: await db.releases.toArray(),
      jobs: await db.jobs.toArray(),
      exports: await db.exports.toArray(),
      events: await db.events.toArray(),
    }),
  );
}
export async function restoreBackup(raw: unknown, mode: 'merge' | 'replace') {
  const b = validateBackup(raw);
  await db.transaction(
    'rw',
    [db.beats, db.templates, db.settings, db.media, db.releases, db.jobs, db.exports, db.events],
    async () => {
      if (mode === 'merge') {
        for (const media of b.media) {
          const existing = await db.media.get(media.id);
          if (existing && !mediaKeys.every((key) => existing[key] === media[key]))
            throw new Error(
              'Immutable media ID collision with different content; no records were merged.',
            );
        }
        for (const job of b.jobs) {
          const existing = await db.jobs.get(job.id);
          if (
            existing &&
            (existing.request.beatId !== job.request.beatId ||
              existing.request.releaseId !== job.request.releaseId ||
              existing.request.audioId !== job.request.audioId ||
              existing.request.artworkId !== job.request.artworkId ||
              !metadataKeys.every(
                (key) => existing.request.metadata[key] === job.request.metadata[key],
              ))
          )
            throw new Error(
              'Render ID collision with different source provenance; no records were merged.',
            );
        }
      }
      if (mode === 'replace') {
        for (const table of [
          db.beats,
          db.templates,
          db.settings,
          db.media,
          db.releases,
          db.jobs,
          db.exports,
          db.events,
        ])
          await table.clear();
      }
      for (const beat of b.beats)
        if (mode === 'replace' || !(await db.beats.get(beat.id))) await db.beats.put(beat);
      if (mode === 'replace') await db.templates.bulkPut(b.templates);
      else
        for (const row of b.templates)
          if (!(await db.templates.get(row.id)))
            await db.templates.put({
              ...row,
              isDefault:
                row.isDefault &&
                !(await db.templates
                  .where('kind')
                  .equals(row.kind)
                  .filter((t) => t.isDefault)
                  .count()),
            });
      if (mode === 'replace' || !(await db.settings.get('preferences')))
        await db.settings.bulkPut(b.settings);
      for (const row of b.media)
        if (mode === 'replace' || !(await db.media.get(row.id))) await db.media.put(row);
      for (const row of b.releases)
        if (mode === 'replace' || !(await db.releases.get(row.id))) await db.releases.put(row);
      for (const row of b.jobs)
        if (mode === 'replace' || !(await db.jobs.get(row.id)))
          await db.jobs.put({
            ...row,
            state: ['Probing', 'Preparing', 'Encoding', 'Validating'].includes(row.state)
              ? 'Interrupted'
              : row.state,
            error: ['Probing', 'Preparing', 'Encoding', 'Validating'].includes(row.state)
              ? 'Imported attempt was not resumed; retry creates a new attempt.'
              : row.error,
          });
      for (const row of b.exports)
        if (mode === 'replace' || !(await db.exports.get(row.id))) await db.exports.put(row);
      for (const row of b.events)
        if (mode === 'replace' || !(await db.events.get(row.id))) await db.events.put(row);
    },
  );
}
export function download(content: string, name: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function calendarExport(beats: Beat[]) {
  const escape = (s: string) =>
    s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//XASMA//Beat Release Manager//EN'];
  for (const b of beats.filter((b) => b.plannedDate)) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${b.id}@xasma.local`,
      `DTSTAMP:${new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '')}`,
      `DTSTART;VALUE=DATE:${b.plannedDate.replaceAll('-', '')}`,
      `SUMMARY:${escape(b.title)}`,
      `DESCRIPTION:${escape(`${b.genre} • ${b.status}`)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines
    .map((line) => {
      const chunks: string[] = [];
      let part = '';
      for (const c of line) {
        if (new TextEncoder().encode(part + c).length > 70) {
          chunks.push(part);
          part = ' ' + c;
        } else part += c;
      }
      return [...chunks, part].join('\r\n');
    })
    .join('\r\n');
}
