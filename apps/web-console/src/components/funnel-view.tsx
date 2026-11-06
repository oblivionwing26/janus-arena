import type { SynthlabReport } from '@janus/shared-kernel';

const percent = (rate: number) => `${String(Math.round(rate * 100))} %`;

/** The purchase funnel per variant (F1.10): persona sessions that reached each step in order. */
export function FunnelView({ funnel }: { funnel: SynthlabReport['funnel'] }) {
  const steps = funnel[0]?.steps ?? [];
  return (
    <table className="funnel">
      <thead>
        <tr>
          <th scope="col">Paso</th>
          {funnel.map((row) => (
            <th key={row.variant} scope="col">
              Variante {row.variant} ({row.sessions} sesiones)
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {steps.map((step, index) => (
          <tr key={step.route}>
            <th scope="row">
              {step.name} <code>{step.route}</code>
            </th>
            {funnel.map((row) => {
              const cell = row.steps[index];
              return (
                <td key={row.variant}>
                  {cell !== undefined && (
                    <div className="funnel-bar">
                      <span style={{ width: percent(cell.rate) }} />
                      <em>
                        {cell.reached} · {percent(cell.rate)}
                      </em>
                    </div>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
