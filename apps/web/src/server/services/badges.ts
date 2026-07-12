import type { Db } from "@lyceora/db";
import { awardedBadge, xpEvent, profile, masteryState, evidenceRecord, reviewQueue, dailyActivity, learningSession } from "@lyceora/db";
import { and, eq, sql, isNotNull, gte } from "drizzle-orm";
import type { TopicGraph } from "@lyceora/taxonomy";
import { evaluateBadges, type BadgeSnapshot } from "@lyceora/engine";

/** Assembles the snapshot from existing tables and inserts new awards idempotently.
 * pathTopicIds scopes domain-completion to the enrolled path (not the whole graph). */
export async function checkAndAwardBadges(
  db: Db, graph: TopicGraph, pathTopicIds: string[], profileId: string
): Promise<string[]> {
  const [p] = await db.select().from(profile).where(eq(profile.id, profileId));
  if (!p) return [];
  const [xp] = await db.select({ total: sql<number>`coalesce(sum(${xpEvent.amount}), 0)` })
    .from(xpEvent).where(eq(xpEvent.profileId, profileId));
  const mastery = await db.select().from(masteryState).where(eq(masteryState.profileId, profileId));
  const masteredSet = new Set(mastery.filter((m) => m.status === "mastered").map((m) => m.topicId));

  const byDomain = new Map<string, string[]>();
  for (const id of pathTopicIds) {
    const t = graph.topics.get(id);
    if (!t) continue;
    (byDomain.get(t.domain) ?? byDomain.set(t.domain, []).get(t.domain)!).push(id);
  }
  const domainsCompleted = [...byDomain.values()].filter((ids) => ids.every((id) => masteredSet.has(id))).length;

  const [reviews] = await db.select({ n: sql<number>`count(*)` }).from(evidenceRecord)
    .where(and(eq(evidenceRecord.profileId, profileId), eq(evidenceRecord.source, "review"), eq(evidenceRecord.isCorrect, true)));
  const [comeback] = await db.select({ n: sql<number>`count(*)` }).from(reviewQueue)
    .where(and(eq(reviewQueue.profileId, profileId), gte(reviewQueue.lapses, 1),
      eq(reviewQueue.suspended, false), gte(reviewQueue.intervalRung, 1), isNotNull(reviewQueue.lastReviewedAt)));
  const [diag] = await db.select({ n: sql<number>`count(*)` }).from(learningSession)
    .where(and(eq(learningSession.profileId, profileId), eq(learningSession.kind, "diagnostic"), eq(learningSession.status, "completed")));
  const [goals] = await db.select({ n: sql<number>`count(*)` }).from(dailyActivity)
    .where(and(eq(dailyActivity.profileId, profileId), eq(dailyActivity.goalMet, true)));

  const snapshot: BadgeSnapshot = {
    totalXp: Number(xp?.total ?? 0), currentStreak: p.currentStreak, masteredCount: masteredSet.size,
    domainsCompleted, reviewsPassedTotal: Number(reviews?.n ?? 0),
    cameBackAfterLapse: Number(comeback?.n ?? 0) > 0, diagnosticCompleted: Number(diag?.n ?? 0) > 0,
    goalMetDays: Number(goals?.n ?? 0)
  };
  const earned = new Set((await db.select().from(awardedBadge).where(eq(awardedBadge.profileId, profileId))).map((b) => b.badgeId));
  const fresh = evaluateBadges(snapshot, earned);
  if (fresh.length === 0) return [];
  const inserted = await db.insert(awardedBadge)
    .values(fresh.map((badgeId) => ({ profileId, badgeId })))
    .onConflictDoNothing().returning({ badgeId: awardedBadge.badgeId });
  return inserted.map((r) => r.badgeId); // only what THIS call actually inserted (races collapse to one winner)
}
