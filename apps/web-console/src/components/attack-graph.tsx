'use client';

import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useEffect, useMemo, useState } from 'react';

import {
  buildAttackGraph,
  NODE_STATES,
  STATE_LABELS,
  type AttackGraph,
  type GraphNode,
  type NodeState,
} from '@/lib/attack-graph';
import type { ConsoleEvent } from '@/lib/console-event';

import { NodePanel } from './attack-node-panel';

interface EndpointData extends Record<string, unknown> {
  readonly node: GraphNode;
}
interface AttackerData extends Record<string, unknown> {
  readonly label: string;
}

function EndpointNode({ data, selected }: NodeProps<Node<EndpointData>>) {
  const { node } = data;
  return (
    <div
      className={`ag-node ag-${node.state}${selected ? ' ag-selected' : ''}`}
      title={`${node.id}: ${STATE_LABELS[node.state]}`}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <span className="ag-method">{node.method}</span>
      <code className="ag-route">{node.route}</code>
      <span className="ag-state">{STATE_LABELS[node.state]}</span>
    </div>
  );
}

function AttackerNode({ data }: NodeProps<Node<AttackerData>>) {
  return (
    <div className="ag-attacker">
      {data.label}
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

const NODE_TYPES = { endpoint: EndpointNode, attacker: AttackerNode };

const EDGE_COLORS = { exploitable: 'var(--error)', harmless: 'var(--muted)' };

function toFlow(graph: AttackGraph): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: [
      ...graph.attackers.map((attacker): Node<AttackerData> => ({
        id: attacker.id,
        type: 'attacker',
        position: attacker.position,
        data: { label: attacker.label },
        draggable: false,
        selectable: false,
      })),
      ...graph.nodes.map((node): Node<EndpointData> => ({
        id: node.id,
        type: 'endpoint',
        position: node.position,
        data: { node },
        draggable: false,
      })),
    ],
    edges: graph.edges.map((edge): Edge => {
      const color = edge.exploitable ? EDGE_COLORS.exploitable : EDGE_COLORS.harmless;
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: `${edge.testType}${edge.count > 1 ? ` ×${String(edge.count)}` : ''}`,
        animated: edge.exploitable,
        style: { stroke: color, strokeWidth: edge.exploitable ? 2.5 : 1.25 },
        labelStyle: { fill: 'var(--text)', fontSize: 11 },
        labelBgStyle: { fill: 'var(--surface)' },
        markerEnd: { type: MarkerType.ArrowClosed, color },
        selectable: false,
      };
    }),
  };
}

/** Frames what has been attacked (or everything, while nothing has) when the graph changes. */
function FitToAction({ graph }: { graph: AttackGraph }) {
  const { fitView } = useReactFlow();
  const touched = graph.nodes.filter((node) => node.state !== 'untested').length;
  const total = graph.nodes.length;
  useEffect(() => {
    const ids =
      touched === 0
        ? undefined
        : [
            ...graph.attackers.map((attacker) => ({ id: attacker.id })),
            ...graph.nodes.filter((node) => node.state !== 'untested').map(({ id }) => ({ id })),
          ];
    const timer = setTimeout(() => {
      void fitView({
        padding: 0.2,
        maxZoom: 1,
        duration: 300,
        ...(ids === undefined ? {} : { nodes: ids }),
      });
    }, 50);
    return () => {
      clearTimeout(timer);
    };
    // The frame follows how much there is to see, not every event.
  }, [touched, total, graph.attackers.length, fitView]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/**
 * The attack graph of a run or a whole gate (F3.10): endpoints as nodes coloured by where they
 * stand, attempts as edges, and a side panel with the selected endpoint's attempts, PoC, diff and
 * verifiers. It draws whatever events it is given, so the live view and the replay share it.
 */
export function AttackGraphView({ events }: { events: readonly ConsoleEvent[] }) {
  const graph = useMemo(() => buildAttackGraph(events), [events]);
  const flow = useMemo(() => toFlow(graph), [graph]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = graph.nodes.find((node) => node.id === selectedId) ?? null;
  const counts = useMemo(() => {
    const result = Object.fromEntries(NODE_STATES.map((state) => [state, 0])) as Record<
      NodeState,
      number
    >;
    for (const node of graph.nodes) result[node.state] += 1;
    return result;
  }, [graph]);

  return (
    <section className="attack-graph" aria-label="Grafo de ataque">
      <ul className="ag-legend" aria-label="Estados">
        {NODE_STATES.map((state) => (
          <li key={state} className={`ag-chip ag-${state}`}>
            {STATE_LABELS[state]} · {counts[state]}
          </li>
        ))}
      </ul>
      <div className="ag-body">
        <div className="ag-canvas">
          <ReactFlow
            nodes={flow.nodes}
            edges={flow.edges}
            nodeTypes={NODE_TYPES}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            minZoom={0.1}
            maxZoom={1.5}
            fitView
            colorMode="system"
            proOptions={{ hideAttribution: true }}
            onNodeClick={(_, node) => {
              if (node.type === 'endpoint') setSelectedId(node.id);
            }}
            onPaneClick={() => {
              setSelectedId(null);
            }}
          >
            <Background />
            <Controls showInteractive={false} />
            <FitToAction graph={graph} />
          </ReactFlow>
        </div>
        <NodePanel node={selected} />
      </div>
    </section>
  );
}
