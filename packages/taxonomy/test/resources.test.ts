import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { resourceSchema } from "../src/index.js";

const read = (f: string) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), "utf-8"));
const resources = z.array(resourceSchema).parse(read("math-it-media/resources.json").resources);
const topicIds = new Set([
  ...read("math-it-media/topics.json").topics.map((t: { id: string }) => t.id),
  ...read("math-junior.json").topics.map((t: { id: string }) => t.id),
  ...read("math-core.json").topics.map((t: { id: string }) => t.id),
]);

const CLUSTERS: Record<string, string[]> = {
  potenze: ["lyc_potenze"],
  divisibilita: ["lyc_div"],
  frazioni: ["lyc_fraz"],
  radici: ["lyc_radici"],
  equivalenze: ["lyc_equiv"],
  piano: ["lyc_piano"],
  poligoni: ["lyc_poli", "lyc_perimetro", "lyc_area", "lyc_cerchio"],
  pitagora: ["lyc_pit"]
};

describe("curated resources", () => {
  it("has >= 30 records, all https, all referencing existing topics", () => {
    expect(resources.length).toBeGreaterThanOrEqual(30);
    for (const r of resources) {
      expect(r.url).toMatch(/^https:\/\//);
      for (const id of r.topicIds) expect(topicIds.has(id)).toBe(true);
    }
  });
  it("every cluster has at least one video, one exercises and one assessment resource", () => {
    for (const [cluster, prefixes] of Object.entries(CLUSTERS)) {
      for (const kind of ["video", "exercises", "assessment"] as const) {
        const hit = resources.some(
          (r) => r.kind === kind && r.topicIds.some((id) => prefixes.some((p) => id.startsWith(p)))
        );
        expect(hit, `${cluster} missing ${kind}`).toBe(true);
      }
    }
  });
});
