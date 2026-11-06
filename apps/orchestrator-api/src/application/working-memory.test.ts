import { describe, expect, it } from 'vitest';

import { WorkingMemory } from './working-memory.js';

function filled(steps: number): WorkingMemory {
  const memory = new WorkingMemory();
  for (let stepIndex = 0; stepIndex < steps; stepIndex++) {
    memory.add({ stepIndex, action: `click e${String(stepIndex + 1)}`, result: 'ok' });
  }
  return memory;
}

describe('WorkingMemory', () => {
  it('is empty before the first action', () => {
    expect(new WorkingMemory().render()).toBe('');
  });

  it('keeps only the last 5 actions word for word', () => {
    const lines = filled(7).render().split('\n');

    expect(lines).toEqual([
      'Your last actions:',
      '- step 3: click e3 → ok',
      '- step 4: click e4 → ok',
      '- step 5: click e5 → ok',
      '- step 6: click e6 → ok',
      '- step 7: click e7 → ok',
    ]);
  });

  it('asks for a summary every 8 actions and folds in only what is new', () => {
    const memory = filled(7);
    expect(memory.summaryDue()).toBe(false);

    memory.add({ stepIndex: 7, action: 'back', result: 'ok' });
    expect(memory.summaryDue()).toBe(true);
    expect(memory.toSummarize().entries).toHaveLength(8);

    memory.setSummary('Created an account and opened the mug.');
    expect(memory.summaryDue()).toBe(false);
    expect(memory.render().split('\n')[0]).toBe(
      'What you did so far: Created an account and opened the mug.',
    );

    memory.add({ stepIndex: 8, action: 'scroll down', result: 'ok' });
    expect(memory.toSummarize()).toEqual({
      previous: 'Created an account and opened the mug.',
      entries: [{ stepIndex: 8, action: 'scroll down', result: 'ok' }],
    });
  });
});
