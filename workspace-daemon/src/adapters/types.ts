import type { AgentExecutionRequest, AgentExecutionResult, AdapterStreamEvent } from "../types";

export interface AgentAdapterContext {
  signal?: AbortSignal;
  onEvent: (event: AdapterStreamEvent) => void;
}

export interface AgentAdapter {
  readonly type: string;
  execute(request: AgentExecutionRequest, context: AgentAdapterContext): Promise<AgentExecutionResult>;
}
