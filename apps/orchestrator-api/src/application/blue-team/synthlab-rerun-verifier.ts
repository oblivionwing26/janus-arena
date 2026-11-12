import { buildSynthlabReport, type ReportConfig } from '@janus/synthlab-report';

import type { FixUnderTest, FixVerification, FixVerifier } from '../../domain/fix/fix-verifier.js';
import { endpointP95, judgeUx } from '../../domain/fix/judge-ux.js';
import type { RunConfig } from '../../domain/run/run-config.js';
import type { SynthLabPort } from '../../domain/run/synthlab-port.js';
import { JanusBranch } from '../../domain/vcs/janus-branch.js';

/** An endpoint as the surface map names it. */
export interface TouchedEndpoint {
  readonly method: string;
  readonly route: string;
}

/**
 * The third verifier (F3.5, V3): SynthLab plays the target's run file on the original image (A)
 * and on the fix's patched variant (B) in one paired run, and judgeUx decides from the personas'
 * success and the p95 of the endpoints the fix touched. The run is its own run, with its own
 * cost in the console; its id goes in the details.
 */
export class SynthlabRerunVerifier implements FixVerifier {
  readonly name = 'synthlab-rerun' as const;

  constructor(
    private readonly deps: {
      readonly synthlab: SynthLabPort;
      /** The target's SynthLab run (personas, seeds, tasks, budget); its variants are replaced. */
      readonly config: RunConfig;
      readonly report: ReportConfig;
      /** The endpoints served by the files a fix changed, from the surface map. */
      readonly touched: (changedFiles: readonly string[]) => readonly TouchedEndpoint[];
    },
  ) {}

  async verify(fix: FixUnderTest): Promise<FixVerification> {
    const run = await this.deps.synthlab.runAndWait({
      ...this.deps.config,
      variants: [
        { key: 'a', ref: 'image' },
        { key: 'b', ref: JanusBranch.fix(fix.findingId), repo: fix.repo, base: fix.base },
      ],
    });
    const { success } = buildSynthlabReport(run.runId, run.events, this.deps.report);
    const personas = (key: string) =>
      success.variants.find((variant) => variant.variant === key)?.personas ?? null;
    const count = (key: string) => {
      const rate = personas(key);
      return rate === null ? null : { successes: rate.successes, n: rate.n };
    };
    const measured = {
      runId: run.runId,
      a: count('a'),
      b: count('b'),
      latency: this.deps.touched(fix.changedFiles).map((endpoint) => ({
        endpoint: `${endpoint.method} ${endpoint.route}`,
        a: endpointP95(run.events, 'a', endpoint),
        b: endpointP95(run.events, 'b', endpoint),
      })),
    };
    const verdict = judgeUx({
      a: measured.a,
      b: measured.b,
      difference: success.comparison?.difference ?? null,
      latency: measured.latency,
    });
    return { passed: verdict.passed, details: `run ${run.runId}: ${verdict.details}`, measured };
  }
}
