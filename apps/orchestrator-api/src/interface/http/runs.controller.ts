import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  Sse,
  type MessageEvent,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { z } from 'zod';

import type { StartRun } from '../../application/start-run.js';
import type { StopRun } from '../../application/stop-run.js';
import {
  EVENT_STORE_PORT,
  type EventStorePort,
} from '../../domain/event-store/event-store-port.js';
import type { RunSummary } from '../../domain/event-store/run-summary.js';
import { isRunCompleted } from '../../domain/event-store/run-summary.js';
import type { StoredEvent } from '../../domain/event-store/stored-event.js';
import { RunNotFoundError } from '../../domain/run/run-errors.js';
import { START_RUN, STOP_RUN } from '../tokens.js';
import { startRunBodySchema } from './start-run-body.js';
import { PersonaNotFoundError } from '../../domain/persona/persona-not-found-error.js';

const runIdSchema = z.ulid();

function toMessage(event: StoredEvent): MessageEvent {
  return { id: String(event.seq), type: event.type, data: event };
}

@Controller('runs')
export class RunsController {
  private readonly logger = new Logger(RunsController.name);

  constructor(
    @Inject(START_RUN) private readonly startRun: StartRun,
    @Inject(STOP_RUN) private readonly stopRun: StopRun,
    @Inject(EVENT_STORE_PORT) private readonly store: EventStorePort,
  ) {}

  @Post()
  @HttpCode(202)
  async start(@Body() body: unknown): Promise<{ runId: string }> {
    const parsed = startRunBodySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(z.prettifyError(parsed.error));
    let started: Awaited<ReturnType<StartRun['execute']>>;
    try {
      started = await this.startRun.execute(parsed.data);
    } catch (error) {
      if (error instanceof PersonaNotFoundError) throw new BadRequestException(error.message);
      throw error;
    }
    const { runId, launched } = started;
    launched.catch((error: unknown) => {
      this.logger.error(`Run ${runId} failed to launch`, error);
    });
    return { runId };
  }

  @Get()
  async list(): Promise<{ runs: RunSummary[] }> {
    return { runs: await this.store.listRuns() };
  }

  /** Live stream of a run's events (ends after run.completed); `?replay=1` reads the table. */
  @Sse(':id/events')
  async events(
    @Param('id') id: string,
    @Query('replay') replay?: string,
  ): Promise<Observable<MessageEvent>> {
    const runId = this.parseRunId(id);
    const existing = await this.store.readRun(runId);
    if (existing.length === 0) throw new NotFoundException(`Run ${runId} does not exist`);

    if (replay === '1' || replay === 'true') {
      return new Observable((subscriber) => {
        existing.forEach((event) => {
          subscriber.next(toMessage(event));
        });
        subscriber.complete();
      });
    }

    return new Observable((subscriber) => {
      const controller = new AbortController();
      void (async () => {
        try {
          for await (const event of this.store.subscribe(runId, { signal: controller.signal })) {
            subscriber.next(toMessage(event));
            if (isRunCompleted(event)) break;
          }
          subscriber.complete();
        } catch (error) {
          subscriber.error(error);
        }
      })();
      return () => {
        controller.abort();
      };
    });
  }

  @Post(':id/stop')
  @HttpCode(202)
  async stop(@Param('id') id: string): Promise<{ runId: string; stopped: true }> {
    const runId = this.parseRunId(id);
    try {
      await this.stopRun.execute(runId);
    } catch (error) {
      if (error instanceof RunNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
    return { runId, stopped: true };
  }

  private parseRunId(id: string): string {
    const parsed = runIdSchema.safeParse(id);
    if (!parsed.success) throw new BadRequestException('Run id must be a ULID');
    return parsed.data;
  }
}
