import path from "node:path";
import type { AgentAdapter, AgentAdapterContext } from "./types";
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

  resolveRuntime(agent: AgentExecutionRequest["agent"]): "acp" | "subagent" {
    return agent.id === "aurora-qa" || agent.id === "aurora-planner" ? "subagent" : "acp";
  }

  buildSessionLabel(agentId: string, projectName: string, taskRunId: string): string {
    const normalizedProjectName = projectName.toLowerCase().replace(/[^a-z0-9]/g, "");
    return `cs-${agentId.replace("aurora-", "")}-${normalizedProjectName}-${taskRunId.slice(0, 8)}`;
  }

  async steerSession(sessionId: string, revisionPrompt: string): Promise<void> {
    const endpoint = `http://127.0.0.1:3333/api/sessions/${encodeURIComponent(sessionId)}/messages`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: revisionPrompt,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenClaw steer request failed with ${response.status}`);
    }
  }

  async execute(request: AgentExecutionRequest, context: AgentAdapterContext): Promise<AgentExecutionResult> {
    const parsedConfig =
      request.agent.adapter_config && request.agent.adapter_config.trim().length > 0
        ? (JSON.parse(request.agent.adapter_config) as Record<string, unknown>)
        : {};
    const baseUrl =
      typeof parsedConfig.url === "string" && parsedConfig.url.trim().length > 0
        ? parsedConfig.url
        : "http://127.0.0.1:3333";
    const projectName =
      typeof request.projectName === "string" && request.projectName.trim().length > 0
        ? request.projectName
        : path.basename(request.workspacePath) || "workspace";
    const endpoint = new URL("/sessions/spawn", baseUrl).toString();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        prompt: request.prompt,
        cwd: request.workspacePath,
        runtime: this.resolveRuntime(request.agent),
        sessionLabel: this.buildSessionLabel(
          request.agent.id,
          projectName,
          request.taskRun.id,
        ),
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
      const sessionId =
        typeof data.sessionId === "string"
          ? data.sessionId
          : typeof data.session_id === "string"
            ? data.session_id
            : typeof data.id === "string"
              ? data.id
              : null;
      if (sessionId) {
        context.tracker?.setTaskRunSessionId(request.taskRun.id, sessionId);
      }
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
    let pendingBuffer = "";
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

      pendingBuffer += decoder.decode(value, { stream: true });
      const lines = pendingBuffer.split(/\r?\n/);
      pendingBuffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data:")) {
          continue;
        }

        const payload = line.slice(5).trim();
        const parsed = tryParseJson(payload);
        if (!parsed) {
          continue;
        }

        const sessionId =
          typeof parsed.sessionId === "string"
            ? parsed.sessionId
            : typeof parsed.session_id === "string"
              ? parsed.session_id
              : typeof parsed.id === "string"
                ? parsed.id
                : null;
        if (sessionId) {
          context.tracker?.setTaskRunSessionId(request.taskRun.id, sessionId);
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
