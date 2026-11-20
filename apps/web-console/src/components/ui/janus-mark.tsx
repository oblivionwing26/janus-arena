import { useId } from 'react';

// Janus bifrons struck like a coin: one bearded profile looking left, the same path mirrored
// looking right, under an ember laurel. A sketch until the Blender model gives the final mark.
const FACE =
  'M50 10 C38 10 29 15 25 25 C22 32 23 38 21 43 L19 47 C18 49 18.5 50 20 51 L22 52 L15 62 C14 64 15 65.5 17 66 L22 67 C21 69 21.5 71 23 71.5 C21.5 73 21.8 75 23.5 76 C22.5 77.5 22.8 79 24 80 C21 84 19 90 20 97 C21 104 27 109 35 111 C40 112.5 46 112.5 50 112 Z';
const LAUREL = 'M50 14 C40 14 33 17 29 22 M44 13 l-5 -6 M37 15 l-6 -5 M31 19 l-7 -3';

// The face is drawn in a 100x120 box with its back at x=50; this maps it into the coin.
const LEFT = 'translate(20 8) translate(-10 -5)';
const RIGHT = 'translate(120 0) scale(-1 1) translate(20 8) translate(-10 -5)';

export function JanusMark({ size = 32, title }: { size?: number; title?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={`${id}-marble`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.96 0 0)" />
          <stop offset=".55" stopColor="oklch(0.80 0 0)" />
          <stop offset="1" stopColor="oklch(0.58 0 0)" />
        </linearGradient>
        <linearGradient id={`${id}-ember`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.80 0 0)" />
          <stop offset="1" stopColor="oklch(0.62 0 0)" />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <circle cx="60" cy="60" r="49" />
        </clipPath>
      </defs>
      <circle
        cx="60"
        cy="60"
        r="57"
        fill="oklch(0.18 0 0)"
        stroke={`url(#${id}-ember)`}
        strokeWidth="3"
      />
      <circle cx="60" cy="60" r="50" fill="none" stroke="oklch(1 0 0 / .12)" />
      <g clipPath={`url(#${id}-clip)`}>
        {[LEFT, RIGHT].map((transform) => (
          <g key={transform} transform={transform}>
            <path d={FACE} fill={`url(#${id}-marble)`} />
            <path
              d={LAUREL}
              fill="none"
              stroke={`url(#${id}-ember)`}
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </g>
        ))}
        <path d="M60 12 V118" stroke="oklch(0.18 0 0)" strokeWidth="1.2" />
      </g>
    </svg>
  );
}
