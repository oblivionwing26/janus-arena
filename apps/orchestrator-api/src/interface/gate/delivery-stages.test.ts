import type { GateStageName, GateStageOutput } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import type { GateStageContext } from '../../domain/gate/gate-stage-port.js';
import { gateReportRuns } from './delivery-stages.js';

const context = (outputs: [GateStageName, GateStageOutput][]): GateStageContext => ({
  gateRunId: '01M796CT3J5XRRXAREPJ88M525',
  outputs: new Map(outputs),
  allowanceEur: 1,
  interrupted: [],
  onRun: () => Promise.resolve(),
});

describe('gateReportRuns', () => {
  it('names every run of a ShopLab-like gate, so the report counts all it spent', () => {
    const runs = gateReportRuns(
      context([
        ['synthlab-a', { runId: '01M796CT6SAG1KM8Y2YEKA027R' }],
        ['variant-b', { runId: '01M796SFQ01XX971E4VC99YNR3', branch: 'janus/variant-x' }],
        ['ab', { runId: '01M796YBE1ZZMFK0266VWSX956' }],
        ['audit', { runId: '01M797M96H2ZDM7K31R7ZM9SY3', blocked: false, introduced: 0 }],
      ]),
    );
    expect(runs).toEqual([
      { role: 'ux', runId: '01M796YBE1ZZMFK0266VWSX956' },
      { role: 'discovery', runId: '01M796CT6SAG1KM8Y2YEKA027R' },
      { role: 'ui-engineer', runId: '01M796SFQ01XX971E4VC99YNR3' },
      { role: 'audit', runId: '01M797M96H2ZDM7K31R7ZM9SY3' },
    ]);
  });

  it('keeps SynthLab on A as the ux run when there is no A/B, once', () => {
    const runs = gateReportRuns(
      context([
        ['synthlab-a', { runId: '01M79YYRATK9KNKWMMD4317E77' }],
        ['red-team', { runId: '01M79ZA35SZ9QRNF6K3AAGXNQN' }],
        [
          'blue-team',
          { runs: ['01M79ZC3PHE7YQA5EQR02YHTBC'], v3Runs: ['01M79ZT16FG1W3EAX2WJNJRQD4'] },
        ],
      ]),
    );
    expect(runs).toEqual([
      { role: 'ux', runId: '01M79YYRATK9KNKWMMD4317E77' },
      { role: 'red-team', runId: '01M79ZA35SZ9QRNF6K3AAGXNQN' },
      { role: 'blue-team', runId: '01M79ZC3PHE7YQA5EQR02YHTBC' },
      { role: 'v3', runId: '01M79ZT16FG1W3EAX2WJNJRQD4' },
    ]);
  });
});
