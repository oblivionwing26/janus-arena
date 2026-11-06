'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import type { ConsoleEvent } from '@/lib/console-event';
import {
  agentOffset,
  buildSwarm,
  layoutSwarm,
  type AgentStatus,
  type Point,
  type SwarmModel,
} from '@/lib/swarm';

const HEIGHT = 380;
const NODE_RADIUS = 26;
/** Vertical room per node in a column: the circle and its label. */
const ROW = 2 * NODE_RADIUS + 26;
const AGENT_RADIUS = 5;
/** How long an agent stays in the friction colour after a pulse, and a pulse ring lasts. */
const FRICTION_MS = 1500;
const PULSE_MS = 900;
/** Time an agent takes to move between two routes at 1×. */
const MOVE_MS = 600;

interface Palette {
  readonly text: string;
  readonly muted: string;
  readonly border: string;
  readonly surface: string;
  readonly status: Record<AgentStatus | 'friction', string>;
}

function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    text: token('--text', '#1c1c1a'),
    muted: token('--muted', '#62625c'),
    border: token('--border', '#dcdcd4'),
    surface: token('--surface', '#ffffff'),
    status: {
      navigating: token('--accent', '#2a5d8f'),
      friction: token('--warning', '#9a6700'),
      success: token('--ok', '#2f7a3e'),
      abandon: token('--error', '#b42318'),
    },
  };
}

interface SwarmCanvasProps {
  /** Events up to the player's cursor. */
  readonly visible: readonly ConsoleEvent[];
  /** Every event received so far (recorded friction signals pulse at their step). */
  readonly known: readonly ConsoleEvent[];
  /** Replay speed: agents move faster at 4× and 16×. */
  readonly speed: number;
}

/**
 * The swarm canvas (F1.12): routes as nodes, observed transitions as edges, every agent as a
 * dot moving between them, coloured by state, with a pulse on each friction signal. It reads
 * the same events as the timeline, so live runs and replays draw the same way. PixiJS (WebGL)
 * is loaded in the browser only.
 */
export function SwarmCanvas({ visible, known, speed }: SwarmCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const model = useMemo(() => buildSwarm(visible, known), [visible, known]);
  // The Pixi ticker reads the latest model and speed every frame, outside React.
  const latest = useRef({ model, speed });
  useEffect(() => {
    latest.current = { model, speed };
  }, [model, speed]);
  const [fps, setFps] = useState<number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const element = host.current;
    if (element === null) return;
    let disposed = false;
    let cleanup = () => {};

    void (async () => {
      const PIXI = await import('pixi.js');
      if (disposed) return;
      const palette = readPalette();
      const app = new PIXI.Application();
      try {
        await app.init({
          width: element.clientWidth,
          height: HEIGHT,
          backgroundAlpha: 0,
          antialias: true,
          resolution: window.devicePixelRatio,
          autoDensity: true,
        });
      } catch (error) {
        setFailed(error instanceof Error ? error.message : String(error));
        return;
      }
      if (disposed) {
        app.destroy(true, { children: true });
        return;
      }
      element.appendChild(app.canvas);

      const edgesLayer = new PIXI.Graphics();
      const nodesLayer = new PIXI.Graphics();
      const labels = new PIXI.Container();
      const pulsesLayer = new PIXI.Graphics();
      const agentsLayer = new PIXI.Graphics();
      app.stage.addChild(edgesLayer, nodesLayer, labels, pulsesLayer, agentsLayer);

      let drawn: SwarmModel | null = null;
      let width = element.clientWidth;
      let height = HEIGHT;
      let positions = new Map<string, Point>();
      const agents = new Map<string, { x: number; y: number }>();
      const pulseStarts = new Map<string, { at: number; agentId: string; route: string }>();
      const seenPulses = new Set<string>();
      const frictionUntil = new Map<string, number>();
      const labelTexts = new Map<string, InstanceType<typeof PIXI.Text>>();

      const drawGraph = (current: SwarmModel) => {
        // A crowded column (many products) gets taller instead of overlapping its labels.
        const perColumn = new Map<number, number>();
        for (const at of layoutSwarm(current, { width, height: HEIGHT }).values()) {
          perColumn.set(at.x, (perColumn.get(at.x) ?? 0) + 1);
        }
        const needed = Math.max(HEIGHT, Math.max(0, ...perColumn.values()) * ROW);
        if (needed !== height) {
          height = needed;
          app.renderer.resize(width, height);
        }
        positions = layoutSwarm(current, { width, height });
        const busiest = Math.max(1, ...current.edges.map((edge) => edge.count));
        edgesLayer.clear();
        for (const edge of current.edges) {
          const from = positions.get(edge.from);
          const to = positions.get(edge.to);
          if (from === undefined || to === undefined) continue;
          edgesLayer
            .moveTo(from.x, from.y)
            .lineTo(to.x, to.y)
            .stroke({ width: 1 + 4 * (edge.count / busiest), color: palette.border, alpha: 0.9 });
        }
        nodesLayer.clear();
        for (const node of current.nodes) {
          const at = positions.get(node.route);
          if (at === undefined) continue;
          nodesLayer
            .circle(at.x, at.y, NODE_RADIUS)
            .fill({ color: palette.surface })
            .stroke({ width: 1.5, color: palette.muted });
          let label = labelTexts.get(node.route);
          if (label === undefined) {
            label = new PIXI.Text({
              text: node.route,
              style: { fontFamily: 'system-ui, sans-serif', fontSize: 11, fill: palette.text },
            });
            label.anchor.set(0.5, 0);
            labels.addChild(label);
            labelTexts.set(node.route, label);
          }
          label.position.set(at.x, at.y + NODE_RADIUS + 4);
        }
        drawn = current;
      };

      const tick = () => {
        const { model: current, speed: currentSpeed } = latest.current;
        const now = performance.now();
        if (current !== drawn) {
          drawGraph(current);
          for (const pulse of current.pulses) {
            if (seenPulses.has(pulse.id)) continue;
            seenPulses.add(pulse.id);
            pulseStarts.set(pulse.id, { at: now, agentId: pulse.agentId, route: pulse.route });
            frictionUntil.set(pulse.agentId, now + FRICTION_MS / currentSpeed);
          }
        }

        // Agents glide towards their route; the step is a fraction of the way per frame.
        const step = Math.min(1, app.ticker.deltaMS / (MOVE_MS / currentSpeed));
        agentsLayer.clear();
        for (const agent of current.agents) {
          const node = positions.get(agent.route);
          if (node === undefined) continue;
          const offset = agentOffset(agent.agentId, NODE_RADIUS - AGENT_RADIUS);
          const target = { x: node.x + offset.x, y: node.y + offset.y };
          const at = agents.get(agent.agentId) ?? { ...target };
          at.x += (target.x - at.x) * step;
          at.y += (target.y - at.y) * step;
          agents.set(agent.agentId, at);
          const inFriction = (frictionUntil.get(agent.agentId) ?? 0) > now;
          const color = palette.status[inFriction ? 'friction' : agent.status];
          // Variant a is a dot, b a square: readable without colour.
          if (agent.variant === 'b') {
            agentsLayer
              .rect(at.x - AGENT_RADIUS, at.y - AGENT_RADIUS, AGENT_RADIUS * 2, AGENT_RADIUS * 2)
              .fill({ color });
          } else {
            agentsLayer.circle(at.x, at.y, AGENT_RADIUS).fill({ color });
          }
        }

        pulsesLayer.clear();
        for (const [id, pulse] of pulseStarts) {
          const age = (now - pulse.at) / (PULSE_MS / currentSpeed);
          if (age >= 1) {
            pulseStarts.delete(id);
            continue;
          }
          const at = agents.get(pulse.agentId) ?? positions.get(pulse.route);
          if (at === undefined) continue;
          pulsesLayer
            .circle(at.x, at.y, AGENT_RADIUS + 18 * age)
            .stroke({ width: 2, color: palette.status.friction, alpha: 1 - age });
        }
      };
      app.ticker.add(tick);

      const resize = new ResizeObserver(() => {
        width = element.clientWidth;
        app.renderer.resize(width, height);
        drawn = null;
      });
      resize.observe(element);
      const meter = setInterval(() => {
        setFps(Math.round(app.ticker.FPS));
      }, 500);

      cleanup = () => {
        clearInterval(meter);
        resize.disconnect();
        app.destroy(true, { children: true });
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  const counts = { navigating: 0, success: 0, abandon: 0 };
  for (const agent of model.agents) counts[agent.status] += 1;

  return (
    <figure className="swarm" aria-label="Enjambre de agentes">
      <div ref={host} className="swarm-canvas" />
      <figcaption>
        <span className="swarm-key navigating">Navegando {counts.navigating}</span>
        <span className="swarm-key friction">Fricción (pulso)</span>
        <span className="swarm-key success">Éxito {counts.success}</span>
        <span className="swarm-key abandon">Abandono {counts.abandon}</span>
        <span>● variante a · ■ variante b</span>
        <span>
          {model.nodes.length} rutas · {model.edges.length} transiciones · {model.pulses.length}{' '}
          pulsos
        </span>
        <span className="fps">{fps === null ? '' : `${String(fps)} fps`}</span>
        {failed !== null && <span role="alert">No se pudo iniciar el lienzo: {failed}</span>}
      </figcaption>
    </figure>
  );
}
