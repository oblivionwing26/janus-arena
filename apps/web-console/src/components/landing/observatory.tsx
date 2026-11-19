'use client';

import { motion, useReducedMotion } from 'motion/react';

const C = 260;
const RINGS = [84, 144, 204, 248];
const ORIGIN = {
  transformOrigin: `${String(C)}px ${String(C)}px`,
  transformBox: 'view-box',
} as const;

/** A point on a ring, `deg` degrees clockwise from twelve o'clock. */
function at(radius: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  // Rounded: the server and the browser must print the same numbers, or hydration complains.
  const round = (value: number) => Math.round(value * 100) / 100;
  return { x: round(C + radius * Math.cos(rad)), y: round(C + radius * Math.sin(rad)) };
}

// Synthetic users on the UX face (left), and attack probes on the security face (right).
const SHOPPERS = [
  { ring: 1, deg: 200, r: 3.2 },
  { ring: 1, deg: 250, r: 2.6 },
  { ring: 1, deg: 310, r: 3 },
  { ring: 2, deg: 215, r: 2.4 },
  { ring: 2, deg: 268, r: 3.4 },
  { ring: 2, deg: 330, r: 2.6 },
  { ring: 3, deg: 230, r: 2.2 },
  { ring: 3, deg: 295, r: 2.8 },
];
const PROBES = [28, 58, 96, 128, 152];
const FRICTION = [
  { ring: 2, deg: 248, delay: 0.8 },
  { ring: 1, deg: 292, delay: 3.1 },
  { ring: 3, deg: 212, delay: 5.4 },
];

/**
 * The hero of the landing page: the observatory. One instrument with two faces: synthetic users
 * orbit on the left and trip (a pulse is a friction signal), probes strike from the right and are
 * stopped at the core. It illustrates the idea; it shows no data. Still when the visitor asks for
 * reduced motion.
 */
export function Observatory() {
  const still = useReducedMotion() === true;
  const spin = (seconds: number, direction: 1 | -1) =>
    still
      ? {}
      : {
          animate: { rotate: 360 * direction },
          transition: { duration: seconds, ease: 'linear' as const, repeat: Infinity },
        };

  return (
    <svg className="observatory" viewBox="0 0 520 520" role="img" aria-labelledby="obs-title">
      <title id="obs-title">
        Janus watches every release with two faces: synthetic users on one side, sandboxed attacks
        on the other.
      </title>
      <defs>
        <clipPath id="obs-left">
          <rect x="0" y="0" width={C - 1} height="520" />
        </clipPath>
        <clipPath id="obs-right">
          <rect x={C + 1} y="0" width={C} height="520" />
        </clipPath>
        <radialGradient id="obs-tint-ux" cx="50%" cy="50%" r="50%">
          <stop offset="0.2" stopColor="var(--face-ux)" stopOpacity="0" />
          <stop offset="1" stopColor="var(--face-ux)" stopOpacity="0.1" />
        </radialGradient>
        <radialGradient id="obs-tint-sec" cx="50%" cy="50%" r="50%">
          <stop offset="0.2" stopColor="var(--face-sec)" stopOpacity="0" />
          <stop offset="1" stopColor="var(--face-sec)" stopOpacity="0.1" />
        </radialGradient>
        <radialGradient id="obs-core" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="var(--fg)" stopOpacity="0.16" />
          <stop offset="1" stopColor="var(--fg)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="obs-axis" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--fg-faint)" stopOpacity="0" />
          <stop offset="0.5" stopColor="var(--fg-faint)" stopOpacity="0.8" />
          <stop offset="1" stopColor="var(--fg-faint)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="obs-probe" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="var(--face-sec)" stopOpacity="0" />
          <stop offset="1" stopColor="var(--face-sec)" />
        </linearGradient>
      </defs>

      {/* Rings and their tick marks. */}
      {RINGS.map((radius, index) => (
        <circle
          key={radius}
          cx={C}
          cy={C}
          r={radius}
          fill="none"
          stroke="var(--line-strong)"
          strokeWidth="1"
          strokeDasharray={index === RINGS.length - 1 ? '2 6' : undefined}
        />
      ))}
      <motion.g style={ORIGIN} {...spin(240, 1)}>
        {Array.from({ length: 72 }, (_, index) => {
          const inner = at(RINGS[3] ?? 248, index * 5);
          const outer = at((RINGS[3] ?? 248) + (index % 6 === 0 ? 9 : 4), index * 5);
          return (
            <line
              key={index}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="var(--fg-faint)"
              strokeWidth="1"
              opacity={index % 6 === 0 ? 0.7 : 0.35}
            />
          );
        })}
      </motion.g>

      {/* The UX face: synthetic users in orbit, a pulse where one trips. */}
      <g clipPath="url(#obs-left)">
        <circle cx={C} cy={C} r={RINGS[3]} fill="url(#obs-tint-ux)" />
        {[1, 2, 3].map((ring) => (
          <motion.g key={ring} style={ORIGIN} {...spin(40 + ring * 22, -1)}>
            {SHOPPERS.filter((dot) => dot.ring === ring).map((dot) => {
              const point = at(RINGS[dot.ring] ?? 144, dot.deg);
              return (
                <circle
                  key={dot.deg}
                  cx={point.x}
                  cy={point.y}
                  r={dot.r}
                  fill="var(--face-ux)"
                  style={{ filter: 'drop-shadow(0 0 6px var(--face-ux))' }}
                />
              );
            })}
          </motion.g>
        ))}
        {FRICTION.map((pulse) => {
          const point = at(RINGS[pulse.ring] ?? 144, pulse.deg);
          return (
            <motion.circle
              key={pulse.deg}
              cx={point.x}
              cy={point.y}
              r={6}
              fill="none"
              stroke="var(--warning)"
              strokeWidth="1.5"
              initial={{ scale: 0.4, opacity: 0 }}
              style={{
                transformOrigin: `${String(point.x)}px ${String(point.y)}px`,
                transformBox: 'view-box',
              }}
              {...(still
                ? { opacity: 0.6 }
                : {
                    animate: { scale: [0.4, 3.2], opacity: [0.9, 0] },
                    transition: {
                      duration: 2.2,
                      delay: pulse.delay,
                      repeat: Infinity,
                      repeatDelay: 4.6,
                      ease: 'easeOut' as const,
                    },
                  })}
            />
          );
        })}
      </g>

      {/* The security face: probes strike from the edge and stop at the core. */}
      <g clipPath="url(#obs-right)">
        <circle cx={C} cy={C} r={RINGS[3]} fill="url(#obs-tint-sec)" />
        {PROBES.map((deg, index) => {
          const from = at(RINGS[3] ?? 248, deg);
          const to = at(56, deg);
          return (
            <motion.line
              key={deg}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="url(#obs-probe)"
              strokeWidth="1.6"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              {...(still
                ? { pathLength: 1, opacity: 0.5 }
                : {
                    animate: { pathLength: [0, 1, 1], opacity: [0, 1, 0] },
                    transition: {
                      duration: 2.4,
                      delay: 0.6 + index * 1.1,
                      repeat: Infinity,
                      repeatDelay: 3.4,
                      ease: 'easeInOut' as const,
                    },
                  })}
            />
          );
        })}
        <motion.g style={ORIGIN} {...spin(70, 1)}>
          {[24, 118, 164].map((deg) => {
            const point = at(RINGS[2] ?? 204, deg);
            return (
              <rect
                key={deg}
                x={point.x - 3}
                y={point.y - 3}
                width="6"
                height="6"
                rx="1"
                fill="var(--face-sec)"
                transform={`rotate(45 ${String(point.x)} ${String(point.y)})`}
                style={{ filter: 'drop-shadow(0 0 6px var(--face-sec))' }}
              />
            );
          })}
        </motion.g>
      </g>

      {/* The axis and the core, where both faces meet: the pull request. */}
      <line x1={C} y1="6" x2={C} y2="514" stroke="url(#obs-axis)" strokeWidth="1" />
      <circle cx={C} cy={C} r="78" fill="url(#obs-core)" />
      <motion.circle
        cx={C}
        cy={C}
        r="52"
        fill="var(--surface-1)"
        stroke="var(--line-strong)"
        style={ORIGIN}
        {...(still
          ? {}
          : {
              animate: { scale: [1, 1.035, 1] },
              transition: { duration: 5, repeat: Infinity, ease: 'easeInOut' as const },
            })}
      />
      <g transform={`translate(${String(C - 26)} ${String(C - 26)}) scale(1.625)`}>
        <path
          d="M15 3.2A12.8 12.8 0 0 0 15 28.8"
          fill="none"
          stroke="var(--face-ux)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M17 3.2A12.8 12.8 0 0 1 17 28.8"
          fill="none"
          stroke="var(--face-sec)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="10.5" cy="13.5" r="1.5" fill="var(--face-ux)" />
        <circle cx="21.5" cy="13.5" r="1.5" fill="var(--face-sec)" />
      </g>

      <text x="34" y="40" className="observatory-label" fill="var(--face-ux)">
        UX · SYNTHETIC USERS
      </text>
      <text x="486" y="40" textAnchor="end" className="observatory-label" fill="var(--face-sec)">
        SECURITY · SANDBOXED ATTACKS
      </text>
      <text x={C} y="500" textAnchor="middle" className="observatory-label" fill="var(--fg-faint)">
        ONE PULL REQUEST
      </text>
    </svg>
  );
}
