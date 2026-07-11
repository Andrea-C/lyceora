import { describe, it, expect } from "vitest";
import { learningSignalSchema } from "../src/index.js";

describe("learningSignalSchema", () => {
  it("accepts a snake_case correction signal", () => {
    const r = learningSignalSchema.safeParse({
      thread_id: "t1", run_id: "r1", actor: "user", signal: "correction",
      before: "wrong hint", after: "user asked simpler words", context: "lyc_potenze_def"
    });
    expect(r.success).toBe(true);
  });
  it("rejects camelCase fields", () => {
    expect(learningSignalSchema.safeParse({ threadId: "t1", runId: "r1", actor: "user", signal: "approval" }).success).toBe(false);
  });
});
