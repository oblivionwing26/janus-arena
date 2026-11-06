import {
  BrowserSessionNotFoundError,
  ElementDisabledError,
  ElementNotFoundError,
  ElementObscuredError,
  NavigationTimeoutError,
  OptionNotFoundError,
} from '../../domain/browser/browser-errors.js';
import type {
  BrowserPort,
  BrowserSessionOptions,
  ElementBox,
  ElementTarget,
  PageSnapshot,
} from '../../domain/browser/browser-port.js';
import type {
  PageActivity,
  PageErrorRecord,
  PageTelemetry,
} from '../../domain/browser/page-telemetry.js';
import { MASK } from './mask-secrets.js';

export interface ScriptedElement {
  readonly target: ElementTarget;
  /** Path (relative to the base URL) the page moves to when this element is clicked. */
  readonly navigatesTo?: string;
  /** Option labels, for a select. */
  readonly options?: readonly string[];
  readonly disabled?: boolean;
  /** Another element covers it: clicks fail with ElementObscuredError. */
  readonly obscured?: boolean;
  /** A password field: snapshots show its value masked, as the Playwright adapter does. */
  readonly secret?: boolean;
  /** Clicking it does nothing at all: no navigation, no DOM change (a dead click). */
  readonly inert?: boolean;
}

export interface ScriptedPage {
  readonly title: string;
  readonly elements: readonly ScriptedElement[];
  /** Technical errors the page reports every time it is shown. */
  readonly errors?: readonly PageErrorRecord[];
  /** Web vitals the page reports once shown. */
  readonly vitals?: { readonly lcpMs?: number; readonly cls?: number; readonly inpMs?: number };
  /** Texts of `alert` notices shown on the page, such as validation errors. */
  readonly alerts?: readonly string[];
}

interface Session {
  readonly baseUrl: string;
  path: string;
  readonly history: string[];
  scrollY: number;
  readonly viewport: { readonly width: number; readonly height: number };
  document: number;
  mutations: number;
  readonly errors: PageErrorRecord[];
  readonly typed: Map<string, string>;
  readonly selected: Map<string, string>;
}

const VIEWPORT = { width: 1280, height: 720 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const ROW_HEIGHT = 40;

function roleOf(target: ElementTarget): string {
  return 'label' in target ? 'textbox' : target.role;
}

function nameOf(target: ElementTarget): string {
  return 'label' in target ? target.label : target.name;
}

/** A labelled field matches its label, or role textbox with that name (as Playwright does). */
function matches(element: ElementTarget, target: ElementTarget): boolean {
  if ('label' in target) return 'label' in element && element.label === target.label;
  return roleOf(element) === target.role && nameOf(element) === target.name;
}

/**
 * Fake browser for unit tests: pages are a map of path -> elements, and clicking an element
 * moves to its `navigatesTo` path. Paths are matched exactly, or by a `:param` segment.
 */
export class ScriptedBrowser implements BrowserPort {
  private readonly sessions = new Map<string, Session>();
  private nextId = 1;

  constructor(
    private readonly pages: Readonly<Record<string, ScriptedPage>>,
    /** What fetchText returns per path, e.g. the target's JSON API. */
    private readonly responses: Readonly<Record<string, { status: number; body: string }>> = {},
  ) {}

  private readonly typedBySession = new Map<string, Map<string, string>>();
  private readonly selectedBySession = new Map<string, Map<string, string>>();

  /** What was typed into each field of a session, kept after it closes, for assertions. */
  typedValues(sessionId: string): ReadonlyMap<string, string> {
    return this.typedBySession.get(sessionId) ?? new Map();
  }

  /** The option picked in each select of a session, kept after it closes. */
  selectedValues(sessionId: string): ReadonlyMap<string, string> {
    return this.selectedBySession.get(sessionId) ?? new Map();
  }

  newSession(options: BrowserSessionOptions): Promise<string> {
    const id = `scripted-${String(this.nextId++)}`;
    const typed = new Map<string, string>();
    const selected = new Map<string, string>();
    this.typedBySession.set(id, typed);
    this.selectedBySession.set(id, selected);
    this.sessions.set(id, {
      baseUrl: options.baseUrl.replace(/\/$/, ''),
      path: '/',
      history: [],
      document: 0,
      mutations: 0,
      errors: [],
      scrollY: 0,
      viewport: options.device === 'mobile' ? MOBILE_VIEWPORT : VIEWPORT,
      typed,
      selected,
    });
    return Promise.resolve(id);
  }

  goto(sessionId: string, url: string): Promise<void> {
    return this.act(() => {
      this.navigate(this.session(sessionId), new URL(url).pathname);
    });
  }

  click(sessionId: string, target: ElementTarget): Promise<void> {
    return this.act(() => {
      const session = this.session(sessionId);
      const { element } = this.find(session, target);
      this.ensureUsable(session, element, target);
      if (element.obscured === true) throw new ElementObscuredError(target, this.url(session));
      if (element.inert === true) return;
      if (element.navigatesTo !== undefined) this.navigate(session, element.navigatesTo);
      else session.mutations += 1;
    });
  }

  type(sessionId: string, target: ElementTarget, text: string): Promise<void> {
    return this.act(() => {
      const session = this.session(sessionId);
      const { element } = this.find(session, target);
      this.ensureUsable(session, element, target);
      session.typed.set(nameOf(target), text);
      session.mutations += 1;
    });
  }

  select(sessionId: string, target: ElementTarget, option: string): Promise<void> {
    return this.act(() => {
      const session = this.session(sessionId);
      const { element } = this.find(session, target);
      this.ensureUsable(session, element, target);
      if (!(element.options ?? []).includes(option)) {
        throw new OptionNotFoundError(target, option, this.url(session));
      }
      session.selected.set(nameOf(target), option);
      session.mutations += 1;
    });
  }

  locate(sessionId: string, target: ElementTarget): Promise<ElementBox> {
    return this.act(() => {
      const session = this.session(sessionId);
      return this.boxAt(session, this.find(session, target).index);
    });
  }

  scroll(sessionId: string, direction: 'up' | 'down'): Promise<void> {
    return this.act(() => {
      const session = this.session(sessionId);
      const step = session.viewport.height * 0.8;
      session.scrollY = Math.max(0, session.scrollY + (direction === 'down' ? step : -step));
    });
  }

  settle(sessionId: string): Promise<void> {
    return this.act(() => {
      this.session(sessionId);
    });
  }

  back(sessionId: string): Promise<void> {
    return this.act(() => {
      const session = this.session(sessionId);
      const previous = session.history.pop();
      if (previous !== undefined) {
        session.path = previous;
        session.scrollY = 0;
        session.document += 1;
        session.mutations = 0;
      }
    });
  }

  waitForUrl(sessionId: string, pattern: RegExp): Promise<void> {
    return this.act(() => {
      const session = this.session(sessionId);
      const url = this.url(session);
      if (!pattern.test(url)) throw new NavigationTimeoutError(pattern.source, url);
    });
  }

  snapshot(sessionId: string): Promise<PageSnapshot> {
    return this.act(() => {
      const session = this.session(sessionId);
      const page = this.page(session);
      const aria = page.elements
        .map(({ target }) => `- ${roleOf(target)} "${nameOf(target)}"`)
        .join('\n');
      const tree = page.elements.map((element, index) => {
        const name = nameOf(element.target);
        const typed = session.typed.get(name);
        const picked = session.selected.get(name) ?? element.options?.[0];
        return {
          role: roleOf(element.target),
          name,
          ref: `e${String(index + 1)}`,
          box: this.boxAt(session, index),
          ...(typed === undefined ? {} : { text: element.secret === true ? MASK : typed }),
          ...(element.disabled === true ? { disabled: true } : {}),
          ...(element.options === undefined
            ? {}
            : {
                children: element.options.map((option) => ({
                  role: 'option',
                  name: option,
                  ...(option === picked ? { selected: true } : {}),
                })),
              }),
        };
      });
      const alerts = (page.alerts ?? []).map((text) => ({ role: 'alert', text }));
      return {
        url: this.url(session),
        title: page.title,
        aria,
        tree: [...tree, ...alerts],
        viewport: session.viewport,
      };
    });
  }

  pageActivity(sessionId: string): Promise<PageActivity> {
    return this.act(() => {
      const session = this.session(sessionId);
      return { documentId: `doc-${String(session.document)}`, mutations: session.mutations };
    });
  }

  drainTelemetry(sessionId: string): Promise<PageTelemetry> {
    return this.act(() => {
      const session = this.session(sessionId);
      const vitals = this.page(session).vitals;
      return {
        errors: session.errors.splice(0),
        vitals: vitals === undefined ? null : { url: this.url(session), ...vitals },
      };
    });
  }

  screenshot(sessionId: string): Promise<Uint8Array> {
    return this.act(() => {
      this.session(sessionId);
      return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    });
  }

  fetchText(sessionId: string, path: string): Promise<{ status: number; body: string }> {
    return this.act(() => {
      this.session(sessionId);
      if (!path.startsWith('/') || path.startsWith('//')) {
        throw new Error(`fetchText only takes a path on the variant, not ${path}`);
      }
      return this.responses[path] ?? { status: 404, body: 'Not found' };
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

  private navigate(session: Session, path: string): void {
    session.history.push(session.path);
    session.path = path;
    session.document += 1;
    session.mutations = 0;
    session.errors.push(...(this.page(session).errors ?? []));
    session.scrollY = 0;
  }

  private url(session: Session): string {
    return session.baseUrl + session.path;
  }

  private boxAt(session: Session, index: number): ElementBox {
    return { x: 0, y: index * ROW_HEIGHT - session.scrollY, width: 200, height: 32 };
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

  private find(
    session: Session,
    target: ElementTarget,
  ): { element: ScriptedElement; index: number } {
    const nth = 'label' in target ? 0 : (target.nth ?? 0);
    const found = this.page(session)
      .elements.map((element, index) => ({ element, index }))
      .filter(({ element }) => matches(element.target, target))[nth];
    if (found === undefined) throw new ElementNotFoundError(target, this.url(session));
    return found;
  }

  private ensureUsable(session: Session, element: ScriptedElement, target: ElementTarget): void {
    if (element.disabled === true) throw new ElementDisabledError(target, this.url(session));
  }
}
