import type { DiffStats } from './vcs-port.js';

/** The UI Engineer's hard limits (CLAUDE.md): at most 5 files and 200 changed lines. */
export const UI_ENGINEER_LIMITS = { maxFiles: 5, maxChangedLines: 200 } as const;
/** The Blue Team's limits (F3.5): the same, so a fix stays small enough to review. */
export const BLUE_TEAM_LIMITS = { maxFiles: 5, maxChangedLines: 200 } as const;

/** Why a change breaks the limits, or null when it fits. Changed lines = added + removed. */
export function exceedsLimits(
  stats: DiffStats,
  limits: { readonly maxFiles: number; readonly maxChangedLines: number } = UI_ENGINEER_LIMITS,
): string | null {
  if (stats.filesChanged > limits.maxFiles) {
    return `${String(stats.filesChanged)} files changed, the limit is ${String(limits.maxFiles)}`;
  }
  const lines = stats.added + stats.removed;
  if (lines > limits.maxChangedLines) {
    return `${String(lines)} lines changed, the limit is ${String(limits.maxChangedLines)}`;
  }
  return null;
}
