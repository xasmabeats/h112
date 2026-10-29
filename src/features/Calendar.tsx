import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download, CalendarDays } from 'lucide-react';
import { useData } from '../app/context';
import { localDate, saveBeat } from '../db';
import { statuses } from '../types';
import { calendarExport, download } from '../lib/backup';
import { PageHeader, Field, Badge, ErrorMessage, errorText, Empty } from '../components/ui';
export default function Calendar() {
  const { beats, notify } = useData();
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selected, setSelected] = useState(localDate(new Date())),
    [beatId, setBeatId] = useState(''),
    [filter, setFilter] = useState(''),
    [error, setError] = useState('');
  const today = localDate(new Date());
  const visible = beats.filter((b) => !filter || b.status === filter);
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
  async function assign() {
    const beat = beats.find((b) => b.id === beatId);
    if (!beat) return;
    try {
      await saveBeat({
        ...beat,
        plannedDate: selected,
        status: beat.status === 'Published' ? 'Published' : 'Scheduled',
      });
      notify('Release date saved');
    } catch (e) {
      setError(errorText(e));
    }
  }
  const upcoming = visible
    .filter((b) => b.plannedDate >= today)
    .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
  return (
    <>
      <PageHeader
        eyebrow="MAKE EVERY DROP COUNT"
        title="Release calendar"
        description="An intentional schedule for your next wave of music."
        actions={
          <button
            className="button"
            onClick={() => download(calendarExport(visible), 'xasma-releases.ics', 'text/calendar')}
          >
            <Download size={16} /> Export calendar
          </button>
        }
      />
      <ErrorMessage error={error} />
      <div className="calendar-layout">
        <section className="panel calendar-panel">
          <div className="panel-heading">
            <h2>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
            <div className="row-actions">
              <select
                aria-label="Calendar status filter"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="">All stages</option>
                {statuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <button
                className="icon-button"
                aria-label="Previous month"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                className="button small"
                onClick={() =>
                  setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
                }
              >
                Today
              </button>
              <button
                className="icon-button"
                aria-label="Next month"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          <div className="calendar-grid weekdays">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {days.map((d) => {
              const key = localDate(d);
              const releases = visible.filter((b) => b.plannedDate === key);
              return (
                <button
                  className={`calendar-day ${d.getMonth() !== month.getMonth() ? 'outside' : ''} ${key === selected ? 'selected' : ''} ${key === today ? 'is-today' : ''}`}
                  key={key}
                  aria-label={`${key}, ${releases.length} releases`}
                  aria-pressed={key === selected}
                  onClick={() => setSelected(key)}
                >
                  <span>{d.getDate()}</span>
                  {releases.slice(0, 2).map((b) => (
                    <span className={`calendar-event status-${b.status.toLowerCase()}`} key={b.id}>
                      {b.title}
                    </span>
                  ))}
                  {releases.length > 2 && <small>+{releases.length - 2} more</small>}
                </button>
              );
            })}
          </div>
        </section>
        <aside>
          <section className="panel form-panel">
            <h2>
              <CalendarDays size={18} /> Plan a release
            </h2>
            <Field label="Release date">
              <input
                type="date"
                required
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              />
            </Field>
            <Field label="Beat">
              <select value={beatId} onChange={(e) => setBeatId(e.target.value)}>
                <option value="">Choose a beat</option>
                {beats.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
            </Field>
            <button
              className="button primary wide"
              disabled={!beatId || !selected}
              onClick={() => void assign()}
            >
              Assign / reschedule
            </button>
            <p className="muted small-text">
              Unpublished beats move to Scheduled. Published beats keep their status.
            </p>
            <div className="selected-releases">
              {visible
                .filter((b) => b.plannedDate === selected)
                .map((b) => (
                  <div key={b.id}>
                    <Link to={`/beats/${b.id}`}>{b.title}</Link>
                    <Badge status={b.status} />
                    <button
                      className="text-button"
                      onClick={() =>
                        void saveBeat({
                          ...b,
                          plannedDate: '',
                          status: b.status === 'Scheduled' ? 'Ready' : b.status,
                        }).catch((e) => setError(errorText(e)))
                      }
                    >
                      Remove date
                    </button>
                  </div>
                ))}
            </div>
          </section>
        </aside>
      </div>
      <section className="panel upcoming-panel">
        <div className="panel-heading">
          <h2>Upcoming release list</h2>
          <span className="count">{upcoming.length}</span>
        </div>
        {upcoming.length ? (
          upcoming.map((b) => (
            <Link key={b.id} className="list-row" to={`/beats/${b.id}`}>
              <span className="mono">{b.plannedDate}</span>
              <strong>{b.title}</strong>
              <span className="muted">{b.genre}</span>
              <Badge status={b.status} />
            </Link>
          ))
        ) : (
          <Empty title="No upcoming releases">
            <p>Choose a beat and a date to plan your next drop.</p>
          </Empty>
        )}
      </section>
    </>
  );
}
