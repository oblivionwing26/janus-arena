import { DomainError } from '../errors/domain-error.js';
import { describeTarget, type ElementTarget } from './browser-port.js';

export class BrowserSessionNotFoundError extends DomainError {
  readonly code = 'browser.session-not-found';

  constructor(readonly sessionId: string) {
    super(`Browser session ${sessionId} does not exist or is closed`);
  }
}

export class ElementNotFoundError extends DomainError {
  readonly code = 'browser.element-not-found';

  constructor(
    readonly target: ElementTarget,
    readonly url: string,
  ) {
    super(`No element ${describeTarget(target)} on ${url}`);
  }
}

export class NavigationTimeoutError extends DomainError {
  readonly code = 'browser.navigation-timeout';

  constructor(
    readonly pattern: string,
    readonly url: string,
  ) {
    super(`URL did not match ${pattern}; still on ${url}`);
  }
}
