import type { LLMGatewayPort } from '../../domain/llm/llm-gateway-port.js';
import { EditingAgent, type EditingResult, type EditingTask } from '../code-agent/editing-agent.js';
import { isCodeFile } from '../locate-friction-code/rank-candidates.js';
import { UI_ENGINEER_TOOLS } from './ui-engineer-prompt.js';

export { MAX_TURNS, type FileEdit } from '../code-agent/editing-agent.js';
export type UiEngineerResult = EditingResult;
export type UiEngineerTask = Omit<EditingTask, 'role' | 'tools' | 'readable'>;

/** The UI Engineer (F2.3): the shared editing loop, reading only code and styles. */
export class UiEngineerAgent {
  constructor(private readonly deps: { readonly gateway: LLMGatewayPort }) {}

  run(task: UiEngineerTask): Promise<UiEngineerResult> {
    return new EditingAgent(this.deps).run({
      ...task,
      role: 'ui-engineer',
      tools: UI_ENGINEER_TOOLS,
      readable: (path) => isCodeFile(path) || path.endsWith('.css'),
    });
  }
}
