import type { LaunchDayVariant } from '@janus/synthlab-report';

import { barsOf, CURVES, percent } from '@/lib/launch-day';

const WIDTH = 640;
const ROW = 30;
const LEFT = 150;
const RIGHT = 64;

/**
 * The three curves of a Launch Day run (F4.1) as intervals on a 0–100 % axis, one row per variant
 * and curve. Colour and label say which curve it is; the interval is a 95 % Wilson interval.
 */
export function LaunchDayChart({ variants }: { readonly variants: readonly LaunchDayVariant[] }) {
  const rows = barsOf(variants);
  const plot = WIDTH - LEFT - RIGHT;
  const x = (share: number) => LEFT + share * plot;
  const height = CURVES.length * (variants.length * ROW + 24) + 34;
  const block = variants.length * ROW + 24;
  return (
    <svg
      role="img"
      aria-label="Las tres curvas de Launch Day por variante, con intervalos del 95 %"
      viewBox={`0 0 ${String(WIDTH)} ${String(height)}`}
      className="launch-day-chart"
    >
      {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
        <g key={tick}>
          <line x1={x(tick)} x2={x(tick)} y1={0} y2={height - 24} className="chart-grid" />
          <text x={x(tick)} y={height - 8} textAnchor="middle" className="chart-label">
            {percent(tick)}
          </text>
        </g>
      ))}
      {CURVES.map((curve, curveIndex) => {
        const top = 8 + curveIndex * block;
        const group = rows.filter((row) => row.curve === curve.key);
        return (
          <g key={curve.key}>
            <text x={0} y={top + 12} className="chart-title">
              {curve.title}
            </text>
            {group.map((row, index) => {
              const cy = top + 24 + index * ROW;
              return (
                <g key={row.variant}>
                  <text x={LEFT - 8} y={cy + 4} textAnchor="end" className="chart-label">
                    Variante {row.variant.toUpperCase()}
                  </text>
                  {row.interval === null ? (
                    <text x={x(0)} y={cy + 4} className="chart-label">
                      sin datos
                    </text>
                  ) : (
                    <>
                      <line
                        x1={x(row.interval.low)}
                        x2={x(row.interval.high)}
                        y1={cy}
                        y2={cy}
                        className={`chart-interval chart-${curve.key}`}
                      />
                      <circle
                        cx={x(row.interval.rate)}
                        cy={cy}
                        r={6}
                        className={`chart-dot chart-${curve.key}`}
                      />
                      <text x={x(1) + 8} y={cy + 4} className="chart-label">
                        {percent(row.interval.rate)}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
