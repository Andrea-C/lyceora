import { and, eq, lte, desc } from "drizzle-orm";
import type { Db } from "@lyceora/db";
import { profile, masteryState, evidenceRecord, reviewQueue, enrollment } from "@lyceora/db";
import type { MasteryState } from "@lyceora/engine";
import { EMPTY_MASTERY_STATE } from "@lyceora/engine";

export class ForbiddenError extends Error {}

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
