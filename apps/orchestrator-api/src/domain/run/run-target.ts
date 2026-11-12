import { isKnownEvent, type JanusEvent, type UnknownEvent } from '@janus/shared-kernel';

/** The target a run recorded in run.started (F3.5); undefined for runs from before then. */
export function runTarget(events: readonly (JanusEvent | UnknownEvent)[]): string | undefined {
  const started = events.filter(isKnownEvent).find((event) => event.type === 'run.started');
  return started?.type === 'run.started' ? started.payload.target : undefined;
}
