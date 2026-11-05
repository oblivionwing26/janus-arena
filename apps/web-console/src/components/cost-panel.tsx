import type { CostSummary } from '@/lib/cost';

const eur = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 4,
});
const integer = new Intl.NumberFormat('es-ES');

function percent(used: number, max: number): string {
  return `${Math.round((used / max) * 100)} %`;
}

export function CostPanel({ cost }: { cost: CostSummary }) {
  return (
    <aside className="cost-panel" aria-label="Coste">
      <h3>Coste</h3>
      <dl>
        <dt>Llamadas LLM</dt>
        <dd>{cost.calls}</dd>
        <dt>Tokens</dt>
        <dd>{integer.format(cost.totalTokens)}</dd>
        <dt>Entrada / salida</dt>
        <dd>
          {integer.format(cost.inputTokens)} / {integer.format(cost.outputTokens)}
        </dd>
        <dt>Caché lectura / escritura</dt>
        <dd>
          {integer.format(cost.cacheReadInputTokens)} /{' '}
          {integer.format(cost.cacheCreationInputTokens)}
        </dd>
        <dt>Coste estimado</dt>
        <dd>{eur.format(cost.estimatedEur)}</dd>
        {cost.budget !== null && (
          <>
            <dt>Presupuesto</dt>
            <dd>
              {integer.format(cost.budget.maxTokens)} tokens ·{' '}
              {percent(cost.totalTokens, cost.budget.maxTokens)}
              <br />
              {eur.format(cost.budget.maxEur)} · {percent(cost.estimatedEur, cost.budget.maxEur)}
            </dd>
          </>
        )}
      </dl>
      {cost.thresholds.length > 0 && (
        <p role="status" className="threshold">
          {cost.thresholds.includes('exhausted')
            ? 'Presupuesto agotado'
            : 'Aviso: 80 % del presupuesto'}
        </p>
      )}
    </aside>
  );
}
