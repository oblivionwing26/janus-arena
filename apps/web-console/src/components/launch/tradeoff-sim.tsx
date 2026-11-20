'use client';

import { useEffect, useRef, useState } from 'react';

import { LAUNCH } from '@/lib/launch-data';
import { useReducedMotion } from './use-reduced-motion';
import { createSim, liveRates, SHIELD_X, setDefense, step, type Sim } from '@/lib/tradeoff-sim';

const STAGES = [
  { x: 0.04, label: 'Arrive' },
  { x: 0.27, label: 'Browse' },
  { x: 0.5, label: 'Cart' },
  { x: SHIELD_X, label: 'Checkout' },
  { x: 0.96, label: 'Paid' },
];

// sRGB stand-ins for the OKLCH tokens (canvas needs concrete colours on every browser).
const C = {
  aurora: '#bdbdbd',
  ember: '#ffffff',
  blood: '#7a7a7a',
  marble: '#f2f2f2',
  stone: '#a6a6a6',
  hair: 'rgba(255,255,255,0.1)',
};

const AUTOPLAY_MS = 6500;
const { value: RATE } = LAUNCH.strictRateLimit;

export function TradeoffSim() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const attacksEl = useRef<HTMLSpanElement>(null);
  const blockedEl = useRef<HTMLSpanElement>(null);
  const simRef = useRef<Sim | null>(null);
  const [defense, setDefenseState] = useState(false);
  const [auto, setAuto] = useState(true);
  const still = useReducedMotion();

  // Autoplay flips the defense until the visitor takes over.
  useEffect(() => {
    if (!auto || still) return;
    const t = setInterval(() => setDefenseState((d) => !d), AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [auto, still]);

  useEffect(() => {
    if (simRef.current) setDefense(simRef.current, defense);
  }, [defense]);

  useEffect(() => {
    if (still) return;
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const sim = createSim({
      attackPassWithDefense: RATE.attacksB / 100,
      shopperBlockWithDefense: RATE.blockedB / 100,
      attackerShare: 0.25,
    });
    simRef.current = sim;
    // Warm up so the first frame already shows a flowing shop.
    for (let i = 0; i < 400; i++) step(sim, 1 / 60);
    const font = getComputedStyle(document.body).fontFamily;

    let W = 0;
    let H = 0;
    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = cv.clientWidth;
      H = cv.clientHeight;
      cv.width = W * dpr;
      cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(cv);

    let running = true;
    let raf = 0;
    let last = performance.now();
    let shieldGlow = 0;
    let lastReadout = 0;
    const io = new IntersectionObserver(([e]) => {
      running = e?.isIntersecting ?? true;
      if (running) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    });
    io.observe(cv);

    function frame(now: number) {
      if (!running || !ctx) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(sim, dt);
      shieldGlow += ((sim.defense ? 1 : 0) - shieldGlow) * Math.min(1, dt * 5);

      const padX = 28;
      const midY = H * 0.5;
      const laneH = H * 0.28;
      const X = (x: number) => padX + x * (W - padX * 2);

      ctx.clearRect(0, 0, W, H);
      // the path
      ctx.strokeStyle = C.hair;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 6]);
      ctx.beginPath();
      ctx.moveTo(X(0), midY);
      ctx.lineTo(X(1), midY);
      ctx.stroke();
      ctx.setLineDash([]);
      // stages
      ctx.font = `500 11px ${font}`;
      ctx.textAlign = 'center';
      for (const s of STAGES) {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.beginPath();
        ctx.arc(X(s.x), midY, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = C.stone;
        ctx.fillText(s.label.toUpperCase(), X(s.x), midY + laneH + 26);
      }
      // the shield
      if (shieldGlow > 0.01) {
        const sx = X(SHIELD_X) + 10;
        const g = ctx.createLinearGradient(sx - 18, 0, sx + 6, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(1, `rgba(255,255,255,${0.35 * shieldGlow})`);
        ctx.fillStyle = g;
        ctx.fillRect(sx - 18, midY - laneH - 14, 24, laneH * 2 + 28);
        ctx.strokeStyle = `rgba(230,230,230,${0.9 * shieldGlow})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx + 6, midY - laneH - 14);
        ctx.lineTo(sx + 6, midY + laneH + 14);
        ctx.stroke();
        ctx.fillStyle = `rgba(242,242,242,${0.9 * shieldGlow})`;
        ctx.fillText('RATE LIMIT', sx + 6, midY - laneH - 22);
      }
      // walkers
      for (const w of sim.walkers) {
        const x = X(w.x);
        const y = midY + w.lane * laneH + (w.fate === 'stopped' ? w.bounce * w.bounce * 60 : 0);
        const fade = w.fate === 'stopped' ? Math.max(0, 1 - w.bounce / 1.4) : Math.min(1, w.x * 12);
        if (w.kind === 'attacker') {
          ctx.strokeStyle = `rgba(255,255,255,${0.35 * fade})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x - 22 * (w.fate === 'stopped' ? -0.3 : 1), y);
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.fillStyle =
            w.fate === 'stopped' ? `rgba(122,122,122,${fade})` : `rgba(255,255,255,${fade})`;
          ctx.beginPath();
          ctx.moveTo(x + 5, y);
          ctx.lineTo(x - 3, y - 3.5);
          ctx.lineTo(x - 3, y + 3.5);
          ctx.fill();
        } else {
          ctx.fillStyle =
            w.fate === 'stopped' ? `rgba(122,122,122,${fade})` : `rgba(189,189,189,${0.9 * fade})`;
          ctx.beginPath();
          ctx.arc(x, y, w.fate === 'stopped' ? 3.6 : 3, 0, Math.PI * 2);
          ctx.fill();
          if (w.fate === 'stopped') {
            ctx.strokeStyle = `rgba(122,122,122,${0.5 * fade})`;
            ctx.beginPath();
            ctx.arc(x, y, 7 + w.bounce * 8, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }
      if (now - lastReadout > 250) {
        lastReadout = now;
        const r = liveRates(sim);
        if (attacksEl.current)
          attacksEl.current.textContent = r.attacksThrough === null ? '—' : `${r.attacksThrough} %`;
        if (blockedEl.current)
          blockedEl.current.textContent =
            r.shoppersBlocked === null ? '—' : `${r.shoppersBlocked} %`;
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
    };
  }, [still]);

  const choose = (on: boolean) => {
    setAuto(false);
    setDefenseState(on);
  };

  return (
    <figure className="sim glass" data-defense={defense}>
      <div className="sim__bar">
        <div>
          <p className="eyebrow">ShopLab · checkout</p>
          <p className="sim__title">What a strict rate limit does</p>
        </div>
        <div className="sim__switch" role="group" aria-label="Defense">
          <button type="button" aria-pressed={!defense} onClick={() => choose(false)}>
            Without it
          </button>
          <button type="button" aria-pressed={defense} onClick={() => choose(true)}>
            With the limit
          </button>
        </div>
      </div>
      {!still && <canvas ref={canvas} className="sim__canvas" aria-hidden />}
      <div className="sim__legend" aria-hidden>
        <span>
          <i className="sim__dot sim__dot--shopper" /> Shopper
        </span>
        <span>
          <i className="sim__dot sim__dot--attacker" /> Attacker
        </span>
        <span>
          <i className="sim__dot sim__dot--blocked" /> Turned away
        </span>
      </div>
      <div className="sim__readout">
        <div>
          <p className="eyebrow">Attacks that get through</p>
          <p className="sim__big" data-tone="ember">
            {still ? (
              `${defense ? RATE.attacksB : RATE.attacksA} %`
            ) : (
              <span ref={attacksEl} aria-live="off">
                —
              </span>
            )}
          </p>
        </div>
        <div>
          <p className="eyebrow">Shoppers turned away</p>
          <p className="sim__big" data-tone="blood">
            {still ? (
              `${defense ? RATE.blockedB : RATE.blockedA} %`
            ) : (
              <span ref={blockedEl} aria-live="off">
                —
              </span>
            )}
          </p>
        </div>
      </div>
      <figcaption className="sim__caption">
        A simulation set to the recorded run: with a limit of 6 requests a minute per address, and
        shoppers sharing addresses, attacks fell from <b>{RATE.attacksA} %</b> to{' '}
        <b>{RATE.attacksB} %</b> and the share of shoppers turned away rose from{' '}
        <b>{RATE.blockedA} %</b> to <b>{RATE.blockedB} %</b>.
      </figcaption>
      <table className="sr-only">
        <caption>Strict rate limit on ShopLab, recorded run</caption>
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col">Without the limit</th>
            <th scope="col">With the limit</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Attacks that get through</th>
            <td>{RATE.attacksA} %</td>
            <td>{RATE.attacksB} %</td>
          </tr>
          <tr>
            <th scope="row">Shoppers turned away</th>
            <td>{RATE.blockedA} %</td>
            <td>{RATE.blockedB} %</td>
          </tr>
        </tbody>
      </table>
    </figure>
  );
}
