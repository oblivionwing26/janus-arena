import { describeBuildChecksContract } from '../../test-support/build-checks-contract.js';
import { CONTRACT_FILES, CONTRACT_RUN } from '../../test-support/vcs-contract.js';
import { InMemoryVcs } from '../vcs/in-memory-vcs.js';
import { ScriptedBuildChecks } from './scripted-build-checks.js';

const URL = 'file:///fixtures/checks';

describeBuildChecksContract('ScriptedBuildChecks', {
  create: async () => {
    const vcs = new InMemoryVcs({ [URL]: { main: CONTRACT_FILES } });
    const workspace = await vcs.clone(URL, { runId: CONTRACT_RUN, ref: 'main' });
    return {
      checks: new ScriptedBuildChecks(vcs),
      vcs,
      workspace,
      breakingPatch: [
        '--- a/README.md',
        '+++ b/README.md',
        '@@ -1 +1 @@',
        '-ShopLab fixture',
        '+ShopLab BROKEN',
        '',
      ].join('\n'),
    };
  },
});
