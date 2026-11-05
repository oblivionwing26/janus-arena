// Provider-neutral message shapes. Adapters translate them to and from the SDK.

export type LlmContentBlock =
  | { readonly type: 'text'; readonly text: string }
  | {
      readonly type: 'tool_use';
      readonly id: string;
      readonly name: string;
      readonly input: unknown;
    }
  | {
      readonly type: 'tool_result';
      readonly toolUseId: string;
      readonly content: string;
      readonly isError?: boolean;
    }
  // Thinking blocks must be passed back unchanged on later turns.
  | { readonly type: 'thinking'; readonly thinking: string; readonly signature: string }
  | { readonly type: 'redacted_thinking'; readonly data: string };

export interface LlmMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string | readonly LlmContentBlock[];
}

export interface LlmToolDefinition {
  readonly name: string;
  readonly description: string;
  /** JSON Schema of the tool input; must describe an object. */
  readonly inputSchema: { readonly type: 'object' } & Readonly<Record<string, unknown>>;
}
