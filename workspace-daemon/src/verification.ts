import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface VerificationResult {
  passed: boolean;
  output: string;
  durationMs: number;
}

export async function runVerification(projectPath: string): Promise<VerificationResult> {
  const startedAt = Date.now();

  try {
    const { stdout, stderr } = await execFileAsync("npx", ["tsc", "--noEmit"], {
      cwd: projectPath,
      timeout: 120_000,
    });

    return {
      passed: true,
      output: [stdout, stderr].filter(Boolean).join("\n").trim() || "TypeScript passed with 0 errors.",
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    const stdout =
      error && typeof error === "object" && "stdout" in error && typeof error.stdout === "string"
        ? error.stdout
        : "";
    const stderr =
      error && typeof error === "object" && "stderr" in error && typeof error.stderr === "string"
        ? error.stderr
        : error instanceof Error
          ? error.message
          : "TypeScript check failed";

    return {
      passed: false,
      output: [stdout, stderr].filter(Boolean).join("\n").trim(),
      durationMs: Date.now() - startedAt,
    };
  }
}
