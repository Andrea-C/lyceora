import type { TopicGraph } from "@lyceora/taxonomy";
import { prerequisiteClosure } from "@lyceora/taxonomy";

export type ProbeLabel = "untested" | "mastered" | "assumedMastered" | "unmastered" | "assumedUnmastered";

export interface DiagnosticState {
  targetTopicIds: string[];
  scopeTopicIds: string[];
  labels: Record<string, ProbeLabel>;
  worklist: string[];
  asked: number;
  softCap: number;
  hardCap: number;
  currentTopicId: string | null;
  askedTopicIds: string[];
}

export interface DiagnosticResult {
  frontier: string[];
  mastered: string[];
  assumedMastered: string[];
  unmastered: string[];
}
export type DiagnosticStep = { kind: "ask"; topicId: string } | { kind: "done"; result: DiagnosticResult };

/** Longest hard-edge path from a source, within scope. Deterministic; memoized per call. */
export function topoLevels(graph: TopicGraph, scope: Set<string>): Map<string, number> {
  const memo = new Map<string, number>();
  const level = (id: string): number => {
    const hit = memo.get(id);
    if (hit !== undefined) return hit;
    memo.set(id, 0); // cycle guard; taxonomy data is validated acyclic upstream
    const hardPrereqs = (graph.prereqsOf.get(id) ?? []).filter((d) => d.strength === "hard" && scope.has(d.prerequisiteId));
    const v = hardPrereqs.length === 0 ? 0 : 1 + Math.max(...hardPrereqs.map((d) => level(d.prerequisiteId)));
    memo.set(id, v);
    return v;
  };
  for (const id of scope) level(id);
  return memo;
}

function sortWorklist(worklist: string[], levels: Map<string, number>): string[] {
  return [...worklist].sort((a, b) => (levels.get(b)! - levels.get(a)!) || a.localeCompare(b));
}

export function initDiagnostic(
  graph: TopicGraph, targetTopicIds: string[], caps: { softCap?: number; hardCap?: number } = {}
): DiagnosticState {
  const scope = prerequisiteClosure(graph, targetTopicIds, { strength: "hard" });
  for (const id of targetTopicIds) scope.add(id);
  const labels: Record<string, ProbeLabel> = {};
  for (const id of scope) labels[id] = "untested";
  const levels = topoLevels(graph, scope);
  return {
    targetTopicIds, scopeTopicIds: [...scope], labels,
    worklist: sortWorklist(targetTopicIds, levels),
    asked: 0, softCap: caps.softCap ?? 20, hardCap: caps.hardCap ?? 25,
    currentTopicId: null, askedTopicIds: []
  };
}

export function runDiagnosticStep(
  graph: TopicGraph, prev: DiagnosticState, answer: { topicId: string; passed: boolean } | null
): { state: DiagnosticState; step: DiagnosticStep } {
  const state: DiagnosticState = {
    ...prev, labels: { ...prev.labels }, worklist: [...prev.worklist], askedTopicIds: [...prev.askedTopicIds]
  };
  const scope = new Set(state.scopeTopicIds);
  const levels = topoLevels(graph, scope);

  if (answer) {
    if (answer.topicId !== state.currentTopicId) throw new Error(`answer for ${answer.topicId}, expected ${state.currentTopicId}`);
    state.asked += 1;
    if (answer.passed) {
      state.labels[answer.topicId] = "mastered";
      for (const a of prerequisiteClosure(graph, [answer.topicId], { strength: "hard" })) {
        if (state.labels[a] === "untested") state.labels[a] = "assumedMastered"; // prune; never overwrite direct evidence
      }
    } else {
      state.labels[answer.topicId] = "unmastered";
      if (state.asked < state.softCap) {
        const direct = (graph.prereqsOf.get(answer.topicId) ?? [])
          .filter((d) => d.strength === "hard" && scope.has(d.prerequisiteId))
          .map((d) => d.prerequisiteId)
          .filter((p) => state.labels[p] === "untested" && !state.worklist.includes(p));
        // Append direct hard prereqs without re-sorting: keep targets before prerequisites
        state.worklist = [...state.worklist, ...sortWorklist(direct, levels)];
      }
    }
    state.currentTopicId = null;
  }

  while (state.worklist.length > 0 && state.asked < state.hardCap) {
    const next = state.worklist.shift()!;
    if (state.labels[next] !== "untested") continue;
    state.currentTopicId = next;
    state.askedTopicIds.push(next);
    return { state, step: { kind: "ask", topicId: next } };
  }

  // finalize
  const met = (id: string) =>
    (graph.prereqsOf.get(id) ?? [])
      .filter((d) => d.strength === "hard" && scope.has(d.prerequisiteId))
      .every((d) => state.labels[d.prerequisiteId] === "mastered" || state.labels[d.prerequisiteId] === "assumedMastered");

  // Iteratively mark untested topics as assumedUnmastered if they have unmet prereqs or depend on unmastered topics
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of state.scopeTopicIds) {
      if (state.labels[id] === "untested") {
        const isUnmastered = (otherId: string) =>
          state.labels[otherId] === "unmastered" || state.labels[otherId] === "assumedUnmastered";

        // Check if any hard prereq is unmastered
        const hasUnmasteredPrereq = (graph.prereqsOf.get(id) ?? [])
          .filter((d) => d.strength === "hard" && scope.has(d.prerequisiteId))
          .some((d) => isUnmastered(d.prerequisiteId));

        // Check if any topic that depends on this one is unmastered
        const isDependencyOfUnmastered = state.scopeTopicIds.some((other) =>
          (graph.prereqsOf.get(other) ?? []).some((d) => d.strength === "hard" && d.prerequisiteId === id && isUnmastered(other))
        );

        if (hasUnmasteredPrereq || isDependencyOfUnmastered || !met(id)) {
          state.labels[id] = "assumedUnmastered";
          changed = true;
        }
      }
    }
  }

  const has = (l: ProbeLabel) => state.scopeTopicIds.filter((id) => state.labels[id] === l);
  const frontier = state.scopeTopicIds
    .filter((id) => state.labels[id] !== "mastered" && state.labels[id] !== "assumedMastered" && met(id))
    .sort((a, b) => (levels.get(a)! - levels.get(b)!) || a.localeCompare(b));
  return {
    state,
    step: {
      kind: "done",
      result: {
        frontier,
        mastered: has("mastered"),
        assumedMastered: has("assumedMastered"),
        unmastered: [...has("unmastered"), ...has("assumedUnmastered")]
      }
    }
  };
}
