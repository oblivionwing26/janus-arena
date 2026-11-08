'use client';

import { useMemo, useState } from 'react';

import { filterFindings, SEVERITIES, type FindingRow, type Severity } from '@/lib/security';

function toggle<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/** The static findings of a run (F2.8), filterable by tool and severity. */
export function FindingsTable({ rows }: { rows: readonly FindingRow[] }) {
  const [tools, setTools] = useState<ReadonlySet<string>>(new Set());
  const [severities, setSeverities] = useState<ReadonlySet<Severity>>(new Set());
  const allTools = useMemo(() => [...new Set(rows.map((row) => row.tool))].sort(), [rows]);
  const shown = filterFindings(rows, { tools, severities });

  if (rows.length === 0) return <p className="muted">Ningún hallazgo en este run.</p>;
  return (
    <>
      <fieldset className="filters">
        <legend>Herramienta</legend>
        {allTools.map((tool) => (
          <label key={tool}>
            <input
              type="checkbox"
              checked={tools.has(tool)}
              onChange={() => {
                setTools(toggle(tools, tool));
              }}
            />
            {tool}
          </label>
        ))}
      </fieldset>
      <fieldset className="filters">
        <legend>Severidad</legend>
        {SEVERITIES.map((severity) => (
          <label key={severity}>
            <input
              type="checkbox"
              checked={severities.has(severity)}
              onChange={() => {
                setSeverities(toggle(severities, severity));
              }}
            />
            {severity}
          </label>
        ))}
      </fieldset>
      <p className="muted">
        {shown.length} de {rows.length} hallazgos. Son sospechas de una herramienta: confirmar uno
        exige una prueba de concepto reproducible.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Severidad</th>
              <th scope="col">Herramienta</th>
              <th scope="col">Regla</th>
              <th scope="col">Dónde</th>
              <th scope="col">Estado</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.id} title={row.title}>
                <td>
                  <span className={`severity severity-${row.severity}`}>{row.severity}</span>
                </td>
                <td>{row.tool}</td>
                <td>
                  <code>{row.rule}</code>
                </td>
                <td>
                  <code>{row.where}</code>
                </td>
                <td>{row.status === 'confirmed' ? 'confirmado' : 'sospecha'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
