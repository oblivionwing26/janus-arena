'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';

import { chapterAt, type Chapter } from '@/lib/lathe';
import { LAUNCH } from '@/lib/launch-data';
import { JUICE_FINDINGS, JUICE_VERIFIERS } from '@/lib/pipeline-data';
import { LOCKOUT_ALTERNATIVES } from '@/lib/tradeoff-data';

import { LaunchSection } from './launch-section';
import { useReducedMotion } from './use-reduced-motion';

const LatheScene = dynamic(() => import('./lathe-scene'), { ssr: false });

const CRITICAL = JUICE_FINDINGS.value.find((f) => f.severity === 'critical');
const LOCKOUT = LOCKOUT_ALTERNATIVES.find((a) => a.name === 'Account lockout');
const LIMIT = LOCKOUT_ALTERNATIVES.find((a) => a.recommended);

function canWebGL(): boolean {
  try {
    return document.createElement('canvas').getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

function AttackChapter() {
  return (
    <article className="chapter" data-face="attack">
      <p className="eyebrow">Face one · the Red Team</p>
      <h3>The face that attacks</h3>
      <p>
        It reads the target&apos;s code, maps every HTTP endpoint, and attacks what each class can
        reach: another user&apos;s data, a login without the password, an injected script, a basket
        with a negative total, a password guessed without limit. All of it inside a sandbox with no
        internet, and only on a target that has proved it is yours.
      </p>
      <p>
        No model invents an attack or decides one worked. Attacks are written as code, and a
        deterministic oracle is the only judge.
      </p>
      {CRITICAL && (
        <div className="sample sample--attack">
          <div className="sample__head">
            <span className="sample__sev">critical</span>
            <span>{CRITICAL.kind}</span>
            <code>{CRITICAL.where}</code>
          </div>
          <p className="sample__oracle">
            <span>oracle</span> {CRITICAL.oracle}
          </p>
          <ul className="sample__stats">
            <li>
              <b>{LAUNCH.juiceGate.confirmed.value}</b> confirmed on Juice Shop
            </li>
            <li>
              <b>32</b> attack requests
            </li>
            <li>
              <b>6</b> stopped by the scope
            </li>
          </ul>
        </div>
      )}
    </article>
  );
}

function TurnChapter() {
  return (
    <article className="chapter chapter--turn" data-face="turn">
      <p className="eyebrow">The same pull request</p>
      <h3>One head, two faces</h3>
      <p>
        Both teams look at the same change. What one breaks, the other has to fix without breaking
        the people who just wanted to buy.
      </p>
    </article>
  );
}

function DefenseChapter() {
  return (
    <article className="chapter" data-face="defense">
      <p className="eyebrow">Face two · the Blue Team</p>
      <h3>The face that defends</h3>
      <p>
        It writes the fix on its own branch and keeps it only if three verifiers agree: the proof no
        longer works, the tests pass, and synthetic shoppers still finish. Then it measures what the
        fix costs them, and tries the alternatives.
      </p>
      <div className="sample sample--defense">
        <ol className="sample__checks">
          {JUICE_VERIFIERS.value.map((v) => (
            <li key={v.name}>
              <span aria-hidden>✓</span>
              <b>{v.label}</b>
              <span>{v.detail}</span>
            </li>
          ))}
        </ol>
        {LOCKOUT?.success && LIMIT?.success && (
          <p className="sample__tradeoff">
            Against brute force, an account lockout left <b>{LOCKOUT.success.after}</b> of{' '}
            {LOCKOUT.success.of} shoppers finishing; a per-account limit,{' '}
            <b>{LIMIT.success.after}</b>. Janus recommends the second.
          </p>
        )}
      </div>
    </article>
  );
}

export function LatheSection() {
  const wrap = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const [chapter, setChapter] = useState<Chapter>('attack');
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const reduced = useReducedMotion();
  const onReady = useCallback(() => setReady(true), []);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      const on = e?.isIntersecting ?? false;
      setVisible(on);
      if (on) setWebgl((w) => (w === null ? canWebGL() : w));
    });
    io.observe(el);
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - window.innerHeight)));
      progress.current = p;
      setChapter(chapterAt(p));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const live = webgl === true && !reduced;

  return (
    <LaunchSection
      id="teams"
      title={
        <>
          One head, <em>two teams</em>
        </>
      }
      lede="Scroll, and Janus turns on his axis: first the face that attacks your release, then the face that defends it. Both look at the same pull request."
      sources={[JUICE_FINDINGS.source, 'assets/janus/scan/LICENCE.md']}
    >
      <div ref={wrap} className="lathe" data-chapter={chapter} data-static={!live || undefined}>
        <div className="lathe__stage">
          <div className="lathe__head" data-ready={ready}>
            {/* eslint-disable-next-line @next/next/no-img-element -- static export, no optimiser */}
            <img
              className="lathe__still"
              data-face="attack"
              src="/models/janus-attack.webp"
              alt="The bearded face of a two-faced marble Janus, lit in ember."
              width={1200}
              height={1500}
            />
            {/* eslint-disable-next-line @next/next/no-img-element -- static export, no optimiser */}
            <img
              className="lathe__still"
              data-face="defense"
              src="/models/janus-defense.webp"
              alt="The young face of the same Janus, lit in cool teal."
              width={1200}
              height={1500}
            />
            {live && <LatheScene progress={progress} running={visible} onReady={onReady} />}
            <p className="lathe__credit">
              Scan: Two-Faced Janus, State Russian Museum · Scan The World · CC BY-NC-SA 4.0
            </p>
          </div>
          <div className="lathe__text">
            <AttackChapter />
            <TurnChapter />
            <DefenseChapter />
          </div>
        </div>
      </div>
    </LaunchSection>
  );
}
