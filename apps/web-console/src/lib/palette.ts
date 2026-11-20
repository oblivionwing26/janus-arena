// The console's palette, as OKLCH triples [lightness, chroma, hue]. tokens.css carries the same
// values; palette.test.ts checks that the two agree and that every text colour meets WCAG AA.

export type Oklch = readonly [l: number, c: number, h: number];

export const PALETTE = {
  void: [0.13, 0, 0],
  ash: [0.2, 0, 0],
  stone: [0.74, 0, 0],
  marble: [0.96, 0, 0],
  ember: [0.98, 0, 0],
  blood: [0.86, 0, 0],
  aurora: [0.8, 0, 0],
  gold: [0.9, 0, 0],
} as const satisfies Record<string, Oklch>;

export type PaletteToken = keyof typeof PALETTE;

/** Tokens that carry text on the page or on a surface, so they must reach 4.5:1. */
export const TEXT_TOKENS: readonly PaletteToken[] = [
  'marble',
  'stone',
  'ember',
  'blood',
  'aurora',
  'gold',
];

export function oklchCss([l, c, h]: Oklch): string {
  return `oklch(${l} ${c} ${h})`;
}

/** OKLCH to linear sRGB (Björn Ottosson's matrices), clamped to the gamut. */
export function oklchToLinearRgb([l, c, h]: Oklch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return [
    clamp(4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S),
    clamp(-1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S),
    clamp(-0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S),
  ];
}

export function relativeLuminance(color: Oklch): number {
  const [r, g, b] = oklchToLinearRgb(color);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio between two colours. */
export function contrastRatio(x: Oklch, y: Oklch): number {
  const a = relativeLuminance(x);
  const b = relativeLuminance(y);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
