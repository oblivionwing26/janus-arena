'use client';

import { useState } from 'react';

import { surfaceRows, type SurfaceFilter, type SurfaceSide } from '@/lib/security';

const OWNER: Readonly<Record<string, string>> = { true: 'sí', false: 'no', unknown: '?' };

/** The HTTP surface maps of a run (F2.8): A and B in tabs, filterable, IDOR leads first. */
export function SurfaceTable({ sides }: { sides: readonly SurfaceSide[] }) {
  const [tab, setTab] = useState(sides.findIndex((side) => side.side === 'variant'));
  const [filter, setFilter] = useState<SurfaceFilter>({ auth: 'all', owner: 'all' });
  const current = sides[tab === -1 ? 0 : tab];

  if (current === undefined) return <p className="muted">Este run no tiene mapa de superficie.</p>;
  const rows = surfaceRows(current, filter);
  const leads = current.endpoints.filter((e) => e.auth && e.ownerCheck === false).length;
  return (
    <>
      <div className="tabs" role="tablist">
        {sides.map((side, index) => (
          <button
            key={side.side}
            type="button"
            role="tab"
            aria-selected={side === current}
            onClick={() => {
              setTab(index);
            }}
          >
            {side.side === 'base' ? 'A' : 'B'} · <code>{side.ref}</code>
          </button>
        ))}
      </div>
      <p className="filters">
        <label>
          Auth{' '}
          <select
            value={filter.auth}
            onChange={(event) => {
              setFilter({ ...filter, auth: event.target.value as SurfaceFilter['auth'] });
            }}
          >
            <option value="all">todas</option>
            <option value="yes">con sesión</option>
            <option value="no">sin sesión</option>
          </select>
        </label>{' '}
        <label>
          Propietario{' '}
          <select
            value={filter.owner}
            onChange={(event) => {
              setFilter({ ...filter, owner: event.target.value as SurfaceFilter['owner'] });
            }}
          >
            <option value="all">todos</option>
            <option value="yes">filtra por el usuario</option>
            <option value="no">no filtra</option>
            <option value="unknown">desconocido</option>
          </select>
        </label>{' '}
        <span className="muted">
          {rows.length} de {current.endpoints.length} endpoints · {leads} pistas de IDOR (con
          sesión, sin comprobar el propietario)
        </span>
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Método</th>
              <th scope="col">Ruta</th>
              <th scope="col">Sesión</th>
              <th scope="col">Propietario</th>
              <th scope="col">Parámetros</th>
              <th scope="col">Handler</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.method} ${row.route}`}
                className={row.idorLead ? 'idor-lead' : undefined}
              >
                <td>{row.method}</td>
                <td>
                  <code>{row.route}</code>
                </td>
                <td>{row.auth ? 'sí' : 'no'}</td>
                <td>{OWNER[String(row.ownerCheck)]}</td>
                <td>{row.params.join(', ')}</td>
                <td>
                  <code>
                    {row.file}:{row.line}
                  </code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
