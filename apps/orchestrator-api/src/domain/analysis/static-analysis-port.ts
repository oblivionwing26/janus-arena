import type { VcsWorkspace } from '../vcs/vcs-port.js';
import type { StaticFinding } from './static-finding.js';

/**
 * One static analysis tool over a workspace (F2.5): Semgrep, gitleaks, osv-scanner or
 * dependency-cruiser, normalised to StaticFinding. Tools never run the target's code. Every
 * adapter must pass src/test-support/static-analysis-contract.ts.
 */
export interface StaticAnalysisPort {
  run(workspace: VcsWorkspace): Promise<StaticFinding[]>;
}

export const STATIC_ANALYSIS_PORT = Symbol('StaticAnalysisPort');
