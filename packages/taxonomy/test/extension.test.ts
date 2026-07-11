import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { loadTaxonomy, buildGraph, assertAcyclic, prerequisiteClosure } from "../src/index.js";

const read = (f: string) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), "utf-8"));
const core = read("math-core.json");
const ext = { topics: read("math-it-media/topics.json").topics, dependencies: read("math-it-media/dependencies.json").dependencies };
const paths = read("math-it-media/paths.json").paths as { id: string; targetTopicIds: string[] }[];

const { topics, dependencies } = loadTaxonomy(
  { topics: [...core.topics, ...ext.topics] },
  { dependencies: [...core.dependencies, ...ext.dependencies] }
);
const graph = buildGraph(topics, dependencies);

describe("math-it-media extension", () => {
  it("has 60 lyc_ topics, all bilingual with 3 evidence items and {{name}} prompts", () => {
    const lyc = topics.filter((t) => t.id.startsWith("lyc_"));
    expect(lyc).toHaveLength(60);
    for (const t of lyc) {
      expect(t.evidence.length).toBeGreaterThanOrEqual(3);
      expect(t.assessmentPrompt.it).toContain("{{name}}");
      expect(t.assessmentPrompt.en).toContain("{{name}}");
    }
  });

  it("merged graph is acyclic and anchor edges resolve into math-core", () => {
    assertAcyclic(graph);
    const anchorEdges = ext.dependencies.filter((d: { prerequisiteId: string }) => d.prerequisiteId.startsWith("mt_"));
    expect(anchorEdges.length).toBeGreaterThanOrEqual(50);
  });

  it("the recovery path exists and every lyc_ topic is in its targets' prerequisite closure", () => {
    const path = paths.find((p) => p.id === "path_recupero_media")!;
    expect(path.targetTopicIds).toHaveLength(8);
    const scope = prerequisiteClosure(graph, path.targetTopicIds, { strength: "all" });
    for (const id of path.targetTopicIds) scope.add(id);
    const uncovered = topics.filter((t) => t.id.startsWith("lyc_") && !scope.has(t.id)).map((t) => t.id);
    expect(uncovered).toEqual([]);
  });
});
