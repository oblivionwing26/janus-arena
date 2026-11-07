import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import type { AttackSurfacePort } from '../../domain/surface/attack-surface-port.js';
import type { Endpoint } from '../../domain/surface/endpoint.js';
import type { VcsWorkspace } from '../../domain/vcs/vcs-port.js';
import {
  handlerDemandsSession,
  isAuthMiddleware,
  mountCovers,
  ownerCheckOf,
} from './access-checks.js';
import { expressRoutes } from './express-routes.js';
import { nextjsEndpoints } from './nextjs-routes.js';
import { SourceSet } from './source-set.js';
import type { SurfaceTarget } from './surface-config.js';

const CODE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;
/** Folders that never hold the server's routes: dependencies, builds, the browser app, tests. */
const SKIP = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'coverage',
  'frontend',
  'test',
  'tests',
  'codefixes',
  'generated',
]);

async function codeFiles(root: string, dir = root): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await codeFiles(root, path)));
    else if (
      CODE.test(entry.name) &&
      !/\.(test|spec)\./.test(entry.name) &&
      !entry.name.endsWith('.d.ts')
    ) {
      found.push(relative(root, path).split(sep).join('/'));
    }
  }
  return found;
}

/**
 * AttackSurfacePort with the TypeScript compiler's parser (F2.6): reads the workspace's server
 * code (no node_modules, builds, browser app or tests) and lists its endpoints, the Next.js or
 * Express way as config/surface.yaml says.
 */
export class TypeScriptAttackSurface implements AttackSurfacePort {
  constructor(private readonly target: SurfaceTarget) {}

  async map(workspace: VcsWorkspace): Promise<Endpoint[]> {
    const files = new Map<string, string>();
    for (const path of await codeFiles(workspace.path)) {
      files.set(path, await readFile(join(workspace.path, ...path.split('/')), 'utf8'));
    }
    const sources = new SourceSet(files);
    const rules = this.target;

    if (this.target.framework === 'nextjs') {
      return nextjsEndpoints(sources).map((endpoint) => {
        const node =
          endpoint.handler === null
            ? undefined
            : sources.exportedFunction(endpoint.handler.file, endpoint.handler.name);
        return {
          ...endpoint,
          auth: node !== undefined && handlerDemandsSession(node, rules),
          ownerCheck: node === undefined ? 'unknown' : ownerCheckOf(node, rules),
        };
      });
    }

    const { routes, mounts } = expressRoutes(sources, this.target.files);
    return routes.map(({ endpoint, middlewares, handlerNode, guardOnly }) => {
      // `app.post('/api/Products', security.isAuthorized())`: a guard in front of routes a
      // library generates (finale-rest in Juice Shop), not a handler of its own.
      const guard = guardOnly !== null && isAuthMiddleware(guardOnly, rules);
      const mounted = mounts.some(
        (mount) =>
          mount.at.file === endpoint.declaredAt.file &&
          mount.at.line <= endpoint.declaredAt.line &&
          mountCovers(mount.prefix, endpoint.route) &&
          mount.middlewares.some((middleware) => isAuthMiddleware(middleware, rules)),
      );
      const node = guard ? null : handlerNode;
      return {
        ...endpoint,
        handler: guard ? null : endpoint.handler,
        auth:
          guard ||
          mounted ||
          middlewares.some((middleware) => isAuthMiddleware(middleware, rules)) ||
          (node !== null && handlerDemandsSession(node, rules)),
        ownerCheck: node === null ? 'unknown' : ownerCheckOf(node, rules),
      };
    });
  }
}
