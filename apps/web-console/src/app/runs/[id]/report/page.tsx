'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { FunnelView } from '@/components/funnel-view';
import { HeatmapView } from '@/components/heatmap-view';
import { useRunEvents } from '@/components/use-run-events';
import { VariantPatches } from '@/components/variant-patches';
import { variantPatches, variantRunOf } from '@/lib/variant';
import type { SynthlabReport } from '@janus/shared-kernel';

import { fetchReport } from '@/lib/backend';

const eur = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 4,
});
const percent = (value: number) => `${String(Math.round(value * 100))} %`;

function download(report: SynthlabReport) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `synthlab-report-${report.runId}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function Success({ success }: { success: SynthlabReport['success'] }) {
  const { comparison } = success;
  return (
    <>
      <table>
        <thead>
          <tr>
            <th scope="col">Variante</th>
            <th scope="col">Éxito sintético de las personas (Wilson 95 %)</th>
            <th scope="col">Baseline competente</th>
          </tr>
        </thead>
        <tbody>
          {success.variants.map((variant) => (
            <tr key={variant.variant}>
              <td>{variant.variant}</td>
              <td>
                {variant.personas === null
                  ? 'sin sesiones de personas'
                  : `${String(variant.personas.successes)}/${String(variant.personas.n)} = ${percent(variant.personas.rate)} [${percent(variant.personas.low)}, ${percent(variant.personas.high)}]`}
              </td>
              <td>
                {variant.baseline.successes}/{variant.baseline.n}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {comparison?.difference != null && (
        <p>
          {comparison.b} − {comparison.a} en {comparison.pairs} pares:{' '}
          {comparison.difference.mean.toFixed(2)} [{comparison.difference.low.toFixed(2)},{' '}
          {comparison.difference.high.toFixed(2)}] →{' '}
          <strong>
            {comparison.verdict === 'no-detectable-difference'
              ? 'sin diferencia detectable'
              : comparison.verdict === 'b-higher'
                ? 'B más alta'
                : 'B más baja'}
          </strong>
        </p>
      )}
    </>
  );
}

/** The generated variant B behind an A/B run (F2.8): the UI Engineer run named by B's branch. */
function GeneratedVariant({ runId }: { runId: string }) {
  const { events } = useRunEvents(runId);
  const variantRun = events === null ? null : variantRunOf(events);
  const variant = useRunEvents(variantRun);
  if (variantRun === null) return null;
  return (
    <>
      <h2>Variante B</h2>
      <p className="muted">
        B la generó el UI Engineer en el run{' '}
        <Link href={`/runs/${variantRun}/variant`}>{variantRun}</Link>.
      </p>
      {variant.error !== null && <p role="alert">{variant.error}</p>}
      {variant.events !== null && <VariantPatches patches={variantPatches(variant.events)} />}
    </>
  );
}

export default function RunReportPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<SynthlabReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchReport(id).then(
      (loaded) => {
        if (!cancelled) setReport(loaded);
      },
      (caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <>
      <h1>Informe SynthLab · {id}</h1>
      <p>
        <Link href={`/runs/${id}`}>← Línea de tiempo del run</Link>
      </p>
      {error !== null && <p role="alert">{error}</p>}
      {report === null && error === null && <p>Calculando el informe…</p>}
      {report !== null && (
        <>
          <p className="muted">
            {report.sessions.persona} sesiones de personas, {report.sessions.baseline} del baseline,{' '}
            {report.sessions.excluded.length} excluidas · calculado de {report.source.events}{' '}
            eventos ·{' '}
            <button
              type="button"
              onClick={() => {
                download(report);
              }}
            >
              Exportar JSON
            </button>
          </p>

          <h2>Éxito sintético de la tarea</h2>
          <Success success={report.success} />

          <h2>Heatmap de fricción</h2>
          <p className="muted">
            Cada sesión cuenta una vez por zona, por su peor señal: un agente en bucle no pesa más
            que varias personas que tropiezan en el mismo sitio.
          </p>
          <HeatmapView report={report} />

          {(report.zonesByVariant?.length ?? 0) > 1 && (
            <>
              <h2>Zonas por variante</h2>
              <div className="zones-by-variant">
                {report.zonesByVariant?.map(({ variant, zones }) => (
                  <table key={variant}>
                    <caption>Variante {variant}</caption>
                    <thead>
                      <tr>
                        <th scope="col">#</th>
                        <th scope="col">Zona</th>
                        <th scope="col">Intensidad</th>
                        <th scope="col">Sesiones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {zones.slice(0, 5).map((zone) => (
                        <tr key={zone.rank}>
                          <td>{zone.rank}</td>
                          <td>
                            {zone.route} <code>{zone.element ?? '(página)'}</code>
                          </td>
                          <td>{zone.intensity}</td>
                          <td>{zone.sessions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ))}
              </div>
            </>
          )}

          <h2>Embudo por variante</h2>
          <FunnelView funnel={report.funnel} />

          <GeneratedVariant runId={id} />

          <h2>Coste</h2>
          <p>
            {eur.format(report.cost.estimatedEur)} en {report.cost.calls} llamadas LLM
            {report.cost.byRole.length > 0 &&
              ` (${report.cost.byRole.map((role) => `${role.role}: ${eur.format(role.estimatedEur)}`).join(', ')})`}
          </p>
        </>
      )}
    </>
  );
}
