import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { loadTaxonomy, buildGraph, assertAcyclic } from "../src/index.js";

describe("math-core dataset", () => {
  it("is valid, bilingual, acyclic, and Mathematics-only", () => {
    const raw = JSON.parse(readFileSync(new URL("../data/math-core.json", import.meta.url), "utf-8"));
    const { topics, dependencies } = loadTaxonomy({ topics: raw.topics }, { dependencies: raw.dependencies });
    expect(topics.length).toBeGreaterThan(10);
    expect(topics.every((t) => t.subject === "Mathematics")).toBe(true);
    expect(topics.every((t) => t.name.it.length > 0 && t.name.en.length > 0)).toBe(true);
    assertAcyclic(buildGraph(topics, dependencies));
  });

  it("keeps the {{name}} placeholder in both locales of assessmentPrompt", () => {
    const raw = JSON.parse(readFileSync(new URL("../data/math-core.json", import.meta.url), "utf-8"));
    const { topics } = loadTaxonomy({ topics: raw.topics }, { dependencies: raw.dependencies });
    for (const t of topics) {
      if (t.assessmentPrompt.en.includes("{{name}}")) {
        expect(t.assessmentPrompt.it).toContain("{{name}}");
      }
    }
  });

  it("includes every math-it-media anchor id", () => {
    const raw = JSON.parse(readFileSync(new URL("../data/math-core.json", import.meta.url), "utf-8"));
    const anchors = JSON.parse(readFileSync(new URL("../data/math-it-media/anchors.json", import.meta.url), "utf-8"));
    const { topics } = loadTaxonomy({ topics: raw.topics }, { dependencies: raw.dependencies });
    const ids = new Set(topics.map((t) => t.id));
    for (const anchorId of anchors.osAnchorIds) {
      expect(ids.has(anchorId)).toBe(true);
    }
  });
});
