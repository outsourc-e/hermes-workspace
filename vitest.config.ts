import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
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
    exclude: ["node_modules", "twenty/**", "run/**"],
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
