import { spawn } from "node:child_process";
import type { AgentAdapter, AgentAdapterContext } from "./types";
import type { AgentExecutionRequest, AgentExecutionResult, AdapterStreamEvent } from "../types";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const FORCE_KILL_DELAY_MS = 5_000;
const EXIT_SETTLE_GRACE_MS = 10_000;

interface ClaudeAdapterConfig {
  command?: string;
  args?: string[];
  timeoutMs?: number;
  env?: Record<string, string>;
  model?: string;
}

function parseAdapterConfig(config: string | null): ClaudeAdapterConfig {
  if (!config || config.trim().length === 0) {
    return {};
  }

  try {
    return JSON.parse(config) as ClaudeAdapterConfig;
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

function buildFailureResult(
  summarySource: string,
  inputTokens: number,
  outputTokens: number,
  error: string,
): AgentExecutionResult {
  return {
    status: "failed",
    summary: summarizeText(summarySource || error || "Claude execution failed"),
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

function extractTokenUsage(output: string): { inputTokens: number; outputTokens: number } {
  const usage = {
    inputTokens: 0,
    outputTokens: 0,
  };
  const normalized = output.replace(/\r/g, "");
  const patterns: Array<{ key: "inputTokens" | "outputTokens"; regex: RegExp }> = [
    { key: "inputTokens", regex: /\b(?:input|prompt)[ _-]?tokens?\b[^0-9]{0,20}(\d[\d,]*)/i },
    { key: "outputTokens", regex: /\b(?:output|completion)[ _-]?tokens?\b[^0-9]{0,20}(\d[\d,]*)/i },
    { key: "inputTokens", regex: /\binput_tokens\b[^0-9]{0,20}(\d[\d,]*)/i },
    { key: "outputTokens", regex: /\boutput_tokens\b[^0-9]{0,20}(\d[\d,]*)/i },
  ];

  for (const { key, regex } of patterns) {
    const match = normalized.match(regex);
    if (!match) {
      continue;
    }

    const parsed = Number.parseInt(match[1].replaceAll(",", ""), 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      usage[key] = parsed;
    }
  }

  return usage;
}

export class ClaudeAdapter implements AgentAdapter {
  readonly type = "claude";

  async execute(request: AgentExecutionRequest, context: AgentAdapterContext): Promise<AgentExecutionResult> {
    return new Promise<AgentExecutionResult>((resolve) => {
      const parsedConfig = parseAdapterConfig(request.agent.adapter_config);
      const command = typeof parsedConfig.command === "string" && parsedConfig.command.trim().length > 0 ? parsedConfig.command : "claude";
      const baseArgs = Array.isArray(parsedConfig.args) && parsedConfig.args.every((value) => typeof value === "string")
        ? parsedConfig.args
        : ["--print", "--permission-mode", "bypassPermissions"];
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
      const args = [...baseArgs];
      if (model && !args.includes("--model")) {
        args.push("--model", model);
      }
      args.push("-p", request.prompt);

      const proc = spawn(command, args, {
        cwd: request.workspacePath,
        stdio: ["pipe", "pipe", "pipe"],
        env,
      });

      let settled = false;
      let stdout = "";
      let stderr = "";
      let outputBuffer = "";
      let inputTokens = 0;
      let outputTokens = 0;
      let forceKillHandle: NodeJS.Timeout | null = null;
      let exitSettleHandle: NodeJS.Timeout | null = null;

      const timeoutHandle = setTimeout(() => {
        void abortRun(`Claude execution timed out after ${Math.round(timeoutMs / 1000)}s`, "failed");
      }, timeoutMs);

      const cleanup = (): void => {
        clearTimeout(timeoutHandle);
        if (forceKillHandle) {
          clearTimeout(forceKillHandle);
          forceKillHandle = null;
        }
        if (exitSettleHandle) {
          clearTimeout(exitSettleHandle);
          exitSettleHandle = null;
        }

        context.signal?.removeEventListener("abort", handleAbort);
      };

      const settle = (result: AgentExecutionResult): void => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        resolve(result);
      };

      const updateTokenUsage = (): void => {
        const usage = extractTokenUsage(stdout);
        inputTokens = usage.inputTokens;
        outputTokens = usage.outputTokens;
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
        updateTokenUsage();
        const checkpointSummary = stdout.trim() || undefined;
        settle({
          status: "completed",
          summary: summarizeText(checkpointSummary ?? ""),
          checkpointSummary,
          inputTokens,
          outputTokens,
          costCents: 0,
        });
      };

      const abortRun = async (message: string, status: AgentExecutionResult["status"]): Promise<void> => {
        context.onEvent({ type: "status", message });
        teardownProcess();
        updateTokenUsage();

        if (status === "stopped") {
          settle({
            status,
            summary: "Run aborted",
            checkpointSummary: stdout.trim() || undefined,
            inputTokens,
            outputTokens,
            costCents: 0,
            error: "Aborted",
          });
          return;
        }

        settle(buildFailureResult(stdout.trim(), inputTokens, outputTokens, message));
      };

      const handleAbort = (): void => {
        void abortRun("Run aborted", "stopped");
      };

      const flushOutputLines = (): void => {
        while (true) {
          const newlineIndex = outputBuffer.indexOf("\n");
          if (newlineIndex === -1) {
            break;
          }

          const line = outputBuffer.slice(0, newlineIndex + 1);
          outputBuffer = outputBuffer.slice(newlineIndex + 1);
          context.onEvent({ type: "agent_message", message: line });
          context.onEvent({ type: "output", message: line });
        }
      };

      context.signal?.addEventListener("abort", handleAbort, { once: true });

      proc.stdout.setEncoding("utf8");
      proc.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        outputBuffer += chunk;
        updateTokenUsage();
        flushOutputLines();
        context.onEvent(createDataEvent("status", { inputTokens, outputTokens }));
      });

      proc.stderr.setEncoding("utf8");
      proc.stderr.on("data", (chunk: string) => {
        stderr += chunk;
        context.onEvent({ type: "error", message: chunk });
      });

      proc.on("error", (error) => {
        updateTokenUsage();
        settle(buildFailureResult(stdout.trim(), inputTokens, outputTokens, error instanceof Error ? error.message : String(error)));
      });

      proc.on("spawn", () => {
        context.onEvent(
          createDataEvent("status", {
            command,
            args,
            workspacePath: request.workspacePath,
          }),
        );
      });

      proc.on("exit", () => {
        exitSettleHandle = setTimeout(() => {
          if (!settled) {
            settle(buildFailureResult("", inputTokens, outputTokens, "Adapter failed to settle after process exit"));
          }
        }, EXIT_SETTLE_GRACE_MS);
      });

      proc.on("close", (code) => {
        if (settled) {
          return;
        }

        if (outputBuffer.length > 0) {
          context.onEvent({ type: "agent_message", message: outputBuffer });
          context.onEvent({ type: "output", message: outputBuffer });
          outputBuffer = "";
        }

        updateTokenUsage();

        if (code === 0 && stdout.trim().length > 0) {
          context.onEvent({
            type: "turn.completed",
            data: {
              inputTokens,
              outputTokens,
            },
          });
          completeSuccess();
          return;
        }

        const failureMessage = stderr.trim() || stdout.trim() || `Process exited with code ${code ?? -1}`;
        settle(buildFailureResult(stdout.trim(), inputTokens, outputTokens, failureMessage));
      });
    });
  }
}
