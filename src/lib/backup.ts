import { db } from '../db';
import { statuses, templateKinds, type Beat, type Settings, type Template } from '../types';
export interface Backup {
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
export function validateBackup(raw: unknown): Backup {
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
  const b = raw as unknown as Backup;
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
export async function exportBackup(): Promise<Backup> {
  return db.transaction('r', db.beats, db.templates, db.settings, async () => ({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    attachments: 'not-supported',
    beats: await db.beats.toArray(),
    templates: await db.templates.toArray(),
    settings: await db.settings.toArray(),
  }));
}
export async function restoreBackup(raw: unknown, mode: 'merge' | 'replace') {
  const b = validateBackup(raw);
  await db.transaction('rw', db.beats, db.templates, db.settings, async () => {
    if (mode === 'replace') {
      await db.beats.clear();
      await db.templates.clear();
      await db.settings.clear();
    }
    const beats = b.beats;
    if (mode === 'merge') {
      for (const row of beats) if (!(await db.beats.get(row.id))) await db.beats.add(row);
      for (const row of b.templates)
        if (!(await db.templates.get(row.id)))
          await db.templates.add({
            ...row,
            isDefault:
              row.isDefault &&
              !(await db.templates
                .where('kind')
                .equals(row.kind)
                .filter((t) => t.isDefault)
                .count()),
          });
      if (!(await db.settings.get('preferences'))) await db.settings.bulkPut(b.settings);
    } else {
      await db.beats.bulkPut(beats);
      await db.templates.bulkPut(b.templates);
      await db.settings.bulkPut(b.settings);
    }
  });
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
