import { spawn } from "node:child_process";
import type { AgentAdapter } from "./types";
import type { AgentExecutionRequest, AgentExecutionResult } from "../types";

export class ClaudeAdapter implements AgentAdapter {
  readonly type = "claude";

  async execute(request: AgentExecutionRequest, context: { signal?: AbortSignal; onEvent: (event: any) => void }): Promise<AgentExecutionResult> {
    return new Promise<AgentExecutionResult>((resolve) => {
      const parsedConfig =
        request.agent.adapter_config && request.agent.adapter_config.trim().length > 0
          ? (JSON.parse(request.agent.adapter_config) as Record<string, unknown>)
          : {};
      const command = typeof parsedConfig.command === "string" ? parsedConfig.command : "claude";
      const proc = spawn(
        command,
        ["--print", "--permission-mode", "bypassPermissions", "-m", request.prompt],
        {
          cwd: request.workspacePath,
          stdio: ["ignore", "pipe", "pipe"],
          env: process.env,
        },
      );

      let stdout = "";
      let stderr = "";
      let settled = false;

      const settle = (result: AgentExecutionResult): void => {
        if (!settled) {
          settled = true;
          resolve(result);
        }
      };

      context.signal?.addEventListener("abort", () => {
        proc.kill("SIGTERM");
        settle({
          status: "stopped",
          summary: "Run aborted",
          inputTokens: 0,
          outputTokens: 0,
          costCents: 0,
          error: "Aborted",
        });
      });

      proc.stdout.setEncoding("utf8");
      proc.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        context.onEvent({ type: "output", message: chunk.trim() });
      });

      proc.stderr.setEncoding("utf8");
      proc.stderr.on("data", (chunk: string) => {
        stderr += chunk;
        context.onEvent({ type: "error", message: chunk.trim() });
      });

      proc.on("error", (error) => {
        settle({
          status: "failed",
          summary: stdout.trim() || "Claude execution failed",
          inputTokens: 0,
          outputTokens: 0,
          costCents: 0,
          error: error.message,
        });
      });

      proc.on("close", (code) => {
        if (code === 0) {
          settle({
            status: "completed",
            summary: stdout.trim() || "Completed",
            checkpointSummary: stdout.trim() || "Completed",
            inputTokens: 0,
            outputTokens: 0,
            costCents: 0,
          });
          return;
        }

        settle({
          status: "failed",
          summary: stdout.trim() || "Claude execution failed",
          inputTokens: 0,
          outputTokens: 0,
          costCents: 0,
          error: stderr.trim() || `Process exited with code ${code ?? -1}`,
        });
      });
    });
  }
}
