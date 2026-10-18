import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright for AI Protect — tuned for your Apple M2 Max + installed Chrome 151 + Antigravity built-in browser
 * - Uses your installed Chrome at /Applications/Google Chrome.app (not bundled Chromium) so Gemini Nano flags propagate
 * - Loads extension via --load-extension=apps/extension
 * - For Antigravity: set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH if needed, or use chrome channel
 */
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Use installed Chrome so Nano model (22GB) is shared
    channel: "chrome" as any,
    // launchOptions executablePath fallback for Antigravity built-in browser debugging via 9222
    launchOptions: {
      executablePath: chromePath,
      args: [
        "--enable-features=OptimizationGuideOnDeviceModel,PromptAPIForGeminiNano,PromptAPIForGeminiNanoMultilingual",
        "--disable-features=Translate",
        "--no-first-run",
        "--no-default-browser-check",
        // Uncomment to auto-load extension in e2e:
        // "--load-extension=apps/extension",
        // "--disable-extensions-except=apps/extension",
      ],
    },
  },
  projects: [
    {
      name: "chromium-m2max",
      use: { ...devices["Desktop Chrome"], channel: "chrome" as any },
    },
  ],
  // Web server for manual e2e: pnpm dev serves workspace at 3001, extension test page at 3001/__ai-protect-test
  webServer: undefined, // start manually: pnpm dev  then pnpm exec playwright test --project=chromium-m2max
});
