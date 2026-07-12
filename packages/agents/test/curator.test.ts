import { describe, it, expect } from "vitest";
import { resourceSchema, type Topic } from "@lyceora/taxonomy";
import { buildQueries, resourceIdFor, curateTopic, createFakeCuratorPorts } from "../src/curator";

// Fixture: minimal Topic object matching the pattern from apps/web/test/services.test.ts
const fixtureTopic: Topic = {
  id: "t1",
  type: "CONCEPTUAL",
  subject: "Mathematics",
  domain: "Arithmetic",
  name: { it: "Potenze", en: "Powers" },
  description: { it: "desc", en: "desc" },
  ageRangeStart: 11,
  ageRangeEnd: 12,
  evidence: [{ it: "e", en: "e" }],
  assessmentPrompt: { it: "{{name}}?", en: "{{name}}?" },
  standards: []
};

describe("buildQueries", () => {
  it("buildQueries produces italian-first then english query", () => {
    const q = buildQueries(fixtureTopic);
    expect(q[0]).toContain("Potenze");
    expect(q[1]).toContain("Powers");
    expect(q).toHaveLength(2);
  });
});

describe("resourceIdFor", () => {
  it("resourceIdFor is deterministic and url-sensitive", () => {
    expect(resourceIdFor("t1", "https://a")).toBe(resourceIdFor("t1", "https://a"));
    expect(resourceIdFor("t1", "https://a")).not.toBe(resourceIdFor("t1", "https://b"));
    expect(resourceIdFor("t1", "https://a")).toMatch(/^res_t1_[0-9a-f]{8}$/);
  });
});

describe("curateTopic", () => {
  it("curateTopic dedupes existing urls, drops dead links and judge-rejected, and validates output against resourceSchema", async () => {
    const ports = createFakeCuratorPorts();
    const out = await curateTopic(fixtureTopic, ports, {
      existingUrls: new Set(["https://existing"]),
      maxSearches: 2
    });
    expect(out).toHaveLength(1);
    expect(() => resourceSchema.parse(out[0])).not.toThrow();
  });

  it("curateTopic respects maxSearches", async () => {
    let calls = 0;
    const ports = {
      ...createFakeCuratorPorts(),
      search: async () => {
        calls++;
        return [];
      }
    };
    await curateTopic(fixtureTopic, ports, { existingUrls: new Set(), maxSearches: 1 });
    expect(calls).toBe(1);
  });
});
