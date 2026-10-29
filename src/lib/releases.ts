import { db } from '../db';
import type { Beat, Metadata } from '../types';
import type {
  ExportRecord,
  HistoryEvent,
  ManagedMedia,
  NativeSnapshot,
  ReleaseDraft,
  RenderJob,
} from '../types/desktop';
export function isActive(job: RenderJob) {
  return ['Probing', 'Preparing', 'Encoding', 'Validating'].includes(job.state);
}
export function releaseCondition(
  release: ReleaseDraft,
  jobs: RenderJob[],
  exports: ExportRecord[],
) {
  if (release.manualPublication) return 'Manually Published';
  const attempts = jobs
    .filter((j) => j.request.releaseId === release.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (attempts.some(isActive)) return 'Rendering';
  const latest = attempts[0];
  if (latest?.state === 'Completed')
    return exports.some((e) => e.jobId === latest.id) ? 'Exported' : 'Rendered';
  if (latest?.state === 'Cancelled') return 'Cancelled';
  if (latest?.state === 'Failed' || latest?.state === 'Interrupted') return 'Failed';
  return release.ready ? 'Ready' : 'Draft';
}
export function outdated(release: ReleaseDraft, job: RenderJob) {
  return (
    release.audioId !== job.request.audioId ||
    release.artworkId !== job.request.artworkId ||
    JSON.stringify(release.metadata) !== JSON.stringify(job.request.metadata)
  );
}
export async function event(
  type: string,
  beatId: string,
  detail: string,
  options: Partial<HistoryEvent> = {},
) {
  const row: HistoryEvent = {
    ...options,
    id: options.id ?? crypto.randomUUID(),
    beatId,
    type,
    detail: detail.slice(0, 4096),
    at: options.at ?? new Date().toISOString(),
  };
  await db.events.put(row);
}
export async function attachMedia(beatId: string, media: ManagedMedia) {
  await db.transaction('rw', db.beats, db.media, db.events, async () => {
    const beat = await db.beats.get(beatId);
    if (!beat)
      throw new Error('Beat was deleted. Imported media was kept safely in desktop storage.');
    await db.media.put(media);
    const key = media.kind === 'audio' ? 'audioId' : 'artworkId';
    await db.beats.update(beatId, { [key]: media.id, updatedAt: new Date().toISOString() });
    await event('media_imported', beatId, `${media.originalName} • ${media.kind} • managed copy`, {
      status: media.kind,
    });
  });
}
export async function createRelease(beat: Beat, metadata: Metadata) {
  const at = new Date().toISOString();
  const release: ReleaseDraft = {
    id: crypto.randomUUID(),
    beatId: beat.id,
    name: beat.title,
    audioId: beat.audioId ?? '',
    artworkId: beat.artworkId ?? '',
    metadata: structuredClone(metadata),
    ready: false,
    createdAt: at,
    updatedAt: at,
    manualPublication: null,
  };
  await db.transaction('rw', db.releases, db.events, async () => {
    await db.releases.add(release);
    await event('release_created', beat.id, 'Release draft created', {
      releaseId: release.id,
      status: 'Draft',
    });
  });
  return release;
}
export async function refreshRelease(release: ReleaseDraft, beat: Beat, metadata: Metadata) {
  await db.transaction('rw', db.releases, db.events, async () => {
    await db.releases.put({
      ...release,
      audioId: beat.audioId ?? '',
      artworkId: beat.artworkId ?? '',
      metadata: structuredClone(metadata),
      ready: false,
      updatedAt: new Date().toISOString(),
    });
    await event(
      'release_updated',
      beat.id,
      'Draft sources refreshed; previous render attempts remain in history',
      { releaseId: release.id, status: 'Draft' },
    );
  });
}
export async function setReady(release: ReleaseDraft, ready: boolean) {
  if (ready && (!release.audioId || !release.artworkId || !release.metadata.title.trim()))
    throw new Error('Audio, artwork and a metadata title are required before Ready.');
  await db.transaction('rw', db.releases, db.events, db.jobs, async () => {
    const active = await db.jobs
      .where('request.releaseId')
      .equals(release.id)
      .filter(isActive)
      .count();
    if (active) throw new Error('Cancel or finish the active render first.');
    await db.releases.update(release.id, { ready, updatedAt: new Date().toISOString() });
    await event(
      'release_preparation',
      release.beatId,
      ready ? 'Release marked Ready' : 'Returned to draft',
      { releaseId: release.id, status: ready ? 'Ready' : 'Draft' },
    );
  });
}
export async function confirmManualPublication(release: ReleaseDraft, url: string) {
  if (url) {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol))
      throw new Error('Enter an HTTP/HTTPS URL or leave it blank.');
  }
  await db.transaction('rw', db.releases, db.beats, db.events, async () => {
    const beat = await db.beats.get(release.beatId);
    if (!beat) throw new Error('Beat not found');
    await db.releases.update(release.id, {
      manualPublication: { confirmedAt: new Date().toISOString(), userReported: true, url },
      updatedAt: new Date().toISOString(),
    });
    await db.beats.update(beat.id, {
      status: 'Published',
      youtubeUrl: url || beat.youtubeUrl,
      updatedAt: new Date().toISOString(),
    });
    await event(
      'manual_publication',
      beat.id,
      'User reported manual publication. No upload or platform timestamp was verified.',
      { releaseId: release.id, status: 'Manually Published' },
    );
  });
}
export async function syncNative(snapshot: NativeSnapshot) {
  await db.transaction(
    'rw',
    [db.media, db.jobs, db.exports, db.events, db.releases, db.beats],
    async () => {
      for (const job of snapshot.catalog.jobs) {
        if (
          !(await db.releases.get(job.request.releaseId)) ||
          !(await db.beats.get(job.request.beatId))
        )
          continue;
        if (!(await db.events.get(`render:${job.id}:start`)))
          await event('render_started', job.request.beatId, `Attempt ${job.attempt} started`, {
            id: `render:${job.id}:start`,
            releaseId: job.request.releaseId,
            jobId: job.id,
            status: 'Probing',
            at: job.createdAt,
          });
        const previous = await db.jobs.get(job.id);
        if (previous?.updatedAt === job.updatedAt) continue;
        await db.jobs.put(job);
        if (previous?.state !== job.state)
          await event(
            `render_${job.state.toLowerCase()}`,
            job.request.beatId,
            job.error ?? `Attempt ${job.attempt}: ${job.state}`,
            {
              id: `render:${job.id}:${job.state}`,
              releaseId: job.request.releaseId,
              jobId: job.id,
              status: job.state,
              at: job.updatedAt,
            },
          );
      }
      for (const record of snapshot.catalog.exports) {
        if (!(await db.jobs.get(record.jobId)) || (await db.exports.get(record.id))) continue;
        await db.exports.put(record);
        await event(
          'export_completed',
          record.beatId,
          `${record.kind}: ${record.destinationName}`,
          {
            id: `export:${record.id}`,
            releaseId: record.releaseId,
            jobId: record.jobId,
            status: 'Exported',
            at: record.createdAt,
          },
        );
      }
    },
  );
}
