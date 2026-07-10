import { describe, it, expect } from "vitest";
import { loadTaxonomy, TaxonomyValidationError } from "../src/index.js";

const goodTopic = {
  id: "lyc_potenze_def",
  type: "CONCEPTUAL",
  subject: "Mathematics",
  domain: "Arithmetic",
  name: { it: "Definizione di potenza", en: "Definition of a power" },
  description: { it: "La potenza come moltiplicazione ripetuta", en: "Powers as repeated multiplication" },
  ageRangeStart: 11,
  ageRangeEnd: 12,
  evidence: [{ it: "Calcola 2^3", en: "Computes 2^3" }],
  assessmentPrompt: { it: "{{name}} sa calcolare 2^3?", en: "Can {{name}} compute 2^3?" },
  standards: []
};
const goodDep = { topicId: "lyc_potenze_def", prerequisiteId: "lyc_x", strength: "hard", reason: "needs multiplication" };

describe("loadTaxonomy", () => {
  it("accepts valid bilingual topics and dependencies", () => {
    const { topics, dependencies } = loadTaxonomy(
      { topics: [goodTopic, { ...goodTopic, id: "lyc_x" }] },
      { dependencies: [goodDep] }
    );
    expect(topics).toHaveLength(2);
    expect(dependencies).toHaveLength(1);
  });

  it("rejects a topic missing an Italian field, naming the id", () => {
    const bad = { ...goodTopic, name: { en: "only english" } };
    expect(() => loadTaxonomy({ topics: [bad] }, { dependencies: [] }))
      .toThrowError(TaxonomyValidationError);
    expect(() => loadTaxonomy({ topics: [bad] }, { dependencies: [] }))
      .toThrowError(/lyc_potenze_def/);
  });

  it("rejects a dependency referencing an unknown topic id", () => {
    expect(() => loadTaxonomy({ topics: [goodTopic] }, { dependencies: [goodDep] }))
      .toThrowError(/lyc_x/);
  });
});
