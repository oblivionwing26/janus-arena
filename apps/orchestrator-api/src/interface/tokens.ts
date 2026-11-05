// DI tokens for use cases; port tokens live next to their ports in domain/.
export const START_RUN = Symbol('StartRun');
export const STOP_RUN = Symbol('StopRun');
export const RUN_AGENT_SESSION = Symbol('RunAgentSession');
export const FINISH_RUN = Symbol('FinishRun');
export const RUN_CONTROL = Symbol('RunControl');
