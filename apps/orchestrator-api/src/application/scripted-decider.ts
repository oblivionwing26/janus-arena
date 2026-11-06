import type { ActorRole } from '@janus/shared-kernel';

import type { Decider, Decision, DecisionInput } from './decider.js';

/** One step of a script, naming elements the way they are observed, never by ref. */
export type ScriptIntent =
  | { readonly do: 'click'; readonly role: string; readonly name: string; readonly nth?: number }
  | { readonly do: 'type'; readonly field: string; readonly text: string }
  | { readonly do: 'select'; readonly field: string; readonly value: string }
  | { readonly do: 'scroll'; readonly direction: 'up' | 'down' }
  | { readonly do: 'back' }
  | { readonly do: 'wait'; readonly ms: number }
  | { readonly do: 'done'; readonly outcome: 'success' | 'abandon'; readonly reason: string };

/** The script named an element the current page does not have. */
export class ScriptIntentNotFoundError extends Error {
  override readonly name = 'ScriptIntentNotFoundError';
}

/**
 * Plays a fixed script through the same instrumented loop as the LLM (F1.6): each intent is
 * resolved to a ref of the current observation. Used by the probes that reproduce the seeded
 * flaws and by scripted baselines; it never reads anything but the observation.
 */
export class ScriptedDecider implements Decider {
  private next = 0;

  constructor(
    private readonly intents: readonly ScriptIntent[],
    readonly role: ActorRole = 'scripted',
  ) {}

  decide({ observation, stepIndex }: DecisionInput): Promise<Decision> {
    const intent = this.intents[this.next++] ?? {
      do: 'done',
      outcome: 'abandon',
      reason: 'The script ran out of steps.',
    };
    const refOf = (role: string, name: string, nth = 0) => {
      for (const [ref, locator] of observation.locators) {
        if (locator.role === role && locator.name === name && locator.nth === nth) return ref;
      }
      throw new ScriptIntentNotFoundError(
        `Step ${String(stepIndex)}: no ${role} "${name}" on the page:\n${observation.full}`,
      );
    };
    switch (intent.do) {
      case 'click':
        return Promise.resolve({
          action: { type: 'click', ref: refOf(intent.role, intent.name, intent.nth) },
        });
      case 'type':
        return Promise.resolve({
          action: { type: 'type', ref: refOf('textbox', intent.field), text: intent.text },
        });
      case 'select':
        return Promise.resolve({
          action: { type: 'select', ref: refOf('combobox', intent.field), value: intent.value },
        });
      case 'scroll':
        return Promise.resolve({ action: { type: 'scroll', direction: intent.direction } });
      case 'back':
        return Promise.resolve({ action: { type: 'back' } });
      case 'wait':
        return Promise.resolve({ action: { type: 'wait', ms: intent.ms } });
      case 'done':
        return Promise.resolve({
          action: { type: 'done', outcome: intent.outcome, reason: intent.reason },
        });
    }
  }
}
