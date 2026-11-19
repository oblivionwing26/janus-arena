'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { DEMO } from '@/lib/demo';
import { fetchDemoIndex, listRuns, type FeaturedRun, type RunRow } from '@/lib/backend';

const dateTime = new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'medium' });

export default function RunsPage() {
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [featured, setFeatured] = useState<readonly FeaturedRun[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const loaded = await listRuns();
        if (DEMO) {
          const index = await fetchDemoIndex();
          if (!cancelled) setFeatured(index.featured);
        }
        if (!cancelled) {
          setRuns(loaded);
          setError(null);
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      }
    };
    void load();
    // A demo is recorded once; a live backend is polled.
    const timer = DEMO ? null : setInterval(() => void load(), 3000);
    return () => {
      cancelled = true;
      if (timer !== null) clearInterval(timer);
    };
  }, []);

  return (
    <>
      <h1>{DEMO ? 'Janus Arena · demo' : 'Runs'}</h1>
      {featured.length > 0 && (
        <section aria-label="Featured runs">
          <h2>Start here</h2>
          <div className="featured">
            {featured.map((story) => (
              <article key={story.runId}>
                <h3>{story.title}</h3>
                <p>{story.summary}</p>
                <ul>
                  {story.links.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href}>{link.label}</Link>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <h2>All recorded runs</h2>
        </section>
      )}
      {error !== null && (
        <p role="alert" className="error">
          {DEMO ? error : `No se puede contactar con el orquestador (${error}).`} Puedes{' '}
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
