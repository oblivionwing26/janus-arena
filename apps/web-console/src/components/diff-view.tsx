import { diffLines, type VariantPatch } from '@/lib/variant';

const VERIFIERS: Readonly<Record<string, string>> = {
  'build-checks': 'lint, typecheck y tests',
  'synthlab-rerun': 'SynthLab de nuevo',
  'regression-tests': 'tests de regresión',
  'poc-replay': 'PoC repetida',
};

/** One patch of variant B (F2.8): its diff, line by line, and what verified it. */
export function DiffView({ patch }: { patch: VariantPatch }) {
  return (
    <article className="patch">
      <header>
        <code>{patch.branch}</code> · parche <code>{patch.patchId}</code>
        <ul className="checks">
          {patch.checks.length === 0 && <li className="muted">sin verificar</li>}
          {patch.checks.map((check, index) => (
            <li key={index} className={check.passed ? 'ok' : 'error'}>
              {check.passed ? '✓' : '✗'} {VERIFIERS[check.verifier] ?? check.verifier}
              {check.details === '' ? '' : `: ${check.details.split('\n')[0] ?? ''}`}
            </li>
          ))}
        </ul>
      </header>
      <table className="diff">
        <tbody>
          {diffLines(patch.diff).map((line, index) =>
            line.kind === 'file' || line.kind === 'hunk' ? (
              <tr key={index} className={`diff-${line.kind}`}>
                <td colSpan={3}>{line.text}</td>
              </tr>
            ) : line.kind === 'meta' ? null : (
              <tr key={index} className={`diff-${line.kind}`}>
                <td className="num">{line.oldLine ?? ''}</td>
                <td className="num">{line.newLine ?? ''}</td>
                <td>
                  <span className="sign">
                    {line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ' '}
                  </span>
                  {line.text}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </article>
  );
}
