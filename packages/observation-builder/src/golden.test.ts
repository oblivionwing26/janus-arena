// F1.1 "Done when": golden files from real ShopLab pages, and the mean observation fits in
// fewer than 1,500 tokens. Captures come from `observation:capture-fixtures` (orchestrator).
// After an intended change, regenerate with UPDATE_GOLDEN=1 and review the diff by hand.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ObservationBuilder } from './observation-builder.js';

const dir = fileURLToPath(new URL('../fixtures/shoplab/', import.meta.url));
const update = process.env.UPDATE_GOLDEN === '1';
const pages = readdirSync(dir)
  .filter((file) => file.endsWith('.capture.json'))
  .map((file) => file.replace('.capture.json', ''))
  .sort();

function capture(name: string): unknown {
  return JSON.parse(readFileSync(`${dir}${name}.capture.json`, 'utf8'));
}

function golden(file: string, actual: string): void {
  const path = `${dir}${file}`;
  if (update) writeFileSync(path, `${actual}\n`);
  // Checkouts may convert line endings; the observation itself always uses \n.
  const expected = readFileSync(path, 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '');
  expect(actual).toBe(expected);
}

describe('golden observations of ShopLab', () => {
  it('has the captured pages', () => {
    expect(pages.length).toBeGreaterThanOrEqual(8);
  });

  it.each(pages)('%s', (name) => {
    golden(`${name}.expected.txt`, new ObservationBuilder().observe(capture(name)).full);
  });

  it('diffs a form while it is filled in and submitted', () => {
    const builder = new ObservationBuilder();
    builder.observe(capture('register-empty'));
    const filled = builder.observe(capture('register-filled'));
    const submitted = builder.observe(capture('register-errors'));

    expect([filled.mode, submitted.mode]).toEqual(['diff', 'diff']);
    golden('register.diff.expected.txt', `${filled.text}\n---\n${submitted.text}`);
  });

  it('keeps the mean observation under 1,500 tokens', () => {
    const tokens = pages.map((name) => new ObservationBuilder().observe(capture(name)).tokens);
    const mean = tokens.reduce((sum, value) => sum + value, 0) / tokens.length;

    console.log(
      `observation tokens: ${pages.map((name, i) => `${name}=${String(tokens[i])}`).join(', ')}; mean=${mean.toFixed(0)}`,
    );
    expect(mean).toBeLessThan(1500);
  });
});
