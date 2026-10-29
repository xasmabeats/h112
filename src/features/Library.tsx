import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, SlidersHorizontal, Copy, Trash2, ArrowUpRight, Music2 } from 'lucide-react';
import { useData } from '../app/context';
import { db, saveBeat, removeBeat } from '../db';
import { statuses, genres, type Beat } from '../types';
import { PageHeader, Badge, Empty, errorText, ErrorMessage } from '../components/ui';
export function filterBeats(
  beats: Beat[],
  query: string,
  genre: string,
  status: string,
  tag: string,
  sort: string,
) {
  return beats
    .filter(
      (b) =>
        (!query ||
          [b.title, b.artists, b.mood, ...b.tags]
            .join(' ')
            .toLowerCase()
            .includes(query.toLowerCase())) &&
        (!genre || b.genre === genre) &&
        (!status || b.status === status) &&
        (!tag || b.tags.some((t) => t.toLowerCase().includes(tag.toLowerCase()))),
    )
    .sort((a, b) =>
      sort === 'title'
        ? a.title.localeCompare(b.title)
        : sort === 'bpm'
          ? a.bpm - b.bpm
          : sort === 'status'
            ? statuses.indexOf(a.status) - statuses.indexOf(b.status)
            : sort === 'plannedDate'
              ? (a.plannedDate || '9999').localeCompare(b.plannedDate || '9999')
              : b[sort as 'createdAt' | 'updatedAt'].localeCompare(
                  a[sort as 'createdAt' | 'updatedAt'],
                ),
    );
}
export default function Library() {
  const { beats, notify } = useData();
  const [query, setQuery] = useState(''),
    [genre, setGenre] = useState(''),
    [status, setStatus] = useState(''),
    [tag, setTag] = useState(''),
    [sort, setSort] = useState('updatedAt'),
    [error, setError] = useState('');
  const filtered = useMemo(
    () => filterBeats(beats, query, genre, status, tag, sort),
    [beats, query, genre, status, tag, sort],
  );
  async function duplicate(beat: Beat) {
    try {
      await saveBeat({
        ...beat,
        id: crypto.randomUUID(),
        title: beat.title + ' (copy)',
        createdAt: new Date().toISOString(),
        status: 'Idea',
        plannedDate: '',
        actualDate: '',
        youtubeUrl: '',
      });
      notify('Beat duplicated');
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function remove(beat: Beat) {
    if (
      !confirm(
        `Remove “${beat.title}” from the active library? Release history and managed copies are retained for provenance and backup recovery.`,
      )
    )
      return;
    try {
      await removeBeat(beat.id);
      notify('Removed from active library');
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="YOUR SOUND, ORGANIZED"
        title="Beat library"
        description="Every idea. Every finished record. One place."
        actions={
          <Link className="button primary" to="/beats/new">
            <Plus size={17} /> New beat
          </Link>
        }
      />
      <div className="toolbar">
        <div className="search">
          <Search size={17} />
          <input
            aria-label="Search beats"
            placeholder="Search beats, artists, moods…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select aria-label="Filter genre" value={genre} onChange={(e) => setGenre(e.target.value)}>
          <option value="">All genres</option>
          {[...new Set([...genres, ...beats.map((b) => b.genre)])].map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <select
          aria-label="Filter status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All stages</option>
          {statuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <input
          className="tag-filter"
          aria-label="Filter tags"
          placeholder="Filter tags"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        />
        <select aria-label="Sort beats" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="updatedAt">Recently edited</option>
          <option value="createdAt">Newest created</option>
          <option value="title">Title A–Z</option>
          <option value="bpm">BPM low–high</option>
          <option value="plannedDate">Release date</option>
          <option value="status">Workflow stage</option>
        </select>
      </div>
      <ErrorMessage error={error} />
      <div className="panel">
        <div className="panel-heading">
          <h2>
            <Music2 size={17} /> All beats <span className="count">{filtered.length}</span>
          </h2>
          <SlidersHorizontal size={16} />
        </div>
        {filtered.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>BEAT / TITLE</th>
                  <th>GENRE</th>
                  <th>BPM / KEY</th>
                  <th>STATUS</th>
                  <th>RELEASE</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((b, i) => (
                  <tr key={b.id}>
                    <td>
                      <Link className="beat-name" to={`/beats/${b.id}`}>
                        <span className={`cover cover-${i % 4}`}>
                          <Music2 size={19} />
                        </span>
                        <span>
                          <strong>{b.title}</strong>
                          <small>
                            {b.artists || b.tags.join(' · ') || 'Original instrumental'}
                          </small>
                        </span>
                      </Link>
                    </td>
                    <td>{b.genre}</td>
                    <td className="mono">
                      {b.bpm} <span className="muted">/ {b.key || '—'}</span>
                    </td>
                    <td>
                      <Badge status={b.status} />
                    </td>
                    <td className="mono">{b.plannedDate || '—'}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          aria-label={`Duplicate ${b.title}`}
                          onClick={() => void duplicate(b)}
                        >
                          <Copy size={15} />
                        </button>
                        <button
                          className="icon-button danger"
                          aria-label={`Delete ${b.title}`}
                          onClick={() => void remove(b)}
                        >
                          <Trash2 size={15} />
                        </button>
                        <Link
                          className="icon-button"
                          aria-label={`Edit ${b.title}`}
                          to={`/beats/${b.id}`}
                        >
                          <ArrowUpRight size={17} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title={beats.length ? 'No matching beats' : 'Your next release starts here'}>
            <p>
              {beats.length
                ? 'Try a different search or filter.'
                : 'Add your first beat and give your ideas a home.'}
            </p>
            <Link className="button" to="/beats/new">
              <Plus size={16} /> Create a beat
            </Link>
          </Empty>
        )}
      </div>
      <p className="footnote">Stored on this device. Your music stays yours.</p>
    </>
  );
}
