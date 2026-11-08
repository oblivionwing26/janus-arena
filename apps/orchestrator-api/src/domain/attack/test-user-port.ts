/** A synthetic account Janus registered on the target for this run (F3.2). */
export interface TestUser {
  /** Who it plays in an attack: `a` owns data, `b` tries to reach it. */
  readonly label: string;
  readonly email: string;
  /** Random per run; never recorded in events or logs. */
  readonly password: string;
  readonly userId: number;
}

/** A logged-in test user: what an attack sends as that user. */
export interface TestSession {
  readonly user: TestUser;
  readonly token: string;
  /** The user's basket on a shop target, when it has one. */
  readonly basketId: number | null;
}

/**
 * Registers and logs in synthetic test users on a target (F3.2). Every adapter must pass
 * src/test-support/test-user-contract.ts.
 */
export interface TestUserPort {
  /** A new account with a unique email and a random password. */
  register(label: string): Promise<TestUser>;
  /** Logs the user in with its own credentials; TestUserLoginError if the target refuses. */
  login(user: TestUser): Promise<TestSession>;
  /** Whose session a token opens, as the target says; null when it opens none. */
  whoami(token: string): Promise<string | null>;
}
