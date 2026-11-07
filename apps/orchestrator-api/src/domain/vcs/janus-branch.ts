import { InvalidBranchNameError } from './vcs-errors.js';

const ULID = '[0-9A-HJKMNP-TV-Z]{26}';
const JANUS_BRANCH = new RegExp(`^janus/(variant|fix)-${ULID}$`);

/**
 * The only branches Janus may create in a target (CLAUDE.md): `janus/variant-<runId>` for a
 * generated variant B and `janus/fix-<findingId>` for a security fix.
 */
export const JanusBranch = {
  variant(runId: string): string {
    return JanusBranch.assert(`janus/variant-${runId}`);
  },
  fix(findingId: string): string {
    return JanusBranch.assert(`janus/fix-${findingId}`);
  },
  /** The name itself when it follows the convention; InvalidBranchNameError otherwise. */
  assert(name: string): string {
    if (!JANUS_BRANCH.test(name)) throw new InvalidBranchNameError(name);
    return name;
  },
} as const;
