import type { TopicGraph, MasteryStatus } from "@lyceora/taxonomy";
import { frontier as graphFrontier } from "@lyceora/taxonomy";

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

/** Descend hard edges to the deepest prerequisite that is not mastered (or is implicated). */
function deepestWeak(graph: TopicGraph, start: string, isWeak: (id: string) => boolean): string {
  let current = start;
  for (;;) {
    const weakBelow = directHardPrereqs(graph, current).filter(isWeak).sort();
    if (weakBelow.length === 0) return current;
    current = weakBelow[0]!;
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
    return outcome.passed
      ? { action: "continue", topicId }
      : outcome.failedConcepts.length === 0 && outcome.masteryAfter === "inProgress" && prereqsAllMastered(prereqs, statusOf)
        ? { action: "reteach", topicId }
        : { action: "continue", topicId };
  }
  const target = deepestWeak(graph, weak.sort()[0]!, isWeak);
  return {
    action: "remediate",
    blockedTopicId: topicId,
    remediationTopicId: target,
    demotePrereq: statusOf(target) === "mastered"
  };
}

function prereqsAllMastered(prereqs: string[], statusOf: (id: string) => MasteryStatus): boolean {
  return prereqs.every((p) => statusOf(p) === "mastered");
}
