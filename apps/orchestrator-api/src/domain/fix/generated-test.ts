/**
 * A regression test Janus writes from a PoC (F3.5, V2), in the target's own test style: code
 * generates it, never an LLM. It must fail on the base and pass on the fix.
 */
export interface GeneratedTest {
  /** Where it goes in the target's tree. */
  readonly path: string;
  /** Its full name as the test runner reports it (suites joined by " > "). */
  readonly name: string;
  readonly source: string;
}
