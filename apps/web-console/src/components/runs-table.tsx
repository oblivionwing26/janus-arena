import Link from 'next/link';

import type { RunRow } from '@/lib/backend';
import { timeAgo } from '@/lib/landing';

const exact = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

function statusOf(run: RunRow): { readonly className: string; readonly text: string } {
  if (run.status === 'running') return { className: 'status status-running', text: 'Running' };
  if (run.outcome === 'success') return { className: 'status status-ok', text: 'Completed' };
  // The orchestrator records `error` when too many sessions did not complete: a result to read,
  // not a crash, so it is amber; anything else unexpected is red.
  if (run.outcome === 'error')
    return { className: 'status status-warn', text: 'Finished with errors' };
  return {
    className: 'status status-error',
    text: run.outcome === null ? 'Ended' : `Ended · ${run.outcome}`,
  };
}

/** Every run the backend lists (or the demo recorded), newest first. */
export function RunsTable({
  runs,
  now,
}: {
  readonly runs: readonly RunRow[];
  readonly now: number;
}) {
  return (
    <div className="table-scroll">
      <table className="runs-table">
        <thead>
          <tr>
            <th scope="col">Run</th>
            <th scope="col">Started</th>
            <th scope="col">Status</th>
            <th scope="col" className="num">
              Events
            </th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const status = statusOf(run);
            return (
              <tr key={run.runId}>
                <td>
                  <Link className="mono run-link" href={`/runs/${run.runId}`}>
                    {run.runId}
                  </Link>
                  {run.reason !== null && <span className="run-reason">{run.reason}</span>}
                </td>
                <td>
                  <time dateTime={run.startedAt} title={exact.format(new Date(run.startedAt))}>
                    {timeAgo(run.startedAt, now)}
                  </time>
                </td>
                <td>
                  <span className={status.className}>{status.text}</span>
                </td>
                <td className="num mono">{run.eventCount.toLocaleString('en')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
