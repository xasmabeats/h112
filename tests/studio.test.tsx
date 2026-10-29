// Targeted adapter-failure UI tests. These do not claim to execute a Windows GUI.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Studio from '../src/features/releases/Studio';
import { DataContext } from '../src/app/context';
import { db, defaults, initialize, newBeat, saveBeat, starters } from '../src/db';
import type { NativeSnapshot, ManagedMedia, RenderJob, ReleaseDraft } from '../src/types/desktop';
const native = vi.hoisted(() => ({
  enabled: true,
  snapshot: null as NativeSnapshot | null,
  refresh: vi.fn(async () => {}),
  saveVideo: vi.fn(async () => null),
  exportRelease: vi.fn(async () => null),
}));
vi.mock('../src/platform', () => ({
  isDesktop: () => native.enabled,
  platform: {
    assetUrl: () => 'blob:synthetic-fixture',
    saveVideo: native.saveVideo,
    exportRelease: native.exportRelease,
    onDrop: async () => () => {},
  },
}));
vi.mock('../src/platform/NativeProvider', () => ({
  useNative: () => ({ snapshot: native.snapshot, error: '', refresh: native.refresh }),
}));
beforeEach(async () => {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear();
  });
  await initialize();
  native.enabled = true;
  vi.clearAllMocks();
});
afterEach(cleanup);
async function setup() {
  const at = new Date().toISOString(),
    metadata = {
      title: 'Manual studio title',
      description: 'Do not replace me',
      tags: 'drill',
      hashtags: '#drill',
      filename: 'test.wav',
      pinnedComment: '',
    };
  const make = (kind: 'audio' | 'artwork'): ManagedMedia => ({
    id: crypto.randomUUID(),
    kind,
    originalName: kind + '.fixture',
    format: kind === 'audio' ? 'mp3' : 'png',
    mime: kind === 'audio' ? 'audio/mpeg' : 'image/png',
    bytes: 1024,
    duration: kind === 'audio' ? 2 : null,
    width: kind === 'artwork' ? 192 : null,
    height: kind === 'artwork' ? 192 : null,
    sha256: 'a'.repeat(64),
    version: 1,
    createdAt: at,
    managed: true,
  });
  const audio = make('audio'),
    art = make('artwork');
  const beat = {
    ...newBeat(),
    title: 'Studio fixture',
    audioId: audio.id,
    artworkId: art.id,
    metadata,
  };
  await saveBeat(beat);
  await db.media.bulkAdd([audio, art]);
  const release: ReleaseDraft = {
    id: crypto.randomUUID(),
    beatId: beat.id,
    name: beat.title,
    audioId: audio.id,
    artworkId: art.id,
    metadata,
    ready: true,
    createdAt: at,
    updatedAt: at,
    manualPublication: null,
  };
  await db.releases.add(release);
  const job: RenderJob = {
    id: crypto.randomUUID(),
    attempt: 1,
    request: {
      beatId: beat.id,
      releaseId: release.id,
      audioId: audio.id,
      artworkId: art.id,
      metadata,
    },
    audio,
    artwork: art,
    state: 'Completed',
    progress: 1,
    createdAt: at,
    updatedAt: at,
    error: null,
    outputBytes: 2048,
    outputSha256: 'b'.repeat(64),
  };
  await db.jobs.add(job);
  native.snapshot = {
    catalog: { media: [audio, art], jobs: [job], exports: [] },
    mediaUrls: { [audio.id]: 'audio', [art.id]: 'art' },
    outputUrls: { [job.id]: 'video' },
    activeJobId: null,
    toolsReady: true,
  };
  const notify = vi.fn();
  render(
    <MemoryRouter initialEntries={['/studio?beat=' + beat.id]}>
      <DataContext.Provider
        value={{ beats: [beat], templates: starters, settings: defaults, notify }}
      >
        <Studio />
      </DataContext.Provider>
    </MemoryRouter>,
  );
  await screen.findByRole('button', { name: 'Save MP4 as…', exact: true });
  return { beat, job, notify };
}
it('does not record or claim an export when native Save As is cancelled', async () => {
  const { beat, job, notify } = await setup();
  fireEvent.click(screen.getByRole('button', { name: 'Save MP4 as…', exact: true }));
  await waitFor(() => expect(native.saveVideo).toHaveBeenCalledWith(job.id));
  await waitFor(() =>
    expect(notify).toHaveBeenCalledWith('Export cancelled; no export was recorded'),
  );
  expect(await db.exports.count()).toBe(0);
  expect((await db.beats.get(beat.id))?.status).toBe('Idea');
  expect((await db.beats.get(beat.id))?.metadata?.description).toBe('Do not replace me');
});
it('shows the actual native export error and leaves export history unchanged', async () => {
  native.exportRelease.mockRejectedValueOnce(new Error('Destination disk is full'));
  const { notify } = await setup();
  fireEvent.click(screen.getByRole('button', { name: 'Export release folder', exact: true }));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('Destination disk is full'),
  );
  expect(await db.exports.count()).toBe(0);
  expect(notify).not.toHaveBeenCalled();
});
it('keeps native render/import/export actions disabled in the web target', async () => {
  native.enabled = false;
  await setup();
  expect(
    screen.getByRole('button', { name: 'Replace / reimport audio', exact: true }),
  ).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Render new MP4 attempt' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save MP4 as…', exact: true })).toBeDisabled();
  expect(native.saveVideo).not.toHaveBeenCalled();
});
