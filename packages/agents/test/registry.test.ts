import { describe, it, expect, vi } from "vitest";
import { loadModelsConfig, createRegistry } from "../src/index.js";

const yamlText = `
version: 1
providers:
  anthropic:  { api_mode: anthropic_messages, api_key_env: ANTHROPIC_API_KEY }
  google:     { api_mode: gemini, api_key_env: GEMINI_API_KEY }
  openrouter: { api_mode: chat_completions, base_url: https://openrouter.ai/api/v1, api_key_env: OPENROUTER_API_KEY }
tiers:
  strong: [anthropic/model-a, google/model-b]
defaults: { tier: strong }
agents:
  teacher: { tier: strong }
  pinned:  { model: google/model-b }
  router:  { model: openrouter/deepseek/deepseek-v3.2 }
task_slots: {}
`;

// Inject fake factories: modelId -> a marker object standing in for LanguageModel
const factories = {
  anthropic_messages: () => (id: string) => ({ marker: "ANT:" + id }),
  gemini: () => (id: string) => ({ marker: "GOO:" + id }),
  chat_completions: () => (id: string) => ({ marker: "OR:" + id })
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

  it("splits a real multi-slash openrouter ref into provider + full modelId", () => {
    const reg = createRegistry(loadModelsConfig(yamlText), factories);
    expect(reg.resolve("router")).toEqual([
      expect.objectContaining({
        ref: "openrouter/deepseek/deepseek-v3.2",
        provider: "openrouter",
        modelId: "deepseek/deepseek-v3.2"
      })
    ]);
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

  it("withFallback walks the chain on DNS/host transient errors with no statusCode", async () => {
    const reg = createRegistry(loadModelsConfig(yamlText), factories);
    const dnsFailure = new Error("getaddrinfo ENOTFOUND api.anthropic.com");
    const fn = vi.fn()
      .mockRejectedValueOnce(dnsFailure)
      .mockResolvedValueOnce("ok-from-second");
    await expect(reg.withFallback("teacher", fn)).resolves.toBe("ok-from-second");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("withFallback rethrows immediately when statusCode is non-retryable even if the message mentions timeout", async () => {
    const reg = createRegistry(loadModelsConfig(yamlText), factories);
    const badRequestWithTimeoutWord = Object.assign(new Error("timeout while validating request"), { statusCode: 400 });
    const fn = vi.fn().mockRejectedValue(badRequestWithTimeoutWord);
    await expect(reg.withFallback("teacher", fn)).rejects.toThrow("timeout");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
