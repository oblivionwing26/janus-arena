import { z } from 'zod';

import { NetworkGuard } from '../../domain/scope/network-guard.js';
import type { ScopedHttpPort } from '../../domain/scope/scoped-http-port.js';

const challenges = z.object({
  data: z.array(z.object({ key: z.string(), solved: z.boolean() })),
});

/**
 * Juice Shop's own ground truth (F3.2): which of its challenges it considers solved. Read only
 * by the orchestrator, to check that an oracle agrees with the target (F3.2) and to score the
 * benchmark (F3.11). It must never be wired to an agent: every agent's scope excludes
 * /api/Challenges (config/scopes.yaml), and this reader has its own guard for that one path.
 */
export class JuiceShopChallenges {
  constructor(
    private readonly http: ScopedHttpPort,
    private readonly origin: string,
  ) {}

  /** Whether each challenge is solved; a key Juice Shop does not know is absent. */
  async solved(keys: readonly string[]): Promise<ReadonlyMap<string, boolean>> {
    const guard = new NetworkGuard({
      target: 'juice-shop-ground-truth',
      origins: [this.origin],
      excludedPaths: [],
      allowedTests: ['http-probe'],
      maxRequestsPerSecond: 5,
    });
    const reply = await this.http
      .client(guard, () => Promise.resolve())
      .send({ method: 'GET', url: `${this.origin}/api/Challenges`, testType: 'http-probe' });
    if (reply.status !== 200) {
      throw new Error(`Juice Shop challenges answered ${String(reply.status)}`);
    }
    const all = challenges.parse(JSON.parse(reply.body)).data;
    return new Map(
      all.filter((challenge) => keys.includes(challenge.key)).map((c) => [c.key, c.solved]),
    );
  }
}
