// Deterministic and deliberately pessimistic: about 3 characters per token for short Spanish UI
// text with quotes and refs. Real token usage per step is measured from llm.call events (F1.9).
const CHARS_PER_TOKEN = 3;

const SURROGATE_PAIR = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;

/** Estimated tokens of `text`, counting characters (code points), not UTF-16 units. */
export function estimateTokens(text: string): number {
  const characters = text.length - (text.match(SURROGATE_PAIR)?.length ?? 0);
  return Math.ceil(characters / CHARS_PER_TOKEN);
}
