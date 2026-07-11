import { and, eq, lte, desc, isNull } from "drizzle-orm";
import type { Db } from "@lyceora/db";
import { profile, masteryState, evidenceRecord, reviewQueue, enrollment, learningSession, servedExercise } from "@lyceora/db";
import type { MasteryState } from "@lyceora/engine";
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
 * Verifies a learning_session row belongs to the gated profile. Every write keyed by a
 * client-supplied sessionId (completeActivity, awardXp, servedExercise creation) MUST go through
 * this first — sessionId alone is not a tenant boundary.
 */
export async function assertSessionOwnership(db: Db, profileId: string, sessionId: string) {
  const [row] = await db.select().from(learningSession).where(eq(learningSession.id, sessionId));
  if (!row || row.profileId !== profileId) {
    throw new ForbiddenError(`session ${sessionId} not owned by profile ${profileId}`);
  }
  return row;
}

/** Server-side custody: persist the FULL exercise (incl. correctAnswer/explanation) the moment
 * it's generated. The client only ever sees the id back, plus a redacted copy for display. */
export async function createServedExercise(
  db: Db, args: { profileId: string; sessionId: string; topicId: string; difficulty: number; exercise: Exercise }
) {
  const [row] = await db.insert(servedExercise).values({
    profileId: args.profileId, sessionId: args.sessionId, topicId: args.topicId, difficulty: args.difficulty,
    exerciseJson: args.exercise as unknown as Record<string, unknown>
  }).returning();
  return row!;
}

/**
 * Atomically claims a served exercise: consumed_at is set BEFORE grading, not after, via a single
 * `UPDATE ... WHERE consumed_at IS NULL RETURNING *`. Zero rows back (missing id, or already
 * consumed) is a clean ConflictError/409 with nothing else having happened — this is what closes
 * a genuine concurrent double-submit, not just a sequential replay (a check-then-act
 * select-then-update pair would leave a race window between the two statements; this doesn't).
 *
 * The claim query only checks `id` + `consumed_at IS NULL` — it does NOT check
 * profile/session/topic/difficulty. The caller (completeActivity) must verify all of those
 * against the returned row and throw the appropriate ForbiddenError/ConflictError itself. If that
 * post-claim check fails, the exercise is still burned. Accepted tradeoff: the client just fetches
 * a fresh one from GET /api/activity/exercise; a burned exercise is far cheaper than reopening a
 * race window on the claim itself.
 */
export async function claimServedExercise(
  db: Db, servedExerciseId: string
): Promise<{ profileId: string; sessionId: string; topicId: string; difficulty: number; exercise: Exercise }> {
  const [row] = await db.update(servedExercise)
    .set({ consumedAt: new Date() })
    .where(and(eq(servedExercise.id, servedExerciseId), isNull(servedExercise.consumedAt)))
    .returning();
  if (!row) {
    throw new ConflictError(`served exercise ${servedExerciseId} is not a valid pending exercise (missing or already consumed)`);
  }
  return {
    profileId: row.profileId, sessionId: row.sessionId, topicId: row.topicId,
    difficulty: row.difficulty, exercise: row.exerciseJson as unknown as Exercise
  };
}
