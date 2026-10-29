import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, localDate } from '../../db';
import { PageHeader, Empty } from '../../components/ui';
export default function History() {
  const records = useLiveQuery(() => db.events.toArray(), [], []),
    beats = useLiveQuery(() => db.beats.toArray(), [], []);
  const [beat, setBeat] = useState(''),
    [status, setStatus] = useState(''),
    [date, setDate] = useState(''),
    [order, setOrder] = useState('newest');
  const filtered = records
    .filter(
      (e) =>
        (!beat || e.beatId === beat) &&
        (!status || e.status === status) &&
        (!date || localDate(new Date(e.at)) === date),
    )
    .sort((a, b) => (order === 'newest' ? b.at.localeCompare(a.at) : a.at.localeCompare(b.at)));
  return (
    <>
      <PageHeader
        eyebrow="YOUR WORK, WITH A RECORD"
        title="Release history"
        description="Meaningful saved events, render attempts, exports and user-reported publication."
      />
      <div className="toolbar">
        <select aria-label="History beat" value={beat} onChange={(e) => setBeat(e.target.value)}>
          <option value="">All beats</option>
          {beats.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
              {b.deletedAt ? ' (removed from library)' : ''}
            </option>
          ))}
        </select>
        <select
          aria-label="History status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {[...new Set(records.map((e) => e.status).filter(Boolean))].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <input
          aria-label="History local date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <select aria-label="History order" value={order} onChange={(e) => setOrder(e.target.value)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>
      <section className="panel">
        {filtered.length ? (
          filtered.map((e) => (
            <article className="history-row" key={e.id}>
              <div>
                <strong>{e.type.replaceAll('_', ' ')}</strong>
                <span className="badge">{e.status ?? 'Saved'}</span>
              </div>
              <p>
                {beats.find((b) => b.id === e.beatId)?.title ?? 'Archived beat'} · {e.detail}
              </p>
              <small className="muted">
                {new Date(e.at).toLocaleString()}
                {e.jobId ? ` · Attempt ID ${e.jobId}` : ''}
              </small>
            </article>
          ))
        ) : (
          <Empty title="No matching events">
            <p>Saved edits and release actions appear here. Keystrokes are not recorded.</p>
          </Empty>
        )}
      </section>
    </>
  );
}
