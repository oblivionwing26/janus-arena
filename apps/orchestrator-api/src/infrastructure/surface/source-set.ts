import ts from 'typescript';

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

/** A function-like node that can answer a request. */
export type FunctionNode =
  ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration;

export function isFunctionNode(node: ts.Node): node is FunctionNode {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  );
}

/**
 * The target's source files, parsed on demand with the TypeScript compiler (syntax only, no
 * type checking) (F2.6). Knows enough module resolution to follow a handler to the file that
 * defines it: relative paths, `@/` (Next.js), extensions and index files.
 */
export class SourceSet {
  private readonly parsed = new Map<string, ts.SourceFile>();

  constructor(private readonly files: ReadonlyMap<string, string>) {}

  paths(): string[] {
    return [...this.files.keys()].sort();
  }

  get(path: string): ts.SourceFile | undefined {
    let file = this.parsed.get(path);
    if (file === undefined) {
      const text = this.files.get(path);
      if (text === undefined) return undefined;
      file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
      this.parsed.set(path, file);
    }
    return file;
  }

  lineOf(node: ts.Node): number {
    const file = node.getSourceFile();
    return file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
  }

  /** The project file an import specifier points at, or undefined for packages. */
  resolve(from: string, specifier: string): string | undefined {
    let base: string[];
    if (specifier.startsWith('@/')) base = ['src', ...specifier.slice(2).split('/')];
    else if (specifier.startsWith('.')) {
      base = from.split('/').slice(0, -1);
      for (const part of specifier.split('/')) {
        if (part === '..') base.pop();
        else if (part !== '.') base.push(part);
      }
    } else return undefined;
    const stem = base.join('/');
    const candidates = [
      stem,
      ...EXTENSIONS.map((ext) => stem.replace(/\.js$/, '') + ext),
      ...EXTENSIONS.map((ext) => `${stem}/index${ext}`),
    ];
    return candidates.find((candidate) => this.files.has(candidate));
  }

  /** Where an identifier used in `file` comes from: a local declaration or an import. */
  definition(
    file: string,
    name: string,
  ): { readonly file: string; readonly node: FunctionNode; readonly name: string } | undefined {
    const source = this.get(file);
    if (source === undefined) return undefined;
    const local = this.localFunction(source, name);
    if (local !== undefined) return { file, node: local, name };
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
        continue;
      }
      const bindings = statement.importClause?.namedBindings;
      if (bindings === undefined || !ts.isNamedImports(bindings)) continue;
      for (const element of bindings.elements) {
        if (element.name.text !== name) continue;
        const target = this.resolve(file, statement.moduleSpecifier.text);
        const exported = (element.propertyName ?? element.name).text;
        const node = target === undefined ? undefined : this.exportedFunction(target, exported);
        if (target !== undefined && node !== undefined)
          return { file: target, node, name: exported };
      }
    }
    return undefined;
  }

  /** `ns.member` where `ns` is `import * as ns from '...'`. */
  namespaceMember(
    file: string,
    namespace: string,
    member: string,
  ): { readonly file: string; readonly node: FunctionNode; readonly name: string } | undefined {
    const source = this.get(file);
    if (source === undefined) return undefined;
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
        continue;
      }
      const bindings = statement.importClause?.namedBindings;
      if (bindings === undefined || !ts.isNamespaceImport(bindings)) continue;
      if (bindings.name.text !== namespace) continue;
      const target = this.resolve(file, statement.moduleSpecifier.text);
      const node = target === undefined ? undefined : this.exportedFunction(target, member);
      if (target !== undefined && node !== undefined) return { file: target, node, name: member };
    }
    return undefined;
  }

  exportedFunction(file: string, name: string): FunctionNode | undefined {
    const source = this.get(file);
    return source === undefined ? undefined : this.localFunction(source, name);
  }

  private localFunction(source: ts.SourceFile, name: string): FunctionNode | undefined {
    for (const statement of source.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) return statement;
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (
            ts.isIdentifier(declaration.name) &&
            declaration.name.text === name &&
            declaration.initializer !== undefined &&
            isFunctionNode(declaration.initializer)
          ) {
            return declaration.initializer;
          }
        }
      }
    }
    return undefined;
  }
}

/** Every node under `root`, depth first. */
export function walk(root: ts.Node, visit: (node: ts.Node) => void): void {
  const go = (node: ts.Node) => {
    visit(node);
    ts.forEachChild(node, go);
  };
  go(root);
}

/**
 * What a handler reads from the request: body and query keys (`req.body.x`, `const { x } =
 * req.body`, `body.x` after `const body = await request.json()`, `searchParams.get('x')`).
 */
export function requestKeys(handler: ts.Node): string[] {
  const keys = new Set<string>();
  const bodyAliases = new Set<string>();
  walk(handler, (node) => {
    // const body = await request.json()
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      /\.json\(\)\s*$/.test(node.initializer.getText().replace(/^await\s+/, ''))
    ) {
      bodyAliases.add(node.name.text);
    }
  });
  walk(handler, (node) => {
    if (ts.isPropertyAccessExpression(node)) {
      const owner = node.expression.getText();
      const where = /(?:^|\.)(body|query)$/.exec(owner)?.[1];
      if (where !== undefined && /^req(uest)?\./.test(owner))
        keys.add(`${where}.${node.name.text}`);
      if (ts.isIdentifier(node.expression) && bodyAliases.has(node.expression.text)) {
        keys.add(`body.${node.name.text}`);
      }
    }
    // const { a, b } = req.body
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer !== undefined
    ) {
      const where = /^req(?:uest)?\.(body|query)$/.exec(node.initializer.getText())?.[1];
      if (where !== undefined) {
        for (const element of node.name.elements) {
          const key = (element.propertyName ?? element.name).getText();
          keys.add(`${where}.${key}`);
        }
      }
    }
    // searchParams.get('x')
    if (
      ts.isCallExpression(node) &&
      node.expression.getText().endsWith('searchParams.get') &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      keys.add(`query.${node.arguments[0].text}`);
    }
  });
  return [...keys].sort();
}
