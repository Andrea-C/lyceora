/**
 * Builds data/math-junior.json: the upstream os-taxonomy Mathematics topics NOT
 * already present in math-core.json, normalized to the math-core bilingual shape.
 * Upstream is English-only, so `it` is copied from `en` for now and the file is
 * flagged `itPending: true` at the root (Task 13 fills in real Italian text).
 * Run: pnpm --filter @lyceora/taxonomy run import:junior
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { topicSchema } from "../src/schema.js";
import type { Topic, Dependency, LocalizedText } from "../src/types.js";

type OsTopic = Omit<Topic, "name" | "description" | "evidence" | "assessmentPrompt"> & {
  name: string; description: string; evidence: string[]; assessmentPrompt: string;
};

const p = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const upstream = JSON.parse(readFileSync(p("../data/os-taxonomy/topics.json"), "utf-8")) as { topics: OsTopic[] };
const upstreamDeps = JSON.parse(readFileSync(p("../data/os-taxonomy/dependencies.json"), "utf-8")) as { dependencies: Dependency[] };
const core = JSON.parse(readFileSync(p("../data/math-core.json"), "utf-8")) as { topics: Topic[] };

const coreIds = new Set(core.topics.map((t) => t.id));
const mathTopics = upstream.topics.filter((t) => t.subject === "Mathematics" && !coreIds.has(t.id));
const juniorIds = new Set(mathTopics.map((t) => t.id));
const keepIds = new Set([...coreIds, ...juniorIds]);

// keep every dependency whose BOTH endpoints exist in core ∪ junior and at least one endpoint is junior
const deps = upstreamDeps.dependencies.filter((d) =>
  keepIds.has(d.topicId) && keepIds.has(d.prerequisiteId) &&
  (juniorIds.has(d.topicId) || juniorIds.has(d.prerequisiteId)));

// mirror the math-core topic shape: upstream localized fields are plain strings,
// core fields are { it, en } — copy en into it and let itPending flag the debt.
const loc = (en: string): LocalizedText => ({ it: en, en });

function normalizeToMathCoreShape(t: OsTopic): Topic {
  const topic: Topic = {
    ...t,
    name: loc(t.name),
    description: loc(t.description),
    evidence: t.evidence.map((e) => loc(e)),
    assessmentPrompt: loc(t.assessmentPrompt)
  };
  const r = topicSchema.safeParse(topic);
  if (!r.success) {
    throw new Error(`Invalid junior topic ${t.id}: ${r.error.issues[0]?.message ?? "unknown"} at ${r.error.issues[0]?.path.join(".")}`);
  }
  return topic;
}

const topics = mathTopics.map((t) => normalizeToMathCoreShape(t));
writeFileSync(p("../data/math-junior.json"), JSON.stringify({ itPending: true, topics, dependencies: deps }, null, 2));
console.log(`math-junior: ${topics.length} topics, ${deps.length} dependencies`);
