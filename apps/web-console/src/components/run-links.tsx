import Link from 'next/link';

import type { ConsoleEvent } from '@/lib/console-event';

const SECURITY = new Set(['finding.created', 'surface.mapped', 'audit.completed']);

/** Links to the run's variant and security pages (F2.8), shown only when it has their data. */
export function RunLinks({ runId, events }: { runId: string; events: readonly ConsoleEvent[] }) {
  const variant = events.some((event) => event.type === 'patch.proposed');
  const security = events.some((event) => SECURITY.has(event.type));
  if (!variant && !security) return null;
  return (
    <p>
      {variant && <Link href={`/runs/${runId}/variant`}>Variante B: diff del UI Engineer →</Link>}
      {variant && security && ' · '}
      {security && (
        <Link href={`/runs/${runId}/security`}>Seguridad: hallazgos y superficie →</Link>
      )}
    </p>
  );
}
