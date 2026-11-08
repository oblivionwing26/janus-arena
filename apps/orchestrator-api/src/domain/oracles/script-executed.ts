import type { PageDialogRecord } from '../browser/page-telemetry.js';
import { verdict, type OracleVerdict } from './oracle-verdict.js';

/**
 * XSS (F3.2): script injected by the attack ran in the page, proved by a dialog showing the
 * run's own marker. A dialog the page opens by itself, or one with another text, proves nothing.
 */
export function scriptExecuted(
  dialogs: readonly PageDialogRecord[],
  marker: string,
): OracleVerdict {
  if (marker.length < 8) return verdict(false, 'the marker is too short to be unique');
  const hit = dialogs.find((dialog) => dialog.message === marker);
  return hit === undefined
    ? verdict(false, `no dialog showed the marker (${String(dialogs.length)} dialogs)`)
    : // The page, not its query: the payload is not repeated in the evidence.
      verdict(
        true,
        `a dialog (${hit.kind}) showed the marker ${marker} on ${hit.url.split('?')[0] ?? hit.url}`,
      );
}
