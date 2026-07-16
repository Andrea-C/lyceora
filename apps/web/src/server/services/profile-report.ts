import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { Db } from "@lyceora/db";
import {
  profile, masteryState, xpEvent, awardedBadge,
  dailyActivity, learningSession, evidenceRecord
} from "@lyceora/db";
import type { TopicGraph, Locale } from "@lyceora/taxonomy";
import { getPath } from "../content";
import * as repo from "../repo";
import { localToday } from "./session";

const RECENT_BADGES_LIMIT = 5;
const REVIEW_TOGETHER_LIMIT = 5;
const ACTIVITY_WINDOW_DAYS = 14;

export interface ProfileReportData {
  displayName: string;
  domains: { domain: string; mastered: number; total: number }[];
  days: { date: string; xp: number; goal: number }[];
  reviewTogether: string[];
  week: { xp: number; xpDelta: number; sessions: number; mastered: number; reviews: number };
  recentBadges: { badgeId: string; awardedAt: Date }[];
}

/** Assembles one profile's parent/admin progress report: domain bars (scoped to the enrolled
 * path, skipped entirely when unenrolled), a 14-day zero-filled activity chart, this-week vs.
 * last-week summary counters, up to 5 needs-review topic names, and up to 5 recent badge awards.
 * Shared by the parent page (per-child) and the admin drill-in (single profile). */
export async function getProfileReport(
  db: Db, graph: TopicGraph, profileId: string, locale: Locale
): Promise<ProfileReportData> {
  const [p] = await db.select().from(profile).where(eq(profile.id, profileId));
  if (!p) throw new Error(`Unknown profile ${profileId}`);

  // Week boundary simplification (Task 11): Monday 00:00 UTC of the current ISO week, not Monday
  // 00:00 in each profile's own timezone — a single shared boundary for every child is good enough
  // for a summary widget where "this week" doesn't need to be per-profile timezone-exact.
  const mondayThisWeek = mondayOfIsoWeekUtc(new Date());
  const mondayLastWeek = new Date(mondayThisWeek);
  mondayLastWeek.setUTCDate(mondayLastWeek.getUTCDate() - 7);

  const masteryRows = await db.select().from(masteryState)
    .where(eq(masteryState.profileId, profileId))
    .orderBy(desc(masteryState.updatedAt));
  const needsReviewTopics = masteryRows
    .filter((r) => r.status === "needsReview")
    .slice(0, REVIEW_TOGETHER_LIMIT)
    .map((r) => graph.topics.get(r.topicId)?.name[locale] ?? r.topicId);
  const masteredThisWeek = masteryRows.filter(
    (r) => r.masteredAt !== null && r.masteredAt >= mondayThisWeek
  ).length;

  const recentBadgeRows = await db.select().from(awardedBadge)
    .where(eq(awardedBadge.profileId, profileId))
    .orderBy(desc(awardedBadge.awardedAt))
    .limit(RECENT_BADGES_LIMIT);
  const recentBadges = recentBadgeRows.map((b) => ({ badgeId: b.badgeId, awardedAt: b.awardedAt }));

  // Domain bars: only for children with an active enrollment — an unenrolled child has no
  // target topic list to bucket by domain, so the section is skipped entirely (empty array).
  let domains: { domain: string; mastered: number; total: number }[] = [];
  const enrollment = await repo.getActiveEnrollment(db, profileId);
  if (enrollment) {
    const path = getPath(enrollment.pathId);
    const masteryByTopic = new Map(masteryRows.map((r) => [r.topicId, r]));
    const domainTotals = new Map<string, { mastered: number; total: number }>();
    for (const topicId of path.targetTopicIds) {
      const topic = graph.topics.get(topicId);
      if (!topic) continue;
      const bucket = domainTotals.get(topic.domain) ?? { mastered: 0, total: 0 };
      bucket.total += 1;
      if (masteryByTopic.get(topicId)?.status === "mastered") bucket.mastered += 1;
      domainTotals.set(topic.domain, bucket);
    }
    // Domain labels are translated at render time (ProfileReport component) via domainLabel —
    // keeping this service free of next-intl/server also keeps it directly unit-testable (no
    // "react-server" module condition needed outside a real Next.js request).
    domains = [...domainTotals.entries()].map(([domain, v]) => ({ domain, ...v }));
  }

  // 14-day activity chart — daily_activity rows for the last 14 local dates, zero-filled where
  // no row exists (a day with no session at all).
  const today = localToday(p.timezone);
  const windowDates = lastNLocalDates(today, ACTIVITY_WINDOW_DAYS);
  const activityRows = await db.select().from(dailyActivity)
    .where(and(eq(dailyActivity.profileId, profileId), gte(dailyActivity.activityDate, windowDates[0]!)));
  const activityByDate = new Map(activityRows.map((r) => [r.activityDate, r]));
  const days = windowDates.map((date) => {
    const row = activityByDate.get(date);
    return { date, xp: row?.xpEarned ?? 0, goal: row?.goalXp ?? p.dailyXpGoal };
  });

  // Weekly summary: this week's XP vs. the 7 days before it (a trend, not just a total),
  // sessions started, topics mastered, and reviews passed — all since Monday 00:00 UTC.
  const [xpThisWeekRow] = await db
    .select({ total: sql<number>`coalesce(sum(${xpEvent.amount}), 0)` })
    .from(xpEvent)
    .where(and(eq(xpEvent.profileId, profileId), gte(xpEvent.createdAt, mondayThisWeek)));
  const [xpLastWeekRow] = await db
    .select({ total: sql<number>`coalesce(sum(${xpEvent.amount}), 0)` })
    .from(xpEvent)
    .where(and(
      eq(xpEvent.profileId, profileId),
      gte(xpEvent.createdAt, mondayLastWeek),
      lt(xpEvent.createdAt, mondayThisWeek)
    ));
  const [{ count: sessionsThisWeek }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(learningSession)
    .where(and(eq(learningSession.profileId, profileId), gte(learningSession.startedAt, mondayThisWeek)));
  const [{ count: reviewsThisWeek }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(evidenceRecord)
    .where(and(
      eq(evidenceRecord.profileId, profileId),
      eq(evidenceRecord.source, "review"),
      eq(evidenceRecord.isCorrect, true),
      gte(evidenceRecord.createdAt, mondayThisWeek)
    ));
  const week = {
    xp: Number(xpThisWeekRow?.total ?? 0),
    xpDelta: Number(xpThisWeekRow?.total ?? 0) - Number(xpLastWeekRow?.total ?? 0),
    sessions: sessionsThisWeek,
    mastered: masteredThisWeek,
    reviews: reviewsThisWeek
  };

  return { displayName: p.displayName, domains, days, reviewTogether: needsReviewTopics, week, recentBadges };
}

/** Monday 00:00 UTC of the ISO week containing `now`. Simplification (Task 11): a single UTC week
 * boundary shared by every profile, rather than Monday 00:00 in each profile's own timezone — good
 * enough for a summary widget where "this week" doesn't need to be per-profile timezone-exact. */
function mondayOfIsoWeekUtc(now: Date): Date {
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = monday.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  monday.setUTCDate(monday.getUTCDate() - daysSinceMonday);
  return monday;
}

/** The `n` local calendar dates (YYYY-MM-DD) ending at and including `todayIso`, oldest first. */
function lastNLocalDates(todayIso: string, n: number): string[] {
  const base = new Date(`${todayIso}T00:00:00Z`);
  const dates: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}
