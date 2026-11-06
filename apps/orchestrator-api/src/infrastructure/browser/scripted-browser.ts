import {
  BrowserSessionNotFoundError,
  ElementNotFoundError,
  NavigationTimeoutError,
} from '../../domain/browser/browser-errors.js';
import type {
  BrowserPort,
  BrowserSessionOptions,
  ElementTarget,
  PageSnapshot,
} from '../../domain/browser/browser-port.js';

export interface ScriptedElement {
  readonly target: ElementTarget;
  /** Path (relative to the base URL) the page moves to when this element is clicked. */
  readonly navigatesTo?: string;
}

export interface ScriptedPage {
  readonly title: string;
  readonly elements: readonly ScriptedElement[];
}

interface Session {
  readonly baseUrl: string;
  path: string;
  readonly typed: Map<string, string>;
}

function sameTarget(a: ElementTarget, b: ElementTarget): boolean {
  if ('label' in a || 'label' in b) return 'label' in a && 'label' in b && a.label === b.label;
  return a.role === b.role && a.name === b.name;
}

/**
 * Fake browser for unit tests: pages are a map of path -> elements, and clicking an element
 * moves to its `navigatesTo` path. Paths are matched exactly, or by a `:param` segment.
 */
export class ScriptedBrowser implements BrowserPort {
  private readonly sessions = new Map<string, Session>();
  private nextId = 1;

  constructor(private readonly pages: Readonly<Record<string, ScriptedPage>>) {}

  private readonly typedBySession = new Map<string, Map<string, string>>();

  /** What was typed into each field of a session, kept after it closes, for assertions. */
  typedValues(sessionId: string): ReadonlyMap<string, string> {
    return this.typedBySession.get(sessionId) ?? new Map();
  }

  newSession(options: BrowserSessionOptions): Promise<string> {
    const id = `scripted-${String(this.nextId++)}`;
    const typed = new Map<string, string>();
    this.typedBySession.set(id, typed);
    this.sessions.set(id, { baseUrl: options.baseUrl.replace(/\/$/, ''), path: '/', typed });
    return Promise.resolve(id);
  }

  goto(sessionId: string, url: string): Promise<void> {
    return this.act(() => {
      const session = this.session(sessionId);
      session.path = new URL(url).pathname;
    });
  }

  click(sessionId: string, target: ElementTarget): Promise<void> {
    return this.act(() => {
      const session = this.session(sessionId);
      const element = this.find(session, target);
      if (element.navigatesTo !== undefined) session.path = element.navigatesTo;
    });
  }

  type(sessionId: string, target: ElementTarget, text: string): Promise<void> {
    return this.act(() => {
      const session = this.session(sessionId);
      this.find(session, target);
      session.typed.set('label' in target ? target.label : target.name, text);
    });
  }

  waitForUrl(sessionId: string, pattern: RegExp): Promise<void> {
    return this.act(() => {
      const session = this.session(sessionId);
      const url = session.baseUrl + session.path;
      if (!pattern.test(url)) throw new NavigationTimeoutError(pattern.source, url);
    });
  }

  snapshot(sessionId: string): Promise<PageSnapshot> {
    return this.act(() => {
      const session = this.session(sessionId);
      const page = this.page(session);
      const aria = page.elements
        .map(({ target }) =>
          'label' in target ? `- textbox "${target.label}"` : `- ${target.role} "${target.name}"`,
        )
        .join('\n');
      const tree = page.elements.map(({ target }, index) => ({
        role: 'label' in target ? 'textbox' : target.role,
        name: 'label' in target ? target.label : target.name,
        ref: `e${String(index + 1)}`,
        box: { x: 0, y: index * 40, width: 200, height: 32 },
      }));
      return {
        url: session.baseUrl + session.path,
        title: page.title,
        aria,
        tree,
        viewport: { width: 1280, height: 720 },
      };
    });
  }

  close(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    return Promise.resolve();
  }

  private act<T>(run: () => T): Promise<T> {
    try {
      return Promise.resolve(run());
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private session(sessionId: string): Session {
    const session = this.sessions.get(sessionId);
    if (session === undefined) throw new BrowserSessionNotFoundError(sessionId);
    return session;
  }

  private page(session: Session): ScriptedPage {
    const exact = this.pages[session.path];
    if (exact !== undefined) return exact;
    const pattern = Object.keys(this.pages).find((key) =>
      new RegExp(`^${key.replace(/:[a-z]+/g, '[^/]+')}$`).test(session.path),
    );
    return (
      (pattern === undefined ? undefined : this.pages[pattern]) ?? {
        title: 'Not found',
        elements: [],
      }
    );
  }

  private find(session: Session, target: ElementTarget): ScriptedElement {
    const element = this.page(session).elements.find((candidate) =>
      sameTarget(candidate.target, target),
    );
    if (element === undefined)
      throw new ElementNotFoundError(target, session.baseUrl + session.path);
    return element;
  }
}
