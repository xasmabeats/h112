import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useBlocker } from 'react-router-dom';
import { ArrowLeft, Save, FileText, Music2 } from 'lucide-react';
import { useData } from '../app/context';
import { newBeat, saveBeat, localDate } from '../db';
import { genres, statuses, type Beat } from '../types';
import { PageHeader, Field, ErrorMessage, errorText } from '../components/ui';
function validUrl(value: string) {
  if (!value) return true;
  try {
    const u = new URL(value);
    return ['https:', 'http:'].includes(u.protocol);
  } catch {
    return false;
  }
}
export default function Editor() {
  const { id } = useParams();
  const { beats, settings, notify } = useData();
  const existing = beats.find((b) => b.id === id);
  const [beat, setBeat] = useState<Beat>(() => existing ?? newBeat(settings.defaultGenre));
  const [dirty, setDirty] = useState(false),
    [error, setError] = useState(''),
    [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const blocker = useBlocker(dirty && !saving);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [dirty]);
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (confirm('Discard your unsaved beat changes?')) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker]);
  function update<K extends keyof Beat>(key: K, value: Beat[K]) {
    setBeat((b) => ({ ...b, [key]: value }));
    setDirty(true);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!validUrl(beat.youtubeUrl)) {
      setError('Enter a valid HTTP or HTTPS YouTube URL.');
      return;
    }
    if (
      beat.status === 'Published' &&
      existing?.status !== 'Published' &&
      !confirm('Confirm this beat has been published?')
    )
      return;
    setSaving(true);
    try {
      await saveBeat({
        ...beat,
        actualDate:
          beat.status === 'Published' ? beat.actualDate || localDate(new Date()) : beat.actualDate,
      });
      setDirty(false);
      notify('Beat saved');
      void navigate('/beats');
    } catch (e) {
      setError(errorText(e));
      setSaving(false);
    }
  }
  if (id && id !== 'new' && !existing)
    return (
      <>
        <PageHeader
          eyebrow="BEAT EDITOR"
          title="Beat not found"
          description="It may have been deleted or belongs to another browser."
        />
        <Link to="/beats" className="button">
          Back to library
        </Link>
      </>
    );
  return (
    <>
      <Link to="/beats" className="back-link">
        <ArrowLeft size={15} /> Beat library
      </Link>
      <PageHeader
        eyebrow="THE WORKSPACE"
        title={existing ? 'Edit beat' : 'Create a beat'}
        description="Capture the details. Shape the release."
        actions={
          existing && (
            <>
              <Link className="button" to={`/studio?beat=${beat.id}`}>
                Release studio
              </Link>
              <Link className="button" to={`/metadata?beat=${beat.id}`}>
                <FileText size={16} /> Generate metadata
              </Link>
            </>
          )
        }
      />
      <form onSubmit={submit}>
        <ErrorMessage error={error} />
        <div className="editor-layout">
          <div className="panel form-panel">
            <h2>
              <Music2 size={18} /> Beat details
            </h2>
            <div className="form-grid">
              <Field label="Beat title *">
                <input
                  required
                  maxLength={200}
                  placeholder="e.g. Midnight Protocol"
                  value={beat.title}
                  onChange={(e) => update('title', e.target.value)}
                />
              </Field>
              <Field label="Genre">
                <input
                  list="genres"
                  required
                  maxLength={100}
                  value={beat.genre}
                  onChange={(e) => update('genre', e.target.value)}
                />
                <datalist id="genres">
                  {genres.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </datalist>
              </Field>
              <Field label="BPM *">
                <input
                  type="number"
                  required
                  min={1}
                  max={400}
                  value={beat.bpm}
                  onChange={(e) => update('bpm', Number(e.target.value))}
                />
              </Field>
              <Field label="Musical key">
                <input
                  maxLength={40}
                  placeholder="e.g. F# minor"
                  value={beat.key}
                  onChange={(e) => update('key', e.target.value)}
                />
              </Field>
              <Field label="Mood">
                <input
                  maxLength={200}
                  placeholder="Dark, cinematic, cold…"
                  value={beat.mood}
                  onChange={(e) => update('mood', e.target.value)}
                />
              </Field>
              <Field
                label="Artist references"
                hint="Only references you choose. No association is implied."
              >
                <input
                  maxLength={300}
                  placeholder="Separate artists with commas"
                  value={beat.artists}
                  onChange={(e) => update('artists', e.target.value)}
                />
              </Field>
              <Field label="Tags" hint="Separate with commas">
                <input
                  maxLength={1000}
                  value={beat.tags.join(', ')}
                  onChange={(e) =>
                    update(
                      'tags',
                      e.target.value.split(',').map((t) => t.trimStart()),
                    )
                  }
                  onBlur={() => update('tags', beat.tags.map((t) => t.trim()).filter(Boolean))}
                />
              </Field>
              <Field
                label="Artwork reference"
                hint="A filename, project path, or URL. Files are not uploaded or fetched."
              >
                <input
                  maxLength={2000}
                  placeholder="midnight-artwork.png"
                  value={beat.artwork}
                  onChange={(e) => update('artwork', e.target.value)}
                />
              </Field>
              <div className="full">
                <Field label="Production notes">
                  <textarea
                    rows={5}
                    placeholder="808 pattern, mix notes, sample sources…"
                    value={beat.productionNotes}
                    onChange={(e) => update('productionNotes', e.target.value)}
                  />
                </Field>
              </div>
              <div className="full">
                <Field label="Additional notes">
                  <textarea
                    rows={3}
                    value={beat.customNotes}
                    onChange={(e) => update('customNotes', e.target.value)}
                  />
                </Field>
              </div>
            </div>
          </div>
          <aside className="panel form-panel">
            <h2>Release details</h2>
            <Field label="Workflow status">
              <select
                value={beat.status}
                onChange={(e) => update('status', e.target.value as Beat['status'])}
              >
                {statuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Planned release date">
              <input
                type="date"
                value={beat.plannedDate}
                onChange={(e) => update('plannedDate', e.target.value)}
              />
            </Field>
            <Field label="Actual release date">
              <input
                type="date"
                value={beat.actualDate}
                onChange={(e) => update('actualDate', e.target.value)}
              />
            </Field>
            <Field label="YouTube video URL">
              <input
                type="url"
                placeholder="https://youtube.com/watch?v=…"
                value={beat.youtubeUrl}
                onChange={(e) => update('youtubeUrl', e.target.value)}
              />
            </Field>
            <div className="info-box">
              Dates use your local calendar. Scheduling never publishes a beat automatically.
            </div>
            {existing && (
              <div className="record-info">
                <p>Created {new Date(beat.createdAt).toLocaleDateString()}</p>
                <p>Edited {new Date(beat.updatedAt).toLocaleDateString()}</p>
              </div>
            )}
            <button className="button primary wide" type="submit" disabled={saving}>
              <Save size={16} />
              {saving ? 'Saving…' : 'Save beat'}
            </button>
          </aside>
        </div>
      </form>
    </>
  );
}
