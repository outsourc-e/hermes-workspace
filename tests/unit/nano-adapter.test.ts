import { describe, it, expect, vi, beforeEach } from "vitest";

// mock ambient LanguageModel
const mockCreate = vi.fn();
const mockAvailability = vi.fn();

beforeEach(() => {
  vi.resetModules();
  // @ts-ignore
  global.LanguageModel = {
    availability: mockAvailability,
    create: mockCreate,
  };
});

describe("nano adapter checkAvailability", () => {
  it("returns unavailable when no LanguageModel", async () => {
    // @ts-ignore
    delete global.LanguageModel;
    const { checkAvailability } = await import("../../packages/ai-protect-nano/src/adapter.js");
    expect(await checkAvailability()).toBe("unavailable");
  });

  it("proxies availability", async () => {
    mockAvailability.mockResolvedValue("available");
    // @ts-ignore
    global.LanguageModel = { availability: mockAvailability, create: mockCreate };
    const { checkAvailability } = await import("../../packages/ai-protect-nano/src/adapter.js");
    expect(await checkAvailability()).toBe("available");
  });
});

describe("detectWithNano — structured output validation", () => {
  it("validates hit schema and guards indices", async () => {
    const fakeSession = {
      prompt: vi.fn(async () => JSON.stringify({ hits: [{ lexId: "CS_021", surface: "Projekt Titan", start: 0, end: 13, confidence: 0.92 }], riskTier: "high" })),
    };
    const { detectWithNano } = await import("../../packages/ai-protect-nano/src/adapter.js");
    const lex = [{ id: "CS_021", secret: "Project Titan", decoy: "Project Atlas", type: "codename" as const }];
    const res = await detectWithNano(fakeSession, "Projekt Titan foo", lex as any);
    expect(res.hits[0].id).toBe("CS_021");
  });
});
