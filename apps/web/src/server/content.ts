import {
  loadTaxonomy, buildGraph, assertAcyclic, resourceSchema,
  type Topic, type TopicGraph, type CuratedResource
} from "@lyceora/taxonomy";
import { z } from "zod";
import mathCore from "@lyceora/taxonomy/data/math-core.json";
import mathJunior from "@lyceora/taxonomy/data/math-junior.json";
import extTopics from "@lyceora/taxonomy/data/math-it-media/topics.json";
import extDeps from "@lyceora/taxonomy/data/math-it-media/dependencies.json";
import rawResources from "@lyceora/taxonomy/data/math-it-media/resources.json";
import paths from "@lyceora/taxonomy/data/math-it-media/paths.json";

const resources = { resources: z.array(resourceSchema).parse(rawResources.resources) };

const { topics, dependencies } = loadTaxonomy(
  { topics: [...mathCore.topics, ...mathJunior.topics, ...extTopics.topics] },
  { dependencies: [...mathCore.dependencies, ...mathJunior.dependencies, ...extDeps.dependencies] }
);
const graph: TopicGraph = buildGraph(topics, dependencies);
assertAcyclic(graph);

const authoredTopicIds: ReadonlySet<string> = new Set(extTopics.topics.map((t) => t.id));

export function getGraph(): TopicGraph { return graph; }
/** Ids of the hand-authored math-it-media extension topics — the recovery-path content layer. */
export function getAuthoredTopicIds(): ReadonlySet<string> { return authoredTopicIds; }
export function getTopic(id: string): Topic {
  const t = graph.topics.get(id);
  if (!t) throw new Error(`Unknown topic ${id}`);
  return t;
}
export function getPath(pathId: string): { id: string; name: { it: string; en: string }; targetTopicIds: string[] } {
  const p = (paths as { paths: { id: string; name: { it: string; en: string }; targetTopicIds: string[] }[] }).paths
    .find((x) => x.id === pathId);
  if (!p) throw new Error(`Unknown path ${pathId}`);
  return p;
}
export function getResources(topicId: string): CuratedResource[] {
  return resources.resources.filter((r) => r.topicIds.includes(topicId));
}

/** Ids of topics browsable in journey/browse mode for a path. `_pathId` is reserved for future
 * multi-path support — today every path resolves to the same authored extension topic set. */
export function getBrowsableTopicIds(_pathId: string): ReadonlySet<string> {
  return authoredTopicIds;
}

/** Picks one "suggested" resource per kind (video/exercises/assessment): the first resource in
 * `locale`, in input order; if a kind has no resource in that locale, the first of any language.
 * All other resources of that kind are unsuggested. Pure — preserves input order in the output. */
export function pickSuggested(
  resources: CuratedResource[], locale: "it" | "en"
): (CuratedResource & { suggested: boolean })[] {
  const picked = new Set<CuratedResource>();
  for (const kind of new Set(resources.map((r) => r.kind))) {
    const ofKind = resources.filter((r) => r.kind === kind);
    const pick = ofKind.find((r) => r.lang === locale) ?? ofKind[0];
    if (pick) picked.add(pick);
  }
  return resources.map((r) => ({ ...r, suggested: picked.has(r) }));
}
