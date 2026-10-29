import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Plus, Music2 } from 'lucide-react';
import { useData } from '../app/context';
import { changeStatus } from '../db';
import { statuses } from '../types';
import { PageHeader, StatusSelect, ErrorMessage, errorText } from '../components/ui';
export default function Pipeline() {
  const { beats, notify } = useData();
  const [error, setError] = useState('');
  return (
    <>
      <PageHeader
        eyebrow="FROM SPARK TO RELEASE"
        title="Release pipeline"
        description="Give every beat a next step. Change stages with the controls on each card."
        actions={
          <Link className="button primary" to="/beats/new">
            <Plus size={17} /> New beat
          </Link>
        }
      />
      <ErrorMessage error={error} />
      <div className="kanban">
        {statuses.map((status, i) => (
          <section className="kanban-column" key={status}>
            <h2>
              <span className={`stage-dot stage-${i}`} />
              {status}
              <span className="count">{beats.filter((b) => b.status === status).length}</span>
            </h2>
            {beats
              .filter((b) => b.status === status)
              .map((b) => (
                <article className="kanban-card" key={b.id}>
                  <Music2 size={19} className="muted" />
                  <Link to={`/beats/${b.id}`}>
                    <h3>{b.title}</h3>
                  </Link>
                  <p>
                    {b.genre} · {b.bpm} BPM
                  </p>
                  {b.plannedDate && <small>{b.plannedDate}</small>}
                  <StatusSelect
                    label={`Status for ${b.title}`}
                    value={b.status}
                    onChange={(s) =>
                      void changeStatus(b, s)
                        .then(() => notify('Workflow updated'))
                        .catch((e) => setError(errorText(e)))
                    }
                  />
                </article>
              ))}
            {!beats.some((b) => b.status === status) && (
              <div className="column-empty">No beats in this stage</div>
            )}
          </section>
        ))}
      </div>
      <div className="info-box">
        Publishing is always explicit. Scheduled dates never automatically change a beat to
        Published.
      </div>
    </>
  );
}
