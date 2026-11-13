'use client';

import { useEffect, useState } from 'react';

import {
  STATE_LABELS,
  ATTACKER_LABELS,
  type FindingView,
  type GraphNode,
} from '@/lib/attack-graph';

import { DiffView } from './diff-view';

/** The PoC of a confirmed finding, fetched when its endpoint is selected. */
function PocView({ finding }: { finding: FindingView }) {
  const [poc, setPoc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { pocRunId, findingId } = finding;

  useEffect(() => {
    if (pocRunId === null) return;
    let cancelled = false;
    fetch(`/api/orchestrator/runs/${pocRunId}/pocs/${findingId}`).then(
      async (response) => {
        if (!response.ok) throw new Error(`El orquestador respondió ${String(response.status)}`);
        const text = JSON.stringify(await response.json(), null, 2);
        if (!cancelled) setPoc(text);
      },
      (caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [pocRunId, findingId]);

  if (pocRunId === null) return <p className="muted">Sin PoC confirmada todavía.</p>;
  if (error !== null) return <p role="alert">{error}</p>;
  if (poc === null) return <p className="muted">Cargando la PoC…</p>;
  return (
    <details open>
      <summary>PoC (se repite con usuarios nuevos)</summary>
      <pre className="ag-poc">{poc}</pre>
    </details>
  );
}

/** What the selected endpoint went through: attempts, findings with their PoC, patches, verifiers. */
export function NodePanel({ node }: { node: GraphNode | null }) {
  if (node === null) {
    return (
      <aside className="ag-panel" aria-label="Detalle del endpoint">
        <p className="muted">
          Selecciona un endpoint del grafo para ver sus intentos, PoC y parches.
        </p>
      </aside>
    );
  }
  return (
    <aside className="ag-panel" aria-label="Detalle del endpoint">
      <h3>
        <code>{node.id}</code>
      </h3>
      <p>
        <span className={`ag-chip ag-${node.state}`}>{STATE_LABELS[node.state]}</span>
        {node.severity !== null && <span className="muted"> · severidad {node.severity}</span>}
      </p>

      <h4>Intentos ({node.attempts.length})</h4>
      {node.attempts.length === 0 ? (
        <p className="muted">Ningún intento todavía.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Quién</th>
              <th>Clase</th>
              <th>HTTP</th>
              <th>Oráculo</th>
            </tr>
          </thead>
          <tbody>
            {node.attempts.map((attempt) => (
              <tr key={attempt.attemptId}>
                <td>{attempt.number}</td>
                <td>{ATTACKER_LABELS[attempt.as]}</td>
                <td>{attempt.testType}</td>
                <td>{attempt.blocked ?? attempt.status ?? '—'}</td>
                <td className={attempt.verdict?.exploitable === true ? 'error' : undefined}>
                  {attempt.verdict === null
                    ? '—'
                    : `${attempt.verdict.exploitable ? 'explotable' : 'no explotable'}: ${attempt.verdict.evidence}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {node.findings.map((finding) => (
        <section key={finding.findingId}>
          <h4>Hallazgo · {finding.severity}</h4>
          <p>{finding.title}</p>
          <PocView finding={finding} />
        </section>
      ))}

      {node.remediations.map((remediation) => (
        <p key={remediation.findingId} className={remediation.status === 'fixed' ? 'ok' : 'error'}>
          {remediation.status === 'fixed'
            ? `Corregido tras ${String(remediation.iterations)} iteración(es): los tres verificadores pasaron.`
            : `Sigue abierto tras ${String(remediation.iterations)} iteración(es): ${remediation.reason ?? ''}`}
        </p>
      ))}

      {node.patches.map((patch) => (
        <section key={patch.patchId}>
          <h4>Parche del Blue Team</h4>
          {patch.summary !== null && <p className="muted">{patch.summary}</p>}
          <DiffView
            patch={{
              patchId: patch.patchId,
              branch: patch.branch,
              diff: patch.diff,
              summary: patch.summary,
              ts: '',
              checks: patch.verifiers.map((each) => ({
                verifier: each.verifier,
                passed: each.passed,
                details: each.details ?? '',
              })),
            }}
          />
        </section>
      ))}
    </aside>
  );
}
