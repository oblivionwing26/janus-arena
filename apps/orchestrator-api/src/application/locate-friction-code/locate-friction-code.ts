import type { FrictionZone, JanusEvent, UnknownEvent } from '@janus/shared-kernel';

import type { VcsPort, VcsWorkspace } from '../../domain/vcs/vcs-port.js';
import { buildContext, type CodeContext } from './build-context.js';
import { isCodeFile, rankCandidates, type CodeCandidate } from './rank-candidates.js';
import { zoneHints, type ZoneHints } from './zone-hints.js';

export interface FrictionCode {
  readonly hints: ZoneHints;
  readonly candidates: readonly CodeCandidate[];
  readonly context: CodeContext;
}

export interface LocateFrictionCodeInput {
  readonly zone: Pick<FrictionZone, 'route' | 'element' | 'evidenceEventIds'>;
  /** The run's events: the zone's texts come from its agent.step events. */
  readonly events: readonly (JanusEvent | UnknownEvent)[];
  readonly workspace: VcsWorkspace;
  /** Route patterns of the target (config/funnels.yaml). */
  readonly routes?: readonly string[];
  readonly maxTokens?: number;
}

/**
 * From a friction zone to the code behind it (F2.2), by code alone: the zone's hints, the
 * workspace's source files ranked by route, imports and texts, and a compact context of the
 * best ones. Reads the target only through VcsPort, which never lists hidden ground-truth
 * files; documents are not searched anyway.
 */
export class LocateFrictionCode {
  constructor(private readonly deps: { readonly vcs: VcsPort }) {}

  async execute(input: LocateFrictionCodeInput): Promise<FrictionCode> {
    const { vcs } = this.deps;
    const hints = zoneHints(input.zone, input.events, input.routes);
    const sources = new Map<string, string>();
    for (const path of (await vcs.listFiles(input.workspace)).filter(isCodeFile)) {
      sources.set(path, await vcs.readFile(input.workspace, path));
    }
    const candidates = rankCandidates(hints, sources);
    return {
      hints,
      candidates,
      context: buildContext(hints, candidates, sources, {
        ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
      }),
    };
  }
}
