/**
 * Builds data/math-core.json: the subset of os-taxonomy Mathematics topics that
 * math-it-media anchors to (transitive prerequisite closure of anchor ids),
 * normalized to the bilingual format using the Italian overlay.
 * Run: pnpm --filter @lyceora/taxonomy exec tsx scripts/build-math-core.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { buildGraph, prerequisiteClosure } from "../src/graph.js";
import type { Topic, Dependency, LocalizedText } from "../src/types.js";

type OsTopic = Omit<Topic, "name" | "description" | "evidence" | "assessmentPrompt"> & {
  name: string; description: string; evidence: string[]; assessmentPrompt: string;
};
type Overlay = Record<string, { name: string; description: string; evidence: string[]; assessmentPrompt: string }>;

const dir = new URL("../data/", import.meta.url);
const os = JSON.parse(readFileSync(new URL("os-taxonomy/topics.json", dir), "utf-8")) as { topics: OsTopic[] };
const osDeps = JSON.parse(readFileSync(new URL("os-taxonomy/dependencies.json", dir), "utf-8")) as { dependencies: Dependency[] };
const anchors = JSON.parse(readFileSync(new URL("math-it-media/anchors.json", dir), "utf-8")) as { osAnchorIds: string[] };
const overlay = JSON.parse(readFileSync(new URL("os-anchors.i18n.json", dir), "utf-8")) as Overlay;

// Build graph over raw English topics (cast: graph only reads id fields)
const pseudoTopics = os.topics.map((t) => ({ ...t, name: { it: "x", en: t.name }, description: { it: "x", en: t.description }, evidence: [{ it: "x", en: "x" }], assessmentPrompt: { it: "x", en: t.assessmentPrompt } })) as Topic[];
const graph = buildGraph(pseudoTopics, osDeps.dependencies);
const keep = prerequisiteClosure(graph, anchors.osAnchorIds, { strength: "all" });
for (const id of anchors.osAnchorIds) keep.add(id);

const missing: string[] = [];
const loc = (id: string, en: string, it: string | undefined, field: string): LocalizedText => {
  if (!it) { missing.push(`${id}.${field}`); return { it: en, en }; }
  return { it, en };
};

// os-taxonomy's topic.type vocabulary (CONCEPTUAL/PROCEDURAL/REPRESENTATIONAL/LANGUAGE/META)
// only partly overlaps our schema's TopicType enum (schema.ts, Task 2), which has no
// LANGUAGE or META. Remap to the closest existing enum value so upstream data validates.
const typeRemap: Record<string, Topic["type"]> = { LANGUAGE: "REPRESENTATIONAL", META: "METACOGNITIVE" };
const remapType = (type: string): Topic["type"] => (typeRemap[type] ?? type) as Topic["type"];

const topics: Topic[] = os.topics
  .filter((t) => keep.has(t.id) && t.subject === "Mathematics")
  .map((t) => ({
    ...t,
    type: remapType(t.type),
    name: loc(t.id, t.name, overlay[t.id]?.name, "name"),
    description: loc(t.id, t.description, overlay[t.id]?.description, "description"),
    evidence: t.evidence.map((e, i) => loc(t.id, e, overlay[t.id]?.evidence?.[i], `evidence[${i}]`)),
    assessmentPrompt: loc(t.id, t.assessmentPrompt, overlay[t.id]?.assessmentPrompt, "assessmentPrompt")
  }));
const ids = new Set(topics.map((t) => t.id));
const dependencies = osDeps.dependencies.filter((d) => ids.has(d.topicId) && ids.has(d.prerequisiteId));

if (missing.length) console.warn(`WARN missing Italian overlay for: ${missing.join(", ")}`);
writeFileSync(new URL("math-core.json", dir), JSON.stringify({ topics, dependencies }, null, 1));
console.log(`math-core.json: ${topics.length} topics, ${dependencies.length} dependencies`);
