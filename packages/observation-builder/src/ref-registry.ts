/**
 * How the executor finds an element again, the way a person sees it: ARIA role, exact
 * accessible name, and its position among elements with the same role and name. Never CSS.
 */
export interface ElementLocator {
  readonly role: string;
  readonly name: string;
  readonly nth: number;
}

/**
 * Short refs (`e1`, `e2`…) that stay the same for the same element across the observations of
 * one agent session. Playwright's own refs change on every snapshot, so they are not used.
 */
export class RefRegistry {
  private readonly refs = new Map<string, string>();

  refFor(locator: ElementLocator): string {
    const key = `${locator.role}\u0000${locator.name}\u0000${String(locator.nth)}`;
    let ref = this.refs.get(key);
    if (ref === undefined) {
      ref = `e${String(this.refs.size + 1)}`;
      this.refs.set(key, ref);
    }
    return ref;
  }
}
