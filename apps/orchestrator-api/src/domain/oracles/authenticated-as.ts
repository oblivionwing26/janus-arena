import { verdict, type OracleVerdict } from './oracle-verdict.js';

export interface AuthenticatedAsInput {
  /** Whose session the target says it opened (its own answer, e.g. `whoami`). */
  readonly sessionEmail: string | null;
  /** What was sent to log in. */
  readonly submitted: { readonly email: string; readonly password: string };
  /** The test users whose passwords Janus holds. */
  readonly known: ReadonlyMap<string, string>;
}

const normalise = (email: string) => email.trim().toLowerCase();

/**
 * Authentication bypass (F3.2): a session was opened for an account whose own credentials were
 * not presented: a different account than the one asked for, or a known account with the
 * wrong password. Never echoes a password in the evidence.
 */
export function authenticatedAs(input: AuthenticatedAsInput): OracleVerdict {
  const { sessionEmail, submitted, known } = input;
  if (sessionEmail === null || sessionEmail.trim() === '') {
    return verdict(false, 'no session was opened');
  }
  const session = normalise(sessionEmail);
  if (session !== normalise(submitted.email)) {
    return verdict(true, `a session for ${session} was opened without its credentials`);
  }
  const password = [...known].find(([email]) => normalise(email) === session)?.[1];
  if (password !== undefined && password !== submitted.password) {
    return verdict(true, `a session for ${session} was opened with a wrong password`);
  }
  return verdict(false, `${session} logged in with its own credentials`);
}
