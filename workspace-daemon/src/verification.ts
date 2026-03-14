import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface VerificationResult {
  passed: boolean;
  output: string;
  durationMs: number;
}

export interface FullVerificationResult {
  check: "tsc" | "test" | "lint";
  passed: boolean;
  output: string;
  durationMs: number;
}

/** Original single-check function (backward compat) */
export async function runVerification(projectPath: string): Promise<VerificationResult> {
  return runTsc(projectPath);
}

/** Run all available checks: tsc + test + lint */
export async function runFullVerification(projectPath: string): Promise<FullVerificationResult[]> {
  const results: FullVerificationResult[] = [];

  // Always run tsc
  const tscResult = await runTsc(projectPath);
  results.push({ check: "tsc", ...tscResult });

  // Run tests if configured
  if (hasTestScript(projectPath)) {
    const testResult = await runNpmScript(projectPath, "test", 120_000);
    results.push({ check: "test", ...testResult });
  }

  // Run lint if configured
  if (hasLintConfig(projectPath)) {
    const lintResult = await runNpmScript(projectPath, "lint", 60_000);
    results.push({ check: "lint", ...lintResult });
  }

  return results;
}

async function runTsc(projectPath: string): Promise<VerificationResult> {
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

async function runNpmScript(projectPath: string, script: string, timeout: number): Promise<VerificationResult> {
  const startedAt = Date.now();

  try {
    const { stdout, stderr } = await execFileAsync("npm", ["run", script], {
      cwd: projectPath,
      timeout,
    });

    return {
      passed: true,
      output: [stdout, stderr].filter(Boolean).join("\n").trim() || `${script} passed.`,
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
          : `${script} failed`;

    return {
      passed: false,
      output: [stdout, stderr].filter(Boolean).join("\n").trim(),
      durationMs: Date.now() - startedAt,
    };
  }
}

function hasTestScript(projectPath: string): boolean {
  try {
    const pkgPath = join(projectPath, "package.json");
    if (!existsSync(pkgPath)) return false;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, string> };
    const testScript = pkg.scripts?.test;
    if (!testScript) return false;
    // Skip npm's default placeholder
    if (testScript.includes('echo "Error: no test specified"')) return false;
    return true;
  } catch {
    return false;
  }
}

function hasLintConfig(projectPath: string): boolean {
  const lintConfigs = [
    ".eslintrc",
    ".eslintrc.js",
    ".eslintrc.cjs",
    ".eslintrc.json",
    ".eslintrc.yml",
    ".eslintrc.yaml",
    "eslint.config.js",
    "eslint.config.cjs",
    "eslint.config.mjs",
    "eslint.config.ts",
  ];

  for (const config of lintConfigs) {
    if (existsSync(join(projectPath, config))) return true;
  }

  // Also check for lint script in package.json
  try {
    const pkgPath = join(projectPath, "package.json");
    if (!existsSync(pkgPath)) return false;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, string> };
    return Boolean(pkg.scripts?.lint);
  } catch {
    return false;
  }
}
