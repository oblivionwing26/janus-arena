'use client';

import { useRouter } from 'next/navigation';

import type { ConsoleEvent } from '@/lib/console-event';
import { buildRunExport } from '@/lib/run-export';

export const OFFLINE_RUN_KEY = 'janus.offline-run';

/** Export the run as JSON, or open it in the backend-free replay page. */
export function ExportActions({
  runId,
  events,
}: {
  runId: string;
  events: readonly ConsoleEvent[];
}) {
  const router = useRouter();
  const disabled = events.length === 0;
  const json = () => JSON.stringify(buildRunExport(runId, events), null, 2);

  return (
    <div className="export-actions">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          const url = URL.createObjectURL(new Blob([json()], { type: 'application/json' }));
          const link = document.createElement('a');
          link.href = url;
          link.download = `janus-run-${runId}.json`;
          link.click();
          URL.revokeObjectURL(url);
        }}
      >
        Exportar JSON
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          try {
            sessionStorage.setItem(OFFLINE_RUN_KEY, json());
            router.push('/replay?from=session');
          } catch {
            // Storage unavailable (private mode): the JSON export still works.
          }
        }}
      >
        Abrir sin backend
      </button>
    </div>
  );
}
