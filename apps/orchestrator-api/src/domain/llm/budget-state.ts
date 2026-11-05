export type BudgetState = 'ok' | 'warning' | 'exhausted';

export interface BudgetSnapshot {
  readonly state: BudgetState;
  readonly usedTokens: number;
  readonly usedEur: number;
  readonly maxTokens: number;
  readonly maxEur: number;
}
