import type { AgentAdapter } from "./types";
import type { AgentExecutionRequest, AgentExecutionResult } from "../types";

function tryParseJson(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export class OpenClawAdapter implements AgentAdapter {
  readonly type = "openclaw";

  async execute(request: AgentExecutionRequest, context: { signal?: AbortSignal; onEvent: (event: any) => void }): Promise<AgentExecutionResult> {
    const parsedConfig =
      request.agent.adapter_config && request.agent.adapter_config.trim().length > 0
        ? (JSON.parse(request.agent.adapter_config) as Record<string, unknown>)
        : {};
    const baseUrl =
      typeof parsedConfig.url === "string" && parsedConfig.url.trim().length > 0
        ? parsedConfig.url
        : "http://127.0.0.1:3333";
    const endpoint = new URL("/sessions/spawn", baseUrl).toString();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        prompt: request.prompt,
        cwd: request.workspacePath,
        agent: {
          id: request.agent.id,
          name: request.agent.name,
          model: request.agent.model,
        },
      }),
      signal: context.signal,
    });

    if (!response.ok) {
      throw new Error(`OpenClaw request failed with ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/event-stream")) {
      const data = (await response.json()) as Record<string, unknown>;
      return {
        status: "completed",
        summary: typeof data.summary === "string" ? data.summary : "Completed",
        checkpointSummary: typeof data.summary === "string" ? data.summary : "Completed",
        inputTokens: typeof data.inputTokens === "number" ? data.inputTokens : 0,
        outputTokens: typeof data.outputTokens === "number" ? data.outputTokens : 0,
        costCents: typeof data.costCents === "number" ? data.costCents : 0,
      };
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let summary = "";
    if (!reader) {
      return {
        status: "completed",
        summary: "Completed",
        checkpointSummary: "Completed",
        inputTokens: 0,
        outputTokens: 0,
        costCents: 0,
      };
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split(/\r?\n/)) {
        if (!line.startsWith("data:")) {
          continue;
        }

        const payload = line.slice(5).trim();
        const parsed = tryParseJson(payload);
        if (!parsed) {
          continue;
        }

        const text = typeof parsed.message === "string" ? parsed.message : "";
        if (text) {
          summary = `${summary}\n${text}`.trim();
          context.onEvent({ type: "output", message: text });
        } else {
          context.onEvent({ type: "status", data: parsed });
        }
      }
    }

    return {
      status: "completed",
      summary: summary || "Completed",
      checkpointSummary: summary || "Completed",
      inputTokens: 0,
      outputTokens: 0,
      costCents: 0,
    };
  }
}
