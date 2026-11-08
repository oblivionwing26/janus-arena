import { DiffView } from '@/components/diff-view';
import type { VariantPatch } from '@/lib/variant';

/** The UI Engineer's patches for variant B (F2.8), each with its summary marked as agent text. */
export function VariantPatches({ patches }: { patches: readonly VariantPatch[] }) {
  if (patches.length === 0) return <p className="muted">Este run no propuso ningún parche.</p>;
  return (
    <>
      {patches.map((patch) => (
        <section key={patch.patchId}>
          {patch.summary !== null && (
            <blockquote className="agent-text">
              <span className="agent-label">Texto del agente, no es evidencia</span>
              {patch.summary}
            </blockquote>
          )}
          <DiffView patch={patch} />
        </section>
      ))}
    </>
  );
}
