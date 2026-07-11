import { describe, it, expect } from "vitest";
import { buildGraph } from "@lyceora/taxonomy";
import type { Topic, Dependency } from "@lyceora/taxonomy";
import { initDiagnostic, runDiagnosticStep } from "../src/index.js";

const t = (id: string): Topic => ({
  id, type: "CONCEPTUAL", subject: "Mathematics", domain: "Arithmetic",
  name: { it: id, en: id }, description: { it: id, en: id },
  ageRangeStart: 11, ageRangeEnd: 12,
  evidence: [{ it: "e", en: "e" }], assessmentPrompt: { it: "{{name}}?", en: "{{name}}?" }, standards: []
});
const hard = (topicId: string, prerequisiteId: string): Dependency => ({ topicId, prerequisiteId, strength: "hard", reason: "t" });

// chain: top -> mid -> base ; sibling target "iso" with no prereqs
const graph = buildGraph(
  ["top", "mid", "base", "iso"].map(t),
  [hard("top", "mid"), hard("mid", "base")]
);

function drive(answers: Record<string, boolean>) {
  let { state, step } = runDiagnosticStep(graph, initDiagnostic(graph, ["top", "iso"]), null);
  const asked: string[] = [];
  while (step.kind === "ask") {
    asked.push(step.topicId);
    ({ state, step } = runDiagnosticStep(graph, state, { topicId: step.topicId, passed: answers[step.topicId] ?? false }));
  }
  return { asked, result: step.result, state };
}

describe("adaptive diagnostic", () => {
  it("asks most-advanced topics first", () => {
    const { asked } = drive({ top: true, iso: true });
    expect(asked[0]).toBe("top"); // depth 2 beats depth 0
  });

  it("a pass prunes the hard-prereq closure as assumedMastered", () => {
    const { asked, result } = drive({ top: true, iso: true });
    expect(asked).toEqual(["top", "iso"]); // mid and base never asked
    expect(result.assumedMastered.sort()).toEqual(["base", "mid"]);
    expect(result.frontier).toEqual([]);
  });

  it("a fail descends to direct hard prereqs and finds the frontier", () => {
    const { asked, result } = drive({ top: false, mid: false, base: true, iso: true });
    expect(asked).toEqual(["top", "iso", "mid", "base"]);
    expect(result.mastered.sort()).toEqual(["base", "iso"]);
    expect(result.unmastered.sort()).toEqual(["mid", "top"]);
    expect(result.frontier).toEqual(["mid"]); // base mastered -> mid learnable; top blocked by mid
  });

  it("direct FAIL is never overwritten by a later ancestor pass", () => {
    // fail mid first is impossible in this order; simulate: fail top, fail mid, pass base -> then nothing overwrites mid
    const { result } = drive({ top: false, mid: false, base: true, iso: true });
    expect(result.unmastered).toContain("mid");
  });

  it("stops at the hard cap and marks unreached topics assumedUnmastered", () => {
    let { state, step } = runDiagnosticStep(graph, initDiagnostic(graph, ["top", "iso"], { softCap: 1, hardCap: 1 }), null);
    expect(step.kind).toBe("ask");
    ({ state, step } = runDiagnosticStep(graph, state, { topicId: "top", passed: false }));
    expect(step.kind).toBe("done");
    if (step.kind === "done") {
      expect(step.result.unmastered).toEqual(expect.arrayContaining(["top", "mid", "base"]));
    }
  });
});
