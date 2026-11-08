import {
  isKnownEvent,
  type AuditCompletedEvent,
  type FindingCreatedEvent,
  type SurfaceMappedEvent,
} from '@janus/shared-kernel';

import type { ConsoleEvent } from './console-event';

export type Severity = FindingCreatedEvent['payload']['severity'];
export const SEVERITIES: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

export interface FindingRow {
  readonly id: string;
  readonly severity: Severity;
  readonly status: FindingCreatedEvent['payload']['status'];
  /** The tool, or `—` for findings recorded before F2.8. */
  readonly tool: string;
  readonly rule: string;
  readonly where: string;
  readonly title: string;
}

/** The findings of a run, most severe first, then by tool and place. */
export function findingRows(events: readonly ConsoleEvent[]): FindingRow[] {
  return events
    .filter(isKnownEvent)
    .flatMap((event) => {
      if (event.type !== 'finding.created') return [];
      const { payload } = event;
      return [
        {
          id: payload.findingId,
          severity: payload.severity,
          status: payload.status,
          tool: payload.tool ?? '—',
          rule: payload.rule ?? '—',
          where:
            payload.file === undefined
              ? ''
              : `${payload.file}${payload.line === undefined || payload.line === 0 ? '' : `:${String(payload.line)}`}`,
          title: payload.title,
        },
      ];
    })
    .sort(
      (a, b) =>
        SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) ||
        a.tool.localeCompare(b.tool) ||
        a.where.localeCompare(b.where),
    );
}

export interface FindingFilter {
  readonly tools: ReadonlySet<string>;
  readonly severities: ReadonlySet<Severity>;
}

/** Rows whose tool and severity are both selected; an empty selection selects everything. */
export function filterFindings(rows: readonly FindingRow[], filter: FindingFilter): FindingRow[] {
  return rows.filter(
    (row) =>
      (filter.tools.size === 0 || filter.tools.has(row.tool)) &&
      (filter.severities.size === 0 || filter.severities.has(row.severity)),
  );
}

export type SurfaceSide = SurfaceMappedEvent['payload'];
export type SurfaceRow = SurfaceSide['endpoints'][number] & {
  /** A session is demanded but nothing filters by its user: a lead for an IDOR. */
  readonly idorLead: boolean;
};

/** The surface maps a run recorded (base and variant of a differential audit). */
export function surfaces(events: readonly ConsoleEvent[]): SurfaceSide[] {
  return events
    .filter(isKnownEvent)
    .flatMap((event) => (event.type === 'surface.mapped' ? [event.payload] : []));
}

export interface SurfaceFilter {
  readonly auth: 'all' | 'yes' | 'no';
  readonly owner: 'all' | 'yes' | 'no' | 'unknown';
}

/** A surface map as table rows, IDOR leads first, filtered by auth and owner check. */
export function surfaceRows(side: SurfaceSide, filter: SurfaceFilter): SurfaceRow[] {
  const owner = (value: boolean | 'unknown') =>
    value === 'unknown' ? 'unknown' : value ? 'yes' : 'no';
  return side.endpoints
    .map((endpoint) => ({ ...endpoint, idorLead: endpoint.auth && endpoint.ownerCheck === false }))
    .filter(
      (row) =>
        (filter.auth === 'all' || (filter.auth === 'yes') === row.auth) &&
        (filter.owner === 'all' || filter.owner === owner(row.ownerCheck)),
    )
    .sort(
      (a, b) =>
        Number(b.idorLead) - Number(a.idorLead) ||
        a.route.localeCompare(b.route) ||
        a.method.localeCompare(b.method),
    );
}

/** The verdict of the differential audit, when the run has one. */
export function auditVerdict(
  events: readonly ConsoleEvent[],
): AuditCompletedEvent['payload'] | null {
  for (const event of events) {
    if (isKnownEvent(event) && event.type === 'audit.completed') return event.payload;
  }
  return null;
}
