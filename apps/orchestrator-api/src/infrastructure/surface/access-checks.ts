import ts from 'typescript';

import type { SurfaceTarget } from './surface-config.js';

export type AccessRules = Pick<
  SurfaceTarget,
  'authCalls' | 'authMiddleware' | 'sessionCalls' | 'sessionIds' | 'ignoreCalls'
>;

const DATA_ACCESS =
  /^(find|get|load|list|fetch|read|update|delete|destroy|remove|query|count|upsert|create|save|build)/i;
const RESPONSE = /^(res|response|NextResponse|Response|console|next)\b/;

/** `a.b.c(...)` → `a.b.c`, without whitespace. */
function calleeText(call: ts.CallExpression): string {
  return call.expression.getText().replace(/\s+/g, '');
}

function matches(text: string, names: readonly string[]): boolean {
  return names.some((name) => text === name || text.endsWith(`.${name}`));
}

function lastName(call: ts.CallExpression): string {
  return /([\w$]+)$/.exec(calleeText(call))?.[1] ?? '';
}

function mentions(node: ts.Node, test: (child: ts.Node) => boolean): boolean {
  let found = false;
  const go = (child: ts.Node) => {
    if (found) return;
    if (test(child)) found = true;
    else ts.forEachChild(child, go);
  };
  go(node);
  return found;
}

/** What a handler does with the session and the path, leaving out the calls the rules ignore. */
interface HandlerFacts {
  readonly calls: readonly ts.CallExpression[];
  /** Variables holding the session's user (`const user = await requireUser(request)`). */
  readonly sessionVars: ReadonlySet<string>;
  /** Variables computed from the session's user (`const email = user.data.email`). */
  readonly derivedVars: ReadonlySet<string>;
  /** Variables computed from path parameters (`const id = req.params.id`). */
  readonly paramVars: ReadonlySet<string>;
  readonly ifs: readonly ts.IfStatement[];
}

function factsOf(handler: ts.Node, rules: AccessRules): HandlerFacts {
  const calls: ts.CallExpression[] = [];
  const ifs: ts.IfStatement[] = [];
  const sessionVars = new Set<string>();
  const derivedVars = new Set<string>();
  const paramVars = new Set<string>();
  const sessionCall = (call: ts.CallExpression) =>
    matches(calleeText(call), rules.authCalls) || matches(calleeText(call), rules.sessionCalls);
  const fromSession = (node: ts.Node) =>
    rules.sessionIds.includes(node.getText().replace(/\s+/g, '')) ||
    mentions(
      node,
      (child) =>
        ts.isIdentifier(child) && (sessionVars.has(child.text) || derivedVars.has(child.text)),
    );

  // Source order: a variable is known before the code that uses it.
  const go = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      if (matches(calleeText(node), rules.ignoreCalls)) return;
      calls.push(node);
    }
    if (ts.isIfStatement(node)) ifs.push(node);
    if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
      const { initializer } = node;
      const names = ts.isIdentifier(node.name)
        ? [node.name.text]
        : ts.isObjectBindingPattern(node.name)
          ? node.name.elements.map((element) => element.name.getText())
          : [];
      const session = mentions(
        initializer,
        (child) =>
          ts.isCallExpression(child) &&
          !matches(calleeText(child), rules.ignoreCalls) &&
          sessionCall(child),
      );
      const derived = !session && fromSession(initializer);
      const param = /\bparams\b/.test(initializer.getText());
      for (const name of names) {
        if (session) sessionVars.add(name);
        if (derived) derivedVars.add(name);
        if (param) paramVars.add(name);
      }
    }
    ts.forEachChild(node, go);
  };
  go(handler);
  return { calls, sessionVars, derivedVars, paramVars, ifs };
}

/** An Express middleware expression (`security.isAuthorized()`) that demands a session. */
export function isAuthMiddleware(expression: ts.Expression, rules: AccessRules): boolean {
  const text = (ts.isCallExpression(expression) ? expression.expression : expression)
    .getText()
    .replace(/\s+/g, '');
  return matches(text, rules.authMiddleware);
}

/**
 * Whether a handler demands a session itself: it calls an auth call (`requireUser`, which
 * throws without one), or it reads the session and branches on it (`if (loggedInUser) …`).
 */
export function handlerDemandsSession(handler: ts.Node, rules: AccessRules): boolean {
  const facts = factsOf(handler, rules);
  if (facts.calls.some((call) => matches(calleeText(call), rules.authCalls))) return true;
  return facts.ifs.some((statement) =>
    mentions(
      statement.expression,
      (child) => ts.isIdentifier(child) && facts.sessionVars.has(child.text),
    ),
  );
}

/**
 * Whether an Express `app.use(prefix)` covers a route: the prefix's segments match the route's
 * first segments, a `:param` matching any segment.
 */
export function mountCovers(prefix: string, route: string): boolean {
  const wanted = prefix.split('/').filter((segment) => segment !== '');
  const actual = route.split('/').filter((segment) => segment !== '');
  return (
    wanted.length <= actual.length &&
    wanted.every(
      (segment, index) =>
        segment.startsWith(':') ||
        actual[index]?.startsWith(':') === true ||
        segment === actual[index],
    )
  );
}

/**
 * The owner-check heuristic (F2.6-B): does the handler reach data through the session user?
 *
 * - `true`: a data access call (find…, get…, update…, query…) gets something of the session
 *   user: a property of the session's user, a value computed from it, or a configured
 *   expression such as `req.body.UserId`.
 * - `false`: a data access call gets a path parameter and nothing of the session user.
 * - `'unknown'`: neither (no data access, or data reached in a way the heuristic cannot follow).
 *
 * Calls the rules ignore (e.g. challenge bookkeeping) do not count either way.
 */
export function ownerCheckOf(handler: ts.Node, rules: AccessRules): boolean | 'unknown' {
  const facts = factsOf(handler, rules);
  const isSession = (node: ts.Node) => {
    if (rules.sessionIds.includes(node.getText().replace(/\s+/g, ''))) return true;
    if (ts.isIdentifier(node) && facts.derivedVars.has(node.text)) return true;
    if (!ts.isPropertyAccessExpression(node)) return false;
    let root: ts.Expression = node;
    while (ts.isPropertyAccessExpression(root)) root = root.expression;
    return (
      ts.isIdentifier(root) &&
      (facts.sessionVars.has(root.text) || facts.derivedVars.has(root.text))
    );
  };
  // Next.js hands path parameters over as `{ params }`; Express as `req.params`.
  const isParam = (node: ts.Node) =>
    (ts.isIdentifier(node) && (facts.paramVars.has(node.text) || node.text === 'params')) ||
    /^req(uest)?\.params\b/.test(node.getText());

  const access = facts.calls.filter(
    (call) => DATA_ACCESS.test(lastName(call)) && !RESPONSE.test(calleeText(call)),
  );
  if (access.some((call) => call.arguments.some((arg) => mentions(arg, isSession)))) return true;
  if (access.some((call) => call.arguments.some((arg) => mentions(arg, isParam)))) return false;
  return 'unknown';
}
