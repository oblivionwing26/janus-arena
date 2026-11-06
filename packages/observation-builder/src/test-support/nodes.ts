// Small helpers to write raw aria trees by hand in unit tests. Not part of the build.

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

let nextY = 0;

/** A box stacked under the previous one, wrapping so hand-written nodes stay in the viewport. */
export function box(y?: number): Box {
  const top = y ?? (nextY = (nextY + 40) % 600);
  return { x: 0, y: top, width: 200, height: 32 };
}

export function node(role: string, props: Record<string, unknown> = {}, children?: unknown[]) {
  return { role, box: box(), ...props, ...(children === undefined ? {} : { children }) };
}

export function capture(tree: unknown[], url = 'http://shop.test/page', title = 'Shop') {
  return { url, title, viewport: { width: 1280, height: 720 }, tree };
}

/** A page whose body is a `main` landmark holding `children`. */
export function page(children: unknown[], url?: string, title?: string) {
  return capture([node('generic', {}, [node('main', { box: box(0) }, children)])], url, title);
}
