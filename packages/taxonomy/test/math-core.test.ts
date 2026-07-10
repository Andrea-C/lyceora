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
});
