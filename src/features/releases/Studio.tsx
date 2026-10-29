import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Clapperboard,
  FileAudio,
  ImagePlus,
  Play,
  Download,
  FolderOpen,
  Plus,
  RefreshCw,
  Square,
} from 'lucide-react';
import { useData } from '../../app/context';
import { db } from '../../db';
import { PageHeader, Field, Empty, ErrorMessage, errorText } from '../../components/ui';
import { generate } from '../../lib/metadata';
import {
  attachMedia,
  createRelease,
  refreshRelease,
  setReady,
  confirmManualPublication,
  isActive,
  releaseCondition,
  outdated,
  nativeMediaPath,
  nativeOutputPath,
} from '../../lib/releases';
import { isDesktop, platform } from '../../platform';
import { useNative } from '../../platform/NativeProvider';
import type { ManagedMedia, RenderJob } from '../../types/desktop';
export default function Studio() {
  const { beats, templates, settings, notify } = useData();
  const { snapshot, error: nativeError, refresh } = useNative();
  const [params] = useSearchParams();
  const [beatId, setBeatId] = useState(params.get('beat') ?? ''),
    [releaseId, setReleaseId] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [url, setUrl] = useState('');
  const releases = useLiveQuery(() => db.releases.toArray(), [], []),
    jobs = useLiveQuery(() => db.jobs.toArray(), [], []),
    exports = useLiveQuery(() => db.exports.toArray(), [], []),
    media = useLiveQuery(() => db.media.toArray(), [], []);
  const beat = beats.find((b) => b.id === beatId),
    drafts = releases
      .filter((r) => r.beatId === beatId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const release = drafts.find((r) => r.id === releaseId) ?? drafts[0];
  const attempts = jobs
    .filter((j) => j.request.releaseId === release?.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const currentMetadata = beat ? (beat.metadata ?? generate(beat, settings, templates)) : null;
  const differs = !!(
    release &&
    beat &&
    (release.audioId !== (beat.audioId ?? '') ||
      release.artworkId !== (beat.artworkId ?? '') ||
      (beat.metadata && JSON.stringify(beat.metadata) !== JSON.stringify(release.metadata)))
  );
  async function action(operation: () => Promise<void>) {
    setError('');
    setBusy(true);
    try {
      await operation();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function imported(records: ManagedMedia[], target: string) {
    for (const record of records) await attachMedia(target, record);
    await refresh();
    notify('Managed media imported; original files were not modified');
  }
  useEffect(() => {
    if (!isDesktop()) return;
    let stopped = false;
    let unlisten: (() => void) | undefined;
    void platform
      .onDrop((token) => {
        if (stopped) return;
        if (!beatId) {
          setError('Select a beat before dropping files.');
          return;
        }
        void action(async () => imported(await platform.importDrop(token), beatId));
      })
      .then((unsub) => {
        if (stopped) unsub();
        else unlisten = unsub;
      })
      .catch((e) => setError(errorText(e)));
    return () => {
      stopped = true;
      unlisten?.();
    };
  }, [beatId]);
  const desktop = isDesktop();
  function mediaCard(kind: 'audio' | 'artwork') {
    const record = media.find((m) => m.id === (kind === 'audio' ? beat?.audioId : beat?.artworkId));
    const path = nativeMediaPath(record, snapshot);
    return (
      <section className="panel form-panel">
        <h2>
          {kind === 'audio' ? <FileAudio size={18} /> : <ImagePlus size={18} />}{' '}
          {kind === 'audio' ? 'Audio source' : 'Artwork source'}
        </h2>
        {record ? (
          <>
            <strong>{record.originalName}</strong>
            <p className="muted small-text">
              {record.mime} · {(record.bytes / 1024 / 1024).toFixed(2)} MB ·{' '}
              {record.managed ? 'Managed copy' : 'External reference'}
            </p>
            <p className="muted small-text">
              {record.kind === 'audio'
                ? `${record.duration?.toFixed(2)} seconds`
                : `${record.width} × ${record.height}px`}{' '}
              · record v{record.version} · copy {record.id.slice(0, 8)}
            </p>
            {path ? (
              kind === 'audio' ? (
                <audio
                  key={record.id}
                  controls
                  preload="metadata"
                  src={platform.assetUrl(path)}
                  onError={() =>
                    setError(
                      'Audio could not be played. Verify the managed copy and Windows media components.',
                    )
                  }
                />
              ) : (
                <img
                  className="artwork-preview"
                  src={platform.assetUrl(path)}
                  alt={`Artwork for ${beat?.title}`}
                  onError={() =>
                    setError(
                      'Artwork copy cannot be displayed; reimport it from the original file.',
                    )
                  }
                />
              )
            ) : (
              <div className="info-box">
                {desktop
                  ? 'Managed copy is missing or unavailable. Reimport the original to relink this beat.'
                  : 'This backup contains a media reference only. Open the Windows app and restore a portable backup or reimport the original.'}
              </div>
            )}
          </>
        ) : (
          <p className="muted">
            {kind === 'audio'
              ? 'Choose an MP3 or PCM WAV, up to 300 MB / 120 minutes.'
              : 'Choose PNG or JPEG, up to 20 MB / 32 megapixels.'}
          </p>
        )}
        <button
          className="button wide"
          disabled={!desktop || !beat || busy}
          onClick={() =>
            void action(async () => {
              const record = await platform.pickMedia(kind);
              if (record && beat) await imported([record], beat.id);
            })
          }
        >
          {record ? 'Replace / reimport' : 'Import'} {kind}
        </button>
      </section>
    );
  }
  async function exportAttempt(job: RenderJob, videoOnly = false) {
    await action(async () => {
      const record = await (videoOnly
        ? platform.saveVideo(job.id)
        : platform.exportRelease(job.id));
      if (!record) {
        notify('Export cancelled; no export was recorded');
        return;
      }
      await refresh();
      notify(
        videoOnly
          ? 'MP4 written successfully'
          : 'Release folder written: MP4, JSON, UTF-8 text and provenance manifest',
      );
    });
  }
  return (
    <>
      <PageHeader
        eyebrow="FROM FINISHED BEAT TO RELEASE FILES"
        title="Release studio"
        description="Import, prepare, render, review and export. Publication is always manual."
      />
      {!desktop && (
        <div className="info-box">
          <strong>Windows desktop tools</strong>
          <p>
            Your web catalog, metadata and backups still work offline. Managed file import, native
            playback, MP4 rendering and portable media archives require the Windows app. No browser
            FFmpeg is downloaded.
          </p>
        </div>
      )}
      <ErrorMessage error={error || nativeError} />
      <div className="toolbar">
        <Field label="Release beat">
          <select
            value={beatId}
            onChange={(e) => {
              setBeatId(e.target.value);
              setReleaseId('');
              setError('');
            }}
          >
            <option value="">Choose a beat</option>
            {beats.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
        </Field>
        {beat && (
          <>
            <Link className="button" to={`/beats/${beat.id}`}>
              Beat details
            </Link>
            <Link className="button" to={`/metadata?beat=${beat.id}`}>
              Edit metadata
            </Link>
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  if (currentMetadata) {
                    const r = await createRelease(beat, currentMetadata);
                    setReleaseId(r.id);
                    notify('Release draft created');
                  }
                })
              }
            >
              <Plus size={16} /> New release draft
            </button>
          </>
        )}
      </div>
      {beat ? (
        <>
          <div className="release-media-grid">
            {mediaCard('audio')}
            {mediaCard('artwork')}
          </div>
          {desktop && (
            <p className="footnote">
              You can also drop one audio file and/or artwork onto this screen. Copies stay in
              application storage.
            </p>
          )}
          {release ? (
            <>
              <section className="panel form-panel">
                <div className="release-heading">
                  <h2>
                    <Clapperboard size={18} /> Release preparation
                  </h2>
                  <div className="release-statuses">
                    <span className="badge">Preparation: {release.ready ? 'Ready' : 'Draft'}</span>
                    <span className="badge">{releaseCondition(release, jobs, exports)}</span>
                  </div>
                </div>
                <Field label="Release draft">
                  <select value={release.id} onChange={(e) => setReleaseId(e.target.value)}>
                    {drafts.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} · {new Date(r.createdAt).toLocaleString()}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="info-box">
                  This is a release snapshot, separate from your production status. Metadata and
                  media used by older renders are retained. Default render: 1920×1080, 30 FPS,
                  H.264/AAC, fit with padding.
                </div>
                {differs && (
                  <p className="error">
                    The beat's sources or saved metadata changed. Refresh this draft before a new
                    render; earlier outputs keep their original provenance.
                  </p>
                )}
                <details>
                  <summary>Review metadata snapshot</summary>
                  <pre className="preview-text">
                    {release.metadata.title}
                    {'\n\n'}
                    {release.metadata.description}
                    {'\n\n'}
                    {release.metadata.tags}
                    {'\n'}
                    {release.metadata.hashtags}
                    {'\n'}
                    {release.metadata.pinnedComment}
                  </pre>
                </details>
                <div className="release-actions">
                  <button
                    className="button"
                    disabled={busy || attempts.some(isActive)}
                    onClick={() =>
                      void action(async () => {
                        if (
                          currentMetadata &&
                          confirm(
                            'Refresh this draft from the current beat and saved metadata? Its existing snapshot will change; render history stays intact.',
                          )
                        )
                          await refreshRelease(release, beat, currentMetadata);
                      })
                    }
                  >
                    <RefreshCw size={15} /> Refresh snapshot
                  </button>
                  <button
                    className="button"
                    disabled={busy || attempts.some(isActive)}
                    onClick={() => void action(() => setReady(release, !release.ready))}
                  >
                    {release.ready ? 'Return to Draft' : 'Mark Ready'}
                  </button>
                  <button
                    className="button primary"
                    disabled={
                      !desktop ||
                      !snapshot?.toolsReady ||
                      busy ||
                      !release.ready ||
                      differs ||
                      !!snapshot.activeJobId ||
                      !nativeMediaPath(
                        media.find((m) => m.id === release.audioId),
                        snapshot,
                      ) ||
                      !nativeMediaPath(
                        media.find((m) => m.id === release.artworkId),
                        snapshot,
                      )
                    }
                    onClick={() =>
                      void action(async () => {
                        await platform.startRender({
                          beatId: release.beatId,
                          releaseId: release.id,
                          audioId: release.audioId,
                          artworkId: release.artworkId,
                          metadata: release.metadata,
                        });
                        await refresh();
                      })
                    }
                  >
                    <Play size={16} /> Render new MP4 attempt
                  </button>
                </div>
                {desktop && snapshot && !snapshot.toolsReady && (
                  <p className="error">
                    Verified bundled media tools are missing. Reinstall a correctly packaged desktop
                    build.
                  </p>
                )}
              </section>
              <div className="render-history">
                <h2>Render attempts & outputs</h2>
                {attempts.length ? (
                  attempts.map((job) => {
                    const available = nativeOutputPath(job, snapshot);
                    return (
                      <article className="panel form-panel" key={job.id}>
                        <div className="release-heading">
                          <h2>
                            Attempt {job.attempt} · {job.state}
                          </h2>
                          <small className="muted">
                            {new Date(job.createdAt).toLocaleString()}
                          </small>
                        </div>
                        {isActive(job) && (
                          <>
                            <progress
                              max={1}
                              value={job.progress}
                              aria-label={`Render progress attempt ${job.attempt}`}
                            />
                            <p className="muted small-text">
                              {job.state} · {Math.floor(job.progress * 100)}%
                            </p>
                            <button
                              className="button"
                              disabled={!desktop || busy}
                              onClick={() => void action(() => platform.cancelRender(job.id))}
                            >
                              <Square size={14} /> Cancel actual process
                            </button>
                          </>
                        )}
                        {job.error && <p className="error">{job.error}</p>}
                        <p className="muted small-text">
                          Source versions: {job.audio.originalName} / {job.artwork.originalName}.
                          Snapshot captured {new Date(job.createdAt).toLocaleString()}.
                        </p>
                        {(outdated(release, job) || differs) && (
                          <p className="info-box">
                            Outdated output: current draft or beat inputs differ from this render's
                            snapshot.
                          </p>
                        )}
                        {job.state === 'Completed' && (
                          <>
                            {available ? (
                              <video
                                key={job.id}
                                controls
                                preload="metadata"
                                src={platform.assetUrl(available)}
                                className="video-preview"
                                onError={() =>
                                  setError(
                                    'Video playback is unavailable. The validated MP4 may require Windows media components; try exporting and playing it locally.',
                                  )
                                }
                              />
                            ) : (
                              <p className="info-box">
                                Generated MP4 is not available in this installation. Metadata-only
                                and portable backups exclude generated video bytes. Re-render to
                                create a new output.
                              </p>
                            )}
                            <div className="release-actions">
                              <button
                                className="button primary"
                                disabled={!desktop || !available || busy}
                                onClick={() => void exportAttempt(job)}
                              >
                                <Download size={16} /> Export release folder
                              </button>
                              <button
                                className="button"
                                disabled={!desktop || !available || busy}
                                onClick={() => void exportAttempt(job, true)}
                              >
                                Save MP4 as…
                              </button>
                              <button
                                className="button"
                                disabled={!desktop || !available || busy}
                                onClick={() => void action(() => platform.openOutputFolder(job.id))}
                              >
                                <FolderOpen size={16} /> Open output folder
                              </button>
                            </div>
                            <p className="small-text muted">
                              Successful exports for this attempt:{' '}
                              {exports.filter((e) => e.jobId === job.id).length}. Cancelling a
                              picker is not an export.
                            </p>
                          </>
                        )}
                      </article>
                    );
                  })
                ) : (
                  <Empty title="No renders yet">
                    <p>Import both sources, review the snapshot, then mark the draft Ready.</p>
                  </Empty>
                )}
              </div>
              <section className="panel form-panel">
                <h2>Manual publication confirmation</h2>
                <p className="muted">
                  XASMA does not authenticate, upload or publish to YouTube. This records your
                  report only, not a verified platform upload time.
                </p>
                <Field label="Published video URL (optional)">
                  <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
                </Field>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      if (
                        confirm(
                          'Confirm you manually published this release? No upload will be performed.',
                        )
                      ) {
                        await confirmManualPublication(release, url);
                        notify('Manual publication reported');
                      }
                    })
                  }
                >
                  Confirm manually published
                </button>
                {release.manualPublication && (
                  <p className="small-text muted">
                    User confirmed{' '}
                    {new Date(release.manualPublication.confirmedAt).toLocaleString()}.
                  </p>
                )}
              </section>
            </>
          ) : (
            <div className="panel">
              <Empty title="Prepare a release">
                <p>
                  Create a draft to snapshot your metadata and media independently of production
                  status.
                </p>
              </Empty>
            </div>
          )}
        </>
      ) : (
        <div className="panel">
          <Empty title="Choose a beat to prepare its release">
            <p>Existing web beats can be transferred with a v1 JSON backup in Settings.</p>
          </Empty>
        </div>
      )}
      <p className="footnote">
        Template-based metadata by default. Optional local AI is not connected. No external
        publishing services.
      </p>
    </>
  );
}
