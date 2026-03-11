import type { AgentExecutionRequest, AgentExecutionResult, AdapterStreamEvent } from "../types";
import type { Tracker } from "../tracker";

export interface AgentAdapterContext {
  signal?: AbortSignal;
  onEvent: (event: AdapterStreamEvent) => void;
  tracker?: Tracker;
}

export interface AgentAdapter {
  readonly type: string;
  execute(request: AgentExecutionRequest, context: AgentAdapterContext): Promise<AgentExecutionResult>;
}
