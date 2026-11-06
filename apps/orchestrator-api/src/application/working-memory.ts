export interface MemoryEntry {
  readonly stepIndex: number;
  /** The action as the agent would recognise it, e.g. `click e12 (button "Pagar")`. */
  readonly action: string;
  /** `ok`, or the failure code. */
  readonly result: string;
}

/**
 * The navigator's working memory (F1.4): the last few actions word for word, plus a short
 * running summary of everything older, refreshed every few steps by the navigator model.
 */
export class WorkingMemory {
  static readonly RECENT = 5;
  static readonly SUMMARY_EVERY = 8;

  private readonly entries: MemoryEntry[] = [];
  private summary: string | null = null;
  private summarizedUpTo = 0;

  add(entry: MemoryEntry): void {
    this.entries.push(entry);
  }

  /** True once SUMMARY_EVERY actions have happened since the last summary. */
  summaryDue(): boolean {
    return this.entries.length - this.summarizedUpTo >= WorkingMemory.SUMMARY_EVERY;
  }

  /** What a new summary has to fold in: the previous summary and the actions since. */
  toSummarize(): { previous: string | null; entries: readonly MemoryEntry[] } {
    return { previous: this.summary, entries: this.entries.slice(this.summarizedUpTo) };
  }

  setSummary(text: string): void {
    this.summary = text;
    this.summarizedUpTo = this.entries.length;
  }

  render(): string {
    const recent = this.entries.slice(-WorkingMemory.RECENT).map(formatEntry);
    return [
      ...(this.summary === null ? [] : [`What you did so far: ${this.summary}`]),
      ...(recent.length === 0 ? [] : ['Your last actions:', ...recent]),
    ].join('\n');
  }
}

export function formatEntry(entry: MemoryEntry): string {
  return `- step ${String(entry.stepIndex + 1)}: ${entry.action} → ${entry.result}`;
}
