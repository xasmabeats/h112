import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Plus,
  Disc3,
  Layers,
  CalendarDays,
  CheckCheck,
  Music2,
  ArrowRight,
  FileText,
} from 'lucide-react';
import { useData } from '../app/context';
import { localDate } from '../db';
import { statuses } from '../types';
import { PageHeader, Badge, Empty } from '../components/ui';
export default function Dashboard() {
  const { beats, settings } = useData();
  const today = localDate(new Date());
  const upcoming = beats
    .filter((b) => b.plannedDate >= today && b.status !== 'Published')
    .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))
    .slice(0, 4);
  const recent = [...beats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  const stats = [
    { label: 'Total beats', value: beats.length, icon: Disc3, detail: 'Your complete catalog' },
    {
      label: 'Unreleased',
      value: beats.filter((b) => b.status !== 'Published').length,
      icon: Layers,
      detail: 'Ideas through final masters',
    },
    {
      label: 'Scheduled',
      value: beats.filter((b) => b.status === 'Scheduled').length,
      icon: CalendarDays,
      detail: 'Next up in your release plan',
    },
    {
      label: 'Published',
      value: beats.filter((b) => b.status === 'Published').length,
      icon: CheckCheck,
      detail: 'Out in the world',
    },
  ];
  return (
    <>
      <PageHeader
        eyebrow="YOUR PRODUCTION COMMAND CENTER"
        title="Studio overview"
        description={`Welcome back${settings.producer ? `, ${settings.producer}` : ''}. Keep the sound moving.`}
        actions={
          <>
            <span className="today">
              {new Date().toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
            <Link className="button primary" to="/beats/new">
              <Plus size={17} /> New beat
            </Link>
          </>
        }
      />
      <section className="studio-banner">
        <div>
          <div className="eyebrow">INDEPENDENT SOUND. INTENTIONAL RELEASES.</div>
          <h2>
            Make the music.
            <br />
            <span>Own the rollout.</span>
          </h2>
          <p>Your catalog, workflow, and next release — in sync.</p>
          <Link to="/pipeline">
            Open release pipeline <ArrowRight size={16} />
          </Link>
        </div>
        <div className="wave-art" aria-hidden="true">
          {Array.from({ length: 43 }, (_, i) => (
            <i
              key={i}
              style={{
                height: `${12 + Math.abs(Math.sin(i * 0.72) * Math.cos(i * 0.19)) * 125}px`,
              }}
            />
          ))}
        </div>
        <span className="banner-label">X / STUDIO SYSTEM 01</span>
      </section>
      <div className="stats-grid">
        {stats.map((s) => (
          <div className="stat-card" key={s.label}>
            <div>
              <span>{s.label}</span>
              <s.icon size={18} />
            </div>
            <strong>{s.value.toString().padStart(2, '0')}</strong>
            <small>{s.detail}</small>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Recently edited</h2>
            <Link to="/beats">
              View library <ArrowUpRight size={15} />
            </Link>
          </div>
          {recent.length ? (
            <div className="recent-list">
              {recent.map((b, i) => (
                <Link className="recent-row" to={`/beats/${b.id}`} key={b.id}>
                  <div className={`cover cover-${i % 4}`}>
                    <Music2 size={19} />
                  </div>
                  <div className="grow">
                    <strong>{b.title}</strong>
                    <small>
                      {b.genre} <span>·</span> {b.bpm} BPM <span>·</span> {b.key || 'Key unset'}
                    </small>
                  </div>
                  <Badge status={b.status} />
                  <ArrowUpRight size={16} className="muted" />
                </Link>
              ))}
            </div>
          ) : (
            <Empty title="A clean slate, a new sound">
              <p>Add your first beat to begin building your catalog.</p>
              <Link className="text-link" to="/beats/new">
                Create your first beat <ArrowRight size={15} />
              </Link>
            </Empty>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Upcoming releases</h2>
            <Link to="/calendar">
              <CalendarDays size={17} />
            </Link>
          </div>
          {upcoming.length ? (
            <div className="upcoming-list">
              {upcoming.map((b) => (
                <Link to={`/beats/${b.id}`} className="upcoming-row" key={b.id}>
                  <div className="date-tile">
                    <strong>{Number(b.plannedDate.slice(8))}</strong>
                    <small>
                      {new Date(b.plannedDate + 'T12:00:00').toLocaleDateString(undefined, {
                        month: 'short',
                      })}
                    </small>
                  </div>
                  <div>
                    <strong>{b.title}</strong>
                    <small>{b.genre}</small>
                    <Badge status={b.status} />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <Empty title="Room for your next drop">
              <p>Plan a release and it will appear here.</p>
              <Link className="text-link" to="/calendar">
                Plan a release <ArrowRight size={15} />
              </Link>
            </Empty>
          )}
        </section>
      </div>
      <section className="panel pipeline-summary">
        <div className="panel-heading">
          <h2>Release pipeline</h2>
          <Link to="/pipeline">
            Manage pipeline <ArrowUpRight size={15} />
          </Link>
        </div>
        <div className="pipeline-stats">
          {statuses.map((s, i) => (
            <Link to="/pipeline" key={s}>
              <div>
                <span className={`stage-dot stage-${i}`} />
                {s}
              </div>
              <strong>
                {beats
                  .filter((b) => b.status === s)
                  .length.toString()
                  .padStart(2, '0')}
              </strong>
              <div className="track">
                <span
                  style={{
                    width: `${beats.length ? (beats.filter((b) => b.status === s).length / beats.length) * 100 : 0}%`,
                  }}
                />
              </div>
            </Link>
          ))}
        </div>
      </section>
      <div className="quick-actions">
        <Link to="/metadata">
          <FileText size={18} />
          <span>
            Find the right words<small>Generate release metadata</small>
          </span>
          <ArrowUpRight size={17} />
        </Link>
        <Link to="/settings">
          <Layers size={18} />
          <span>
            Keep your work safe<small>Export a portable backup</small>
          </span>
          <ArrowUpRight size={17} />
        </Link>
      </div>
      <p className="footnote">
        <span className="online-dot" /> Local-first. Private by design. No cloud required.
      </p>
    </>
  );
}
