import { useState } from 'react';
import { Square } from 'lucide-react';
import type { NativeSnapshot } from '../types/desktop';
import { platform } from './index';
import { errorText } from '../components/ui';
export function RenderDock({
  snapshot,
  historyError,
}: {
  snapshot: NativeSnapshot;
  historyError: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const id = snapshot.activeJobId;
  if (!id) return null;
  const job = snapshot.catalog.jobs.find((j) => j.id === id);
  return (
    <aside className="render-dock" aria-label="Active desktop render">
      <div>
        <strong>{job ? `Attempt ${job.attempt} · ${job.state}` : 'Native render active'}</strong>
        <button
          className="button small"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError('');
            void platform
              .cancelRender(id)
              .catch((e) => setError(errorText(e)))
              .finally(() => setBusy(false));
          }}
        >
          <Square size={12} /> Cancel render
        </button>
      </div>
      {job && <progress aria-label="Active native render progress" max={1} value={job.progress} />}
      <p>
        {job
          ? `${Math.floor(job.progress * 100)}% · ${job.request.metadata.title}`
          : 'Fetching stage details…'}
      </p>
      {(error || historyError) && (
        <p className="error" role="alert">
          {error ||
            `History persistence needs attention: ${historyError}. Native cancellation remains available.`}
        </p>
      )}
    </aside>
  );
}
