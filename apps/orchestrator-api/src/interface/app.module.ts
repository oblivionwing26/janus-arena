import { Module } from '@nestjs/common';

import { HealthController } from './http/health.controller.js';

// Composition root (ADR 0001): the only place that wires adapters to ports.
// Inject ports with explicit tokens (@Inject(TOKEN)), never by constructor type.
@Module({
  controllers: [HealthController],
})
export class AppModule {}
