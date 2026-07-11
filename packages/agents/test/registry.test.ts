import { describe, it, expect, vi } from "vitest";
import { loadModelsConfig, createRegistry } from "../src/index.js";

const yamlText = `
version: 1
providers:
  anthropic: { api_mode: anthropic_messages, api_key_env: ANTHROPIC_API_KEY }
  google:    { api_mode: gemini, api_key_env: GEMINI_API_KEY }
tiers:
  strong: [anthropic/model-a, google/model-b]
defaults: { tier: strong }
agents:
  teacher: { tier: strong }
  pinned:  { model: google/model-b }
task_slots: {}
`;

// Inject fake factories: modelId -> a marker object standing in for LanguageModel
const factories = {
  anthropic_messages: () => (id: string) => ({ marker: "ANT:" + id }),
  gemini: () => (id: string) => ({ marker: "GOO:" + id })
} as never;

describe("registry", () => {
  it("resolves tier chains in order and honors explicit model pins", () => {
    const reg = createRegistry(loadModelsConfig(yamlText), factories);
    expect(reg.resolve("teacher").map((c) => c.ref)).toEqual(["anthropic/model-a", "google/model-b"]);
    expect(reg.resolve("pinned").map((c) => c.ref)).toEqual(["google/model-b"]);
  });

  it("splits openrouter-style refs on the first slash only", () => {
    const reg = createRegistry(loadModelsConfig(yamlText), factories);
    expect(reg.resolve("teacher")[0]).toMatchObject({ provider: "anthropic", modelId: "model-a" });
  });

  it("withFallback walks the chain on retryable errors only", async () => {
    const reg = createRegistry(loadModelsConfig(yamlText), factories);
    const rateLimited = Object.assign(new Error("429"), { statusCode: 429 });
    const fn = vi.fn()
      .mockRejectedValueOnce(rateLimited)
      .mockResolvedValueOnce("ok-from-second");
    await expect(reg.withFallback("teacher", fn)).resolves.toBe("ok-from-second");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("withFallback rethrows non-retryable errors without walking", async () => {
    const reg = createRegistry(loadModelsConfig(yamlText), factories);
    const badRequest = Object.assign(new Error("400 bad request"), { statusCode: 400 });
    const fn = vi.fn().mockRejectedValue(badRequest);
    await expect(reg.withFallback("teacher", fn)).rejects.toThrow("400");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
