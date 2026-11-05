'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface RunRow {
  runId: string;
  startedAt: string;
  eventCount: number;
  status: 'running' | 'completed';
  outcome: string | null;
  reason: string | null;
}

const dateTime = new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'medium' });

export default function RunsPage() {
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/orchestrator/runs', { cache: 'no-store' });
        if (!response.ok) throw new Error(`El orquestador respondió ${String(response.status)}`);
        const body = (await response.json()) as { runs: RunRow[] };
        if (!cancelled) {
          setRuns(body.runs);
          setError(null);
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      }
    };
    void load();
    const timer = setInterval(() => void load(), 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <>
      <h1>Runs</h1>
      {error !== null && (
        <p role="alert" className="error">
          No se puede contactar con el orquestador ({error}). Puedes{' '}
          <Link href="/replay">reproducir un run exportado</Link> sin backend.
        </p>
      )}
      {runs === null && error === null && <p>Cargando…</p>}
      {runs !== null && runs.length === 0 && <p>Todavía no hay runs.</p>}
      {runs !== null && runs.length > 0 && (
        <table>
          <thead>
            <tr>
              <th scope="col">Run</th>
              <th scope="col">Inicio</th>
              <th scope="col">Estado</th>
              <th scope="col">Resultado</th>
              <th scope="col">Eventos</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.runId}>
                <td>
                  <Link href={`/runs/${run.runId}`}>{run.runId}</Link>
                </td>
                <td>{dateTime.format(new Date(run.startedAt))}</td>
                <td>{run.status === 'running' ? 'en curso' : 'terminado'}</td>
                <td>
                  {run.outcome ?? '—'}
                  {run.reason === null ? '' : ` · ${run.reason}`}
                </td>
                <td>{run.eventCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
