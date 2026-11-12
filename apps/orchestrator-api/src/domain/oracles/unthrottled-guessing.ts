import { verdict, type OracleVerdict } from './oracle-verdict.js';

/** Wrong passwords sent one after another to one account, then the right one (F3.6). */
export interface GuessingRun {
  readonly guesses: readonly { readonly status: number | null; readonly ms: number }[];
  readonly rightAfter: { readonly signedIn: boolean };
}

/** Slower than this per guess on average, guessing is throttled (a progressive delay). */
export const MAX_MS_PER_GUESS = 1000;
/** Answers that mean the shop stopped the guessing: too many requests, or the account locked. */
const STOPPED = new Set([423, 429]);

/**
 * Brute force (F3.6): an account can be guessed at. Exploitable when every wrong password got an
 * answer, none was throttled (429) or met a locked account (423), they came back faster than
 * MAX_MS_PER_GUESS on average, and the right password still signs in after them. A lockout, a
 * rate limit and a progressive delay each make it not exploitable, which is how V1 tells a fix.
 */
export function unthrottledGuessing(run: GuessingRun): OracleVerdict {
  const { guesses } = run;
  if (guesses.length === 0) return verdict(false, 'no guess was made');
  const unanswered = guesses.findIndex((guess) => guess.status === null);
  if (unanswered !== -1) {
    return verdict(false, `guess ${String(unanswered + 1)} got no answer, so nothing is proven`);
  }
  const stopped = guesses.findIndex((guess) => STOPPED.has(guess.status ?? 0));
  if (stopped !== -1) {
    return verdict(
      false,
      `the shop throttled at guess ${String(stopped + 1)} (${String(guesses[stopped]?.status)})`,
    );
  }
  const average = Math.round(guesses.reduce((sum, guess) => sum + guess.ms, 0) / guesses.length);
  const pace = `${String(guesses.length)} wrong passwords were refused in ${String(average)} ms each on average`;
  if (!run.rightAfter.signedIn) {
    return verdict(false, `${pace}, but the right password no longer signs in`);
  }
  if (average >= MAX_MS_PER_GUESS) return verdict(false, `${pace}: guessing is slowed down`);
  return verdict(true, `${pace}, none throttled, and the right one still signed in`);
}
