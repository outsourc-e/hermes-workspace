#!/usr/bin/env node
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const command = args[0];

function printUsage() {
  console.log(`
  @clawsuite/workspace-daemon — Multi-agent coding orchestrator

  Usage:
    workspace-daemon start [--port 3099] [--db ./workspace.db]
    workspace-daemon status
    workspace-daemon init [path]

  Commands:
    start     Start the daemon server
    status    Check if daemon is running
    init      Initialize a workspace config in the given directory

  Options:
    --port    Port to listen on (default: 3099)
    --db      SQLite database path (default: ./workspace.db)
    --help    Show this help
  `);
}

function getArg(flag: string, fallback: string): string {
  const index = args.indexOf(flag);
  if (index !== -1 && args[index + 1]) return args[index + 1];
  return fallback;
}

async function start() {
  const port = getArg("--port", "3099");
  const db = getArg("--db", "./workspace.db");

  process.env.PORT = port;
  process.env.WORKSPACE_DB_PATH = resolve(db);

  console.log(`Starting workspace daemon on port ${port}...`);
  console.log(`Database: ${resolve(db)}`);

  // Dynamic import to load the server
  await import("../src/server.js");
}

async function status() {
  const port = getArg("--port", "3099");
  try {
    const response = await fetch(`http://localhost:${port}/api/workspace/projects`);
    if (response.ok) {
      console.log(`✅ Daemon is running on port ${port}`);
      const projects = (await response.json()) as unknown[];
      console.log(`   ${projects.length} project${projects.length === 1 ? "" : "s"} tracked`);
    } else {
      console.log(`⚠️  Daemon responded with status ${response.status}`);
    }
  } catch {
    console.log(`❌ Daemon is not running on port ${port}`);
    process.exit(1);
  }
}

function init(targetPath?: string) {
  const dir = resolve(targetPath || ".");
  console.log(`Initializing workspace at ${dir}`);

  if (!existsSync(dir)) {
    console.error(`Directory does not exist: ${dir}`);
    process.exit(1);
  }

  console.log("✅ Workspace ready. Run 'workspace-daemon start' to begin.");
}

switch (command) {
  case "start":
    void start();
    break;
  case "status":
    void status();
    break;
  case "init":
    init(args[1]);
    break;
  case "--help":
  case "-h":
  case undefined:
    printUsage();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
}
