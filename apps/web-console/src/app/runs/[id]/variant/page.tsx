'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import { useRunEvents } from '@/components/use-run-events';
import { VariantPatches } from '@/components/variant-patches';
import { variantPatches } from '@/lib/variant';

export default function RunVariantPage() {
  const { id } = useParams<{ id: string }>();
  const { events, error } = useRunEvents(id);

  return (
    <>
      <h1>Variante B · {id}</h1>
      <p>
        <Link href={`/runs/${id}`}>← Línea de tiempo del run</Link>
      </p>
      <p className="muted">
        Los cambios del UI Engineer sobre <code>janus/variant-{id}</code>. Solo se confirma en la
        rama el parche que pasa sus comprobaciones.
      </p>
      {error !== null && <p role="alert">{error}</p>}
      {events === null && error === null && <p>Cargando los eventos…</p>}
      {events !== null && <VariantPatches patches={variantPatches(events)} />}
    </>
  );
}
