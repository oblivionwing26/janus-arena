'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { PIPELINE_SOURCES, type Face } from '@/lib/pipeline-data';
import { stationAt } from '@/lib/pipeline-scroll';

import { LaunchSection } from './launch-section';
import {
  ABCard,
  AuditCard,
  BlueTeamCard,
  MergeCard,
  PersonaCard,
  RedTeamCard,
  SealCard,
  VariantCard,
} from './station-cards';
import { useReducedMotion } from './use-reduced-motion';

interface Station {
  key: string;
  face: Face;
  name: string;
  title: string;
  target: string;
  card: ReactNode;
}

const STATIONS: readonly Station[] = [
  {
    key: 'synthlab',
    face: 'ux',
    name: 'SynthLab',
    title: 'Synthetic shoppers walk variant A',
    target: 'Juice Shop',
    card: <PersonaCard />,
  },
  {
    key: 'variant',
    face: 'ux',
    name: 'Variant B',
    title: 'The worst friction becomes a patch',
    target: 'ShopLab',
    card: <VariantCard />,
  },
  {
    key: 'ab',
    face: 'ux',
    name: 'Paired A/B',
    title: 'The same shoppers walk both variants',
    target: 'ShopLab',
    card: <ABCard />,
  },
  {
    key: 'audit',
    face: 'gate',
    name: 'Differential audit',
    title: 'What does B introduce?',
    target: 'ShopLab',
    card: <AuditCard />,
  },
  {
    key: 'red',
    face: 'security',
    name: 'Red Team',
    title: 'Code attacks it in a sandbox',
    target: 'Juice Shop',
    card: <RedTeamCard />,
  },
  {
    key: 'blue',
    face: 'security',
    name: 'Blue Team',
    title: 'A fix, proved three ways',
    target: 'Juice Shop',
    card: <BlueTeamCard />,
  },
  {
    key: 'seal',
    face: 'trust',
    name: 'Signed report',
    title: 'Both faces, one signature',
    target: 'Juice Shop',
    card: <SealCard />,
  },
  {
    key: 'merge',
    face: 'trust',
    name: 'A person merges',
    title: 'The gate stops at the pull request',
    target: 'Any target',
    card: <MergeCard />,
  },
];

const FACE_COLOR: Record<Face, string> = {
  ux: 'var(--aurora)',
  gate: 'var(--marble)',
  security: 'var(--ember)',
  trust: 'var(--gold)',
};

// The rail: an S-curve down the left half of the stage.
const RAIL = 'M 70 40 C 390 110, 400 250, 220 330 S 30 520, 210 600 S 400 790, 330 870';
const VIEW = { w: 440, h: 910 };

export function PipelineSection() {
  const wrap = useRef<HTMLDivElement>(null);
  const path = useRef<SVGPathElement>(null);
  const lit = useRef<SVGPathElement>(null);
  const token = useRef<SVGGElement>(null);
  const [active, setActive] = useState(0);
  const [nodes, setNodes] = useState<{ x: number; y: number }[]>([]);
  const reduced = useReducedMotion();

  useEffect(() => {
    const p = path.current;
    if (!p) return;
    const L = p.getTotalLength();
    setNodes(
      STATIONS.map((_, i) => {
        const pt = p.getPointAtLength((L * i) / (STATIONS.length - 1));
        return { x: pt.x, y: pt.y };
      }),
    );
  }, []);

  useEffect(() => {
    const el = wrap.current;
    const p = path.current;
    if (!el || !p) return;
    const L = p.getTotalLength();
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const scrollable = Math.max(1, r.height - window.innerHeight);
      const progress = Math.min(1, Math.max(0, -r.top / scrollable));
      setActive(stationAt(progress, STATIONS.length));
      if (lit.current) {
        lit.current.style.strokeDasharray = `${L}`;
        lit.current.style.strokeDashoffset = `${L * (1 - progress)}`;
      }
      if (token.current) {
        const pt = p.getPointAtLength(L * progress);
        token.current.setAttribute('transform', `translate(${pt.x} ${pt.y})`);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const jump = (i: number) => {
    const el = wrap.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const scrollable = el.offsetHeight - window.innerHeight;
    const at = (i + 0.5) / STATIONS.length;
    window.scrollTo({ top: top + scrollable * at, behavior: reduced ? 'auto' : 'smooth' });
  };

  const current = STATIONS[active] ?? STATIONS[0];

  return (
    <LaunchSection
      id="how-it-works"
      title={
        <>
          One pull request, <em>eight stations</em>
        </>
      }
      lede="Janus runs as a gate. Each station writes its own event log, so a gate that crashes resumes where it stopped, and every result below can be replayed."
      sources={PIPELINE_SOURCES.slice(0, 3)}
    >
      <div
        ref={wrap}
        className="pipeline"
        style={{ ['--stations' as string]: STATIONS.length }}
        data-face={current?.face}
        data-static={reduced || undefined}
      >
        <div className="pipeline__stage">
          <div className="pipeline__rail">
            <svg viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} aria-hidden>
              <defs>
                <linearGradient id="rail-lit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--aurora)" />
                  <stop offset="0.42" stopColor="var(--marble)" />
                  <stop offset="0.6" stopColor="var(--ember)" />
                  <stop offset="0.85" stopColor="var(--gold)" />
                </linearGradient>
                <filter id="rail-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="6" />
                </filter>
              </defs>
              <path ref={path} d={RAIL} fill="none" stroke="oklch(1 0 0 / 0.08)" strokeWidth="2" />
              <path
                d={RAIL}
                fill="none"
                stroke="oklch(1 0 0 / 0.14)"
                strokeWidth="1"
                strokeDasharray="2 7"
              />
              <path
                ref={lit}
                d={RAIL}
                fill="none"
                stroke="url(#rail-lit)"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              {nodes.map((n, i) => {
                const s = STATIONS[i];
                if (!s) return null;
                const on = i <= active;
                const here = i === active;
                const right = n.x < VIEW.w / 2;
                return (
                  <g
                    key={s.key}
                    className="rail-node"
                    data-on={on}
                    data-here={here}
                    transform={`translate(${n.x} ${n.y})`}
                  >
                    {here && (
                      <circle
                        r="22"
                        fill={FACE_COLOR[s.face]}
                        opacity="0.18"
                        filter="url(#rail-glow)"
                      />
                    )}
                    <circle
                      r={here ? 9 : 6}
                      fill={on ? FACE_COLOR[s.face] : 'var(--void)'}
                      stroke={FACE_COLOR[s.face]}
                      strokeWidth="1.5"
                    />
                    <text
                      x={right ? 22 : -22}
                      y="5"
                      textAnchor={right ? 'start' : 'end'}
                      className="rail-node__label"
                    >
                      <tspan className="rail-node__num">{String(i + 1).padStart(2, '0')}</tspan>{' '}
                      {s.name}
                    </text>
                  </g>
                );
              })}
              <g ref={token} className="rail-token">
                <circle r="16" fill="var(--marble)" opacity="0.25" filter="url(#rail-glow)" />
                <circle r="5" fill="white" />
              </g>
            </svg>
            <ol className="pipeline__jump" aria-label="Stations">
              {STATIONS.map((s, i) => (
                <li key={s.key}>
                  <button
                    type="button"
                    aria-current={i === active ? 'step' : undefined}
                    onClick={() => jump(i)}
                  >
                    {String(i + 1).padStart(2, '0')} {s.name}
                  </button>
                </li>
              ))}
            </ol>
          </div>
          <div className="pipeline__cards">
            {STATIONS.map((s, i) => (
              <article
                key={s.key}
                className="station glass"
                data-face={s.face}
                data-active={i === active}
              >
                <header className="station__head">
                  <span className="station__count">
                    {String(i + 1).padStart(2, '0')}{' '}
                    <span>/ {String(STATIONS.length).padStart(2, '0')}</span>
                  </span>
                  <span
                    className="chip"
                    data-tone={
                      s.face === 'ux' ? 'aurora' : s.face === 'security' ? 'ember' : 'gold'
                    }
                  >
                    {s.name}
                  </span>
                  <span className="station__target">{s.target}</span>
                </header>
                <h3 className="station__title">{s.title}</h3>
                <div className="station__body">{s.card}</div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </LaunchSection>
  );
}
