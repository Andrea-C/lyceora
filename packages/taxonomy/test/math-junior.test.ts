import { describe, it, expect } from "vitest";
import junior from "../data/math-junior.json";
import core from "../data/math-core.json";
import { loadTaxonomy, buildGraph, assertAcyclic } from "../src/index.js";
import extTopics from "../data/math-it-media/topics.json";
import extDeps from "../data/math-it-media/dependencies.json";

describe("math-junior dataset", () => {
  it("contains exactly the upstream math topics not in math-core", () => {
    expect(junior.topics.length).toBe(275);
    const coreIds = new Set(core.topics.map((t: { id: string }) => t.id));
    for (const t of junior.topics) expect(coreIds.has(t.id)).toBe(false);
  });

  it("merged three-source graph loads, is acyclic, and fully connected (no dangling deps)", () => {
    const { topics, dependencies } = loadTaxonomy(
      { topics: [...core.topics, ...junior.topics, ...extTopics.topics] },
      { dependencies: [...core.dependencies, ...junior.dependencies, ...extDeps.dependencies] }
    );
    const graph = buildGraph(topics, dependencies);
    assertAcyclic(graph);
    expect(topics.length).toBe(228 + 275 + extTopics.topics.length);
  });

  it("junior dependencies only reference topics present in the merged set", () => {
    const ids = new Set([...core.topics, ...junior.topics].map((t: { id: string }) => t.id));
    for (const d of junior.dependencies) {
      expect(ids.has(d.topicId)).toBe(true);
      expect(ids.has(d.prerequisiteId)).toBe(true);
    }
  });
});
