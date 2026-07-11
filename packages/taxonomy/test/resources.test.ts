import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { resourceSchema } from "../src/index.js";

const read = (f: string) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), "utf-8"));
const resources = z.array(resourceSchema).parse(read("math-it-media/resources.json").resources);
const topicIds = new Set(read("math-it-media/topics.json").topics.map((t: { id: string }) => t.id));
const targets: string[] = read("math-it-media/paths.json").paths[0].targetTopicIds;

describe("curated resources", () => {
  it("has >= 30 records, all https, all referencing existing lyc_ topics", () => {
    expect(resources.length).toBeGreaterThanOrEqual(30);
    for (const r of resources) {
      expect(r.url).toMatch(/^https:\/\//);
      for (const id of r.topicIds) expect(topicIds.has(id)).toBe(true);
    }
  });
  it("every cluster has at least one video, one exercises and one assessment resource", () => {
    const prefixOf = (t: string) => t.split("_").slice(0, 2).join("_"); // lyc_potenze, lyc_div, ...
    for (const target of targets) {
      const cluster = prefixOf(target);
      for (const kind of ["video", "exercises", "assessment"] as const) {
        const hit = resources.some((r) => r.kind === kind && r.topicIds.some((id) => prefixOf(id) === cluster));
        expect(hit, `${cluster} missing ${kind}`).toBe(true);
      }
    }
  });
});
