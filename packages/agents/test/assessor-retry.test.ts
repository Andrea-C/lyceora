import { describe, it, expect, vi, beforeEach } from "vitest";
import { NoObjectGeneratedError } from "ai";
import type { Topic } from "@lyceora/taxonomy";
import { loadModelsConfig, createRegistry, generateExercises } from "../src/index.js";

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateObject: vi.fn()
}));
const { generateObject } = await import("ai");
const generateObjectMock = vi.mocked(generateObject);

// single-model chain so withFallback has nowhere to walk — call counts isolate the retry itself
const yamlText = `
version: 1
providers:
  anthropic: { api_mode: anthropic_messages, api_key_env: ANTHROPIC_API_KEY }
tiers:
  standard: [anthropic/model-a]
defaults: { tier: standard }
agents:
  assessor: { tier: standard }
task_slots: {}
`;
const factories = { anthropic_messages: () => (id: string) => ({ marker: "ANT:" + id }) } as never;

const topic = {
  id: "t1", name: { it: "Potenze", en: "Powers" }, description: { it: "d", en: "d" },
  ageRangeStart: 11, ageRangeEnd: 14, evidence: [{ it: "e", en: "e" }]
} as unknown as Topic;

const exercise = { id: "e1", kind: "numeric", prompt: "2+2?", correctAnswer: "4", explanation: "2+2 fa 4.", difficulty: 1 };
const okResult = { object: { exercises: [exercise] } } as never;

function schemaMismatch(): NoObjectGeneratedError {
  return new NoObjectGeneratedError({
    message: "response did not match schema",
    text: "{}", response: { id: "r", timestamp: new Date(), modelId: "model-a" },
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    finishReason: "stop"
  } as never);
}

describe("generateExercises schema-mismatch retry", () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
  });

  it("retries once when the model output fails schema validation", async () => {
    const reg = createRegistry(loadModelsConfig(yamlText), factories);
    generateObjectMock.mockRejectedValueOnce(schemaMismatch()).mockResolvedValueOnce(okResult);
    await expect(generateExercises(reg, topic, "it", { count: 1, difficulty: 1 })).resolves.toEqual([exercise]);
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after the single retry", async () => {
    const reg = createRegistry(loadModelsConfig(yamlText), factories);
    generateObjectMock.mockRejectedValue(schemaMismatch());
    await expect(generateExercises(reg, topic, "it", { count: 1, difficulty: 1 })).rejects.toThrow("did not match schema");
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-schema errors (they stay withFallback's business)", async () => {
    const reg = createRegistry(loadModelsConfig(yamlText), factories);
    generateObjectMock.mockRejectedValue(Object.assign(new Error("400 bad request"), { statusCode: 400 }));
    await expect(generateExercises(reg, topic, "it", { count: 1, difficulty: 1 })).rejects.toThrow("400");
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
  });
});
