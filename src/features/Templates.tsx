import { useState } from 'react';
import { Plus, Copy, Trash2, Star, Save, X } from 'lucide-react';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useData } from '../app/context';
import { db, newBeat } from '../db';
import { generate } from '../lib/metadata';
import { templateKinds, type Template } from '../types';
import { PageHeader, Field, ErrorMessage, errorText, Empty } from '../components/ui';
export default function Templates() {
  const { templates, beats, settings, notify } = useData();
  const [editing, setEditing] = useState<Template | null>(null),
    [filter, setFilter] = useState(''),
    [error, setError] = useState('');
  useUnsavedChanges(!!editing, 'Discard the open template draft?');
  function open(t: Template | null) {
    if (editing && !confirm('Discard the current template draft?')) return;
    setEditing(t);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      await db.transaction('rw', db.templates, async () => {
        if (editing.isDefault)
          await db.templates.where('kind').equals(editing.kind).modify({ isDefault: false });
        await db.templates.put(editing);
      });
      setEditing(null);
      notify('Template saved');
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function remove(t: Template) {
    if (!confirm(`Delete template “${t.name}”?`)) return;
    try {
      await db.templates.delete(t.id);
      notify('Template deleted');
    } catch (e) {
      setError(errorText(e));
    }
  }
  const demo = beats[0] ?? {
    ...newBeat(settings.defaultGenre),
    title: 'Your beat title',
    mood: 'Your mood',
    artists: 'Your artist references',
  };
  const preview = editing
    ? generate(demo, settings, [{ ...editing, isDefault: true }], editing.id)
    : null;
  return (
    <>
      <PageHeader
        eyebrow="A REPEATABLE RELEASE SYSTEM"
        title="Templates"
        description="Build your own language. Reuse it on every release."
        actions={
          <button
            className="button primary"
            onClick={() =>
              open({
                id: crypto.randomUUID(),
                name: '',
                kind: 'title',
                content: '',
                isDefault: false,
              })
            }
          >
            <Plus size={17} /> New template
          </button>
        }
      />
      <ErrorMessage error={error} />
      <div className="toolbar">
        <select
          aria-label="Template type filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">All template types</option>
          {templateKinds.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
        <span className="muted small-text">
          Placeholders:{' '}
          {
            '{beatTitle} {genre} {bpm} {key} {mood} {artists} {producer} {year} {licensing} {contact} {socials}'
          }
        </span>
      </div>
      <div className="template-layout">
        <section className="template-grid">
          {templates
            .filter((t) => !filter || t.kind === filter)
            .map((t) => (
              <article className="panel template-card" key={t.id}>
                <div className="template-type">
                  {t.kind}{' '}
                  {t.isDefault && (
                    <span>
                      <Star size={12} /> Default
                    </span>
                  )}
                </div>
                <button className="template-edit" onClick={() => open({ ...t })}>
                  <h2>{t.name}</h2>
                  <pre>{t.content}</pre>
                </button>
                <div className="row-actions">
                  <button className="text-button" onClick={() => open({ ...t })}>
                    Edit template
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Duplicate ${t.name}`}
                    onClick={() =>
                      void db.templates
                        .add({
                          ...t,
                          id: crypto.randomUUID(),
                          name: t.name + ' (copy)',
                          isDefault: false,
                        })
                        .catch((e) => setError(errorText(e)))
                    }
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    className="icon-button danger"
                    aria-label={`Delete ${t.name}`}
                    onClick={() => void remove(t)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            ))}
          {!templates.length && (
            <Empty title="Your templates, your voice">
              <p>Create a template to get started.</p>
            </Empty>
          )}
        </section>
        {editing && (
          <form className="panel form-panel template-editor" onSubmit={save}>
            <div className="panel-heading">
              <h2>Edit template</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Close template editor"
                onClick={() => open(null)}
              >
                <X size={18} />
              </button>
            </div>
            <Field label="Template name">
              <input
                required
                maxLength={100}
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </Field>
            <Field label="Type">
              <select
                value={editing.kind}
                onChange={(e) =>
                  setEditing({ ...editing, kind: e.target.value as Template['kind'] })
                }
              >
                {templateKinds.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </Field>
            <Field label="Template content">
              <textarea
                required
                rows={8}
                value={editing.content}
                onChange={(e) => setEditing({ ...editing, content: e.target.value })}
              />
            </Field>
            <label className="check-label">
              <input
                type="checkbox"
                checked={editing.isDefault}
                onChange={(e) => setEditing({ ...editing, isDefault: e.target.checked })}
              />{' '}
              Use as default for this type
            </label>
            <details open>
              <summary>Preview using {beats.length ? 'your first beat' : 'sample inputs'}</summary>
              <pre className="preview-text">
                {editing.kind === 'licensing' ? editing.content : preview?.[editing.kind]}
              </pre>
            </details>
            <button className="button primary wide">
              <Save size={16} /> Save template
            </button>
          </form>
        )}
      </div>
    </>
  );
}
