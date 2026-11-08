import type {
  BrowserAttackPort,
  BrowserVisit,
  InjectionPoint,
} from '../../domain/attack/browser-attack-port.js';

export interface FakeField {
  /** A URL on the origin with `{payload}` where the page reflects what is typed. */
  readonly template: string;
  readonly field: string;
  /** The page renders the value as HTML, so a script vector runs. */
  readonly unsafe: boolean;
}

// The texts of the alerts a payload would raise if the page rendered it as HTML.
const ALERT = /alert\((?:`([^`]*)`|'([^']*)')\)/g;

/**
 * A target's pages for tests (F3.3): fields that reflect typed input in the URL, rendered
 * safely or not. A visit to an unsafe field raises one dialog per alert in the payload.
 */
export class InMemoryBrowserAttack implements BrowserAttackPort {
  readonly visited: string[] = [];

  constructor(
    private readonly origin: string,
    private readonly fields: readonly FakeField[],
  ) {}

  discover(origin: string): Promise<readonly InjectionPoint[]> {
    return Promise.resolve(
      origin === this.origin ? this.fields.map(({ template, field }) => ({ template, field })) : [],
    );
  }

  visit(origin: string, url: string): Promise<BrowserVisit> {
    if (origin !== this.origin || new URL(url).origin !== origin) {
      return Promise.resolve({ blocked: 'out-of-scope-origin', status: null, dialogs: [] });
    }
    this.visited.push(url);
    const field = this.fields.find((each) =>
      url.startsWith(each.template.split('{payload}')[0] ?? ''),
    );
    if (field === undefined) return Promise.resolve({ blocked: null, status: 404, dialogs: [] });
    const payload = decodeURIComponent(
      url.slice((field.template.split('{payload}')[0] ?? '').length),
    );
    const dialogs = field.unsafe
      ? [...payload.matchAll(ALERT)].map((match) => ({
          kind: 'alert',
          message: match[1] ?? match[2] ?? '',
          url,
        }))
      : [];
    return Promise.resolve({ blocked: null, status: 200, dialogs });
  }
}
