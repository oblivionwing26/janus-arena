import ts from 'typescript';

import type { CodeLocation, DeclaredEndpoint, HttpMethod } from '../../domain/surface/endpoint.js';
import {
  isFunctionNode,
  requestKeys,
  walk,
  type FunctionNode,
  type SourceSet,
} from './source-set.js';

const METHODS: Readonly<Record<string, HttpMethod>> = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  patch: 'PATCH',
  delete: 'DELETE',
  all: 'ALL',
};

/** A route as Express registers it, with the middlewares written before its handler. */
export interface ExpressRoute {
  readonly endpoint: DeclaredEndpoint;
  readonly middlewares: readonly ts.Expression[];
  readonly handlerNode: FunctionNode | null;
  /** The only argument after the path, when there is just one: it may be a guard, not a handler. */
  readonly guardOnly: ts.Expression | null;
}

/** `app.use(prefix, ...middlewares)`: applies to every route under the prefix declared after it. */
export interface ExpressMount {
  readonly prefix: string;
  readonly middlewares: readonly ts.Expression[];
  readonly at: CodeLocation;
}

function pathOf(node: ts.Expression | undefined): string | null {
  return node !== undefined && ts.isStringLiteralLike(node) && node.text.startsWith('/')
    ? node.text
    : null;
}

/** The path and method of `x.get('/p', ...)` or `x.route('/p').get(...)`. */
function registration(
  call: ts.CallExpression,
): { method: HttpMethod; path: string; args: readonly ts.Expression[] } | null {
  if (!ts.isPropertyAccessExpression(call.expression)) return null;
  const method = METHODS[call.expression.name.text];
  if (method === undefined) return null;
  const direct = pathOf(call.arguments[0]);
  if (direct !== null && call.arguments.length >= 2) {
    return { method, path: direct, args: call.arguments.slice(1) };
  }
  // x.route('/p').get(handler)
  let target = call.expression.expression;
  while (ts.isCallExpression(target) && ts.isPropertyAccessExpression(target.expression)) {
    if (target.expression.name.text === 'route') {
      const path = pathOf(target.arguments[0]);
      return path === null || call.arguments.length === 0
        ? null
        : { method, path, args: call.arguments };
    }
    target = target.expression.expression;
  }
  return null;
}

/** The function that answers, through wrappers (`asyncHandler(fn)`) and factories (`fn()`). */
function resolveHandler(
  sources: SourceSet,
  file: string,
  expression: ts.Expression,
  depth = 0,
): { file: string; node: FunctionNode; name: string } | null {
  if (depth > 4) return null;
  if (isFunctionNode(expression)) return { file, node: expression, name: '(inline)' };
  let found: { file: string; node: FunctionNode; name: string } | undefined;
  if (ts.isIdentifier(expression)) found = sources.definition(file, expression.text);
  if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
    found = sources.namespaceMember(file, expression.expression.text, expression.name.text);
  }
  if (found !== undefined) return found;
  if (ts.isCallExpression(expression)) {
    if (expression.arguments.length === 1) {
      const [inner] = expression.arguments;
      // asyncHandler(retrieveBasket()) → retrieveBasket()
      if (inner !== undefined && (ts.isCallExpression(inner) || isFunctionNode(inner))) {
        return resolveHandler(sources, file, inner, depth + 1);
      }
    }
    // retrieveBasket(): a factory; the handler is the function it returns.
    const factory = resolveHandler(sources, file, expression.expression, depth + 1);
    if (factory === null) return null;
    let returned: FunctionNode | null = null;
    walk(factory.node, (node) => {
      if (returned === null && ts.isReturnStatement(node) && node.expression !== undefined) {
        if (isFunctionNode(node.expression)) returned = node.expression;
      }
    });
    if (ts.isArrowFunction(factory.node) && isFunctionNode(factory.node.body)) {
      returned = factory.node.body;
    }
    return { ...factory, node: returned ?? factory.node };
  }
  return null;
}

/**
 * The HTTP surface of an Express app (F2.6): every `x.get|post|put|patch|delete|all('/path', ...)`
 * and `x.route('/path').get(...)` in the given files, with the handler followed to the function
 * that answers. `app.use` mounts are returned too, for the auth check of F2.6-B.
 */
export function expressRoutes(
  sources: SourceSet,
  files: readonly string[],
): { routes: ExpressRoute[]; mounts: ExpressMount[] } {
  const routes: ExpressRoute[] = [];
  const mounts: ExpressMount[] = [];
  for (const file of files) {
    const source = sources.get(file);
    if (source === undefined) continue;
    walk(source, (node) => {
      if (!ts.isCallExpression(node)) return;
      if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'use') {
        const prefix = pathOf(node.arguments[0]);
        if (prefix !== null) {
          mounts.push({
            prefix,
            middlewares: node.arguments.slice(1),
            at: { file, line: sources.lineOf(node) },
          });
        }
        return;
      }
      const found = registration(node);
      if (found === null) return;
      const last = found.args.at(-1);
      const handler = last === undefined ? null : resolveHandler(sources, file, last);
      const pathParams = [...found.path.matchAll(/:(\w+)/g)].map((match) => match[1] ?? '');
      routes.push({
        endpoint: {
          route: found.path,
          method: found.method,
          declaredAt: { file, line: sources.lineOf(node) },
          handler:
            handler === null
              ? null
              : { file: handler.file, line: sources.lineOf(handler.node), name: handler.name },
          params: [...pathParams, ...(handler === null ? [] : requestKeys(handler.node))],
        },
        middlewares: found.args.slice(0, -1),
        handlerNode: handler?.node ?? null,
        guardOnly: found.args.length === 1 ? (found.args[0] ?? null) : null,
      });
    });
  }
  return { routes, mounts };
}
