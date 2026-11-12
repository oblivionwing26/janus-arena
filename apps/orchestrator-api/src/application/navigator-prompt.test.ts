// F1.3 "Done when": every persona's stable prefix (system + tools) is byte-identical between
// steps, so the prompt cache works. Steps use the real ShopLab observations from F1.1.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ObservationBuilder } from '@janus/observation-builder';
import { describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';

import type { Persona } from '../domain/persona/persona.js';
import {
  parsePersonaFile,
  YamlPersonaCatalog,
} from '../infrastructure/personas/yaml-persona-catalog.js';
import { NavigatorPrompt, type NavigatorTask } from './navigator-prompt.js';

const CAPTURES = fileURLToPath(
  new URL('../../../../packages/observation-builder/fixtures/shoplab/', import.meta.url),
);
const PERSONAS = fileURLToPath(new URL('../../../../personas/', import.meta.url));
const GOLDEN = fileURLToPath(new URL('./navigator-prompt.golden.txt', import.meta.url));

const task: NavigatorTask = {
  hasAccount: false,
  details: {
    name: 'Cliente Sintético',
    email: 'cliente-01jc0f13@shoplab.test',
    password: 'synthetic-password-1',
    address: 'Calle Sintética 1, 28001 Madrid',
  },
};

/** The observations of a purchase, in order, as one agent session would see them. */
function observations(): string[] {
  const builder = new ObservationBuilder();
  return ['register-empty', 'register-filled', 'home', 'product', 'cart', 'checkout', 'order'].map(
    (page) =>
      builder.observe(JSON.parse(readFileSync(`${CAPTURES}${page}.capture.json`, 'utf8'))).text,
  );
}

function prefixHash(prompt: NavigatorPrompt): string {
  const { system, tools } = prompt.request({ stepIndex: 0, observation: '', lastResult: null });
  return createHash('sha256').update(JSON.stringify({ system, tools })).digest('hex');
}

const personas = await new YamlPersonaCatalog().list();
const firstStep = { stepIndex: 0, observation: 'Page: /', lastResult: null };

describe('NavigatorPrompt', () => {
  it.each(personas.map((persona): [string, Persona] => [persona.id, persona]))(
    '%s: the stable prefix is byte-identical in every step',
    (_id, persona) => {
      const prompt = NavigatorPrompt.forSession(persona, task);
      const steps = observations().map((observation, stepIndex) =>
        prompt.request({
          stepIndex,
          observation,
          lastResult: stepIndex === 0 ? null : { status: 'ok' },
        }),
      );

      const prefixes = steps.map(({ system, tools }) => JSON.stringify({ system, tools }));
      expect(new Set(prefixes).size).toBe(1);
      // Rebuilding for the same session gives the same bytes too.
      expect(prefixHash(NavigatorPrompt.forSession(persona, task))).toBe(prefixHash(prompt));
    },
  );

  it('says the address and card are saved only when the account has them (F3.5a)', () => {
    const persona = personas[0];
    if (persona === undefined) throw new Error('no personas');
    const saved = 'Your home address and card are already saved in that account.';

    const withThem = NavigatorPrompt.forSession(persona, {
      ...task,
      hasAccount: true,
      savedCheckout: true,
    });
    const without = NavigatorPrompt.forSession(persona, { ...task, hasAccount: true });

    expect(withThem.request(firstStep).system.stable).toContain(saved);
    expect(without.request(firstStep).system.stable).not.toContain(saved);
  });

  it('never puts the page in the cached part, and always in the step message', () => {
    const [persona] = personas;
    if (persona === undefined) throw new Error('no personas');
    const prompt = NavigatorPrompt.forSession(persona, task);
    const observation = observations()[3] ?? '';

    const request = prompt.request({ stepIndex: 3, observation, lastResult: { status: 'ok' } });

    expect(request.system.variable).toBeUndefined();
    expect(request.system.stable).not.toContain('Añadir al carrito');
    expect(JSON.stringify(request.tools)).not.toContain('Añadir al carrito');
    expect(request.messages).toHaveLength(1);
    expect(request.messages[0]?.role).toBe('user');
    expect(request.messages[0]?.content).toContain(observation);
  });

  it('tells the agent what went wrong with its last action', () => {
    const [persona] = personas;
    if (persona === undefined) throw new Error('no personas');
    const request = NavigatorPrompt.forSession(persona, task).request({
      stepIndex: 4,
      observation: 'page /cart · "ShopLab"',
      lastResult: {
        status: 'failed',
        error: { code: 'browser.element-obscured', message: 'Element is covered' },
      },
    });

    expect(request.messages[0]?.content).toContain(
      'Your last action failed (browser.element-obscured): Element is covered',
    );
  });

  it('keeps each persona apart and uses its own model role', () => {
    const hashes = new Set(
      personas.map((persona) => prefixHash(NavigatorPrompt.forSession(persona, task))),
    );
    expect(hashes.size).toBe(personas.length);

    const baseline = personas.find((persona) => persona.id === 'competent-baseline');
    if (baseline === undefined) throw new Error('no baseline');
    expect(NavigatorPrompt.forSession(baseline, task).role).toBe('competent-baseline');
  });

  it('is long enough to be cached (512 tokens minimum on current models)', () => {
    for (const persona of personas) {
      const { system, tools } = NavigatorPrompt.forSession(persona, task).request({
        stepIndex: 0,
        observation: '',
        lastResult: null,
      });
      // ~4 characters per token is generous for English; stay well clear of the minimum.
      expect((system.stable.length + JSON.stringify(tools).length) / 4).toBeGreaterThan(800);
    }
  });

  it('matches the reviewed prefix of one persona (UPDATE_GOLDEN=1 to regenerate)', () => {
    const carmen = personas.find((persona) => persona.id === 'carmen-retired');
    if (carmen === undefined) throw new Error('no carmen-retired');
    const { stable } = NavigatorPrompt.forSession(carmen, task).request({
      stepIndex: 0,
      observation: '',
      lastResult: null,
    }).system;

    if (process.env.UPDATE_GOLDEN === '1') writeFileSync(GOLDEN, `${stable}\n`);
    const expected = readFileSync(GOLDEN, 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '');
    expect(stable).toBe(expected);
  });

  it('does not depend on the order of keys in the persona file', () => {
    const file = 'lucia-private.yaml';
    const source = readFileSync(`${PERSONAS}${file}`, 'utf8');
    const original = parsePersonaFile(file, source);
    const reversed = parsePersonaFile(
      file,
      stringify(Object.fromEntries(Object.entries(parse(source) as object).reverse())),
    );

    expect(prefixHash(NavigatorPrompt.forSession(reversed, task))).toBe(
      prefixHash(NavigatorPrompt.forSession(original, task)),
    );
  });
});
