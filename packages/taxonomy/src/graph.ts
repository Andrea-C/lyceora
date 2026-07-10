import type { Topic, Dependency } from "./types.js";

export type MasteryStatus = "unknown" | "inProgress" | "mastered" | "needsReview";
export type MasteryMap = ReadonlyMap<string, MasteryStatus>;

export interface TopicGraph {
  topics: Map<string, Topic>;
  prereqsOf: Map<string, Dependency[]>;
  dependentsOf: Map<string, Dependency[]>;
}

export class TaxonomyCycleError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "TaxonomyCycleError";
  }
}

export function buildGraph(topics: Topic[], deps: Dependency[]): TopicGraph {
  const g: TopicGraph = { topics: new Map(), prereqsOf: new Map(), dependentsOf: new Map() };
  for (const t of topics) g.topics.set(t.id, t);
  for (const d of deps) {
    push(g.prereqsOf, d.topicId, d);
    push(g.dependentsOf, d.prerequisiteId, d);
  }
  return g;
}
function push(m: Map<string, Dependency[]>, k: string, d: Dependency) {
  const arr = m.get(k) ?? [];
  arr.push(d);
  m.set(k, arr);
}

export function prerequisiteClosure(
  graph: TopicGraph, ids: string[], opts: { strength?: "hard" | "all" } = {}
): Set<string> {
  const strength = opts.strength ?? "all";
  const seen = new Set<string>();
  const stack = [...ids];
  while (stack.length) {
    const id = stack.pop()!;
    for (const d of graph.prereqsOf.get(id) ?? []) {
      if (strength === "hard" && d.strength !== "hard") continue;
      if (!seen.has(d.prerequisiteId)) {
        seen.add(d.prerequisiteId);
        stack.push(d.prerequisiteId);
      }
    }
  }
  for (const id of ids) seen.delete(id);
  return seen;
}

export function topoOrder(graph: TopicGraph, ids: Set<string>): string[] {
  const inDegree = new Map<string, number>();
  for (const id of ids) {
    const n = (graph.prereqsOf.get(id) ?? []).filter((d) => ids.has(d.prerequisiteId)).length;
    inDegree.set(id, n);
  }
  const ready = [...ids].filter((id) => inDegree.get(id) === 0).sort();
  const out: string[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    out.push(id);
    for (const d of graph.dependentsOf.get(id) ?? []) {
      if (!ids.has(d.topicId)) continue;
      const n = inDegree.get(d.topicId)! - 1;
      inDegree.set(d.topicId, n);
      if (n === 0) {
        ready.push(d.topicId);
        ready.sort();
      }
    }
  }
  if (out.length !== ids.size) {
    const resolved = new Set(out);
    const residual = new Set([...ids].filter((i) => !resolved.has(i)));
    const cycle = findCycle(graph, residual);
    throw new TaxonomyCycleError(`cycle: ${cycle.join(" -> ")}`);
  }
  return out;
}

// Given a set of nodes that never reached in-degree 0 (a superset of any real
// cycle — it also includes nodes that merely depend, transitively, on a cycle),
// walk prerequisite edges within that set from a deterministic start node until
// a node repeats, then report only the repeated segment.
function findCycle(graph: TopicGraph, residual: Set<string>): string[] {
  const start = [...residual].sort()[0]!;
  const path: string[] = [start];
  const visited = new Set<string>([start]);
  let current = start;
  for (;;) {
    const next = (graph.prereqsOf.get(current) ?? [])
      .map((d) => d.prerequisiteId)
      .filter((id) => residual.has(id))
      .sort()[0];
    if (next === undefined) return path;
    if (visited.has(next)) return [...path.slice(path.indexOf(next)), next];
    path.push(next);
    visited.add(next);
    current = next;
  }
}

export function assertAcyclic(graph: TopicGraph): void {
  topoOrder(graph, new Set(graph.topics.keys()));
}

export function frontier(graph: TopicGraph, targetIds: string[], mastery: MasteryMap): string[] {
  const scope = prerequisiteClosure(graph, targetIds, { strength: "all" });
  for (const id of targetIds) scope.add(id);
  const eligible = [...scope].filter((id) => {
    if (mastery.get(id) === "mastered") return false;
    const hardPrereqs = (graph.prereqsOf.get(id) ?? []).filter((d) => d.strength === "hard" && scope.has(d.prerequisiteId));
    return hardPrereqs.every((d) => mastery.get(d.prerequisiteId) === "mastered");
  });
  const order = topoOrder(graph, scope);
  const rank = new Map(order.map((id, i) => [id, i]));
  return eligible.sort((a, b) => rank.get(a)! - rank.get(b)!);
}
