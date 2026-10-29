import { beforeEach, describe, it, expect, vi } from 'vitest';
import {
  db,
  initialize,
  newBeat,
  saveBeat,
  changeStatus,
  localDate,
  defaults,
  starters,
} from '../src/db';
import { generate } from '../src/lib/metadata';
import { validateBackup, exportBackup, restoreBackup, calendarExport } from '../src/lib/backup';
import { filterBeats } from '../src/features/Library';
beforeEach(async () => {
  await db.beats.clear();
  await db.templates.clear();
  await db.settings.clear();
  for (const table of [db.media, db.releases, db.jobs, db.exports, db.events]) await table.clear();
  await initialize();
});
describe('persistent beat workflow', () => {
  it('creates, edits, reloads and deletes records', async () => {
    const beat = { ...newBeat(), title: 'Midnight', tags: ['cold'] };
    await saveBeat(beat);
    expect(await db.beats.count()).toBe(1);
    await saveBeat({ ...beat, title: 'Midnight II', status: 'Mixing' });
    db.close();
    await db.open();
    expect((await db.beats.get(beat.id))?.title).toBe('Midnight II');
    expect((await db.beats.get(beat.id))?.status).toBe('Mixing');
    await db.beats.delete(beat.id);
    expect(await db.beats.count()).toBe(0);
  });
  it('rejects invalid input', async () => {
    await expect(saveBeat(newBeat())).rejects.toThrow('title');
    await expect(saveBeat({ ...newBeat(), title: 'A', bpm: NaN })).rejects.toThrow('BPM');
    await expect(saveBeat({ ...newBeat(), title: 'A', bpm: 401 })).rejects.toThrow('BPM');
  });
  it('requires explicit publish confirmation and does not publish overdue releases', async () => {
    const beat = {
      ...newBeat(),
      title: 'A',
      plannedDate: '2020-01-01',
      status: 'Scheduled' as const,
    };
    await saveBeat(beat);
    expect((await db.beats.get(beat.id))?.status).toBe('Scheduled');
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await changeStatus(beat, 'Published');
    expect((await db.beats.get(beat.id))?.status).toBe('Scheduled');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await changeStatus(beat, 'Published');
    expect((await db.beats.get(beat.id))?.actualDate).toBe(localDate(new Date()));
    vi.restoreAllMocks();
  });
  it('searches, filters and sorts actual records', () => {
    const beats = [
      { ...newBeat('Drill'), title: 'Zeta', bpm: 150, tags: ['cold'], status: 'Ready' as const },
      { ...newBeat('Supertrap'), title: 'Alpha', bpm: 120 },
    ];
    expect(filterBeats(beats, 'zeta', 'Drill', 'Ready', 'cold', 'title')).toHaveLength(1);
    expect(filterBeats(beats, '', '', '', '', 'bpm')[0].title).toBe('Alpha');
    expect(filterBeats(beats, 'missing', '', '', '', 'title')).toHaveLength(0);
  });
  it('reschedules without shifting date-only values', async () => {
    const beat = {
      ...newBeat(),
      title: 'A',
      plannedDate: '2026-12-31',
      status: 'Scheduled' as const,
    };
    await saveBeat(beat);
    await saveBeat({ ...beat, plannedDate: '2027-01-01' });
    expect((await db.beats.get(beat.id))?.plannedDate).toBe('2027-01-01');
    expect(localDate(new Date(2026, 0, 1, 0, 1))).toBe('2026-01-01');
  });
  it('surfaces storage quota failures without reporting success', async () => {
    const put = vi
      .spyOn(db.beats, 'put')
      .mockRejectedValueOnce(new DOMException('Storage full', 'QuotaExceededError'));
    await expect(saveBeat({ ...newBeat(), title: 'Full' })).rejects.toMatchObject({
      name: 'QuotaExceededError',
    });
    put.mockRestore();
    expect(await db.beats.count()).toBe(0);
  });
});
describe('metadata and portable backups', () => {
  it('generates dynamic metadata locally and preserves manual edits after reload', async () => {
    const beat = {
      ...newBeat(),
      title: 'Night Shift',
      artists: 'Chosen Artist',
      key: 'F# minor',
      mood: 'cold',
    };
    const metadata = generate(
      beat,
      { ...defaults, producer: 'XASMA', contact: '', licensing: '' },
      starters,
    );
    expect(metadata.title).toContain(String(new Date().getFullYear()));
    expect(metadata.title).toContain('Chosen Artist');
    expect(metadata.description).not.toContain('free for profit');
    expect(metadata.filename).toBe('night-shift-140-f-minor.wav');
    metadata.title = 'Manual title';
    await saveBeat({ ...beat, metadata });
    db.close();
    await db.open();
    expect((await db.beats.get(beat.id))?.metadata?.title).toBe('Manual title');
  });
  it('exports and restores complete data with safe merge and replace', async () => {
    const beat = { ...newBeat(), title: 'Original' };
    await saveBeat(beat);
    const backup = await exportBackup();
    await saveBeat({ ...beat, title: 'Newer local edit' });
    await saveBeat({ ...newBeat(), title: 'Extra' });
    await restoreBackup(backup, 'merge');
    expect((await db.beats.get(beat.id))?.title).toBe('Newer local edit');
    expect(await db.beats.count()).toBe(2);
    await restoreBackup(backup, 'replace');
    expect(await db.beats.count()).toBe(1);
    expect((await db.beats.get(beat.id))?.title).toBe('Original');
    expect(await db.templates.count()).toBe(starters.length);
  });
  it('rejects corrupt backups and duplicate IDs before erasing anything', async () => {
    await saveBeat({ ...newBeat(), title: 'Safe' });
    const b = await exportBackup();
    for (const invalid of [
      {},
      { ...b, schemaVersion: 99 },
      { ...b, beats: [b.beats[0], b.beats[0]] },
      { ...b, beats: [{ ...b.beats[0], bpm: 'wrong' }] },
      { ...b, beats: [{ ...b.beats[0], plannedDate: '2026-02-30' }] },
    ]) {
      expect(() => validateBackup(invalid)).toThrow();
      await expect(restoreBackup(invalid, 'replace')).rejects.toThrow();
      expect(await db.beats.count()).toBe(1);
    }
  });
  it('exports escaped calendar events with stable all-day dates', () => {
    const ics = calendarExport([
      { ...newBeat(), title: 'Night, Shift; Part 2', plannedDate: '2026-10-31' },
    ]);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261031');
    expect(ics).toContain('Night\\, Shift\\; Part 2');
    expect(ics).toContain('END:VCALENDAR');
  });
  it('initialization is repeatable and does not recreate user-deleted templates', async () => {
    await db.templates.clear();
    await initialize();
    expect(await db.templates.count()).toBe(0);
  });
});
it('rolls back a failed replace import atomically', async () => {
  await saveBeat({ ...newBeat(), title: 'Original catalog' });
  const incoming = await exportBackup();
  incoming.beats = [{ ...newBeat(), title: 'Incoming catalog' }];
  incoming.events = incoming.events.map((e) => ({ ...e, beatId: incoming.beats[0].id }));
  const write = vi
    .spyOn(db.templates, 'bulkPut')
    .mockRejectedValueOnce(new DOMException('Storage full', 'QuotaExceededError'));
  await expect(restoreBackup(incoming, 'replace')).rejects.toMatchObject({
    name: 'QuotaExceededError',
  });
  write.mockRestore();
  expect((await db.beats.toArray()).map((b) => b.title)).toEqual(['Original catalog']);
});
it('generates valid hashtags from multiword genres and leaves unknown title placeholders visible', () => {
  const generated = generate(
    { ...newBeat('Dark Trap'), title: 'Night' },
    defaults,
    [
      ...starters,
      {
        id: 'custom',
        name: 'Custom',
        kind: 'title',
        content: '{beatTitle} {toString}',
        isDefault: false,
      },
    ],
    'custom',
  );
  expect(generated.hashtags).toContain('#DarkTrap');
  expect(generated.hashtags.split(' ').every((t) => /^#[\p{L}\p{N}_]+$/u.test(t))).toBe(true);
  expect(generated.title).toBe('Night {toString}');
});
