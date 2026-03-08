import { spawn } from "node:child_process";
import type { AgentAdapter } from "./types";
import type { AgentExecutionRequest, AgentExecutionResult } from "../types";

function parseJsonLines(chunk: string, onMessage: (event: Record<string, unknown>) => void): void {
  const lines = chunk.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      onMessage(parsed);
    } catch {
      onMessage({ type: "output_text", text: trimmed });
    }
  }
}

export class CodexAdapter implements AgentAdapter {
  readonly type = "codex";

  async execute(request: AgentExecutionRequest, context: { signal?: AbortSignal; onEvent: (event: any) => void }): Promise<AgentExecutionResult> {
    return new Promise<AgentExecutionResult>((resolve) => {
      const command = request.agent.adapter_config ? JSON.parse(request.agent.adapter_config).command : undefined;
      const proc = spawn(command ?? "codex", ["app-server"], {
        cwd: request.workspacePath,
        stdio: ["pipe", "pipe", "pipe"],
        env: process.env,
      });

      let stdoutBuffer = "";
      let stderrBuffer = "";
      let summary = "";
      let inputTokens = 0;
      let outputTokens = 0;
      let settled = false;

      const settle = (result: AgentExecutionResult): void => {
        if (settled) {
          return;
        }

        settled = true;
        resolve(result);
      };

      context.signal?.addEventListener("abort", () => {
        proc.kill("SIGTERM");
        settle({
          status: "stopped",
          summary: "Run aborted",
          inputTokens,
          outputTokens,
          costCents: 0,
          error: "Aborted",
        });
      });

      proc.stdout.setEncoding("utf8");
      proc.stdout.on("data", (chunk: string) => {
        stdoutBuffer += chunk;
        parseJsonLines(chunk, (event) => {
          const type = typeof event.type === "string" ? event.type : "output";
          if (type === "item.completed" && typeof event.item === "object" && event.item && "text" in event.item) {
            const text = typeof event.item.text === "string" ? event.item.text : "";
            if (text) {
              summary = `${summary}\n${text}`.trim();
              context.onEvent({ type: "output", message: text });
            }
          } else if (type === "turn.completed" && typeof event.usage === "object" && event.usage) {
            const usage = event.usage as Record<string, unknown>;
            inputTokens = typeof usage.input_tokens === "number" ? usage.input_tokens : inputTokens;
            outputTokens = typeof usage.output_tokens === "number" ? usage.output_tokens : outputTokens;
            context.onEvent({ type: "turn.completed", data: usage });
          } else if (type === "output_text" && typeof event.text === "string") {
            context.onEvent({ type: "output", message: event.text });
          } else {
            context.onEvent({ type: "status", data: event });
          }
        });
      });

      proc.stderr.setEncoding("utf8");
      proc.stderr.on("data", (chunk: string) => {
        stderrBuffer += chunk;
        context.onEvent({ type: "error", message: chunk.trim() });
      });

      proc.on("spawn", () => {
        const payloads = [
          { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
          { jsonrpc: "2.0", id: 2, method: "thread/start", params: {} },
          {
            jsonrpc: "2.0",
            id: 3,
            method: "turn/start",
            params: {
              input: request.prompt,
            },
          },
        ];

        for (const payload of payloads) {
          proc.stdin.write(`${JSON.stringify(payload)}\n`);
        }
      });

      proc.on("error", (error) => {
        settle({
          status: "failed",
          summary: summary || "Codex execution failed",
          inputTokens,
          outputTokens,
          costCents: 0,
          error: error.message,
        });
      });

      proc.on("close", (code) => {
        if (code === 0) {
          settle({
            status: "completed",
            summary: summary || stdoutBuffer.trim() || "Completed",
            checkpointSummary: summary || stdoutBuffer.trim() || "Completed",
            inputTokens,
            outputTokens,
            costCents: 0,
          });
          return;
        }

        settle({
          status: "failed",
          summary: summary || "Codex execution failed",
          inputTokens,
          outputTokens,
          costCents: 0,
          error: stderrBuffer.trim() || stdoutBuffer.trim() || `Process exited with code ${code ?? -1}`,
        });
      });
    });
  }
}
