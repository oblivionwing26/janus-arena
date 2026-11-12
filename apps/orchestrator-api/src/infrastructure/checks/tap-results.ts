import type { TestResults } from '../../domain/fix/judge-tests.js';

const FILE = /^# janus-file (\S+)$/;
const SUBTEST = /^( *)# Subtest: (.*)$/;
const RESULT = /^( *)(not )?ok \d+ - (.*?)(?: # (?:SKIP|TODO)\b.*)?$/;

/**
 * Node's TAP output, one file after another behind `# janus-file <path>` lines (F3.5, V2), as one
 * result per leaf test: `file > suite > … > test`. Suites are not results of their own; a file
 * that fails before any of its tests runs counts as one failing test, `<file> > (file)`.
 */
export function tapResults(output: string): TestResults {
  const results = new Map<string, 'pass' | 'fail'>();
  let file: string | null = null;
  /** Open subtests by depth, and whether each had subtests of its own. */
  let stack: { name: string; parent: boolean }[] = [];
  for (const line of output.split(/\r?\n/)) {
    const marker = FILE.exec(line);
    if (marker !== null) {
      file = marker[1] ?? null;
      stack = [];
      continue;
    }
    if (file === null) continue;
    const subtest = SUBTEST.exec(line);
    if (subtest !== null) {
      const depth = (subtest[1] ?? '').length / 4;
      stack = stack.slice(0, depth);
      const parent = stack[depth - 1];
      if (parent !== undefined) parent.parent = true;
      stack.push({ name: subtest[2] ?? '', parent: false });
      continue;
    }
    const result = RESULT.exec(line);
    if (result === null) continue;
    const depth = (result[1] ?? '').length / 4;
    const node = stack[depth];
    if (node === undefined || node.parent) continue;
    const outcome = result[2] === undefined ? 'pass' : 'fail';
    const path = stack.slice(0, depth + 1).map((each) => each.name);
    const name = depth === 0 && path[0] === file ? `${file} > (file)` : [file, ...path].join(' > ');
    results.set(name, results.get(name) === 'fail' ? 'fail' : outcome);
  }
  return results;
}
