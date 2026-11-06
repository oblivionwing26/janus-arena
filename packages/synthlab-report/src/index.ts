// Public entry point of @janus/synthlab-report: a run's events in, its SynthLab report out.

export { buildSynthlabReport } from './build-report.js';
export { costOf } from './cost.js';
export { funnelOf, type FunnelRow } from './funnel.js';
export { funnelsFileSchema, reportConfigSchema, type ReportConfig } from './report-config.js';
export { routeOf } from './route-pattern.js';
export { frictionZones } from './zones.js';
