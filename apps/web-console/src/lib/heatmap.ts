import type { FrictionZone, SynthlabReport } from '@janus/shared-kernel';

/** One page of the heatmap: a screenshot of the route and the zones that sit on it. */
export interface RouteHeatmap {
  readonly route: string;
  /** Sum of its zones' intensity: routes are shown hottest first. */
  readonly intensity: number;
  readonly screenshot: NonNullable<FrictionZone['screenshot']> | null;
  /** Zones on an element, drawn as boxes on the screenshot. */
  readonly elements: readonly { readonly zone: FrictionZone; readonly heat: number }[];
  /** Zones on the page as a whole (backtracks, abandonment...), drawn as a frame. */
  readonly page: { readonly zone: FrictionZone; readonly heat: number } | null;
}

/**
 * Groups a report's zones by route for the heatmap view (F1.10). `heat` is the zone's
 * intensity relative to the hottest zone of the run, from 0 to 1, so colours compare across
 * pages. Each route uses the screenshot of its hottest zone that has one.
 */
export function routeHeatmaps(report: Pick<SynthlabReport, 'zones'>): RouteHeatmap[] {
  const max = Math.max(0, ...report.zones.map((zone) => zone.intensity));
  const heat = (zone: FrictionZone) => (max === 0 ? 0 : zone.intensity / max);
  const routes = new Map<string, FrictionZone[]>();
  for (const zone of report.zones)
    routes.set(zone.route, [...(routes.get(zone.route) ?? []), zone]);

  return [...routes]
    .map(([route, zones]) => {
      const page = zones.find((zone) => zone.element === null);
      return {
        route,
        intensity: zones.reduce((sum, zone) => sum + zone.intensity, 0),
        screenshot: zones.find((zone) => zone.screenshot !== null)?.screenshot ?? null,
        elements: zones
          .filter((zone) => zone.element !== null)
          .map((zone) => ({ zone, heat: heat(zone) })),
        page: page === undefined ? null : { zone: page, heat: heat(page) },
      };
    })
    .sort((a, b) => b.intensity - a.intensity || a.route.localeCompare(b.route));
}

/** From yellow (cool) to red (hot); never fully transparent, so a cool zone stays visible. */
export function heatColor(heat: number): string {
  const clamped = Math.min(1, Math.max(0, heat));
  return `hsl(${String(Math.round(50 - 50 * clamped))} 90% 48%)`;
}

/** Path of a run artifact through the console's proxy to the orchestrator. */
export function artifactUrl(runId: string, artifact: string): string {
  return `/api/orchestrator/runs/${runId}/artifacts/${artifact.split('/').map(encodeURIComponent).join('/')}`;
}
