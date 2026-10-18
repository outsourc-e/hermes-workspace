import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      // subpath aliases BEFORE root aliases (vite alias order is first-match)
      "@ai-protect/shared/types": resolve(__dirname, "packages/ai-protect-shared/src/types.ts"),
      "@ai-protect/shared/schemas": resolve(__dirname, "packages/ai-protect-shared/src/schemas.ts"),
      "@ai-protect/shared/constants": resolve(__dirname, "packages/ai-protect-shared/src/constants.ts"),
      "@ai-protect/core/pii-patterns": resolve(__dirname, "packages/ai-protect-core/src/pii-patterns.ts"),
      "@ai-protect/core/aho-corasick": resolve(__dirname, "packages/ai-protect-core/src/aho-corasick.ts"),
      "@ai-protect/core/substitute": resolve(__dirname, "packages/ai-protect-core/src/substitute.ts"),
      "@ai-protect/core/rehydrator": resolve(__dirname, "packages/ai-protect-core/src/rehydrator.ts"),
      "@ai-protect/core/audit": resolve(__dirname, "packages/ai-protect-core/src/audit.ts"),
      "@ai-protect/nano/adapter": resolve(__dirname, "packages/ai-protect-nano/src/adapter.ts"),
      "@ai-protect/shared": resolve(__dirname, "packages/ai-protect-shared/src/index.ts"),
      "@ai-protect/core": resolve(__dirname, "packages/ai-protect-core/src/index.ts"),
      "@ai-protect/nano": resolve(__dirname, "packages/ai-protect-nano/src/index.ts"),
      "@ai-protect/policy": resolve(__dirname, "packages/ai-protect-policy/src/index.ts"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["tests/**/*.{test,spec}.ts", "packages/**/*.{test,spec}.ts", "src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "twenty/**", "run/**"],
    browser: {
      enabled: false, // enable via --browser for live Nano on M2 Max: pnpm exec vitest run tests/live --browser.enabled --browser.name=chromium --browser.provider=playwright
      name: "chromium",
      provider: "playwright",
    },
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      include: ["packages/ai-protect-*/src/**"],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 60,
        lines: 80,
      },
    },
    testTimeout: 10000,
  },
});
