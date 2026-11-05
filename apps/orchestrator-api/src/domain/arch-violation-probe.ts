// TEMPORARY (F0.4 proof): domain/ must not import NestJS. CI must fail on check:arch.
// This branch is never merged.
import { Injectable } from '@nestjs/common';

@Injectable()
export class ArchViolationProbe {
  readonly name = 'arch-violation-probe';
}
