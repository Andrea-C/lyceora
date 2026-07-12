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

export function getGraph(): TopicGraph { return graph; }
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
