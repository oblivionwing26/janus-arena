import { uiEngineerToolInputs } from '@janus/shared-kernel';

import type { Budget } from '../../domain/llm/budget.js';
import type { LLMGatewayPort } from '../../domain/llm/llm-gateway-port.js';
import type { LlmContentBlock, LlmMessage } from '../../domain/llm/llm-message.js';
import type { EditPolicy } from '../../domain/vcs/edit-policy.js';
import { isCodeFile } from '../locate-friction-code/rank-candidates.js';
import { UI_ENGINEER_TOOLS } from './ui-engineer-prompt.js';

const {
  read_file: readFileInput,
  edit_file: editFileInput,
  done: doneInput,
} = uiEngineerToolInputs;

export const MAX_TURNS = 12;
const MAX_READ_LINES = 400;

/** A file as the agent left it: `before` null when it created the file. */
export interface FileEdit {
  readonly path: string;
  readonly before: string | null;
  readonly after: string;
}

export interface UiEngineerResult {
  readonly outcome: 'done' | 'turn_limit' | 'no_tool_use';
  readonly summary: string;
  readonly edits: readonly FileEdit[];
  /** Tool calls refused by code (forbidden path, missing text...), for the record. */
  readonly refused: readonly string[];
}

export interface UiEngineerTask {
  readonly runId: string;
  readonly agentId: string;
  /** Rules + task + code context: the cached prefix. */
  readonly system: string;
  /** The first message: what to look at, the screenshot, and on a retry, what failed. */
  readonly brief: readonly LlmContentBlock[];
  readonly policy: EditPolicy;
  /** The workspace's files; null when the file does not exist or may not be read. */
  readonly readFile: (path: string) => Promise<string | null>;
  readonly budget: Budget;
}

interface ToolOutcome {
  readonly content: string;
  readonly isError?: boolean;
  readonly done?: string;
}

/**
 * The UI Engineer's loop (F2.3): the model reads and edits files only through three
 * allowlisted tools, and code enforces every rule. Edits land in memory; nothing reaches the
 * workspace here. Stops at `done`, after MAX_TURNS, or when the model stops using tools.
 */
export class UiEngineerAgent {
  constructor(private readonly deps: { readonly gateway: LLMGatewayPort }) {}

  async run(task: UiEngineerTask): Promise<UiEngineerResult> {
    const files = new Map<string, { before: string | null; current: string | null }>();
    const refused: string[] = [];
    const messages: LlmMessage[] = [{ role: 'user', content: task.brief }];

    const load = async (path: string) => {
      let entry = files.get(path);
      if (entry === undefined) {
        const content =
          isCodeFile(path) || path.endsWith('.css') ? await task.readFile(path) : null;
        entry = { before: content, current: content };
        files.set(path, entry);
      }
      return entry;
    };

    const tool = async (name: string, input: unknown): Promise<ToolOutcome> => {
      if (name === 'read_file') {
        const parsed = readFileInput.safeParse(input);
        if (!parsed.success) return { content: 'read_file needs a path.', isError: true };
        const { current } = await load(parsed.data.path);
        if (current === null)
          return { content: `No readable file ${parsed.data.path}.`, isError: true };
        const lines = current.split('\n');
        const shown = lines
          .slice(0, MAX_READ_LINES)
          .map((line, i) => `${String(i + 1).padStart(4)}| ${line}`);
        return {
          content:
            shown.join('\n') +
            (lines.length > MAX_READ_LINES
              ? `\n… ${String(lines.length - MAX_READ_LINES)} more lines`
              : ''),
        };
      }
      if (name === 'edit_file') {
        const parsed = editFileInput.safeParse(input);
        if (!parsed.success)
          return { content: 'edit_file needs path, old_text and new_text.', isError: true };
        const { path, old_text: oldText, new_text: newText } = parsed.data;
        if (!task.policy.canEdit(path)) {
          refused.push(`edit ${path}: not an editable file`);
          return {
            content: `You may not edit ${path}. Edit only the allowed files.`,
            isError: true,
          };
        }
        const entry = await load(path);
        if (entry.current === null) {
          if (oldText !== '') return { content: `${path} does not exist.`, isError: true };
          entry.current = newText;
          return { content: `Created ${path}.` };
        }
        const count = entry.current.split(oldText).length - 1;
        if (oldText === '' || count !== 1) {
          refused.push(`edit ${path}: old_text found ${String(count)} times`);
          return {
            content: `old_text must appear exactly once in ${path}; it appears ${String(count)} times. Read the file and copy the text exactly.`,
            isError: true,
          };
        }
        entry.current = entry.current.replace(oldText, () => newText);
        return { content: `Edited ${path}.` };
      }
      if (name === 'done') {
        const parsed = doneInput.safeParse(input);
        return { content: 'Done.', done: parsed.success ? parsed.data.summary : 'Done.' };
      }
      return { content: `Unknown tool ${name}.`, isError: true };
    };

    const result = (outcome: UiEngineerResult['outcome'], summary: string): UiEngineerResult => ({
      outcome,
      summary,
      edits: [...files].flatMap(([path, { before, current }]) =>
        current === null || current === before ? [] : [{ path, before, after: current }],
      ),
      refused,
    });

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await this.deps.gateway.complete({
        role: 'ui-engineer',
        system: { stable: task.system },
        messages,
        tools: UI_ENGINEER_TOOLS,
        budget: task.budget,
        context: { runId: task.runId, agentId: task.agentId },
      });
      messages.push({ role: 'assistant', content: response.content });
      const calls = response.content.filter(
        (block): block is Extract<LlmContentBlock, { type: 'tool_use' }> =>
          block.type === 'tool_use',
      );
      if (calls.length === 0)
        return result('no_tool_use', 'The model stopped without calling done.');

      const results: LlmContentBlock[] = [];
      let finished: string | undefined;
      for (const call of calls) {
        const outcome = await tool(call.name, call.input);
        finished ??= outcome.done;
        results.push({
          type: 'tool_result',
          toolUseId: call.id,
          content: outcome.content,
          ...(outcome.isError === true ? { isError: true } : {}),
        });
      }
      if (finished !== undefined) return result('done', finished);
      messages.push({ role: 'user', content: results });
    }
    return result('turn_limit', `Stopped after ${String(MAX_TURNS)} turns.`);
  }
}
