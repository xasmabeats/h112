import { useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { isDesktop, platform } from '../../platform';
import { useNative } from '../../platform/NativeProvider';
import { exportBackup, restoreBackup, validateBackup, type Backup } from '../../lib/backup';
import { useData } from '../../app/context';
import type { PreparedRestore } from '../../types/desktop';
import { ErrorMessage, Field, errorText } from '../../components/ui';
export function DesktopBackups() {
  const { notify } = useData();
  const { refresh } = useNative();
  const [stage, setStage] = useState<PreparedRestore | null>(null),
    [backup, setBackup] = useState<Backup | null>(null),
    [mode, setMode] = useState<'merge' | 'replace'>('merge'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function action(f: () => Promise<void>) {
    setError('');
    setBusy(true);
    try {
      await f();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (stage) await platform.finishRestore(stage.transactionId);
    setStage(null);
    setBackup(null);
  }
  return (
    <section className="panel form-panel">
      <h2>Portable desktop backups</h2>
      <p className="muted small-text">
        ZIP includes schema-v2 database metadata and every managed audio/artwork file listed in it.
        Generated MP4 bytes are excluded. Missing or changed media aborts the backup rather than
        claiming it is complete.
      </p>
      <ErrorMessage error={error} />
      <button
        className="button wide"
        disabled={!isDesktop() || busy || !!stage}
        onClick={() =>
          void action(async () => {
            const current = validateBackup(await exportBackup());
            const saved = await platform.portableBackup(JSON.stringify(current));
            notify(
              saved
                ? 'Portable archive written, including managed audio and artwork'
                : 'Backup Save As cancelled; no backup was created',
            );
          })
        }
      >
        <Download size={16} /> Save portable ZIP
      </button>
      <button
        className="button wide"
        disabled={!isDesktop() || busy || !!stage}
        onClick={() =>
          void action(async () => {
            const prepared = await platform.prepareRestore();
            if (!prepared) return;
            try {
              const validated = validateBackup(JSON.parse(prepared.metadataJson));
              setStage(prepared);
              setBackup(validated);
            } catch (e) {
              await platform.finishRestore(prepared.transactionId);
              throw e;
            }
          })
        }
      >
        <Upload size={16} /> Inspect portable ZIP
      </button>
      {!isDesktop() && (
        <p className="info-box">
          Portable media archives require the Windows app. This web version accepts genuine v1 and
          v2 metadata-only JSON backups.
        </p>
      )}
      {stage && backup && (
        <div className="import-preview">
          <h3>Validated portable archive</h3>
          <p>
            {backup.beats.length} beats · {backup.releases.length} releases · {backup.jobs.length}{' '}
            attempts · {stage.mediaCount} files included
          </p>
          <Field label="Portable restore mode">
            <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="merge">Merge — preserve existing IDs</option>
              <option value="replace">Replace database — retain a recovery snapshot</option>
            </select>
          </Field>
          <p className="small-text muted">
            Files are validated in staging first, then promoted before the database transaction.
            Existing managed files are never overwritten with different content or deleted during
            restore. An interrupted restore may leave extra safe copies, not dangling database
            references.
          </p>
          <button
            className="button primary wide"
            disabled={busy}
            onClick={() =>
              void action(async () => {
                if (
                  !confirm(
                    mode === 'replace'
                      ? 'Replace the current database with this validated portable archive? A local recovery JSON is saved first; existing managed files are retained.'
                      : 'Merge this validated portable archive? Existing record IDs and preferences are kept.',
                  )
                )
                  return;
                if (mode === 'replace')
                  await platform.createRecovery(JSON.stringify(await exportBackup()));
                await platform.promoteRestore(stage.transactionId);
                await restoreBackup(backup, mode);
                await platform.finishRestore(stage.transactionId);
                setStage(null);
                setBackup(null);
                await refresh();
                notify(
                  'Portable backup restored. Generated videos must be re-rendered if not already available locally.',
                );
              })
            }
          >
            Confirm portable restore
          </button>
          <button className="text-button" disabled={busy} onClick={() => void action(cancel)}>
            Cancel and remove staging files
          </button>
        </div>
      )}
    </section>
  );
}
