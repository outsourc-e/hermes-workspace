import { spawn } from "node:child_process";
import type { AgentAdapter, AgentAdapterContext } from "./types";
import type { AgentExecutionRequest, AgentExecutionResult } from "../types";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

function parseAdapterConfig(config: string | null): Record<string, unknown> {
  if (!config || config.trim().length === 0) {
    return {};
  }

  try {
    return JSON.parse(config) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function toPositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
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

function summarizeResponse(response: string): string {
  const normalized = response.trim();
  if (!normalized) {
    return "Completed";
  }

  const singleLine = normalized.replace(/\s+/g, " ").trim();
  if (singleLine.length <= 280) {
    return singleLine;
  }

  return `${singleLine.slice(0, 277).trimEnd()}...`;
}

function getFailureMessage(stderr: string, code: number | null, timedOut: boolean): string {
  const trimmed = stderr.trim();
  if (trimmed) {
    return trimmed;
  }

  if (timedOut) {
    return "Claude execution timed out";
  }

  return `Process exited with code ${code ?? -1}`;
}

export class ClaudeAdapter implements AgentAdapter {
  readonly type = "claude";

  async execute(request: AgentExecutionRequest, context: AgentAdapterContext): Promise<AgentExecutionResult> {
    return new Promise<AgentExecutionResult>((resolve) => {
      const parsedConfig = parseAdapterConfig(request.agent.adapter_config);
      const command = typeof parsedConfig.command === "string" && parsedConfig.command.trim().length > 0 ? parsedConfig.command : "claude";
      const timeoutMs = toPositiveNumber(parsedConfig.timeoutMs) ?? DEFAULT_TIMEOUT_MS;
      const taskPrompt = request.prompt;
      const proc = spawn(command, ["--print", "--permission-mode", "bypassPermissions", "-p", taskPrompt], {
        cwd: request.workspacePath,
        stdio: ["pipe", "pipe", "pipe"],
        env: process.env,
      });

      let stdout = "";
      let stderr = "";
      let settled = false;
      let timedOut = false;
      let forceKillHandle: NodeJS.Timeout | null = null;

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        context.onEvent({
          type: "status",
          message: `Claude execution timed out after ${Math.round(timeoutMs / 1000)}s`,
        });
        proc.kill("SIGTERM");
        forceKillHandle = setTimeout(() => {
          proc.kill("SIGKILL");
        }, 5000);
      }, timeoutMs);

      const cleanup = (): void => {
        clearTimeout(timeoutHandle);
        if (forceKillHandle) {
          clearTimeout(forceKillHandle);
          forceKillHandle = null;
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

      const handleAbort = (): void => {
        proc.kill("SIGTERM");
        forceKillHandle = setTimeout(() => {
          proc.kill("SIGKILL");
        }, 5000);
        settle({
          status: "stopped",
          summary: "Run aborted",
          inputTokens: 0,
          outputTokens: 0,
          costCents: 0,
          error: "Aborted",
        });
      };

      context.signal?.addEventListener("abort", handleAbort, { once: true });

      proc.stdout.setEncoding("utf8");
      proc.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        context.onEvent({
          type: "output",
          message: chunk,
        });
      });

      proc.stderr.setEncoding("utf8");
      proc.stderr.on("data", (chunk: string) => {
        stderr += chunk;
        context.onEvent({
          type: "error",
          message: chunk,
        });
      });

      proc.on("error", (error) => {
        const usage = extractTokenUsage(stdout);
        settle({
          status: "failed",
          summary: summarizeResponse(stdout) || "Claude execution failed",
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          costCents: 0,
          error: error.message,
        });
      });

      proc.on("close", (code) => {
        const response = stdout.trim();
        const usage = extractTokenUsage(stdout);

        if (code === 0 && !timedOut) {
          const summary = summarizeResponse(response);
          settle({
            status: "completed",
            summary,
            checkpointSummary: response || summary,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            costCents: 0,
          });
          return;
        }

        settle({
          status: "failed",
          summary: summarizeResponse(response) || "Claude execution failed",
          checkpointSummary: response || undefined,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          costCents: 0,
          error: getFailureMessage(stderr, code, timedOut),
        });
      });
    });
  }
}
