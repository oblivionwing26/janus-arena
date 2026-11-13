import Link from 'next/link';

import type { ConsoleEvent } from '@/lib/console-event';

const SECURITY = new Set(['finding.created', 'surface.mapped', 'audit.completed']);
const ATTACK = new Set(['attack.attempt', 'gate.stage']);

/**
 * Links to the run's variant, security and attack graph pages (F2.8, F3.10), shown only when it
 * has their data.
 */
export function RunLinks({ runId, events }: { runId: string; events: readonly ConsoleEvent[] }) {
  const variant = events.some((event) => event.type === 'patch.proposed');
  const security = events.some((event) => SECURITY.has(event.type));
  const attack = events.some((event) => ATTACK.has(event.type));
  if (!variant && !security && !attack) return null;
  return (
    <p>
      {variant && <Link href={`/runs/${runId}/variant`}>Variante B: diff del UI Engineer →</Link>}
      {variant && security && ' · '}
      {security && (
        <Link href={`/runs/${runId}/security`}>Seguridad: hallazgos y superficie →</Link>
      )}
      {attack && (variant || security) && ' · '}
      {attack && <Link href={`/runs/${runId}/attack`}>Grafo de ataque →</Link>}
    </p>
  );
}
