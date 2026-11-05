import type {
  SessionQueueHandlers,
  SessionQueuePort,
} from '../../domain/run/session-queue-port.js';

/** A queue adapter as the composition root sees it: enqueue side plus worker lifecycle. */
export interface SessionQueueRuntime extends SessionQueuePort {
  start(handlers: SessionQueueHandlers): Promise<void>;
  close(): Promise<void>;
}
