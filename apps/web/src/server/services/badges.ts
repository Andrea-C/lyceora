import type { Db } from "@lyceora/db";
import { awardedBadge, xpEvent, profile, masteryState, evidenceRecord, dailyActivity, learningSession } from "@lyceora/db";
import { and, eq, sql } from "drizzle-orm";
import type { TopicGraph } from "@lyceora/taxonomy";
import { evaluateBadges, type BadgeSnapshot } from "@lyceora/engine";

/** Assembles the snapshot from existing tables and inserts new awards idempotently.
 * pathTopicIds scopes domain-completion to the enrolled path (not the whole graph).
 * `events` carries call-site-local facts that can't be reconstructed from row state alone —
 * currently just cameBackAfterLapse (a passed review on a topic whose PRE-update lapses >= 1;
 * see session.ts's review-bookkeeping branch, the only place that knows this at the moment it's
 * true). A row-state proxy for this was tried and rejected: a FAILED review at rung >= 2 leaves
 * behind the exact same reviewQueue shape (lapses >= 1, suspended false, intervalRung >= 1,
 * lastReviewedAt set), so querying reviewQueue here would award rimonta on a wrong answer. */
export async function checkAndAwardBadges(
  db: Db, graph: TopicGraph, pathTopicIds: string[], profileId: string,
  events?: { cameBackAfterLapse?: boolean }
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
  const [diag] = await db.select({ n: sql<number>`count(*)` }).from(learningSession)
    .where(and(eq(learningSession.profileId, profileId), eq(learningSession.kind, "diagnostic"), eq(learningSession.status, "completed")));
  const [goals] = await db.select({ n: sql<number>`count(*)` }).from(dailyActivity)
    .where(and(eq(dailyActivity.profileId, profileId), eq(dailyActivity.goalMet, true)));

  const snapshot: BadgeSnapshot = {
    totalXp: Number(xp?.total ?? 0), currentStreak: p.currentStreak, masteredCount: masteredSet.size,
    domainsCompleted, reviewsPassedTotal: Number(reviews?.n ?? 0),
    cameBackAfterLapse: events?.cameBackAfterLapse ?? false, diagnosticCompleted: Number(diag?.n ?? 0) > 0,
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
