import { parseEvent, type RunCompletedEvent } from '@janus/shared-kernel';
import { PrismaPg } from '@prisma/adapter-pg';

import { DuplicateEventSeqError } from '../../domain/event-store/duplicate-event-seq-error.js';
import type {
  EventStorePort,
  SubscribeOptions,
} from '../../domain/event-store/event-store-port.js';
import { isRunCompleted, type RunSummary } from '../../domain/event-store/run-summary.js';
import type { StoredEvent } from '../../domain/event-store/stored-event.js';
import { Prisma, PrismaClient } from '../persistence/generated/prisma/client.js';
import { findDuplicateSeq } from './find-duplicate-seq.js';
import { followRun } from './follow-run.js';
import { PgNotificationHub } from './pg-notification-hub.js';

const UNIQUE_VIOLATION = 'P2002';

// The stored body is the event exactly as appended, so it round-trips UnknownEvent fields.
function toJson(event: StoredEvent): Prisma.InputJsonObject {
  return event as unknown as Prisma.InputJsonObject;
}

export class PostgresEventStore implements EventStorePort {
  private constructor(
    private readonly prisma: PrismaClient,
    private readonly hub: PgNotificationHub,
  ) {}

  static async connect(connectionString: string): Promise<PostgresEventStore> {
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    const hub = await PgNotificationHub.connect(connectionString);
    return new PostgresEventStore(prisma, hub);
  }

  async append(events: readonly StoredEvent[]): Promise<void> {
    if (events.length === 0) return;
    // What readRun would reject never gets in: one bad envelope made a whole run unreadable.
    events.forEach((event) => parseEvent(event));
    const duplicate = findDuplicateSeq(events);
    if (duplicate !== undefined) throw new DuplicateEventSeqError(duplicate.runId, duplicate.seq);

    const runIds = [...new Set(events.map((event) => event.runId))];
    try {
      await this.prisma.$transaction([
        this.prisma.run.createMany({ data: runIds.map((id) => ({ id })), skipDuplicates: true }),
        this.prisma.event.createMany({
          data: events.map((event) => ({
            id: event.id,
            runId: event.runId,
            seq: event.seq,
            ts: new Date(event.ts),
            schemaVersion: event.schemaVersion,
            actorAgentId: event.actor.agentId,
            actorRole: event.actor.role,
            type: event.type,
            body: toJson(event),
          })),
        }),
      ]);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        const runId = runIds.length === 1 ? runIds[0] : undefined;
        throw new DuplicateEventSeqError(runId ?? runIds.join(','), undefined);
      }
      throw error;
    }
  }

  async readRun(runId: string, fromSeq = 0): Promise<StoredEvent[]> {
    const rows = await this.prisma.event.findMany({
      where: { runId, seq: { gte: fromSeq } },
      orderBy: { seq: 'asc' },
      select: { body: true },
    });
    return rows.map((row) => parseEvent(row.body));
  }

  subscribe(runId: string, options: SubscribeOptions = {}): AsyncIterable<StoredEvent> {
    return followRun(
      {
        readRun: (id, fromSeq) => this.readRun(id, fromSeq),
        watch: (id, onChange) => this.hub.watch(id, onChange),
      },
      runId,
      options.fromSeq ?? 0,
      options.signal,
    );
  }

  async listRuns(limit = 100): Promise<RunSummary[]> {
    const groups = await this.prisma.event.groupBy({
      by: ['runId'],
      _min: { ts: true },
      _count: { _all: true },
      orderBy: { _min: { ts: 'desc' } },
      take: limit,
    });
    const completions = await this.prisma.event.findMany({
      where: { runId: { in: groups.map((group) => group.runId) }, type: 'run.completed' },
      orderBy: { seq: 'asc' },
      select: { runId: true, body: true },
    });
    const completedByRun = new Map<string, RunCompletedEvent>();
    for (const row of completions) {
      const event = parseEvent(row.body);
      if (isRunCompleted(event) && !completedByRun.has(row.runId)) {
        completedByRun.set(row.runId, event);
      }
    }
    return groups.map((group) => {
      const completed = completedByRun.get(group.runId);
      return {
        runId: group.runId,
        startedAt: (group._min.ts ?? new Date(0)).toISOString(),
        eventCount: group._count._all,
        status: completed === undefined ? 'running' : 'completed',
        outcome: completed?.payload.outcome ?? null,
        reason: completed?.payload.reason ?? null,
      };
    });
  }

  async close(): Promise<void> {
    await Promise.all([this.prisma.$disconnect(), this.hub.close()]);
  }
}
