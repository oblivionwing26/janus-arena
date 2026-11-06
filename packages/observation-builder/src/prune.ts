import type { RawBox, RawCapture, RawNode } from './raw-capture.js';
import type { ElementLocator, RefRegistry } from './ref-registry.js';

export type ObservationLine =
  | { readonly kind: 'element'; readonly ref: string; readonly text: string }
  | { readonly kind: 'heading' | 'notice' | 'text'; readonly text: string };

export interface PrunedPage {
  readonly lines: readonly ObservationLine[];
  readonly locators: ReadonlyMap<string, ElementLocator>;
  /** Texts of the visible `alert` notices (validation errors), route announcers left out. */
  readonly alerts: readonly string[];
}

const INTERACTIVE = new Set([
  'button',
  'checkbox',
  'combobox',
  'link',
  'listbox',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'radio',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'textbox',
  'treeitem',
]);
const VALUE_ROLES = new Set(['textbox', 'searchbox', 'spinbutton']);
const CHOICE_ROLES = new Set(['combobox', 'listbox']);
const NOTICE_ROLES = new Set(['alert', 'status']);
/** Landmarks whose prose (not their controls) reaches the agent. */
const PROSE_ROOTS = new Set(['main', 'dialog', 'alertdialog']);
/** Containers whose accessible name is useful context for the controls inside. */
const NAMED_CONTAINERS = new Set(['alertdialog', 'dialog', 'form', 'group', 'radiogroup', 'table']);
/** Roles whose accessible name is their visible content. */
const NAME_IS_CONTENT = new Set(['cell', 'columnheader', 'gridcell', 'rowheader']);
/** Text blocks written as one line when they hold no controls. */
const BLOCKS = new Set([
  'blockquote',
  'caption',
  'cell',
  'code',
  'columnheader',
  'definition',
  'emphasis',
  'gridcell',
  'listitem',
  'paragraph',
  'rowheader',
  'strong',
  'term',
]);

const MAX_TEXT = 120;
const MAX_NAME = 80;
const MAX_OPTIONS = 10;

type Child = string | RawNode;

interface Context {
  readonly prose: boolean;
  /** Whether the closest ancestor with a box lies inside the observation window. */
  readonly visible: boolean;
  /** Names of sibling controls: a text equal to one of them is just its label. */
  readonly labels: ReadonlySet<string>;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function hasControl(node: RawNode): boolean {
  return (node.children ?? []).some(
    (child) => typeof child !== 'string' && (INTERACTIVE.has(child.role) || hasControl(child)),
  );
}

function flatten(child: Child): string {
  if (typeof child === 'string') return normalise(child);
  const own = NAME_IS_CONTENT.has(child.role) || child.role === 'heading' ? child.name : undefined;
  const parts = [own, child.text, ...(child.children ?? []).map(flatten)];
  return normalise(parts.filter((part) => part !== undefined && part !== '').join(' '));
}

/**
 * Turns a raw aria tree into observation lines: controls inside the window (one screen above
 * and below the viewport) with stable refs, plus headings, notices and prose from `main`.
 */
export function prune(capture: RawCapture, registry: RefRegistry): PrunedPage {
  const lines: ObservationLine[] = [];
  const locators = new Map<string, ElementLocator>();
  const seen = new Map<string, number>();
  const headings = new Set<string>();
  /** Line index → each notice, to drop route announcers at the end. */
  const notices = new Map<number, { role: string; value: string }>();
  const { height } = capture.viewport;

  const inWindow = (box: RawBox) =>
    box.width > 0 && box.height > 0 && box.y + box.height > -height && box.y < 2 * height;

  const text = (kind: 'heading' | 'notice' | 'text', value: string, context: Context) => {
    if (value === '' || !context.visible) return;
    lines.push({ kind, text: clip(value, MAX_TEXT) });
  };

  const element = (node: RawNode, context: Context) => {
    const name = node.name ?? '';
    const key = `${node.role}\u0000${name}`;
    const nth = seen.get(key) ?? 0;
    seen.set(key, nth + 1);
    if (!context.visible) return;
    const locator = { role: node.role, name, nth };
    const ref = registry.refFor(locator);
    locators.set(ref, locator);
    lines.push({ kind: 'element', ref, text: `[${ref}] ${describe(node)}` });
  };

  const walk = (child: Child, parent: Context) => {
    if (typeof child === 'string') {
      const value = normalise(child);
      if (parent.prose && !parent.labels.has(value)) text('text', value, parent);
      return;
    }
    const node = child;
    const context: Context = {
      prose: parent.prose || PROSE_ROOTS.has(node.role),
      visible: node.box === undefined ? parent.visible : inWindow(node.box),
      labels: new Set(
        (node.children ?? []).flatMap((c) =>
          typeof c !== 'string' && INTERACTIVE.has(c.role) && c.name !== undefined ? [c.name] : [],
        ),
      ),
    };

    if (INTERACTIVE.has(node.role)) {
      element(node, context);
      return;
    }
    if (NOTICE_ROLES.has(node.role)) {
      const value = flatten(node);
      if (value !== '' && context.visible) notices.set(lines.length, { role: node.role, value });
      text('notice', value === '' ? '' : `! ${node.role} ${JSON.stringify(value)}`, context);
      return;
    }
    const controls = hasControl(node);
    if (node.role === 'heading') headings.add(flatten(node));
    if (node.role === 'heading' && !controls) {
      if (context.prose) {
        const value = flatten(node);
        text('heading', value === '' ? '' : `${'#'.repeat(node.level ?? 2)} ${value}`, context);
      }
      return;
    }
    if (node.role === 'row' && !controls) {
      if (context.prose) {
        const cells = (node.children ?? []).map(flatten).filter((cell) => cell !== '');
        text('text', cells.join(' | '), context);
      }
      return;
    }
    if (context.prose && !controls && BLOCKS.has(node.role)) {
      const value = flatten(node);
      if (!parent.labels.has(value)) text('text', value, context);
      return;
    }
    if (context.prose && NAMED_CONTAINERS.has(node.role) && node.name !== undefined) {
      text('text', `${node.name}:`, context);
    }
    if (context.prose && node.text !== undefined && !parent.labels.has(normalise(node.text))) {
      text('text', normalise(node.text), context);
    }
    for (const grandchild of node.children ?? []) walk(grandchild, context);
  };

  const root: Context = { prose: false, visible: true, labels: new Set() };
  for (const child of capture.tree) walk(child, root);
  // A route announcer (e.g. Next.js) is an alert that only repeats the title or a heading.
  headings.add(capture.title);
  const announcers = new Set(
    [...notices].filter(([, { value }]) => headings.has(value)).map(([index]) => index),
  );
  const alerts = [...notices]
    .filter(([index, { role }]) => role === 'alert' && !announcers.has(index))
    .map(([, { value }]) => value);
  return { lines: lines.filter((_, index) => !announcers.has(index)), locators, alerts };
}

function describe(node: RawNode): string {
  const parts = [node.role];
  if (node.name !== undefined && node.name !== '') {
    parts.push(JSON.stringify(clip(normalise(node.name), MAX_NAME)));
  }

  if (VALUE_ROLES.has(node.role) && node.text !== undefined && node.text !== '') {
    parts.push(`= ${JSON.stringify(clip(normalise(node.text), MAX_NAME))}`);
  } else if (VALUE_ROLES.has(node.role) && node.placeholder !== undefined) {
    parts.push(`placeholder ${JSON.stringify(node.placeholder)}`);
  }
  if (CHOICE_ROLES.has(node.role)) {
    const options = (node.children ?? []).filter(
      (child): child is RawNode => typeof child !== 'string' && child.role === 'option',
    );
    const selected = options.find((option) => option.selected === true);
    if (selected?.name !== undefined) parts.push(`= ${JSON.stringify(selected.name)}`);
    if (options.length > 0) {
      const names = options.slice(0, MAX_OPTIONS).map((option) => option.name ?? '');
      const more =
        options.length > MAX_OPTIONS ? `|…(+${String(options.length - MAX_OPTIONS)})` : '';
      parts.push(`options: ${names.join('|')}${more}`);
    }
  }
  if (node.role === 'link' && node.url !== undefined && node.url !== '' && node.url !== '#') {
    parts.push(`→ ${clip(node.url, MAX_NAME)}`);
  }

  if (node.checked === true) parts.push('[checked]');
  if (node.checked === 'mixed') parts.push('[mixed]');
  if (node.pressed === true) parts.push('[pressed]');
  if (node.selected === true && !CHOICE_ROLES.has(node.role)) parts.push('[selected]');
  if (node.expanded === true) parts.push('[expanded]');
  if (node.expanded === false) parts.push('[collapsed]');
  if (node.disabled === true) parts.push('[disabled]');
  if (node.invalid !== undefined && node.invalid !== false && node.invalid !== 'false') {
    parts.push('[invalid]');
  }
  if (node.active === true) parts.push('[focused]');
  return parts.join(' ');
}
