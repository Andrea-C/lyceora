import type { TopicGraph } from "@lyceora/taxonomy";
import { frontier as graphFrontier } from "@lyceora/taxonomy";
import type { MasteryState } from "./mastery";
import type { ReviewRow } from "./review";
import { topoLevels } from "./diagnostic";
import { XP_AMOUNTS } from "./xp";

export type SessionItem =
  | { kind: "review"; topicId: string; reason: "due" | "remediation"; difficulty: 1 | 2 | 3 }
  | { kind: "lesson"; topicId: string }
  | { kind: "exercise"; topicId: string; difficulty: 1 | 2 | 3 }
  | { kind: "assessment"; topicId: string; difficulty: 1 | 2 | 3 };

export interface SessionPlan {
  sessionKind: "daily" | "diagnostic";
  items: SessionItem[];
  estimatedXp: number;
  dailyXpGoal: number;
  /** Idempotency ledger: stable keys (`${kind}:${topicId}:${difficulty}:${ordinal}`) of plan
   * items that have already had XP awarded for them. Absent/undefined == none consumed yet.
   * Written by apps/web's completeActivity, never by composeSessionPlan itself. */
  consumedItems?: string[];
}

export interface ComposeInputs {
  graph: TopicGraph;
  targetTopicIds: string[];
  mastery: ReadonlyMap<string, MasteryState>;
  dueReviews: ReviewRow[];
  dailyXpGoal: number;
}

const MAX_DUE_REVIEWS = 6;
const MAX_ITEMS = 12;

function statusMap(mastery: ReadonlyMap<string, MasteryState>) {
  return new Map([...mastery].map(([id, s]) => [id, s.status] as const));
}

/**
 * Full re-teach (lesson + 3 escalating exercises + assessment) when the prior "mastery" was
 * thin evidence (a likely false test-out) or the topic has lapsed repeatedly; otherwise a
 * short block (exercises + assessment at rung difficulty) is enough to confirm re-mastery.
 */
function remediationBlock(topicId: string, state: MasteryState | undefined): SessionItem[] {
  const lapses = state?.lapses ?? 0;
  const totalAttempts = state?.totalAttempts ?? 0;
  const review: SessionItem = { kind: "review", topicId, reason: "remediation", difficulty: 2 };
  if (lapses >= 2 || totalAttempts <= 2) {
    return [
      review,
      { kind: "lesson", topicId },
      { kind: "exercise", topicId, difficulty: 1 },
      { kind: "exercise", topicId, difficulty: 2 },
      { kind: "exercise", topicId, difficulty: 3 },
      { kind: "assessment", topicId, difficulty: 2 }
    ];
  }
  return [
    review,
    { kind: "exercise", topicId, difficulty: 2 },
    { kind: "exercise", topicId, difficulty: 3 },
    { kind: "assessment", topicId, difficulty: 2 }
  ];
}

function newTopicBlock(topicId: string): SessionItem[] {
  return [
    { kind: "lesson", topicId },
    { kind: "exercise", topicId, difficulty: 1 },
    { kind: "exercise", topicId, difficulty: 2 },
    { kind: "exercise", topicId, difficulty: 3 },
    { kind: "assessment", topicId, difficulty: 2 }
  ];
}

export function composeSessionPlan(inputs: ComposeInputs): SessionPlan {
  const { graph, targetTopicIds, mastery, dailyXpGoal } = inputs;
  const statuses = statusMap(mastery);
  const front = graphFrontier(graph, targetTopicIds, statuses);
  const levels = topoLevels(graph, new Set(graph.topics.keys()));
  const byDeepestThenId = (a: string, b: string) => (levels.get(a)! - levels.get(b)!) || a.localeCompare(b);

  // tier 1: ALL needsReview topics (not just ones blocking another topic) — a needsReview path
  // target with no dependents (e.g. a spaced-review failure on a leaf) must still be remediated,
  // never fall through to tier 3 as "new" content. Order: topics that block another topic first
  // (fix foundations before leaves), then dependentless ones; deepest-first within each group,
  // ties by id.
  // Scope to topics actually in this graph: an out-of-path mastery row (e.g. leftover state from
  // a different enrollment/path) must not consume session budget, and topoLevels only has
  // entries for in-graph ids (levels.get(id)! would be NaN otherwise).
  const needsReviewIds = [...mastery]
    .filter(([id, s]) => s.status === "needsReview" && graph.topics.has(id))
    .map(([id]) => id);
  const blocksSomething = (id: string) => (graph.dependentsOf.get(id) ?? []).some((d) => d.strength === "hard");
  const remediation = [
    ...needsReviewIds.filter(blocksSomething).sort(byDeepestThenId),
    ...needsReviewIds.filter((id) => !blocksSomething(id)).sort(byDeepestThenId)
  ];

  // tier 2: due reviews, most overdue first, excluding anything already remediated this session
  const due = inputs.dueReviews
    .filter((r) => !r.suspended && !remediation.includes(r.topicId))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
    .slice(0, MAX_DUE_REVIEWS);

  // tier 3: frontier new content — unknown/inProgress ONLY (needsReview is never "new"),
  // 1 new topic (2 only when tiers 1-2 are empty), excluding anything already scheduled above
  const dueIds = new Set(due.map((r) => r.topicId));
  const newCount = remediation.length === 0 && due.length === 0 ? 2 : 1;
  const newTopics = front
    .filter((id) => {
      const status = statuses.get(id) ?? "unknown";
      return (status === "unknown" || status === "inProgress") && !remediation.includes(id) && !dueIds.has(id);
    })
    .slice(0, newCount);

  // assemble as whole blocks and cap at MAX_ITEMS without ever truncating a block mid-way;
  // the first block is always admitted, even alone.
  const blocks: SessionItem[][] = [];
  for (const topicId of remediation) blocks.push(remediationBlock(topicId, mastery.get(topicId)));
  for (const r of due.slice(0, 2)) blocks.push([{ kind: "review", topicId: r.topicId, reason: "due", difficulty: 2 }]);
  for (const topicId of newTopics) blocks.push(newTopicBlock(topicId));
  for (const r of due.slice(2)) blocks.push([{ kind: "review", topicId: r.topicId, reason: "due", difficulty: 2 }]);

  const items: SessionItem[] = [];
  for (const block of blocks) {
    // break, not skip-and-continue: tier priority order is deliberate, so a later smaller block
    // must never jump ahead of an earlier block that didn't fit.
    if (items.length !== 0 && items.length + block.length > MAX_ITEMS) break;
    items.push(...block);
  }

  const xpOf = (i: SessionItem) =>
    i.kind === "lesson" ? XP_AMOUNTS.lessonComplete
    : i.kind === "exercise" ? XP_AMOUNTS.exerciseCorrect
    : i.kind === "assessment" ? XP_AMOUNTS.assessmentPass
    : XP_AMOUNTS.reviewComplete;
  return {
    sessionKind: "daily",
    items,
    estimatedXp: items.reduce((sum, i) => sum + xpOf(i), 0),
    dailyXpGoal
  };
}
