import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { AgentAdapterType, WorkflowConfig, WorkflowDefinition, WorkflowHooks } from "./types";

const DEFAULT_WORKFLOW_CONFIG: WorkflowConfig = {
  pollIntervalMs: 5000,
  maxConcurrentAgents: 4,
  workspaceRoot: path.resolve(process.cwd(), ".workspaces"),
  autoApprove: true,
  defaultAdapter: "codex",
  hooks: {},
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const entries = value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  return entries.length > 0 ? entries : undefined;
}

function parseFrontmatter(raw: string): WorkflowDefinition {
  if (!raw.startsWith("---")) {
    return {
      config: {},
      promptTemplate: raw.trim(),
    };
  }

  const closingIndex = raw.indexOf("\n---", 3);
  if (closingIndex === -1) {
    throw new Error("Invalid WORKFLOW.md front matter: missing closing delimiter");
  }

  const yamlBlock = raw.slice(3, closingIndex).trim();
  const body = raw.slice(closingIndex + 4).trim();
  const parsed = yamlBlock.length > 0 ? YAML.parse(yamlBlock) : {};

  if (!isObject(parsed)) {
    throw new Error("Invalid WORKFLOW.md front matter: expected top-level object");
  }

  return {
    config: parsed,
    promptTemplate: body,
  };
}

function normalizeHooks(config: Record<string, unknown>): WorkflowHooks {
  const hooks = isObject(config.hooks) ? config.hooks : {};
  return {
    before_run: toStringArray(hooks.before_run),
    after_run: toStringArray(hooks.after_run),
    after_create: toStringArray(hooks.after_create),
  };
}

function normalizeAdapter(value: unknown): AgentAdapterType {
  if (value === "claude" || value === "openclaw" || value === "ollama" || value === "codex") {
    return value;
  }

  return "codex";
}

export function resolveWorkflowPath(projectPath?: string | null): string | null {
  const candidates = [
    projectPath ? path.join(projectPath, "WORKFLOW.md") : null,
    path.resolve(process.cwd(), "WORKFLOW.md"),
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function loadWorkflowDefinition(projectPath?: string | null): WorkflowDefinition {
  const workflowPath = resolveWorkflowPath(projectPath);

  if (!workflowPath) {
    return {
      config: {},
      promptTemplate: "You are an autonomous coding agent. Complete the assigned task and report the result.",
    };
  }

  const raw = fs.readFileSync(workflowPath, "utf8");
  return parseFrontmatter(raw);
}

export function getWorkflowConfig(projectPath?: string | null): WorkflowConfig {
  const definition = loadWorkflowDefinition(projectPath);
  const config = definition.config;
  const workspaceRoot =
    typeof config.workspace_root === "string" && config.workspace_root.trim().length > 0
      ? path.resolve(projectPath ?? process.cwd(), config.workspace_root)
      : DEFAULT_WORKFLOW_CONFIG.workspaceRoot;

  return {
    pollIntervalMs:
      typeof config.poll_interval_ms === "number"
        ? config.poll_interval_ms
        : DEFAULT_WORKFLOW_CONFIG.pollIntervalMs,
    maxConcurrentAgents:
      typeof config.max_concurrent_agents === "number"
        ? config.max_concurrent_agents
        : DEFAULT_WORKFLOW_CONFIG.maxConcurrentAgents,
    workspaceRoot,
    autoApprove: typeof config.auto_approve === "boolean" ? config.auto_approve : DEFAULT_WORKFLOW_CONFIG.autoApprove,
    defaultAdapter: normalizeAdapter(config.default_adapter),
    agentCommand: typeof config.agent_command === "string" ? config.agent_command : undefined,
    agentArgs: toStringArray(config.agent_args),
    env: isObject(config.env)
      ? Object.fromEntries(
          Object.entries(config.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
        )
      : undefined,
    hooks: normalizeHooks(config),
  };
}

export function renderTaskPrompt(
  template: string,
  input: {
    projectName: string;
    taskName: string;
    taskDescription: string | null;
    workspacePath: string;
  },
): string {
  const replacements: Record<string, string> = {
    project_name: input.projectName,
    task_name: input.taskName,
    task_description: input.taskDescription ?? "",
    workspace_path: input.workspacePath,
  };

  const rendered = template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key: string) => replacements[key] ?? "");
  const fallback = [
    `Project: ${input.projectName}`,
    `Task: ${input.taskName}`,
    `Workspace: ${input.workspacePath}`,
    input.taskDescription ? `Description:\n${input.taskDescription}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return rendered.trim().length > 0 ? rendered.trim() : fallback;
}
