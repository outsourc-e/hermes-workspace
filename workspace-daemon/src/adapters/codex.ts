import { spawn } from "node:child_process";
import type { AgentAdapter, AgentAdapterContext } from "./types";
import type { AgentExecutionRequest, AgentExecutionResult, AdapterStreamEvent } from "../types";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const FORCE_KILL_DELAY_MS = 5_000;
const JSON_RPC_VERSION = "2.0";
const CLIENT_NAME = "clawsuite-workspace";
const CLIENT_VERSION = "0.1.0";

type JsonRpcId = number | string;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

interface JsonRpcSuccessResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
}

interface JsonRpcErrorResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  error: {
    code?: number;
    message?: string;
    data?: unknown;
  };
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

interface CodexAdapterConfig {
  command?: string;
  args?: string[];
  timeoutMs?: number;
  env?: Record<string, string>;
  model?: string;
}

interface ThreadStartResponse {
  thread: {
    id: string;
  };
}

interface TurnStartResponse {
  turn: {
    id: string;
    status?: string;
  };
}

interface TurnCompletedNotification {
  threadId: string;
  turn: {
    id: string;
    status: "completed" | "interrupted" | "failed" | "inProgress";
    error?: {
      message?: string | null;
      additionalDetails?: string | null;
    } | null;
  };
}

interface ThreadTokenUsageUpdatedNotification {
  threadId: string;
  turnId: string;
  tokenUsage: {
    total?: TokenUsageBreakdown | null;
    last?: TokenUsageBreakdown | null;
  };
}

interface TokenUsageBreakdown {
  inputTokens?: number;
  outputTokens?: number;
}

interface AgentMessageDeltaNotification {
  threadId: string;
  turnId: string;
  itemId: string;
  delta: string;
}

interface LegacyTurnCompleteEvent {
  turn_id: string;
  last_agent_message?: string | null;
}

interface LegacyTokenUsageInfo {
  total_token_usage?: {
    input_tokens?: number;
    output_tokens?: number;
  } | null;
  last_token_usage?: {
    input_tokens?: number;
    output_tokens?: number;
  } | null;
}

function parseAdapterConfig(config: string | null): CodexAdapterConfig {
  if (!config || config.trim().length === 0) {
    return {};
  }

  try {
    return JSON.parse(config) as CodexAdapterConfig;
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toPositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function summarizeText(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Completed";
  }

  if (normalized.length <= 280) {
    return normalized;
  }

  return `${normalized.slice(0, 277).trimEnd()}...`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function buildFailureResult(
  summarySource: string,
  inputTokens: number,
  outputTokens: number,
  error: string,
): AgentExecutionResult {
  return {
    status: "failed",
    summary: summarizeText(summarySource || error || "Codex execution failed"),
    checkpointSummary: summarySource || undefined,
    inputTokens,
    outputTokens,
    costCents: 0,
    error,
  };
}

function createDataEvent(type: AdapterStreamEvent["type"], data: Record<string, unknown>): AdapterStreamEvent {
  return { type, data };
}

export class CodexAdapter implements AgentAdapter {
  readonly type = "codex";

  async execute(request: AgentExecutionRequest, context: AgentAdapterContext): Promise<AgentExecutionResult> {
    return new Promise<AgentExecutionResult>((resolve) => {
      const parsedConfig = parseAdapterConfig(request.agent.adapter_config);
      const command = typeof parsedConfig.command === "string" && parsedConfig.command.trim().length > 0 ? parsedConfig.command : "codex";
      const args = Array.isArray(parsedConfig.args) && parsedConfig.args.every((value) => typeof value === "string")
        ? parsedConfig.args
        : ["app-server"];
      const timeoutMs = toPositiveNumber(parsedConfig.timeoutMs) ?? DEFAULT_TIMEOUT_MS;
      const model =
        typeof parsedConfig.model === "string" && parsedConfig.model.trim().length > 0
          ? parsedConfig.model
          : request.agent.model;
      const env =
        parsedConfig.env && isRecord(parsedConfig.env)
          ? {
              ...process.env,
              ...Object.fromEntries(
                Object.entries(parsedConfig.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
              ),
            }
          : process.env;

      const proc = spawn(command, args, {
        cwd: request.workspacePath,
        stdio: ["pipe", "pipe", "pipe"],
        env,
      });

      let settled = false;
      let stdoutBuffer = "";
      let stderrBuffer = "";
      let nextRequestId = 1;
      let forceKillHandle: NodeJS.Timeout | null = null;
      let currentThreadId: string | null = null;
      let currentTurnId: string | null = null;
      let finalMessage = "";
      let completedTurnMessage: string | null = null;
      let inputTokens = 0;
      let outputTokens = 0;
      const pending = new Map<JsonRpcId, PendingRequest>();

      const timeoutHandle = setTimeout(() => {
        void abortRun(`Codex execution timed out after ${Math.round(timeoutMs / 1000)}s`, "failed");
      }, timeoutMs);

      const cleanup = (): void => {
        clearTimeout(timeoutHandle);
        if (forceKillHandle) {
          clearTimeout(forceKillHandle);
          forceKillHandle = null;
        }

        context.signal?.removeEventListener("abort", handleAbort);
      };

      const rejectPending = (message: string): void => {
        for (const [, entry] of pending) {
          entry.reject(new Error(message));
        }
        pending.clear();
      };

      const settle = (result: AgentExecutionResult): void => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        rejectPending(result.error ?? "Codex process ended");
        resolve(result);
      };

      const sendMessage = (payload: JsonRpcRequest | JsonRpcNotification | JsonRpcSuccessResponse | JsonRpcErrorResponse): void => {
        if (proc.stdin.destroyed || !proc.stdin.writable) {
          throw new Error("Codex stdin is not writable");
        }

        proc.stdin.write(`${JSON.stringify(payload)}\n`);
      };

      const sendRequest = <TResponse>(method: string, params?: unknown): Promise<TResponse> => {
        const id = nextRequestId++;

        return new Promise<TResponse>((resolveRequest, rejectRequest) => {
          pending.set(id, {
            resolve: resolveRequest as (value: unknown) => void,
            reject: rejectRequest,
          });

          try {
            sendMessage({
              jsonrpc: JSON_RPC_VERSION,
              id,
              method,
              params,
            });
          } catch (error) {
            pending.delete(id);
            rejectRequest(error instanceof Error ? error : new Error(errorMessage(error)));
          }
        });
      };

      const sendNotification = (method: string, params?: unknown): void => {
        sendMessage({
          jsonrpc: JSON_RPC_VERSION,
          method,
          ...(typeof params === "undefined" ? {} : { params }),
        });
      };

      const sendResult = (id: JsonRpcId, result: unknown): void => {
        sendMessage({
          jsonrpc: JSON_RPC_VERSION,
          id,
          result,
        });
      };

      const sendError = (id: JsonRpcId, message: string, code = -32000): void => {
        sendMessage({
          jsonrpc: JSON_RPC_VERSION,
          id,
          error: {
            code,
            message,
          },
        });
      };

      const teardownProcess = (): void => {
        if (!proc.killed) {
          proc.kill("SIGTERM");
          forceKillHandle = setTimeout(() => {
            proc.kill("SIGKILL");
          }, FORCE_KILL_DELAY_MS);
        }
      };

      const completeSuccess = (): void => {
        const checkpointSummary = (completedTurnMessage ?? finalMessage).trim() || undefined;
        const summary = summarizeText(checkpointSummary ?? "");
        settle({
          status: "completed",
          summary,
          checkpointSummary,
          inputTokens,
          outputTokens,
          costCents: 0,
        });
      };

      const abortRun = async (message: string, status: AgentExecutionResult["status"]): Promise<void> => {
        context.onEvent({ type: "status", message });

        if (currentThreadId && currentTurnId && status !== "completed") {
          try {
            await sendRequest("turn/interrupt", {
              threadId: currentThreadId,
              turnId: currentTurnId,
            });
          } catch {
            // Fall through to process teardown.
          }
        }

        teardownProcess();

        if (status === "stopped") {
          settle({
            status,
            summary: "Run aborted",
            checkpointSummary: finalMessage.trim() || undefined,
            inputTokens,
            outputTokens,
            costCents: 0,
            error: "Aborted",
          });
          return;
        }

        settle(
          buildFailureResult(
            completedTurnMessage ?? finalMessage,
            inputTokens,
            outputTokens,
            message,
          ),
        );
      };

      const handleAbort = (): void => {
        void abortRun("Run aborted", "stopped");
      };

      const applyTokenUsage = (usage: TokenUsageBreakdown | null | undefined): void => {
        if (!usage) {
          return;
        }

        if (typeof usage.inputTokens === "number") {
          inputTokens = usage.inputTokens;
        }

        if (typeof usage.outputTokens === "number") {
          outputTokens = usage.outputTokens;
        }
      };

      const handleNotification = (method: string, rawParams: unknown): void => {
        if (!isRecord(rawParams)) {
          context.onEvent(createDataEvent("status", { method }));
          return;
        }

        switch (method) {
          case "turn/started": {
            const turnId = typeof rawParams.turnId === "string" ? rawParams.turnId : null;
            if (turnId) {
              currentTurnId = turnId;
            }
            context.onEvent(createDataEvent("status", { method, ...rawParams }));
            break;
          }

          case "thread/tokenUsage/updated": {
            const notification = rawParams as unknown as ThreadTokenUsageUpdatedNotification;
            if (!currentTurnId || notification.turnId === currentTurnId) {
              applyTokenUsage(notification.tokenUsage.last ?? notification.tokenUsage.total);
            }
            context.onEvent({
              type: "status",
              data: {
                method,
                inputTokens,
                outputTokens,
              },
            });
            break;
          }

          case "item/agentMessage/delta": {
            const notification = rawParams as unknown as AgentMessageDeltaNotification;
            if (notification.delta) {
              finalMessage += notification.delta;
              context.onEvent({ type: "agent_message", message: notification.delta });
              context.onEvent({ type: "output", message: notification.delta });
            }
            break;
          }

          case "turn/completed": {
            const notification = rawParams as unknown as TurnCompletedNotification;
            const completedTurnId = notification.turn.id;
            if (completedTurnId) {
              currentTurnId = completedTurnId;
            }

            if (notification.turn.status === "failed") {
              const failureMessage =
                notification.turn.error?.message ??
                notification.turn.error?.additionalDetails ??
                "Codex turn failed";
              settle(buildFailureResult(completedTurnMessage ?? finalMessage, inputTokens, outputTokens, failureMessage));
              teardownProcess();
              return;
            }

            if (notification.turn.status === "interrupted") {
              settle({
                status: "stopped",
                summary: summarizeText(completedTurnMessage ?? finalMessage),
                checkpointSummary: (completedTurnMessage ?? finalMessage).trim() || undefined,
                inputTokens,
                outputTokens,
                costCents: 0,
                error: "Interrupted",
              });
              teardownProcess();
              return;
            }

            context.onEvent({
              type: "turn.completed",
              data: {
                method,
                threadId: notification.threadId,
                turnId: notification.turn.id,
                status: notification.turn.status,
                inputTokens,
                outputTokens,
              },
            });

            if (notification.turn.status === "completed") {
              completeSuccess();
              teardownProcess();
            }
            break;
          }

          case "error": {
            const errorValue =
              rawParams.error && isRecord(rawParams.error) && typeof rawParams.error.message === "string"
                ? rawParams.error.message
                : "Codex protocol error";
            stderrBuffer = `${stderrBuffer}${errorValue}\n`;
            context.onEvent({ type: "error", message: errorValue });
            break;
          }

          default:
            context.onEvent(createDataEvent("status", { method, ...rawParams }));
            break;
        }
      };

      const handleLegacyEvent = (event: Record<string, unknown>): void => {
        const type = typeof event.type === "string" ? event.type : null;
        if (!type) {
          return;
        }

        switch (type) {
          case "agent_message_content_delta":
          case "agent_message_delta": {
            const delta = typeof event.delta === "string" ? event.delta : "";
            if (delta) {
              finalMessage += delta;
              context.onEvent({ type: "agent_message", message: delta });
              context.onEvent({ type: "output", message: delta });
            }
            break;
          }

          case "token_count": {
            const info = isRecord(event.info) ? (event.info as unknown as LegacyTokenUsageInfo) : null;
            applyTokenUsage(
              info?.last_token_usage
                ? {
                    inputTokens: info.last_token_usage.input_tokens,
                    outputTokens: info.last_token_usage.output_tokens,
                  }
                : info?.total_token_usage
                  ? {
                      inputTokens: info.total_token_usage.input_tokens,
                      outputTokens: info.total_token_usage.output_tokens,
                    }
                  : null,
            );
            break;
          }

          case "task_complete": {
            const legacy = event as unknown as LegacyTurnCompleteEvent;
            if (typeof legacy.last_agent_message === "string" && legacy.last_agent_message.trim().length > 0) {
              completedTurnMessage = legacy.last_agent_message;
              finalMessage = legacy.last_agent_message;
            }
            context.onEvent({
              type: "turn.completed",
              data: {
                turnId: legacy.turn_id,
                inputTokens,
                outputTokens,
              },
            });
            break;
          }

          case "error": {
            const message = typeof event.message === "string" ? event.message : "Codex event error";
            stderrBuffer = `${stderrBuffer}${message}\n`;
            context.onEvent({ type: "error", message });
            break;
          }

          default:
            context.onEvent(createDataEvent("status", event));
            break;
        }
      };

      const handleServerRequest = (rpcRequest: JsonRpcRequest): void => {
        switch (rpcRequest.method) {
          case "item/commandExecution/requestApproval":
            context.onEvent({
              type: "status",
              data: {
                method: rpcRequest.method,
                policy: "always",
              },
            });
            sendResult(rpcRequest.id, { decision: "acceptForSession" });
            break;

          case "item/fileChange/requestApproval":
            context.onEvent({
              type: "status",
              data: {
                method: rpcRequest.method,
                policy: "always",
              },
            });
            sendResult(rpcRequest.id, { decision: "acceptForSession" });
            break;

          case "execCommandApproval":
          case "applyPatchApproval":
            context.onEvent({
              type: "status",
              data: {
                method: rpcRequest.method,
                policy: "always",
              },
            });
            sendResult(rpcRequest.id, { decision: "approved_for_session" });
            break;

          default:
            sendError(rpcRequest.id, `Unsupported server request: ${rpcRequest.method}`);
            context.onEvent({
              type: "error",
              message: `Unsupported server request: ${rpcRequest.method}`,
            });
            break;
        }
      };

      const handleJsonRpcMessage = (message: unknown): void => {
        if (!isRecord(message)) {
          return;
        }

        if (typeof message.method === "string" && Object.prototype.hasOwnProperty.call(message, "id")) {
          handleServerRequest(message as unknown as JsonRpcRequest);
          return;
        }

        if (typeof message.method === "string") {
          handleNotification(message.method, message.params);
          return;
        }

        if (Object.prototype.hasOwnProperty.call(message, "id")) {
          const id = message.id as JsonRpcId;
          const entry = pending.get(id);
          if (!entry) {
            return;
          }

          pending.delete(id);
          if (isRecord(message.error)) {
            entry.reject(new Error(typeof message.error.message === "string" ? message.error.message : "JSON-RPC request failed"));
            return;
          }

          entry.resolve(message.result);
          return;
        }

        if (typeof message.type === "string") {
          handleLegacyEvent(message);
        }
      };

      const parseStdoutChunk = (chunk: string): void => {
        stdoutBuffer += chunk;

        while (true) {
          const newlineIndex = stdoutBuffer.indexOf("\n");
          if (newlineIndex === -1) {
            break;
          }

          const line = stdoutBuffer.slice(0, newlineIndex).trim();
          stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);

          if (!line) {
            continue;
          }

          try {
            handleJsonRpcMessage(JSON.parse(line) as unknown);
          } catch {
            finalMessage += `${line}\n`;
            context.onEvent({ type: "output", message: `${line}\n` });
          }
        }
      };

      const bootstrap = async (): Promise<void> => {
        const threadResponse = (await sendRequest<ThreadStartResponse>("initialize", {
          clientInfo: {
            name: CLIENT_NAME,
            title: null,
            version: CLIENT_VERSION,
          },
          capabilities: {
            experimentalApi: false,
          },
        }).then(async () => {
          sendNotification("initialized");

          return sendRequest<ThreadStartResponse>("thread/start", {
            model: model ?? undefined,
            cwd: request.workspacePath,
            experimentalRawEvents: false,
            persistExtendedHistory: false,
          });
        })) as ThreadStartResponse;

        currentThreadId = threadResponse.thread.id;

        const turnResponse = (await sendRequest<TurnStartResponse>("turn/start", {
          threadId: currentThreadId,
          model: model ?? undefined,
          cwd: request.workspacePath,
          input: [
            {
              type: "text",
              text: request.prompt,
              text_elements: [],
            },
          ],
        })) as TurnStartResponse;

        currentTurnId = turnResponse.turn.id;
      };

      context.signal?.addEventListener("abort", handleAbort, { once: true });

      proc.stdout.setEncoding("utf8");
      proc.stdout.on("data", (chunk: string) => {
        parseStdoutChunk(chunk);
      });

      proc.stderr.setEncoding("utf8");
      proc.stderr.on("data", (chunk: string) => {
        stderrBuffer += chunk;
        context.onEvent({ type: "error", message: chunk });
      });

      proc.on("error", (error) => {
        settle(buildFailureResult(completedTurnMessage ?? finalMessage, inputTokens, outputTokens, error.message));
      });

      proc.on("spawn", () => {
        void bootstrap().catch((error) => {
          const message = errorMessage(error);
          teardownProcess();
          settle(buildFailureResult(completedTurnMessage ?? finalMessage, inputTokens, outputTokens, message));
        });
      });

      proc.on("close", (code) => {
        if (settled) {
          return;
        }

        const trailingOutput = stdoutBuffer.trim();
        if (trailingOutput) {
          finalMessage += `${trailingOutput}\n`;
        }

        if (code === 0 && (completedTurnMessage ?? finalMessage).trim().length > 0) {
          completeSuccess();
          return;
        }

        const failureMessage = stderrBuffer.trim() || `Process exited with code ${code ?? -1}`;
        settle(
          buildFailureResult(
            completedTurnMessage ?? finalMessage,
            inputTokens,
            outputTokens,
            failureMessage,
          ),
        );
      });
    });
  }
}
