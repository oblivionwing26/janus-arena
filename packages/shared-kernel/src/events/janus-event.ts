import { z } from 'zod';

import { agentActionEventSchema } from './v1/agent-action.js';
import { agentStepEventSchema } from './v1/agent-step.js';
import { agentThoughtEventSchema } from './v1/agent-thought.js';
import { auditCompletedEventSchema } from './v1/audit-completed.js';
import { budgetThresholdEventSchema } from './v1/budget-threshold.js';
import { findingCreatedEventSchema } from './v1/finding-created.js';
import { frictionSignalEventSchema } from './v1/friction-signal.js';
import { llmCallEventSchema } from './v1/llm-call.js';
import { pageErrorEventSchema } from './v1/page-error.js';
import { pageScreenshotEventSchema } from './v1/page-screenshot.js';
import { pageVitalsEventSchema } from './v1/page-vitals.js';
import { patchProposedEventSchema } from './v1/patch-proposed.js';
import { runCompletedEventSchema } from './v1/run-completed.js';
import { runStartedEventSchema } from './v1/run-started.js';
import { sessionEndedEventSchema } from './v1/session-ended.js';
import { sessionStartedEventSchema } from './v1/session-started.js';
import { taskVerifiedEventSchema } from './v1/task-verified.js';
import { verificationResultEventSchema } from './v1/verification-result.js';

const knownEventSchemas = [
  runStartedEventSchema,
  runCompletedEventSchema,
  agentStepEventSchema,
  agentActionEventSchema,
  frictionSignalEventSchema,
  llmCallEventSchema,
  findingCreatedEventSchema,
  patchProposedEventSchema,
  verificationResultEventSchema,
  budgetThresholdEventSchema,
  agentThoughtEventSchema,
  sessionEndedEventSchema,
  pageErrorEventSchema,
  pageVitalsEventSchema,
  pageScreenshotEventSchema,
  sessionStartedEventSchema,
  taskVerifiedEventSchema,
  auditCompletedEventSchema,
] as const;

export const janusEventSchema = z.discriminatedUnion('type', knownEventSchemas);

export type JanusEvent = z.infer<typeof janusEventSchema>;
export type JanusEventType = JanusEvent['type'];

const supportedSchemaVersions: ReadonlyMap<string, number> = new Map(
  knownEventSchemas.map((schema) => [schema.shape.type.value, schema.shape.schemaVersion.value]),
);

// Highest schemaVersion this build understands for a type, or undefined for unknown types.
export function supportedSchemaVersion(type: string): number | undefined {
  return supportedSchemaVersions.get(type);
}
