import type { Db } from "@lyceora/db";
import { evidenceRecord, learningSession, xpEvent, dailyActivity, profile, reviewQueue } from "@lyceora/db";
import { and, eq, sql } from "drizzle-orm";
import type { TopicGraph, Locale } from "@lyceora/taxonomy";
import {
  applyEvidence, composeSessionPlan, routeNext, applyReviewOutcome, enterReviewRotation,
  XP_AMOUNTS, nextStreak,
  type SessionPlan, type SessionItem, type AssessmentOutcome
} from "@lyceora/engine";
import type { Exercise } from "@lyceora/agents";
import * as repo from "../repo";

export interface AssessorPort {
  generate(topicId: string, locale: Locale, difficulty: 1 | 2 | 3, count: number): Promise<Exercise[]>;
  grade(exercise: Exercise, answer: string, locale: Locale, opts?: { candidateConcepts?: string[] }): Promise<{ correct: boolean; feedback: string; failedConcepts: string[] }>;
}

export function localToday(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date()); // YYYY-MM-DD
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
  args: { profileId: string; sessionId: string; item: SessionItem; servedExerciseId?: string; answer?: string }
) {
  const p = await repo.getOwnedProfile(db, userId, args.profileId);
  // IMPORTANT: gates every write below keyed by sessionId. Nothing in this function or in
  // awardXp may touch learning_session/xp_event/daily_activity for this sessionId before this.
  await repo.assertSessionOwnership(db, p.id, args.sessionId);
  const today = localToday(p.timezone);
  const { item } = args;

  if (item.kind === "lesson") {
    await awardXp(db, args, XP_AMOUNTS.lessonComplete, "lessonComplete", today, p);
    return { xp: XP_AMOUNTS.lessonComplete };
  }

  const source = item.kind === "assessment" ? "assessment" as const
    : item.kind === "review" ? "review" as const : "exercise" as const;
  const candidateConcepts = source === "assessment"
    ? (graph.prereqsOf.get(item.topicId) ?? []).filter((d) => d.strength === "hard").map((d) => d.prerequisiteId)
    : [];

  // server-side custody: grade the exercise this profile/session/topic was actually served,
  // never a client-echoed blob, and mark it single-use so it can't be replayed.
  const { exercise } = await repo.loadServedExerciseForGrading(db, {
    servedExerciseId: args.servedExerciseId!, profileId: p.id, sessionId: args.sessionId, topicId: item.topicId
  });
  const graded = await assessor.grade(exercise, args.answer!, p.locale, { candidateConcepts });
  const difficulty = "difficulty" in item ? item.difficulty : (2 as const);
  await db.insert(evidenceRecord).values({
    profileId: p.id, topicId: item.topicId, sessionId: args.sessionId, source,
    isCorrect: graded.correct, difficulty, question: exercise.prompt,
    studentAnswer: args.answer, rubricNotes: graded.feedback, promptRef: exercise.id
  });
  await repo.consumeServedExercise(db, args.servedExerciseId!);
  const before = await repo.getMasteryOrEmpty(db, p.id, item.topicId);
  const after = applyEvidence(before, [{ source, isCorrect: graded.correct, difficulty, createdAt: new Date() }]);
  await repo.upsertMastery(db, p.id, item.topicId, after);

  let xp = 0;
  if (graded.correct) {
    xp = source === "assessment" && after.status === "mastered" ? XP_AMOUNTS.assessmentPass
      : source === "review" ? XP_AMOUNTS.reviewComplete : XP_AMOUNTS.exerciseCorrect;
    await awardXp(db, args, xp, source === "assessment" && after.status === "mastered" ? "assessmentPass"
      : source === "review" ? "reviewComplete" : "exerciseCorrect", today, p);
  }

  // review-queue bookkeeping for review items
  if (source === "review") {
    const [row] = await db.select().from(reviewQueue)
      .where(and(eq(reviewQueue.profileId, p.id), eq(reviewQueue.topicId, item.topicId)));
    if (row) {
      const next = applyReviewOutcome(
        { topicId: row.topicId, intervalRung: row.intervalRung, dueOn: row.dueOn, lapses: row.lapses, suspended: row.suspended },
        graded.correct, today);
      await db.update(reviewQueue).set({
        intervalRung: next.intervalRung, dueOn: next.dueOn, lapses: next.lapses,
        suspended: next.suspended, lastReviewedAt: new Date()
      }).where(eq(reviewQueue.id, row.id));
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
  return { graded, xp, masteryAfter: after.status, routeDecision };
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
