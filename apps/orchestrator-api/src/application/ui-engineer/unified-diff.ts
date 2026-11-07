const CONTEXT = 3;

interface Op {
  readonly kind: ' ' | '-' | '+';
  readonly line: string;
}

function splitLines(text: string): string[] {
  if (text === '') return [];
  return text.replace(/\n$/, '').split('\n');
}

/** The edit script between two line lists, from their longest common subsequence. */
function editScript(a: readonly string[], b: readonly string[]): Op[] {
  const common: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    const row = common[i] ?? [];
    for (let j = b.length - 1; j >= 0; j--) {
      row[j] =
        a[i] === b[j]
          ? (common[i + 1]?.[j + 1] ?? 0) + 1
          : Math.max(common[i + 1]?.[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      ops.push({ kind: ' ', line: a[i] ?? '' });
      i += 1;
      j += 1;
    } else if (
      i < a.length &&
      (j >= b.length || (common[i + 1]?.[j] ?? 0) >= (common[i]?.[j + 1] ?? 0))
    ) {
      // Removals before additions, as git writes them.
      ops.push({ kind: '-', line: a[i] ?? '' });
      i += 1;
    } else {
      ops.push({ kind: '+', line: b[j] ?? '' });
      j += 1;
    }
  }
  return ops;
}

/**
 * A git-style unified diff of one file (F2.3): the UI Engineer edits files in memory, and the
 * change reaches the workspace only as a patch through VcsPort.applyPatch. `before` null is a
 * new file, `after` null a deleted one. Texts end with a newline. Empty when nothing changed.
 */
export function unifiedDiff(path: string, before: string | null, after: string | null): string {
  if (before === after) return '';
  const ops = editScript(splitLines(before ?? ''), splitLines(after ?? ''));
  const header = [
    `diff --git a/${path} b/${path}`,
    ...(before === null ? ['new file mode 100644'] : []),
    ...(after === null ? ['deleted file mode 100644'] : []),
    `--- ${before === null ? '/dev/null' : `a/${path}`}`,
    `+++ ${after === null ? '/dev/null' : `b/${path}`}`,
  ];

  const changed = ops.flatMap((op, index) => (op.kind === ' ' ? [] : [index]));
  const hunks: string[] = [];
  let cursor = 0;
  while (cursor < changed.length) {
    const first = changed[cursor] ?? 0;
    let last = first;
    while (cursor + 1 < changed.length && (changed[cursor + 1] ?? 0) - last <= 2 * CONTEXT + 1) {
      cursor += 1;
      last = changed[cursor] ?? last;
    }
    cursor += 1;
    const start = Math.max(0, first - CONTEXT);
    const end = Math.min(ops.length - 1, last + CONTEXT);
    const slice = ops.slice(start, end + 1);
    const prior = ops.slice(0, start);
    const oldStart = prior.filter((op) => op.kind !== '+').length;
    const newStart = prior.filter((op) => op.kind !== '-').length;
    const oldCount = slice.filter((op) => op.kind !== '+').length;
    const newCount = slice.filter((op) => op.kind !== '-').length;
    hunks.push(
      `@@ -${String(oldCount === 0 ? oldStart : oldStart + 1)},${String(oldCount)} +${String(newCount === 0 ? newStart : newStart + 1)},${String(newCount)} @@`,
      ...slice.map((op) => `${op.kind}${op.line}`),
    );
  }
  return `${[...header, ...hunks].join('\n')}\n`;
}
