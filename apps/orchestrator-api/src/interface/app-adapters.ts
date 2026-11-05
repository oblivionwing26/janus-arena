import type { BrowserPort } from '../domain/browser/browser-port.js';
import type { EventStorePort } from '../domain/event-store/event-store-port.js';
import type { SandboxPort } from '../domain/sandbox/sandbox-port.js';
import type { SessionQueueRuntime } from '../infrastructure/queue/session-queue-runtime.js';

/** Every adapter the app needs. main.ts passes the real ones; tests pass in-memory fakes. */
export interface AppAdapters {
  readonly eventStore: EventStorePort & { close?(): Promise<void> };
  readonly sandbox: SandboxPort;
  readonly browser: BrowserPort & { shutdown?(): Promise<void> };
  readonly queue: SessionQueueRuntime;
}

export const APP_ADAPTERS = Symbol('AppAdapters');
