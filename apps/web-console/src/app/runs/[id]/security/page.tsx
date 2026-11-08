'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import { FindingsTable } from '@/components/findings-table';
import { SurfaceTable } from '@/components/surface-table';
import { useRunEvents } from '@/components/use-run-events';
import { auditVerdict, findingRows, surfaces } from '@/lib/security';

export default function RunSecurityPage() {
  const { id } = useParams<{ id: string }>();
  const { events, error } = useRunEvents(id);
  const verdict = events === null ? null : auditVerdict(events);

  return (
    <>
      <h1>Seguridad · {id}</h1>
      <p>
        <Link href={`/runs/${id}`}>← Línea de tiempo del run</Link>
      </p>
      {error !== null && <p role="alert">{error}</p>}
      {events === null && error === null && <p>Cargando los eventos…</p>}
      {events !== null && (
        <>
          {verdict !== null && (
            <>
              <h2>Auditoría diferencial</h2>
              <p className={verdict.blocked ? 'verdict verdict-block' : 'verdict verdict-pass'}>
                <strong>{verdict.blocked ? 'B bloqueada' : 'B pasa'}</strong>:{' '}
                <code>{verdict.base.ref}</code> → <code>{verdict.variant.ref}</code> · B introduce{' '}
                {verdict.introduced.findings} hallazgos y {verdict.introduced.endpoints} cambios de
                endpoint ({verdict.introduced.critical} críticos, {verdict.introduced.high} altos)
              </p>
              {verdict.reasons.length > 0 && (
                <ul>
                  {verdict.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              )}
            </>
          )}
          <h2>Hallazgos</h2>
          <FindingsTable rows={findingRows(events)} />
          <h2>Mapa de superficie</h2>
          <SurfaceTable sides={surfaces(events)} />
        </>
      )}
    </>
  );
}
