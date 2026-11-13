'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';

import { RunViewer } from '@/components/run-viewer';
import { useRunEvents } from '@/components/use-run-events';
import { GateEventSource } from '@/lib/gate-source';

/**
 * The attack graph of a gate, or of any run (F3.10). It follows the gate and every run its stages
 * started as one stream: live while the gate runs, a replay once it has finished.
 */
export default function RunAttackPage() {
  const { id } = useParams<{ id: string }>();
  const { events, error } = useRunEvents(id);
  const source = useMemo(() => new GateEventSource(id), [id]);
  const finished = events?.some((event) => event.type === 'run.completed') ?? false;

  return (
    <>
      <h1>Grafo de ataque · {id}</h1>
      <p>
        <Link href={`/runs/${id}`}>← Línea de tiempo del run</Link>
      </p>
      <p className="muted">
        Los endpoints son nodos y los intentos de ataque, aristas. En un gate se reproducen juntos
        su Red Team y su Blue Team. Los números de seq de esta vista son los del reproductor, no los
        de cada run.
      </p>
      {error !== null && <p role="alert">{error}</p>}
      {events === null && error === null && <p>Cargando los eventos…</p>}
      {events !== null && (
        <RunViewer
          key={`${id}-${finished ? 'replay' : 'live'}`}
          source={source}
          mode={finished ? 'replay' : 'live'}
          view="attack"
        />
      )}
    </>
  );
}
