import { useEffect, useState } from 'react';
import { useSearchParams, useBlocker } from 'react-router-dom';
import { Copy, RefreshCw, Save, Check, FileText } from 'lucide-react';
import { useData } from '../app/context';
import { saveBeat } from '../db';
import { generate } from '../lib/metadata';
import { event } from '../lib/releases';
import type { Metadata as MetadataType } from '../types';
import { PageHeader, Field, Empty, ErrorMessage, errorText } from '../components/ui';
const labels: Record<keyof MetadataType, string> = {
  title: 'YouTube video title',
  description: 'Video description',
  tags: 'YouTube tags',
  hashtags: 'Hashtags',
  filename: 'Suggested filename',
  pinnedComment: 'Pinned comment',
};
const limits: Partial<Record<keyof MetadataType, number>> = {
  title: 100,
  description: 5000,
  tags: 500,
};
export default function Metadata() {
  const { beats, templates, settings, notify } = useData();
  const [params] = useSearchParams();
  const [id, setId] = useState(params.get('beat') || ''),
    [templateId, setTemplateId] = useState(settings.defaultTemplate),
    [result, setResult] = useState<MetadataType | null>(null),
    [dirty, setDirty] = useState(false),
    [copied, setCopied] = useState(''),
    [error, setError] = useState('');
  const [selectedFields, setSelectedFields] = useState<(keyof MetadataType)[]>(
    Object.keys(labels) as (keyof MetadataType)[],
  );
  const [dirtyFields, setDirtyFields] = useState<(keyof MetadataType)[]>([]);
  const beat = beats.find((b) => b.id === id);
  const blocker = useBlocker(dirty);
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (confirm('Discard unsaved metadata edits?')) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  useEffect(() => {
    setResult(beat ? (beat.metadata ?? generate(beat, settings, templates, templateId)) : null);
    setDirty(false);
    setDirtyFields([]);
  }, [id]);
  const preview = beat ? generate(beat, settings, templates, templateId) : null;
  function regenerate() {
    if (!selectedFields.length) return;
    if (
      (dirtyFields.some((key) => selectedFields.includes(key)) || !!beat?.metadata) &&
      !confirm(
        'Replace selected fields with template-generated text? Unsaved or saved edits in these fields will be replaced. Other fields stay unchanged.',
      )
    )
      return;
    if (!preview || !beat) return;
    setResult((previous) => {
      const next = { ...(previous ?? preview) };
      for (const key of selectedFields) next[key] = preview[key];
      return next;
    });
    setDirtyFields((fields) => [...new Set([...fields, ...selectedFields])]);
    setDirty(true);
    void event(
      'metadata_generated',
      beat.id,
      `Template-based regeneration: ${selectedFields.join(', ')}`,
    ).catch((e) => setError(errorText(e)));
  }
  async function save() {
    if (!beat || !result) return;
    try {
      await saveBeat({ ...beat, metadata: result });
      setDirty(false);
      setDirtyFields([]);
      notify('Metadata saved to beat');
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function copy(key: keyof MetadataType) {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result[key]);
      setCopied(key);
      setTimeout(() => setCopied(''), 1800);
    } catch {
      setError('Clipboard access is unavailable. Select and copy the text manually.');
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="WORDS THAT MATCH YOUR SOUND"
        title="YouTube metadata"
        description="Template-driven, fully editable, and generated on your device."
        actions={
          <button
            className="button primary"
            disabled={!beat || !result}
            onClick={() => void save()}
          >
            <Save size={16} /> Save to beat
          </button>
        }
      />
      <ErrorMessage error={error} />
      <div className="metadata-layout">
        <aside className="panel form-panel">
          <h2>
            <FileText size={18} /> Release inputs
          </h2>
          <p className="muted small-text">Template-based · local · not AI</p>
          <Field label="Beat">
            <select
              value={id}
              onChange={(e) => {
                if (!dirty || confirm('Discard unsaved metadata edits?')) setId(e.target.value);
              }}
            >
              <option value="">Select a beat</option>
              {beats.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Title pattern">
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">Default title pattern</option>
              {templates
                .filter((t) => t.kind === 'title')
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </Field>
          {beat && (
            <dl className="metadata-inputs">
              {[
                ['Genre', beat.genre],
                ['BPM', beat.bpm],
                ['Key', beat.key || 'Not set'],
                ['Mood', beat.mood || 'Not set'],
                ['Artists', beat.artists || 'Not set'],
                ['Custom tags', beat.tags.join(', ') || 'Not set'],
                ['Producer', settings.producer || 'Not set'],
                ['Contact', settings.contact || 'Not set'],
                ['Social links', settings.socials || 'Not set'],
                ['Licensing', settings.licensing || 'Not set'],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          <fieldset className="regenerate-fields">
            <legend className="muted small-text">Fields to regenerate</legend>
            {(Object.keys(labels) as (keyof MetadataType)[]).map((key) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={selectedFields.includes(key)}
                  onChange={(e) =>
                    setSelectedFields((fields) =>
                      e.target.checked ? [...fields, key] : fields.filter((f) => f !== key),
                    )
                  }
                />
                Regenerate {labels[key]}
              </label>
            ))}
          </fieldset>
          <button
            className="button wide"
            disabled={!beat || !selectedFields.length}
            onClick={regenerate}
          >
            <RefreshCw size={15} /> Generate / regenerate
          </button>
          <p className="muted small-text">
            Edit beat inputs in the Beat Editor. Producer, licensing, contact, and social links come
            from Settings.
          </p>
          {beat && (
            <details>
              <summary>Title suggestions (templates)</summary>
              <div className="suggestions">
                {templates
                  .filter((t) => t.kind === 'title')
                  .map((t) => {
                    const suggestion = generate(beat, settings, templates, t.id).title;
                    return (
                      <button
                        key={t.id}
                        className="button"
                        onClick={() => {
                          if (
                            (dirtyFields.includes('title') || beat.metadata) &&
                            !confirm(
                              'Replace only the current title with this template suggestion?',
                            )
                          )
                            return;
                          setResult((current) => ({
                            ...(current ?? generate(beat, settings, templates)),
                            title: suggestion,
                          }));
                          setDirty(true);
                          setDirtyFields((fields) => [...new Set([...fields, 'title' as const])]);
                          void event(
                            'metadata_generated',
                            beat.id,
                            `Title suggestion: ${t.name}`,
                          ).catch((e) => setError(errorText(e)));
                        }}
                      >
                        {suggestion}
                      </button>
                    );
                  })}
              </div>
            </details>
          )}
          {preview && (
            <details>
              <summary>Live template preview</summary>
              <pre className="preview-text">
                {preview.title}
                {'\n\n'}
                {preview.description}
              </pre>
            </details>
          )}
          <div className="info-box">
            Templates use your inputs only. Review artist references and licensing terms before
            publishing. Search rankings and growth are never guaranteed.
          </div>
        </aside>
        <section>
          {result ? (
            <div className="metadata-results">
              {(Object.keys(labels) as (keyof MetadataType)[]).map((key) => (
                <div className="panel metadata-result" key={key}>
                  <div className="panel-heading">
                    <h2>{labels[key]}</h2>
                    <div className="row-actions">
                      <span
                        className={
                          limits[key] && result[key].length > limits[key] ? 'over-limit' : 'muted'
                        }
                      >
                        {result[key].length}
                        {limits[key] ? ` / ${limits[key]}` : ''}
                      </span>
                      <button
                        className="icon-button"
                        aria-label={`Copy ${labels[key]}`}
                        onClick={() => void copy(key)}
                      >
                        {copied === key ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                    </div>
                  </div>
                  <textarea
                    aria-label={labels[key]}
                    rows={key === 'description' ? 9 : key === 'title' || key === 'filename' ? 2 : 3}
                    value={result[key]}
                    onChange={(e) => {
                      setResult({ ...result, [key]: e.target.value });
                      setDirty(true);
                      setDirtyFields((fields) => [...new Set([...fields, key])]);
                    }}
                  />
                  {limits[key] && result[key].length > limits[key] && (
                    <p className="error">
                      Exceeds the suggested YouTube character limit. Trim before publishing.
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="panel">
              <Empty title="Give your next release a voice">
                <p>Select a saved beat to generate titles, descriptions, tags, and more.</p>
              </Empty>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
