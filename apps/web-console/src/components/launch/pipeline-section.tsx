'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { PIPELINE_SOURCES, type Face } from '@/lib/pipeline-data';
import { stationAt } from '@/lib/pipeline-scroll';

import { GATE_BOARD_SOURCES, GateBoard } from './gate-board';
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

export function PipelineSection() {
  const wrap = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const scrollable = Math.max(1, r.height - window.innerHeight);
      const progress = Math.min(1, Math.max(0, -r.top / scrollable));
      setActive(stationAt(progress, STATIONS.length));
      board.current?.style.setProperty('--progress', String(progress));
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
    const stage = el.querySelector('.pipeline__stage');
    if (stage && getComputedStyle(stage).position !== 'sticky') {
      document
        .getElementById(`station-${STATIONS[i]?.key ?? ''}`)
        ?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      return;
    }
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
      sources={[...PIPELINE_SOURCES.slice(0, 3), ...GATE_BOARD_SOURCES]}
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
            <GateBoard stations={STATIONS} active={active} onJump={jump} boardRef={board} />
          </div>
          <div className="pipeline__cards">
            {STATIONS.map((s, i) => (
              <article
                key={s.key}
                id={`station-${s.key}`}
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
