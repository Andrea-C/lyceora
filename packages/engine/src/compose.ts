import type { TopicGraph } from "@lyceora/taxonomy";
import { frontier as graphFrontier } from "@lyceora/taxonomy";
import type { MasteryState } from "./mastery.js";
import type { ReviewRow } from "./review.js";
import { XP_AMOUNTS } from "./xp.js";

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

export function composeSessionPlan(inputs: ComposeInputs): SessionPlan {
  const { graph, targetTopicIds, mastery, dailyXpGoal } = inputs;
  const statuses = statusMap(mastery);
  const front = graphFrontier(graph, targetTopicIds, statuses);

  // tier 1: needsReview topics that gate a frontier-adjacent topic (deepest first = fix foundations)
  const blockedBy = (id: string) =>
    (graph.prereqsOf.get(id) ?? []).some((d) => d.strength === "hard" && statuses.get(d.prerequisiteId) === "needsReview");
  const blockedTopics = [...graph.topics.keys()].filter(blockedBy);
  const remediation = [...new Set(
    blockedTopics.flatMap((id) =>
      (graph.prereqsOf.get(id) ?? [])
        .filter((d) => d.strength === "hard" && statuses.get(d.prerequisiteId) === "needsReview")
        .map((d) => d.prerequisiteId)
    )
  )].sort();

  // tier 2: due reviews, most overdue first, excluding anything already remediated this session
  const due = inputs.dueReviews
    .filter((r) => !r.suspended && !remediation.includes(r.topicId))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
    .slice(0, MAX_DUE_REVIEWS);

  // tier 3: frontier new content — 1 new topic (2 only when tiers 1-2 are empty)
  const newCount = remediation.length === 0 && due.length === 0 ? 2 : 1;
  const newTopics = front.filter((id) => !remediation.includes(id)).slice(0, newCount);

  const items: SessionItem[] = [];
  for (const topicId of remediation) {
    const st = mastery.get(topicId);
    items.push({ kind: "review", topicId, reason: "remediation", difficulty: 2 });
    items.push({ kind: "lesson", topicId });
    items.push({ kind: "exercise", topicId, difficulty: st && st.lapses >= 2 ? 1 : 2 });
    items.push({ kind: "exercise", topicId, difficulty: 2 });
    items.push({ kind: "assessment", topicId, difficulty: 2 });
  }
  for (const r of due.slice(0, 2)) items.push({ kind: "review", topicId: r.topicId, reason: "due", difficulty: 2 });
  for (const topicId of newTopics) {
    items.push({ kind: "lesson", topicId });
    items.push({ kind: "exercise", topicId, difficulty: 1 });
    items.push({ kind: "exercise", topicId, difficulty: 2 });
    items.push({ kind: "exercise", topicId, difficulty: 3 });
    items.push({ kind: "assessment", topicId, difficulty: 2 });
  }
  for (const r of due.slice(2)) items.push({ kind: "review", topicId: r.topicId, reason: "due", difficulty: 2 });

  const capped = items.slice(0, MAX_ITEMS);
  const xpOf = (i: SessionItem) =>
    i.kind === "lesson" ? XP_AMOUNTS.lessonComplete
    : i.kind === "exercise" ? XP_AMOUNTS.exerciseCorrect
    : i.kind === "assessment" ? XP_AMOUNTS.assessmentPass
    : XP_AMOUNTS.reviewComplete;
  return {
    sessionKind: "daily",
    items: capped,
    estimatedXp: capped.reduce((sum, i) => sum + xpOf(i), 0),
    dailyXpGoal
  };
}
