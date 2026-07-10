import { describe, it, expect } from "vitest";
import { buildGraph, assertAcyclic, prerequisiteClosure, topoOrder, frontier, TaxonomyCycleError } from "../src/index.js";
import type { Topic, Dependency } from "../src/index.js";

const t = (id: string): Topic => ({
  id, type: "CONCEPTUAL", subject: "Mathematics", domain: "Arithmetic",
  name: { it: id, en: id }, description: { it: id, en: id },
  ageRangeStart: 11, ageRangeEnd: 12,
  evidence: [{ it: "e", en: "e" }], assessmentPrompt: { it: "{{name}}?", en: "{{name}}?" }, standards: []
});
const dep = (topicId: string, prerequisiteId: string, strength: "hard" | "soft" = "hard"): Dependency =>
  ({ topicId, prerequisiteId, strength, reason: "test" });

// Diamond: d needs b and c (hard); b and c need a (b hard, c soft)
const topics = ["a", "b", "c", "d"].map(t);
const deps = [dep("b", "a"), dep("c", "a", "soft"), dep("d", "b"), dep("d", "c")];

describe("graph engine", () => {
  it("computes hard-only and full prerequisite closure", () => {
    const g = buildGraph(topics, deps);
    expect(prerequisiteClosure(g, ["d"], { strength: "hard" })).toEqual(new Set(["b", "c", "a"]));
    // hard-only: c->a is soft, but b->a is hard so a stays reachable
    expect(prerequisiteClosure(g, ["c"], { strength: "hard" })).toEqual(new Set());
    expect(prerequisiteClosure(g, ["c"], { strength: "all" })).toEqual(new Set(["a"]));
  });

  it("orders topologically with prerequisites first, ties by id", () => {
    const g = buildGraph(topics, deps);
    expect(topoOrder(g, new Set(["a", "b", "c", "d"]))).toEqual(["a", "b", "c", "d"]);
  });

  it("frontier = non-mastered with all hard prereqs mastered", () => {
    const g = buildGraph(topics, deps);
    const mastery = new Map([["a", "mastered" as const], ["b", "mastered" as const]]);
    // c has only a soft prereq -> eligible; d blocked by non-mastered hard prereq c? No: d's hard prereqs are b (mastered) and c (not) -> blocked
    expect(frontier(g, ["d"], mastery)).toEqual(["c"]);
  });

  it("detects cycles", () => {
    const g = buildGraph(topics, [...deps, dep("a", "d")]);
    expect(() => assertAcyclic(g)).toThrowError(TaxonomyCycleError);
  });
});
