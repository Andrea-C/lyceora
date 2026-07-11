import { and, eq, lte, desc, isNull, sql } from "drizzle-orm";
import type { Db } from "@lyceora/db";
import { profile, masteryState, evidenceRecord, reviewQueue, enrollment, learningSession, servedExercise } from "@lyceora/db";
import type { MasteryState, SessionPlan } from "@lyceora/engine";
import { EMPTY_MASTERY_STATE } from "@lyceora/engine";
import type { Exercise } from "@lyceora/agents";

export class ForbiddenError extends Error {}
/** State-conflict: the request is well-formed and the caller is who they say they are, but the
 * thing they're asking for doesn't match the current server-side state (wrong session/topic,
 * already consumed, session no longer active). Routes map this to 409. */
export class ConflictError extends Error {}

/** THE tenant gate. Every service path MUST resolve profiles through this. */
export async function getOwnedProfile(db: Db, userId: string, profileId: string) {
  const [p] = await db.select().from(profile)
    .where(and(eq(profile.id, profileId), eq(profile.ownerUserId, userId)));
  if (!p) throw new ForbiddenError(`profile ${profileId} not owned by ${userId}`);
  return p;
}

export async function getMasteryMap(db: Db, profileId: string): Promise<Map<string, MasteryState>> {
  const rows = await db.select().from(masteryState).where(eq(masteryState.profileId, profileId));
  return new Map(rows.map((r) => [r.topicId, {
    status: r.status, consecutiveCorrectAtLevel: r.consecutiveCorrectAtLevel,
    totalCorrect: r.totalCorrect, totalAttempts: r.totalAttempts, lapses: r.lapses,
    masteredAt: r.masteredAt, lastEvidenceAt: r.lastEvidenceAt
  }]));
}

export async function getMasteryOrEmpty(db: Db, profileId: string, topicId: string): Promise<MasteryState> {
  const m = await getMasteryMap(db, profileId);
  return m.get(topicId) ?? EMPTY_MASTERY_STATE;
}

export async function upsertMastery(db: Db, profileId: string, topicId: string, s: MasteryState) {
  await db.insert(masteryState)
    .values({ profileId, topicId, status: s.status, consecutiveCorrectAtLevel: s.consecutiveCorrectAtLevel,
      totalCorrect: s.totalCorrect, totalAttempts: s.totalAttempts, lapses: s.lapses,
      masteredAt: s.masteredAt, lastEvidenceAt: s.lastEvidenceAt })
    .onConflictDoUpdate({ target: [masteryState.profileId, masteryState.topicId],
      set: { status: s.status, consecutiveCorrectAtLevel: s.consecutiveCorrectAtLevel,
        totalCorrect: s.totalCorrect, totalAttempts: s.totalAttempts, lapses: s.lapses,
        masteredAt: s.masteredAt, lastEvidenceAt: s.lastEvidenceAt } });
}

export async function getDueReviews(db: Db, profileId: string, today: string) {
  return db.select().from(reviewQueue)
    .where(and(eq(reviewQueue.profileId, profileId), lte(reviewQueue.dueOn, today), eq(reviewQueue.suspended, false)));
}

export async function getRecentErrors(db: Db, profileId: string, topicId: string, limit = 3): Promise<string[]> {
  const rows = await db.select().from(evidenceRecord)
    .where(and(eq(evidenceRecord.profileId, profileId), eq(evidenceRecord.topicId, topicId), eq(evidenceRecord.isCorrect, false)))
    .orderBy(desc(evidenceRecord.createdAt)).limit(limit);
  return rows.map((r) => r.question ?? r.rubricNotes ?? "").filter(Boolean);
}

export async function getActiveEnrollment(db: Db, profileId: string) {
  const [e] = await db.select().from(enrollment)
    .where(and(eq(enrollment.profileId, profileId), eq(enrollment.status, "active")));
  return e ?? null;
}

/** Idempotent: re-enrolling in a path the profile already has just re-activates it. */
export async function createEnrollment(db: Db, profileId: string, pathId: string) {
  const [e] = await db.insert(enrollment).values({ profileId, pathId })
    .onConflictDoUpdate({ target: [enrollment.profileId, enrollment.pathId], set: { status: "active" } })
    .returning();
  return e!;
}

/**
 * Verifies a learning_session row belongs to the gated profile AND is still active. Every write
 * keyed by a client-supplied sessionId (completeActivity, awardXp, servedExercise creation) MUST
 * go through this first — sessionId alone is not a tenant boundary, and a session that has
 * already ended (completed/abandoned) must never accept further activity (mirrors the same
 * status gate answerDiagnostic already enforces for diagnostic sessions).
 */
export async function assertSessionOwnership(db: Db, profileId: string, sessionId: string) {
  const [row] = await db.select().from(learningSession).where(eq(learningSession.id, sessionId));
  if (!row || row.profileId !== profileId) {
    throw new ForbiddenError(`session ${sessionId} not owned by profile ${profileId}`);
  }
  if (row.status !== "active") {
    throw new ConflictError(`session ${sessionId} is not active (status=${row.status})`);
  }
  return row;
}

/**
 * Optimistic compare-and-swap: appends `key` to `currentPlan.consumedItems` iff the row's
 * plan_json is STILL exactly `currentPlan` (Postgres jsonb structural equality, not a version
 * column) — i.e. nobody else has consumed anything since this call's caller read the row. Returns
 * false when the swap loses the race (a concurrent identical request already recorded this same
 * key, or any other consumption happened first); the caller must treat that as "already
 * consumed", never retry the write itself.
 */
export async function claimPlanItem(
  db: Db, sessionId: string, currentPlan: SessionPlan, key: string
): Promise<boolean> {
  const consumedItems = [...(currentPlan.consumedItems ?? []), key];
  const [row] = await db.update(learningSession)
    .set({ planJson: { ...currentPlan, consumedItems } })
    .where(and(eq(learningSession.id, sessionId), eq(learningSession.planJson, currentPlan)))
    .returning();
  return !!row;
}

/** Product cap, not a DB uniqueness rule: a client re-fetching GET /api/activity/exercise for the
 * same plan slot indefinitely would burn unlimited assessor.generate calls (cost) and, via
 * completeActivity's plan-item consumption, unlimited *graded* attempts. 3 covers "wrong, wrong,
 * right" without letting the endpoint be hammered. */
export const MAX_SERVED_PER_ITEM = 3;

/**
 * Serves a fresh exercise for a plan item, capped at MAX_SERVED_PER_ITEM total servedExercise
 * rows per (sessionId, topicId, difficulty, itemKind) — COUNT-then-insert (itemKind lives inside
 * exerciseJson, not a dedicated column, so the count filters on that jsonb field). Throws
 * ConflictError at the cap; the caller (GET /api/activity/exercise) maps that to 409 via
 * `guarded`.
 */
export async function createServedExerciseCapped(
  db: Db, args: { profileId: string; sessionId: string; topicId: string; difficulty: number; itemKind: ServedItemKind; exercise: Exercise }
) {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(servedExercise)
    .where(and(
      eq(servedExercise.sessionId, args.sessionId),
      eq(servedExercise.topicId, args.topicId),
      eq(servedExercise.difficulty, args.difficulty),
      sql`${servedExercise.exerciseJson} ->> 'itemKind' = ${args.itemKind}`
    ));
  if (count >= MAX_SERVED_PER_ITEM) {
    throw new ConflictError(
      `already served ${MAX_SERVED_PER_ITEM} exercises for ${args.itemKind}:${args.topicId}:${args.difficulty} in session ${args.sessionId}`
    );
  }
  return createServedExercise(db, args);
}

/** The SessionItem kind an exercise was fetched for — distinct from Exercise.kind (mcq/numeric/
 * open). Pinned at serve time so a client can't grade the same served exercise under a different
 * item kind (e.g. fetched for a plain "exercise" item, graded as the higher-stakes "assessment"
 * that happens to share the same topicId+difficulty in the plan). */
export type ServedItemKind = "review" | "exercise" | "assessment";

/** Server-side custody: persist the FULL exercise (incl. correctAnswer/explanation) the moment
 * it's generated, plus the item kind it was fetched for. The client only ever sees the id back,
 * plus a redacted copy for display. No dedicated `kind` column: folded into the existing
 * `exerciseJson` jsonb as `itemKind` alongside the exercise fields, read back at claim time. */
export async function createServedExercise(
  db: Db, args: { profileId: string; sessionId: string; topicId: string; difficulty: number; itemKind: ServedItemKind; exercise: Exercise }
) {
  const [row] = await db.insert(servedExercise).values({
    profileId: args.profileId, sessionId: args.sessionId, topicId: args.topicId, difficulty: args.difficulty,
    exerciseJson: { ...args.exercise, itemKind: args.itemKind } as unknown as Record<string, unknown>
  }).returning();
  return row!;
}

/**
 * Atomically claims a served exercise: consumed_at is set BEFORE grading, not after, via a single
 * `UPDATE ... WHERE consumed_at IS NULL RETURNING *`. Zero rows back (missing id, not owned by
 * this profile, or already consumed) is a clean ConflictError/409 with nothing else having
 * happened — this is what closes a genuine concurrent double-submit, not just a sequential replay
 * (a check-then-act select-then-update pair would leave a race window between the two statements;
 * this doesn't).
 *
 * The claim query also checks `profile_id = $2` — an id for an exercise served to a *different*
 * profile is indistinguishable from "missing or already consumed" and, critically, is never
 * claimed/burned by the attempt. Session/topic/difficulty/itemKind are NOT part of the WHERE
 * clause; the caller (completeActivity) must verify those against the returned row and throw the
 * appropriate ConflictError itself. If that post-claim check fails, the exercise is still burned.
 * Accepted tradeoff: the client just fetches a fresh one from GET /api/activity/exercise; a burned
 * exercise is far cheaper than reopening a race window on the claim itself.
 */
export async function claimServedExercise(
  db: Db, servedExerciseId: string, profileId: string
): Promise<{ sessionId: string; topicId: string; difficulty: number; itemKind: string; exercise: Exercise }> {
  const [row] = await db.update(servedExercise)
    .set({ consumedAt: new Date() })
    .where(and(
      eq(servedExercise.id, servedExerciseId),
      eq(servedExercise.profileId, profileId),
      isNull(servedExercise.consumedAt)
    ))
    .returning();
  if (!row) {
    throw new ConflictError(`served exercise ${servedExerciseId} is not a valid pending exercise for this profile (missing, foreign, or already consumed)`);
  }
  const { itemKind, ...exercise } = row.exerciseJson as unknown as (Exercise & { itemKind: string });
  return { sessionId: row.sessionId, topicId: row.topicId, difficulty: row.difficulty, itemKind, exercise: exercise as Exercise };
}
