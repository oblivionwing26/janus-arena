import type { FrictionZone } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { artifactUrl, heatColor, routeHeatmaps } from './heatmap';

function zone(
  route: string,
  element: string | null,
  intensity: number,
  shot = false,
): FrictionZone {
  return {
    rank: 1,
    route,
    element,
    intensity,
    signals: intensity,
    sessions: intensity,
    detectors: [],
    boxes: [],
    screenshot: shot
      ? { agentId: 'carmen-a-s1-a1', stepIndex: 3, artifact: `x${route}.png` }
      : null,
    evidenceEventIds: [],
  };
}

describe('routeHeatmaps', () => {
  it('groups zones by route, hottest route first, with heat relative to the hottest zone', () => {
    const maps = routeHeatmaps({
      zones: [
        zone('/register', 'role=button[name="Crear cuenta"]', 8, true),
        zone('/cart', null, 6),
        zone('/cart', 'role=link[name="Otras opciones"]', 4, true),
        zone('/checkout', null, 2),
      ],
    });

    expect(maps.map((map) => [map.route, map.intensity])).toEqual([
      ['/cart', 10],
      ['/register', 8],
      ['/checkout', 2],
    ]);
    const [cart] = maps;
    expect(cart?.screenshot?.artifact).toBe('x/cart.png');
    expect(cart?.page?.heat).toBe(0.75);
    expect(cart?.elements.map((entry) => entry.heat)).toEqual([0.5]);
    expect(maps[2]?.screenshot).toBeNull();
  });

  it('is empty without zones', () => {
    expect(routeHeatmaps({ zones: [] })).toEqual([]);
  });
});

describe('heatColor', () => {
  it('goes from yellow to red and clamps', () => {
    expect(heatColor(0)).toBe('hsl(50 90% 48%)');
    expect(heatColor(1)).toBe('hsl(0 90% 48%)');
    expect(heatColor(7)).toBe(heatColor(1));
  });
});

describe('artifactUrl', () => {
  it('goes through the proxy and keeps the key segments', () => {
    expect(artifactUrl('01JC0F110RP0000000000000AA', 'carmen-a-s1-a1/step-3.png')).toBe(
      '/api/orchestrator/runs/01JC0F110RP0000000000000AA/artifacts/carmen-a-s1-a1/step-3.png',
    );
  });
});
