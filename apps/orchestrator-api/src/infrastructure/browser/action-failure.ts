export type ActionFailure = 'obscured' | 'disabled' | 'not-found';

/**
 * Why a Playwright action timed out, read from its call log: Playwright keeps retrying while
 * another element intercepts the click or the element is disabled, then times out.
 */
export function actionFailureOf(message: string): ActionFailure {
  if (message.includes('intercepts pointer events')) return 'obscured';
  if (/element is not (enabled|editable)/.test(message)) return 'disabled';
  return 'not-found';
}
