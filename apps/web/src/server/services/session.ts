import type { Db } from "@lyceora/db";
import { evidenceRecord, learningSession, xpEvent, dailyActivity, profile, reviewQueue } from "@lyceora/db";
import { and, eq, sql } from "drizzle-orm";
import type { TopicGraph, Locale } from "@lyceora/taxonomy";
import {
  applyEvidence, composeSessionPlan, routeNext, applyReviewOutcome, enterReviewRotation,
  computeImplicitReviews,
  XP_AMOUNTS, nextStreak,
  type SessionPlan, type SessionItem, type AssessmentOutcome
} from "@lyceora/engine";
import type { Exercise } from "@lyceora/agents";
import * as repo from "../repo";
import { checkAndAwardBadges } from "./badges";

export interface AssessorPort {
  generate(topicId: string, locale: Locale, difficulty: 1 | 2 | 3, count: number): Promise<Exercise[]>;
  grade(exercise: Exercise, answer: string, locale: Locale, opts?: { candidateConcepts?: string[] }): Promise<{ correct: boolean; feedback: string; failedConcepts: string[] }>;
}

export function localToday(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date()); // YYYY-MM-DD
}

/** Stable per-item consumption signature: kind+topicId, plus difficulty when the item kind has
 * one (review/exercise/assessment) — "lesson" items have no difficulty field. Deliberately
 * excludes `reason` (review's due/remediation) — the plan-membership check is about which
 * kind+topicId+difficulty slots exist, not which reason triggered them. */
function itemSignature(kind: SessionItem["kind"], topicId: string, difficulty?: number): string {
  return difficulty === undefined ? `${kind}:${topicId}` : `${kind}:${topicId}:${difficulty}`;
}

/** One consumption key per plan item, in plan order: `${signature}:${ordinal}` where ordinal
 * counts prior items sharing the same signature. This is what lets duplicate plan items (not
 * excluded by composeSessionPlan, though rare in practice) be consumed one at a time, in the
 * order they appear, instead of colliding on a single key. */
function planItemKeys(items: SessionItem[]): string[] {
  const seenCount = new Map<string, number>();
  return items.map((it) => {
    const sig = itemSignature(it.kind, it.topicId, "difficulty" in it ? it.difficulty : undefined);
    const ordinal = seenCount.get(sig) ?? 0;
    seenCount.set(sig, ordinal + 1);
    return `${sig}:${ordinal}`;
  });
}

/** Plan-item keys (in plan order) whose kind+topicId+difficulty matches the submitted item —
 * empty means the item isn't on this session's plan at all (a ConflictError case for the
 * caller), more than one means the plan happens to contain duplicates of this exact slot. */
function matchingPlanKeys(keys: string[], item: SessionItem): string[] {
  const prefix = `${itemSignature(item.kind, item.topicId, "difficulty" in item ? item.difficulty : undefined)}:`;
  return keys.filter((k) => k.startsWith(prefix));
}

export async function startSession(db: Db, graph: TopicGraph, userId: string, profileId: string, targetTopicIds: string[]) {
  const p = await repo.getOwnedProfile(db, userId, profileId);
  const today = localToday(p.timezone);
  const plan: SessionPlan = composeSessionPlan({
    graph, targetTopicIds,
    mastery: await repo.getMasteryMap(db, profileId),
    dueReviews: (await repo.getDueReviews(db, profileId, today)).map((r) => ({
      topicId: r.topicId, intervalRung: r.intervalRung, dueOn: r.dueOn, lapses: r.lapses, suspended: r.suspended
    })),
    dailyXpGoal: p.dailyXpGoal
  });
  const [s] = await db.insert(learningSession).values({ profileId, kind: "daily", planJson: plan }).returning();
  return { sessionId: s!.id, plan };
}

export async function completeActivity(
  db: Db, graph: TopicGraph, assessor: AssessorPort, userId: string,
  args: { profileId: string; sessionId: string; item: SessionItem; servedExerciseId?: string; answer?: string },
  pathTopicIds: string[]
) {
  const p = await repo.getOwnedProfile(db, userId, args.profileId);
  // IMPORTANT: gates every write below keyed by sessionId. Nothing in this function or in
  // awardXp may touch learning_session/xp_event/daily_activity for this sessionId before this.
  // Also the single up-front read of session status + plan/consumedItems state everything below
  // reasons about — a session that isn't "active" (completed/abandoned) is rejected right here.
  const sessionRow = await repo.assertSessionOwnership(db, p.id, args.sessionId);
  const today = localToday(p.timezone);
  const { item } = args;

  // plan-membership + idempotency ledger: a submitted item must match a real (kind, topicId,
  // difficulty-where-applicable) slot in this session's composed plan — this is what closes the
  // "lesson XP for literally any topicId, no plan check, no idempotency at all" hole. The
  // matching key(s) double as this call's candidate idempotency key(s), consumed below only once
  // XP actually gets awarded for that slot.
  const plan = sessionRow.planJson;
  const planKeys = planItemKeys(plan?.items ?? []);
  const consumed = new Set(plan?.consumedItems ?? []);
  const candidateKeys = matchingPlanKeys(planKeys, item);
  if (candidateKeys.length === 0) {
    throw new repo.ConflictError(`item ${item.kind}:${item.topicId} is not part of this session's plan`);
  }
  const unconsumedKey = candidateKeys.find((k) => !consumed.has(k));

  if (item.kind === "lesson") {
    // idempotency: a lesson has no notion of "regrading" — once its plan slot is consumed, every
    // subsequent identical POST is a pure replay and must be rejected outright, not re-awarded.
    if (!unconsumedKey || !(await repo.claimPlanItem(db, args.sessionId, plan!, unconsumedKey))) {
      throw new repo.ConflictError(`lesson ${item.topicId} was already completed for this session`);
    }
    await awardXp(db, args, XP_AMOUNTS.lessonComplete, "lessonComplete", today, p);
    const newBadges = await checkAndAwardBadges(db, graph, pathTopicIds, p.id);
    return { xp: XP_AMOUNTS.lessonComplete, newBadges };
  }

  // defensive: the discriminated union + the route's zod schema already guarantee this, but a
  // non-gradeable kind must never reach the custody claim below.
  if (item.kind !== "assessment" && item.kind !== "review" && item.kind !== "exercise") {
    throw new repo.ConflictError(`item kind ${(item as { kind: string }).kind} is not gradeable`);
  }
  const source = item.kind;
  const candidateConcepts = source === "assessment"
    ? (graph.prereqsOf.get(item.topicId) ?? []).filter((d) => d.strength === "hard").map((d) => d.prerequisiteId)
    : [];

  // server-side custody: claim (consume) the exercise BEFORE grading — an atomic
  // UPDATE...WHERE profile_id = $2 AND consumed_at IS NULL closes the sequential-replay, the
  // concurrent-race, AND the foreign-profile cases in one query (a foreign profileId simply never
  // matches a row to claim, so it's never burned). If a check below then fails, the exercise is
  // still burned (see repo.claimServedExercise's doc comment for that accepted tradeoff).
  const claimed = await repo.claimServedExercise(db, args.servedExerciseId!, p.id);
  if (claimed.sessionId !== args.sessionId || claimed.topicId !== item.topicId) {
    throw new repo.ConflictError(`served exercise ${args.servedExerciseId} does not match this session/topic`);
  }
  // pin difficulty AND item kind (and thus the exercise itself) to what was actually served — the
  // client-supplied item.difficulty/item.kind are only ever used to validate they match, never
  // trusted for the evidence record or the mastery fold. Kind pinning closes the slack where the
  // same topicId+difficulty can appear under more than one item kind in the plan (e.g. an
  // "exercise" and an "assessment" for the same topic at the same difficulty) — without this, a
  // client could fetch under one kind and grade under the other to get that kind's XP/routing.
  if (claimed.difficulty !== item.difficulty) {
    throw new repo.ConflictError(
      `served exercise difficulty (${claimed.difficulty}) does not match the requested item difficulty (${item.difficulty})`
    );
  }
  if (claimed.itemKind !== item.kind) {
    throw new repo.ConflictError(
      `served exercise was fetched for item kind "${claimed.itemKind}", not "${item.kind}"`
    );
  }
  const exercise = claimed.exercise;
  const difficulty = claimed.difficulty as 1 | 2 | 3;

  const graded = await assessor.grade(exercise, args.answer!, p.locale, { candidateConcepts });
  await db.insert(evidenceRecord).values({
    profileId: p.id, topicId: item.topicId, sessionId: args.sessionId, source,
    isCorrect: graded.correct, difficulty, question: exercise.prompt,
    studentAnswer: args.answer, rubricNotes: graded.feedback, promptRef: exercise.id
  });
  const before = await repo.getMasteryOrEmpty(db, p.id, item.topicId);
  const after = applyEvidence(before, [{ source, isCorrect: graded.correct, difficulty, createdAt: new Date() }]);
  await repo.upsertMastery(db, p.id, item.topicId, after);

  let xp = 0;
  if (graded.correct) {
    const amount = source === "assessment" && after.status === "mastered" ? XP_AMOUNTS.assessmentPass
      : source === "review" ? XP_AMOUNTS.reviewComplete : XP_AMOUNTS.exerciseCorrect;
    const reason = source === "assessment" && after.status === "mastered" ? "assessmentPass" as const
      : source === "review" ? "reviewComplete" as const : "exerciseCorrect" as const;
    // XP is awarded only the FIRST time this plan slot is successfully completed. A served
    // exercise can legitimately be re-fetched (up to repo.MAX_SERVED_PER_ITEM) after this slot was
    // already consumed — grading it here still records honest evidence/mastery/feedback, but xp
    // stays 0 rather than paying out twice for the same plan slot.
    if (unconsumedKey && await repo.claimPlanItem(db, args.sessionId, plan!, unconsumedKey)) {
      xp = amount;
      await awardXp(db, args, amount, reason, today, p);
    }
  }

  // review-queue bookkeeping for review items
  if (source === "review") {
    const [row] = await db.select().from(reviewQueue)
      .where(and(eq(reviewQueue.profileId, p.id), eq(reviewQueue.topicId, item.topicId)));
    if (row) {
      const next = applyReviewOutcome(
        { topicId: row.topicId, intervalRung: row.intervalRung, dueOn: row.dueOn, lapses: row.lapses, suspended: row.suspended },
        graded.correct, today,
        // streak INCLUDING this review's evidence — `after` is the post-fold state; keep this call after applyEvidence
        { masteryStreak: after.consecutiveCorrectAtLevel });
      await db.update(reviewQueue).set({
        intervalRung: next.intervalRung, dueOn: next.dueOn, lapses: next.lapses,
        suspended: next.suspended, lastReviewedAt: new Date()
      }).where(eq(reviewQueue.id, row.id));
    }
  }

  // implicit repetition: a correct answer on this topic silently refreshes its DIRECT hard
  // prerequisites' review clocks (credit-only; see packages/engine review.ts for the contract)
  if (graded.correct) {
    const directHard = (graph.prereqsOf.get(item.topicId) ?? [])
      .filter((d) => d.strength === "hard").map((d) => d.prerequisiteId);
    if (directHard.length > 0) {
      const rows = await repo.getReviewRows(db, p.id, directHard);
      const masteryMap = await repo.getMasteryMap(db, p.id);
      const rowOf = new Map(rows.map((r) => [r.topicId,
        { topicId: r.topicId, intervalRung: r.intervalRung, dueOn: r.dueOn, lapses: r.lapses, suspended: r.suspended }]));
      const changed = computeImplicitReviews(
        directHard, (id) => rowOf.get(id), (id) => masteryMap.get(id)?.status ?? "unknown", today);
      for (const c of changed) {
        await db.update(reviewQueue).set({ dueOn: c.dueOn })
          .where(and(eq(reviewQueue.profileId, p.id), eq(reviewQueue.topicId, c.topicId)));
      }
    }
  }

  // routing after assessments
  let routeDecision;
  if (source === "assessment") {
    const outcome: AssessmentOutcome = { passed: graded.correct, masteryAfter: after.status, failedConcepts: graded.failedConcepts };
    const mastery = await repo.getMasteryMap(db, p.id);
    routeDecision = routeNext(graph, item.topicId, outcome,
      (id) => mastery.get(id)?.status ?? "unknown");
    if (routeDecision.action === "advance") {
      const r = enterReviewRotation(item.topicId, today);
      await db.insert(reviewQueue).values({ profileId: p.id, ...r })
        .onConflictDoUpdate({ target: [reviewQueue.profileId, reviewQueue.topicId],
          set: { intervalRung: r.intervalRung, dueOn: r.dueOn, suspended: false } });
    }
    if (routeDecision.action === "remediate" && routeDecision.demotePrereq) {
      // derived evidence makes the demotion auditable through the same fold
      await db.insert(evidenceRecord).values({
        profileId: p.id, topicId: routeDecision.remediationTopicId, sessionId: args.sessionId,
        source: "assessment", isCorrect: false, difficulty, derived: true, promptRef: exercise.id
      });
      const prev = await repo.getMasteryOrEmpty(db, p.id, routeDecision.remediationTopicId);
      await repo.upsertMastery(db, p.id, routeDecision.remediationTopicId,
        applyEvidence(prev, [{ source: "assessment", isCorrect: false, difficulty, createdAt: new Date() }]));
      const [row] = await db.select().from(reviewQueue)
        .where(and(eq(reviewQueue.profileId, p.id), eq(reviewQueue.topicId, routeDecision.remediationTopicId)));
      if (row) {
        const next = applyReviewOutcome(
          { topicId: row.topicId, intervalRung: row.intervalRung, dueOn: row.dueOn, lapses: row.lapses, suspended: row.suspended },
          false, today);
        await db.update(reviewQueue).set({ intervalRung: next.intervalRung, dueOn: next.dueOn, lapses: next.lapses, suspended: next.suspended })
          .where(eq(reviewQueue.id, row.id));
      }
    }
  }
  const newBadges = await checkAndAwardBadges(db, graph, pathTopicIds, p.id);
  return { graded, xp, masteryAfter: after.status, routeDecision, newBadges };
}

async function awardXp(
  db: Db, args: { profileId: string; sessionId: string; item: SessionItem }, amount: number,
  reason: "lessonComplete" | "exerciseCorrect" | "assessmentPass" | "reviewComplete", today: string,
  p: { id: string; dailyXpGoal: number; currentStreak: number; longestStreak: number; lastActiveOn: string | null; timezone: string }
) {
  await db.insert(xpEvent).values({ profileId: p.id, sessionId: args.sessionId, topicId: args.item.topicId, reason, amount });
  await db.update(learningSession).set({ xpEarned: sql`${learningSession.xpEarned} + ${amount}` })
    .where(eq(learningSession.id, args.sessionId));
  await db.insert(dailyActivity)
    .values({ profileId: p.id, activityDate: today, xpEarned: amount, goalXp: p.dailyXpGoal, goalMet: amount >= p.dailyXpGoal })
    .onConflictDoUpdate({ target: [dailyActivity.profileId, dailyActivity.activityDate],
      set: { xpEarned: sql`${dailyActivity.xpEarned} + ${amount}`,
             goalMet: sql`${dailyActivity.xpEarned} + ${amount} >= ${dailyActivity.goalXp}` } });
  const streak = nextStreak({ currentStreak: p.currentStreak, longestStreak: p.longestStreak, lastActiveOn: p.lastActiveOn }, today);
  await db.update(profile).set({ ...streak, lastActiveOn: today }).where(eq(profile.id, p.id));
}
