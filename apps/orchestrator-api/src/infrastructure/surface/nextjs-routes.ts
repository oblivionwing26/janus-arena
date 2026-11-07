import ts from 'typescript';

import type { DeclaredEndpoint, HttpMethod } from '../../domain/surface/endpoint.js';
import { isFunctionNode, requestKeys, type SourceSet } from './source-set.js';

const ROUTE_FILE = /^(?:src\/)?app\/(?:(.*)\/)?route\.(?:ts|js|tsx|jsx)$/;
const METHODS = new Set<HttpMethod>(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

/** `src/app/api/orders/[id]/route.ts` → `/api/orders/:id`; groups `(x)` dropped. */
export function nextRoute(file: string): { route: string; params: string[] } | null {
  const match = ROUTE_FILE.exec(file);
  if (match === null) return null;
  const params: string[] = [];
  const segments = (match[1] ?? '')
    .split('/')
    .filter((segment) => segment !== '' && !/^\(.*\)$/.test(segment) && !segment.startsWith('@'))
    .map((segment) => {
      const dynamic = /^\[\[?(\.\.\.)?([^\]]+)\]\]?$/.exec(segment);
      if (dynamic?.[2] === undefined) return segment;
      params.push(dynamic[2]);
      return dynamic[1] === undefined ? `:${dynamic[2]}` : `*${dynamic[2]}`;
    });
  return { route: `/${segments.join('/')}`, params };
}

function exportedFunctions(source: ts.SourceFile): { name: string; node: ts.Node }[] {
  const found: { name: string; node: ts.Node }[] = [];
  const exported = (node: ts.Node) =>
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
  for (const statement of source.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name !== undefined &&
      exported(statement)
    ) {
      found.push({ name: statement.name.text, node: statement });
    }
    if (ts.isVariableStatement(statement) && exported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.initializer !== undefined &&
          isFunctionNode(declaration.initializer)
        ) {
          found.push({ name: declaration.name.text, node: declaration.initializer });
        }
      }
    }
  }
  return found;
}

function usesServer(source: ts.SourceFile): boolean {
  const [first] = source.statements;
  return (
    first !== undefined &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === 'use server'
  );
}

/**
 * The HTTP surface of a Next.js app router project (F2.6): every `route.ts` export named after an
 * HTTP method, and every exported function of a `'use server'` file (server actions, which
 * Next.js reaches with POST).
 */
export function nextjsEndpoints(sources: SourceSet): DeclaredEndpoint[] {
  const endpoints: DeclaredEndpoint[] = [];
  for (const file of sources.paths()) {
    const source = sources.get(file);
    if (source === undefined) continue;
    const route = nextRoute(file);
    if (route !== null) {
      for (const { name, node } of exportedFunctions(source)) {
        if (!METHODS.has(name as HttpMethod)) continue;
        const line = sources.lineOf(node);
        endpoints.push({
          route: route.route,
          method: name as HttpMethod,
          declaredAt: { file, line },
          handler: { file, line, name },
          params: [...route.params, ...requestKeys(node)],
        });
      }
    } else if (usesServer(source)) {
      for (const { name, node } of exportedFunctions(source)) {
        const line = sources.lineOf(node);
        endpoints.push({
          route: `action:${file}#${name}`,
          method: 'POST',
          declaredAt: { file, line },
          handler: { file, line, name },
          params: requestKeys(node),
        });
      }
    }
  }
  return endpoints.sort(
    (a, b) => a.route.localeCompare(b.route) || a.method.localeCompare(b.method),
  );
}
