'use client';

import { useState } from 'react';

import { DEMO } from '@/lib/demo';
import { artifactUrl, heatColor, routeHeatmaps, type RouteHeatmap } from '@/lib/heatmap';
import type { SynthlabReport } from '@janus/shared-kernel';

function detectorsOf(zone: RouteHeatmap['elements'][number]['zone']): string {
  return zone.detectors.map((entry) => `${entry.detector} ×${String(entry.signals)}`).join(', ');
}

/**
 * One route: its screenshot with the element zones drawn as boxes, coloured by intensity, and
 * a frame for the friction that belongs to the page as a whole. Boxes are viewport positions
 * at the time of each action, so they line up with the screenshot of the same scroll position.
 */
function RouteCard({ runId, map }: { runId: string; map: RouteHeatmap }) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const frame = map.page === null ? undefined : heatColor(map.page.heat);

  return (
    <figure className="heatmap-route">
      <figcaption>
        <strong>{map.route}</strong> · intensidad {map.intensity}
      </figcaption>
      {map.screenshot === null || DEMO ? (
        <p className="muted">
          {DEMO ? 'La demo no incluye capturas de pantalla.' : 'Sin captura de esta página.'}
        </p>
      ) : (
        <div
          className="heatmap-shot"
          style={frame === undefined ? undefined : { outline: `6px solid ${frame}` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a run artifact, not a static asset */}
          <img
            src={artifactUrl(runId, map.screenshot.artifact)}
            alt={`Captura de ${map.route} (paso ${String(map.screenshot.stepIndex)} de ${map.screenshot.agentId})`}
            onLoad={(event) => {
              setSize({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              });
            }}
          />
          {size !== null && (
            <svg viewBox={`0 0 ${String(size.width)} ${String(size.height)}`} aria-hidden="true">
              {map.elements.flatMap(({ zone, heat }) =>
                zone.boxes.map((box, index) => (
                  <rect
                    key={`${zone.rank}-${String(index)}`}
                    x={box.x}
                    y={box.y}
                    width={box.width}
                    height={box.height}
                    fill={heatColor(heat)}
                    fillOpacity={0.25 + 0.35 * heat}
                    stroke={heatColor(heat)}
                    strokeWidth={3}
                  />
                )),
              )}
            </svg>
          )}
        </div>
      )}
      <ul className="heatmap-legend">
        {map.page !== null && (
          <li>
            <span className="swatch" style={{ background: heatColor(map.page.heat) }} />#
            {map.page.zone.rank} Página · {map.page.zone.sessions} sesiones ·{' '}
            {detectorsOf(map.page.zone)}
          </li>
        )}
        {map.elements.map(({ zone, heat }) => (
          <li key={zone.rank}>
            <span className="swatch" style={{ background: heatColor(heat) }} />#{zone.rank}{' '}
            <code>{zone.element}</code> · {zone.sessions} sesiones · {detectorsOf(zone)}
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** The heatmap of a run (F1.10): every route with friction, hottest first. */
export function HeatmapView({ report }: { report: SynthlabReport }) {
  const maps = routeHeatmaps(report);
  if (maps.length === 0) return <p>Ninguna señal de fricción en este run.</p>;
  return (
    <div className="heatmap">
      {maps.map((map) => (
        <RouteCard key={map.route} runId={report.runId} map={map} />
      ))}
    </div>
  );
}
