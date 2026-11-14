'use client';

import { launchDayCurves } from '@janus/synthlab-report';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { LaunchDayChart } from '@/components/launch-day-chart';
import { useRunEvents } from '@/components/use-run-events';
import { hasLaunchDay, rateText } from '@/lib/launch-day';

export default function RunLaunchDayPage() {
  const { id } = useParams<{ id: string }>();
  const { events, error } = useRunEvents(id);
  const curves = events === null ? null : launchDayCurves(events);

  return (
    <>
      <h1>Launch Day · {id}</h1>
      <p>
        <Link href={`/runs/${id}`}>← Línea de tiempo del run</Link>
      </p>
      {error !== null && <p role="alert">{error}</p>}
      {events === null && error === null && <p>Cargando los eventos…</p>}
      {events !== null && curves !== null && !hasLaunchDay(events) && (
        <p>Este run no tiene saboteadores ni compradores marcados: no es un run de Launch Day.</p>
      )}
      {events !== null && curves !== null && hasLaunchDay(events) && (
        <>
          <p>
            Una defensa se juzga con las tres curvas juntas: que los ataques fallen vale poco si los
            compradores fallan con ellos. Los compradores son sintéticos y las tasas llevan su
            intervalo de Wilson del 95 %; no predicen el comportamiento de personas reales.
          </p>
          <LaunchDayChart variants={curves.variants} />
          <h2>Detalle por variante</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Variante</th>
                  <th>Compradores</th>
                  <th>Éxito de compradores</th>
                  <th>Bloqueados</th>
                  <th>Éxito de ataques</th>
                  <th>Contaminados</th>
                </tr>
              </thead>
              <tbody>
                {curves.variants.map((each) => (
                  <tr key={each.variant}>
                    <td>{each.variant.toUpperCase()}</td>
                    <td>{each.legitimate.sessions}</td>
                    <td>{rateText(each.legitimate.success)}</td>
                    <td>{rateText(each.legitimate.blocked)}</td>
                    <td>{rateText(each.attacks.success)}</td>
                    <td>{each.contaminated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2>Saboteadores</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Variante</th>
                  <th>Tarea</th>
                  <th>Veredictos</th>
                  <th>Explotables</th>
                  <th>Peticiones atendidas antes del primer rechazo</th>
                </tr>
              </thead>
              <tbody>
                {curves.variants.flatMap((each) =>
                  each.attacks.byTask.map((outcome) => (
                    <tr key={`${each.variant}-${outcome.task}`}>
                      <td>{each.variant.toUpperCase()}</td>
                      <td>{outcome.task}</td>
                      <td>{outcome.verdicts}</td>
                      <td>{outcome.exploitable}</td>
                      <td>
                        {outcome.refusedAfter.length === 0
                          ? 'nunca rechazado'
                          : outcome.refusedAfter.join(', ')}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
