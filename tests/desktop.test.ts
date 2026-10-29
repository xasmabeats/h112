import { beforeEach, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import { db, createDatabase, initialize, newBeat, saveBeat, removeBeat } from '../src/db';
import { exportBackup, restoreBackup, validateBackup } from '../src/lib/backup';
import {
  attachMedia,
  createRelease,
  refreshRelease,
  setReady,
  releaseCondition,
  outdated,
  syncNative,
  confirmManualPublication,
} from '../src/lib/releases';
import { generate } from '../src/lib/metadata';
import { defaults, starters } from '../src/db';
import { manualPublisher, templateProvider } from '../src/lib/providers';
import type { ManagedMedia, RenderJob, NativeSnapshot } from '../src/types/desktop';
beforeEach(async () => {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear();
  });
  await initialize();
});
const media = (kind: 'audio' | 'artwork'): ManagedMedia => ({
  id: crypto.randomUUID(),
  kind,
  originalName: kind === 'audio' ? 'source.mp3' : 'cover.png',
  format: kind === 'audio' ? 'mp3' : 'png',
  mime: kind === 'audio' ? 'audio/mpeg' : 'image/png',
  bytes: 2048,
  duration: kind === 'audio' ? 2 : null,
  width: kind === 'artwork' ? 192 : null,
  height: kind === 'artwork' ? 192 : null,
  sha256: 'a'.repeat(64),
  version: 1,
  createdAt: new Date().toISOString(),
  managed: true,
});
async function prepared() {
  const beat = {
    ...newBeat(),
    title: 'Migration fixture',
    metadata: {
      title: 'Handwritten title',
      description: 'Personal draft',
      tags: 'dark',
      hashtags: '#dark',
      filename: 'beat.wav',
      pinnedComment: '',
    },
  };
  await saveBeat(beat);
  const audio = media('audio'),
    art = media('artwork');
  await attachMedia(beat.id, audio);
  await attachMedia(beat.id, art);
  const updated = (await db.beats.get(beat.id))!;
  const release = await createRelease(updated, beat.metadata);
  return { beat: updated, audio, art, release };
}
it('upgrades a genuine v1 database without modifying beats, templates, dates or metadata', async () => {
  const name = 'xasma-migration-' + crypto.randomUUID();
  const old = new Dexie(name);
  old
    .version(1)
    .stores({
      beats: 'id,title,genre,status,plannedDate,updatedAt,*tags',
      templates: 'id,kind',
      settings: 'id',
    });
  await old.open();
  const beat = {
    ...newBeat(),
    title: 'Existing v1 beat',
    plannedDate: '2027-01-01',
    status: 'Mixing' as const,
    metadata: generate({ ...newBeat(), title: 'Original' }, defaults, starters),
  };
  await old.table('beats').add(beat);
  await old.table('templates').bulkAdd(starters);
  await old.table('settings').add(defaults);
  old.close();
  const upgraded = createDatabase(name);
  await upgraded.open();
  expect(await upgraded.beats.get(beat.id)).toEqual(beat);
  expect(await upgraded.templates.toArray()).toHaveLength(starters.length);
  expect(await upgraded.settings.get('preferences')).toEqual(defaults);
  expect(await upgraded.releases.count()).toBe(0);
  expect(upgraded.verno).toBe(2);
  upgraded.close();
  await Dexie.delete(name);
});
it('accepts v1 JSON and round trips v2 release/media/history data', async () => {
  const { beat, audio, art, release } = await prepared();
  const timestamp = new Date().toISOString();
  const job: RenderJob = {
    id: crypto.randomUUID(),
    attempt: 1,
    request: {
      beatId: beat.id,
      releaseId: release.id,
      audioId: audio.id,
      artworkId: art.id,
      metadata: release.metadata,
    },
    audio,
    artwork: art,
    state: 'Completed',
    progress: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    error: null,
    outputBytes: 9999,
    outputSha256: 'b'.repeat(64),
  };
  await syncNative({
    catalog: { media: [audio, art], jobs: [job], exports: [] },
    mediaUrls: {},
    outputUrls: {},
    activeJobId: null,
    toolsReady: true,
  });
  const backup = validateBackup(await exportBackup());
  expect(backup.schemaVersion).toBe(2);
  expect(backup.attachments).toBe('references-only');
  await restoreBackup(backup, 'replace');
  expect(await exportBackup()).toMatchObject({
    beats: [beat],
    media: expect.any(Array),
    releases: [release],
    jobs: [job],
  });
  expect(await db.media.count()).toBe(2);
  expect(await db.events.where('type').equals('render_completed').count()).toBe(1);
  const legacy = {
    schemaVersion: 1,
    attachments: 'not-supported',
    exportedAt: timestamp,
    beats: [{ ...newBeat(), title: 'V1 backup' }],
    templates: starters,
    settings: [defaults],
  };
  await restoreBackup(legacy, 'replace');
  expect((await db.beats.toArray())[0].title).toBe('V1 backup');
  expect(await db.jobs.count()).toBe(0);
});
it('keeps manual metadata during media replacement and marks output provenance outdated', async () => {
  const { beat, audio, art, release } = await prepared();
  const snapshot = structuredClone(release);
  const replacement = media('audio');
  await attachMedia(beat.id, replacement);
  const updated = (await db.beats.get(beat.id))!;
  expect(updated.metadata).toEqual(beat.metadata);
  expect(updated.audioId).toBe(replacement.id);
  expect(await db.media.get(audio.id)).toEqual(audio);
  await refreshRelease(release, updated, updated.metadata!);
  const refreshed = (await db.releases.get(release.id))!;
  expect(
    outdated(refreshed, {
      request: {
        ...snapshot,
        releaseId: release.id,
        metadata: snapshot.metadata,
        audioId: audio.id,
        artworkId: art.id,
      },
    } as unknown as RenderJob),
  ).toBe(true);
});
it('enforces preparation transitions and keeps publication separate from rendering/export', async () => {
  const { beat, release } = await prepared();
  expect(releaseCondition(release, [], [])).toBe('Draft');
  await setReady(release, true);
  expect(releaseCondition((await db.releases.get(release.id))!, [], [])).toBe('Ready');
  expect((await db.beats.get(beat.id))?.status).toBe('Idea');
  await expect(setReady({ ...release, audioId: '' }, true)).rejects.toThrow('required');
  await confirmManualPublication(release, '');
  expect((await db.releases.get(release.id))?.manualPublication?.userReported).toBe(true);
  expect((await db.beats.get(beat.id))?.status).toBe('Published');
  expect((await db.beats.get(beat.id))?.actualDate).toBe('');
});
it('deduplicates terminal native callbacks and preserves all source records when a beat is removed', async () => {
  const { beat, audio, art, release } = await prepared();
  const timestamp = new Date().toISOString();
  const job: RenderJob = {
    id: crypto.randomUUID(),
    attempt: 1,
    request: {
      beatId: beat.id,
      releaseId: release.id,
      audioId: audio.id,
      artworkId: art.id,
      metadata: release.metadata,
    },
    audio,
    artwork: art,
    state: 'Cancelled',
    progress: 0.1,
    createdAt: timestamp,
    updatedAt: timestamp,
    error: 'Cancelled',
    outputBytes: null,
    outputSha256: null,
  };
  const snapshot: NativeSnapshot = {
    catalog: { media: [audio, art], jobs: [job], exports: [] },
    mediaUrls: {},
    outputUrls: {},
    activeJobId: null,
    toolsReady: true,
  };
  await syncNative(snapshot);
  await syncNative(snapshot);
  expect(await db.events.where('type').equals('render_cancelled').count()).toBe(1);
  await removeBeat(beat.id);
  expect((await db.beats.get(beat.id))?.deletedAt).toBeTruthy();
  expect(validateBackup(await exportBackup()).jobs).toHaveLength(1);
});
it('rejects unknown schemas, malformed records, duplicate IDs and missing source references before writes', async () => {
  await prepared();
  const backup = await exportBackup();
  for (const broken of [
    { ...backup, schemaVersion: 999 },
    { ...backup, media: [backup.media[0], backup.media[0]] },
    { ...backup, media: [] },
    { ...backup, media: [{ ...backup.media[0], bytes: -1 }, backup.media[1]] },
  ]) {
    await expect(restoreBackup(broken, 'replace')).rejects.toThrow();
    expect(await db.beats.count()).toBe(1);
  }
});
it('rolls back related media and event writes on quota failure', async () => {
  const beat = { ...newBeat(), title: 'Safe' };
  await saveBeat(beat);
  const write = vi
    .spyOn(db.events, 'put')
    .mockRejectedValueOnce(new DOMException('Quota', 'QuotaExceededError'));
  await expect(attachMedia(beat.id, media('audio'))).rejects.toMatchObject({
    name: 'QuotaExceededError',
  });
  write.mockRestore();
  expect(await db.media.count()).toBe(0);
  expect((await db.beats.get(beat.id))?.audioId).toBeUndefined();
});
it('uses a complete template provider and reports future network publishing as unsupported', async () => {
  expect(
    await templateProvider.generate({ ...newBeat(), title: 'Local' }, defaults, starters),
  ).toMatchObject({ title: expect.stringContaining('Local') });
  const controller = new AbortController();
  controller.abort();
  await expect(
    templateProvider.generate(newBeat(), defaults, starters, controller.signal),
  ).rejects.toThrow();
  expect(
    await manualPublisher.publish(generate(newBeat(), defaults, starters), () => {}),
  ).toMatchObject({ supported: false, error: { code: 'UNSUPPORTED' } });
});
