import type { TopicGraph, MasteryStatus } from "@lyceora/taxonomy";
import { frontier as graphFrontier } from "@lyceora/taxonomy";
import { topoLevels } from "./diagnostic";

export interface AssessmentOutcome {
  passed: boolean;
  masteryAfter: MasteryStatus;
  failedConcepts: string[]; // prereq topicIds attributed by the Assessor to wrong answers
}

export type RouteDecision =
  | { action: "advance"; masteredTopicId: string; nextTopicId: string | null }
  | { action: "continue"; topicId: string }
  | { action: "reteach"; topicId: string }
  | { action: "remediate"; blockedTopicId: string; remediationTopicId: string; demotePrereq: boolean };

function directHardPrereqs(graph: TopicGraph, id: string): string[] {
  return (graph.prereqsOf.get(id) ?? []).filter((d) => d.strength === "hard").map((d) => d.prerequisiteId);
}

/** Deepest = lowest topo level (closest to foundations); ties broken by id. */
function argDeepest(ids: string[], levels: Map<string, number>): string {
  return [...ids].sort((a, b) => (levels.get(a)! - levels.get(b)!) || a.localeCompare(b))[0]!;
}

/** Descend hard edges to the deepest prerequisite that is not mastered (or is implicated). */
function deepestWeak(graph: TopicGraph, start: string, isWeak: (id: string) => boolean, levels: Map<string, number>): string {
  let current = start;
  for (;;) {
    const weakBelow = directHardPrereqs(graph, current).filter(isWeak);
    if (weakBelow.length === 0) return current;
    current = argDeepest(weakBelow, levels);
  }
}

export function routeNext(
  graph: TopicGraph, topicId: string, outcome: AssessmentOutcome,
  statusOf: (id: string) => MasteryStatus
): RouteDecision {
  if (outcome.masteryAfter === "mastered") {
    const statuses = new Map<string, MasteryStatus>([...graph.topics.keys()].map((id) => [id, statusOf(id)]));
    statuses.set(topicId, "mastered");
    const next = graphFrontier(graph, [...graph.topics.keys()], statuses)[0] ?? null;
    return { action: "advance", masteredTopicId: topicId, nextTopicId: next };
  }
  const prereqs = directHardPrereqs(graph, topicId);
  const isWeak = (id: string) => statusOf(id) !== "mastered" || outcome.failedConcepts.includes(id);
  const weak = prereqs.filter(isWeak);
  if (weak.length === 0) {
    // Attribution noise (a failedConcepts entry naming a non-prereq) must not suppress reteach:
    // no weak prerequisite means the gap is in the topic itself.
    return outcome.passed ? { action: "continue", topicId } : { action: "reteach", topicId };
  }
  const levels = topoLevels(graph, new Set(graph.topics.keys()));
  const target = deepestWeak(graph, argDeepest(weak, levels), isWeak, levels);
  return {
    action: "remediate",
    blockedTopicId: topicId,
    remediationTopicId: target,
    demotePrereq: statusOf(target) === "mastered"
  };
}
