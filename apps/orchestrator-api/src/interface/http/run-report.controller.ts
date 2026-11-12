import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import type { SynthlabReport } from '@janus/shared-kernel';
import { buildSynthlabReport } from '@janus/synthlab-report';
import { z } from 'zod';

import {
  ArtifactNotFoundError,
  InvalidArtifactKeyError,
} from '../../domain/artifacts/artifact-errors.js';
import { assertArtifactKey } from '../../domain/artifacts/assert-artifact-key.js';
import {
  EVENT_STORE_PORT,
  type EventStorePort,
} from '../../domain/event-store/event-store-port.js';
import { APP_ADAPTERS, type AppAdapters } from '../app-adapters.js';
import { runTarget } from '../../domain/run/run-target.js';

const runIdSchema = z.ulid();
// The part of the Fastify reply this controller uses (fastify is not a direct dependency).
interface Reply {
  type(contentType: string): Reply;
  header(name: string, value: string): Reply;
}
const targetSchema = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/);

/**
 * The SynthLab report of a run (F1.10), computed from its events on every request, and the
 * screenshots it points at. Read-only: nothing here writes the event log.
 */
@Controller('runs')
export class RunReportController {
  constructor(
    @Inject(EVENT_STORE_PORT) private readonly store: EventStorePort,
    @Inject(APP_ADAPTERS) private readonly adapters: AppAdapters,
  ) {}

  @Get(':id/report')
  async report(@Param('id') id: string, @Query('target') asked?: string): Promise<SynthlabReport> {
    const runId = this.parseRunId(id);
    if (asked !== undefined && !targetSchema.safeParse(asked).success) {
      throw new BadRequestException('Invalid target');
    }
    const events = await this.store.readRun(runId);
    if (events.length === 0) throw new NotFoundException(`Run ${runId} does not exist`);
    // The run's own target (F3.5); ShopLab for runs recorded before targets were.
    const target = asked ?? runTarget(events) ?? 'shoplab';
    const config = this.adapters.reports?.[target];
    if (config === undefined) throw new NotFoundException(`No report settings for ${target}`);
    return buildSynthlabReport(runId, events, config);
  }

  /** A run artifact such as `carmen-retired-a-s1-a1/step-12.png`. Only PNG screenshots. */
  @Get(':id/artifacts/*')
  async artifact(
    @Param('id') id: string,
    @Param('*') key: string,
    @Res({ passthrough: true }) reply: Reply,
  ): Promise<Buffer> {
    const runId = this.parseRunId(id);
    const artifacts = this.adapters.artifacts;
    if (artifacts === undefined)
      throw new NotFoundException('This orchestrator stores no artifacts');
    try {
      assertArtifactKey(key);
      if (!key.endsWith('.png')) throw new InvalidArtifactKeyError(key);
      const bytes = await artifacts.get(runId, key);
      void reply.type('image/png').header('cache-control', 'private, max-age=3600');
      return Buffer.from(bytes);
    } catch (error) {
      if (error instanceof InvalidArtifactKeyError) throw new BadRequestException(error.message);
      if (error instanceof ArtifactNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  private parseRunId(id: string): string {
    const parsed = runIdSchema.safeParse(id);
    if (!parsed.success) throw new BadRequestException('Run id must be a ULID');
    return parsed.data;
  }
}
