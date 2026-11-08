import { isKnownEvent } from '@janus/shared-kernel';

import type { ConsoleEvent } from './console-event';

export type DiffLineKind = 'file' | 'hunk' | 'add' | 'remove' | 'context' | 'meta';

export interface DiffLine {
  readonly kind: DiffLineKind;
  readonly text: string;
  /** Line number in the old and new file, where it applies. */
  readonly oldLine: number | null;
  readonly newLine: number | null;
}

/** A unified diff as lines to draw, with their old and new line numbers. */
export function diffLines(diff: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  for (const text of diff.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (hunk !== null) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      lines.push({ kind: 'hunk', text, oldLine: null, newLine: null });
    } else if (text.startsWith('diff --git ')) {
      lines.push({
        kind: 'file',
        text: text.replace(/^diff --git a\/(\S+) b\/\S+$/, '$1'),
        oldLine: null,
        newLine: null,
      });
    } else if (/^(---|\+\+\+|new file|deleted file|index )/.test(text)) {
      lines.push({ kind: 'meta', text, oldLine: null, newLine: null });
    } else if (text.startsWith('+')) {
      lines.push({ kind: 'add', text: text.slice(1), oldLine: null, newLine: newLine++ });
    } else if (text.startsWith('-')) {
      lines.push({ kind: 'remove', text: text.slice(1), oldLine: oldLine++, newLine: null });
    } else {
      lines.push({ kind: 'context', text: text.slice(1), oldLine: oldLine++, newLine: newLine++ });
    }
  }
  return lines;
}

const VARIANT_BRANCH = /^janus\/variant-([0-9A-HJKMNP-TV-Z]{26})$/;

/**
 * The UI Engineer run behind an A/B run's variant B (F2.8): B is the branch
 * `janus/variant-<runId>`, and that run holds its patches. Null for hand-made variants.
 */
export function variantRunOf(events: readonly ConsoleEvent[]): string | null {
  for (const event of events) {
    if (!isKnownEvent(event) || event.type !== 'run.started') continue;
    for (const variant of event.payload.variants ?? []) {
      const runId = VARIANT_BRANCH.exec(variant.ref)?.[1];
      if (runId !== undefined) return runId;
    }
  }
  return null;
}

export interface VariantPatch {
  readonly patchId: string;
  readonly branch: string;
  readonly diff: string;
  /** The agent's account of the change: agent text, not evidence. Null before F2.8. */
  readonly summary: string | null;
  readonly ts: string;
  readonly checks: readonly {
    readonly verifier: string;
    readonly passed: boolean;
    readonly details: string;
  }[];
}

/** The patches of a UI Engineer run, each with the verifications recorded for it. */
export function variantPatches(events: readonly ConsoleEvent[]): VariantPatch[] {
  const known = events.filter(isKnownEvent);
  return known.flatMap((event) =>
    event.type === 'patch.proposed'
      ? [
          {
            patchId: event.payload.patchId,
            branch: event.payload.branch,
            diff: event.payload.diff,
            summary: event.payload.summary ?? null,
            ts: event.ts,
            checks: known.flatMap((check) =>
              check.type === 'verification.result' &&
              check.payload.patchId === event.payload.patchId
                ? [
                    {
                      verifier: check.payload.verifier,
                      passed: check.payload.passed,
                      details: check.payload.details ?? '',
                    },
                  ]
                : [],
            ),
          },
        ]
      : [],
  );
}
