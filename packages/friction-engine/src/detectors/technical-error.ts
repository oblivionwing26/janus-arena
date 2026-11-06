import type { PageErrorEvent } from '@janus/shared-kernel';

import type { FrictionConfig } from '../config.js';
import { location, type AgentSession } from '../session.js';
import type { FrictionSignalDraft, FrictionSeverity } from '../signal.js';

function severityOf(error: PageErrorEvent): FrictionSeverity {
  const { kind, status } = error.payload;
  if (kind === 'console') return 'low';
  if (kind === 'http' && status !== undefined && status >= 500) return 'high';
  return 'medium';
}

/**
 * The page broke while the agent used it: a server error, a failed request, a timeout or a
 * console error (page.error, F1.6). Noise such as a missing favicon is ignored, and so are
 * responses where the server simply rejected the input (a validation 400 is a form error).
 */
export function detectTechnicalErrors(
  session: AgentSession,
  config: FrictionConfig,
): FrictionSignalDraft[] {
  const ignored = config.technicalError.ignoreUrls.map((pattern) => new RegExp(pattern));
  const ignoredStatuses = new Set(config.technicalError.ignoreStatuses);
  return session.errors.flatMap((error) => {
    const { kind, status, url, stepIndex } = error.payload;
    if (kind === 'http' && status !== undefined && status < 400) return [];
    if (kind === 'http' && status !== undefined && ignoredStatuses.has(status)) return [];
    if (kind !== 'console' && ignored.some((pattern) => pattern.test(url))) return [];
    return [
      {
        detector: 'technical-error' as const,
        severity: severityOf(error),
        agentId: session.agentId,
        evidenceEventIds: [error.id],
        ...location(session, stepIndex),
      },
    ];
  });
}
