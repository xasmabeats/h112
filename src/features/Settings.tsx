import { useEffect, useState } from 'react';
import { Save, Download, Upload, HardDrive, ShieldCheck } from 'lucide-react';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useData } from '../app/context';
import { db } from '../db';
import { exportBackup, validateBackup, restoreBackup, download, type Backup } from '../lib/backup';
import { PageHeader, Field, ErrorMessage, errorText } from '../components/ui';
export default function Settings() {
  const { settings, templates, notify } = useData();
  const [form, setForm] = useState(settings),
    [error, setError] = useState(''),
    [preview, setPreview] = useState<Backup | null>(null),
    [mode, setMode] = useState<'merge' | 'replace'>('merge'),
    [busy, setBusy] = useState(false),
    [storage, setStorage] = useState<StorageEstimate | null>(null),
    [persistent, setPersistent] = useState(false);
  useUnsavedChanges(
    JSON.stringify(form) !== JSON.stringify(settings),
    'Discard your unsaved preferences?',
  );
  useEffect(() => {
    setForm(settings);
  }, [settings]);
  useEffect(() => {
    void navigator.storage?.estimate().then(setStorage);
    void navigator.storage?.persisted?.().then(setPersistent);
  }, []);
  function update(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await db.settings.put(form);
      notify('Preferences saved');
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function readFile(file?: File) {
    setPreview(null);
    setError('');
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setError('Backup is too large. Maximum import size is 25 MB.');
      return;
    }
    try {
      setPreview(validateBackup(JSON.parse(await file.text())));
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function restore() {
    if (!preview) return;
    if (
      !confirm(
        mode === 'replace'
          ? 'Replace ALL current beats, templates, and settings? Export a backup first.'
          : 'Merge backup? Existing record IDs and current preferences will be kept.',
      )
    )
      return;
    setBusy(true);
    try {
      await restoreBackup(preview, mode);
      setPreview(null);
      notify('Backup restored');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const mb = (n = 0) => (n / 1024 / 1024).toFixed(1);
  return (
    <>
      <PageHeader
        eyebrow="YOUR STUDIO, YOUR RULES"
        title="Settings & backups"
        description="Personalize your workflow and protect your catalog."
      />
      <ErrorMessage error={error} />
      <div className="settings-layout">
        <form className="panel form-panel" onSubmit={save}>
          <h2>Studio preferences</h2>
          <div className="form-grid">
            <Field label="Producer display name">
              <input
                maxLength={100}
                value={form.producer}
                onChange={(e) => update('producer', e.target.value)}
              />
            </Field>
            <Field label="Default genre">
              <input
                maxLength={100}
                value={form.defaultGenre}
                onChange={(e) => update('defaultGenre', e.target.value)}
              />
            </Field>
            <Field label="Default title template">
              <select
                value={form.defaultTemplate}
                onChange={(e) => update('defaultTemplate', e.target.value)}
              >
                <option value="">Use default title template</option>
                {templates
                  .filter((t) => t.kind === 'title')
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field
              label="Preferred release schedule"
              hint="A planning note, not automated scheduling."
            >
              <input
                placeholder="e.g. Tuesdays and Fridays, 18:00"
                value={form.schedule}
                onChange={(e) => update('schedule', e.target.value)}
              />
            </Field>
            <Field label="Contact details (optional)">
              <input value={form.contact} onChange={(e) => update('contact', e.target.value)} />
            </Field>
            <Field label="Layout density">
              <select
                value={form.appearance}
                onChange={(e) => update('appearance', e.target.value)}
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </Field>
            <div className="full">
              <Field label="Social links (optional)">
                <textarea
                  rows={3}
                  placeholder="Add only the links you want in your descriptions"
                  value={form.socials}
                  onChange={(e) => update('socials', e.target.value)}
                />
              </Field>
            </div>
            <div className="full">
              <Field
                label="Licensing text"
                hint="Use terms you have the right to offer. No license is assumed."
              >
                <textarea
                  rows={4}
                  value={form.licensing}
                  onChange={(e) => update('licensing', e.target.value)}
                />
              </Field>
              <Field label="Apply a licensing template">
                <select
                  value=""
                  onChange={(e) => {
                    const t = templates.find((t) => t.id === e.target.value);
                    if (t && (!form.licensing || confirm('Replace your licensing text?')))
                      update('licensing', t.content);
                  }}
                >
                  <option value="">Choose a saved disclaimer…</option>
                  {templates
                    .filter((t) => t.kind === 'licensing')
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </Field>
            </div>
          </div>
          <button className="button primary" type="submit">
            <Save size={16} /> Save preferences
          </button>
        </form>
        <aside>
          <section className="panel form-panel">
            <h2>
              <ShieldCheck size={18} /> Backups & restore
            </h2>
            <p className="muted">
              Your data lives in this browser on this device. Clearing browser storage can
              permanently erase it. It does not automatically sync between your iPhone and PC.
            </p>
            <button
              className="button wide"
              onClick={() =>
                void exportBackup()
                  .then((b) =>
                    download(
                      JSON.stringify(b, null, 2),
                      `xasma-backup-${new Date().toISOString().slice(0, 10)}.json`,
                    ),
                  )
                  .catch((e) => setError(errorText(e)))
              }
            >
              <Download size={16} /> Export all data
            </button>
            <label className="button wide import-button">
              <Upload size={16} /> Choose backup to import
              <input
                aria-label="Import backup file"
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  void readFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
            <p className="small-text muted">
              Portable JSON includes beats, saved metadata, templates, preferences, and artwork
              references. Audio and image binaries are not stored or included. Transfer this file
              manually between devices.
            </p>
            {preview && (
              <div className="import-preview">
                <h3>Validated backup</h3>
                <p>
                  {preview.beats.length} beats · {preview.templates.length} templates ·{' '}
                  {preview.settings.length} preference records
                </p>
                <p className="muted">Exported {new Date(preview.exportedAt).toLocaleString()}</p>
                <Field label="Import mode">
                  <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                    <option value="merge">Merge — keep existing IDs and settings</option>
                    <option value="replace">Replace — erase current data</option>
                  </select>
                </Field>
                <p className="small-text">
                  Merge skips records whose IDs already exist. Replace imports this backup exactly.
                  Neither mode writes anything until confirmed.
                </p>
                <button
                  className="button primary wide"
                  disabled={busy}
                  onClick={() => void restore()}
                >
                  {busy ? 'Restoring…' : 'Confirm import'}
                </button>
                <button className="text-button" onClick={() => setPreview(null)}>
                  Cancel
                </button>
              </div>
            )}
          </section>
          <section className="panel form-panel storage-panel">
            <h2>
              <HardDrive size={18} /> Local storage
            </h2>
            <p className="storage-number">
              {mb(storage?.usage)}{' '}
              <small>MB used{storage?.quota ? ` / ${mb(storage.quota)} MB estimated` : ''}</small>
            </p>
            <p className="muted small-text">
              {persistent
                ? 'Persistent storage is enabled. Keep exporting backups.'
                : 'Your browser may evict local data under storage pressure.'}
            </p>
            <button
              className="button wide"
              onClick={() =>
                void navigator.storage
                  ?.persist?.()
                  .then((result) => {
                    setPersistent(result);
                    notify(
                      result
                        ? 'Persistent storage enabled'
                        : 'Browser did not grant persistent storage. Keep regular backups.',
                    );
                  })
                  .catch((e) => setError(errorText(e)))
              }
            >
              Request persistent storage
            </button>
          </section>
        </aside>
      </div>
    </>
  );
}
