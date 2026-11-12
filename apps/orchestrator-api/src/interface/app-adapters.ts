import type { BrowserPort } from '../domain/browser/browser-port.js';
import type { FrictionConfig } from '@janus/friction-engine';
import type { ReportConfig } from '@janus/synthlab-report';

import type { ArtifactStorePort } from '../domain/artifacts/artifact-store-port.js';
import type { EventStorePort } from '../domain/event-store/event-store-port.js';
import type { OrderReaderPort } from '../domain/task/order-reader-port.js';
import type { ShopperAccountPort } from '../domain/task/shopper-account-port.js';
import type { ShopperProfile } from '../domain/task/shopper-profile.js';
import type { LLMGatewayPort } from '../domain/llm/llm-gateway-port.js';
import type { PersonaCatalogPort } from '../domain/persona/persona-catalog-port.js';
import type { SandboxPort } from '../domain/sandbox/sandbox-port.js';
import type { SessionQueueRuntime } from '../infrastructure/queue/session-queue-runtime.js';

/** Every adapter the app needs. main.ts passes the real ones; tests pass in-memory fakes. */
export interface AppAdapters {
  readonly eventStore: EventStorePort & { close?(): Promise<void> };
  readonly sandbox: SandboxPort;
  readonly browser: BrowserPort & { shutdown?(): Promise<void> };
  readonly queue: SessionQueueRuntime;
  /** Persona sessions (F1.4). Without them a run can only use the scripted buyer. */
  readonly gateway?: LLMGatewayPort;
  readonly personas?: PersonaCatalogPort;
  /** Reads each target after a task (F1.9 oracle), by target name. */
  readonly orders?: Readonly<Record<string, OrderReaderPort>>;
  /** Each target's synthetic shopper details (config/shoppers.yaml, F3.5a). */
  readonly shoppers?: Readonly<Record<string, ShopperProfile>>;
  /** Creates shopper accounts before a session, by target (F3.5a). */
  readonly accounts?: Readonly<Record<string, ShopperAccountPort>>;
  /** Screenshots and other run files (F1.6). */
  readonly artifacts?: ArtifactStorePort;
  /** Friction thresholds (config/friction.yaml); the engine defaults otherwise. */
  readonly friction?: FrictionConfig;
  /** Report settings per target (config/funnels.yaml, F1.10). Without them, no reports. */
  readonly reports?: Readonly<Record<string, ReportConfig>>;
}

export const APP_ADAPTERS = Symbol('AppAdapters');
