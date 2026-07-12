import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import {
  profile, masteryState, xpEvent, awardedBadge,
  dailyActivity, learningSession, evidenceRecord
} from "@lyceora/db";
import { getSessionOrRedirect } from "@/lib/session";
import { BADGE_DEFINITIONS } from "@lyceora/engine";
import { getGraph, getPath } from "@/server/content";
import { domainLabel } from "@/server/domain-labels";
import * as repo from "@/server/repo";
import { localToday } from "@/server/services/session";
import { PathProgress, type DomainProgress } from "@/components/PathProgress";
import { ActivityChart } from "@/components/ActivityChart";

const RECENT_BADGES_LIMIT = 5;
const REVIEW_TOGETHER_LIMIT = 5;
const ACTIVITY_WINDOW_DAYS = 14;

export default async function ParentPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getSessionOrRedirect(locale);
  const t = await getTranslations("parent");
  const tDomains = await getTranslations("domains");
  const graph = getGraph();

  const profiles = await db.select().from(profile).where(eq(profile.ownerUserId, session.user.id));

  // Week boundary simplification (Task 11): Monday 00:00 UTC of the current ISO week, not Monday
  // 00:00 in each profile's own timezone — a single shared boundary for every child is good enough
  // for a summary widget where "this week" doesn't need to be per-profile timezone-exact.
  const mondayThisWeek = mondayOfIsoWeekUtc(new Date());
  const mondayLastWeek = new Date(mondayThisWeek);
  mondayLastWeek.setUTCDate(mondayLastWeek.getUTCDate() - 7);

  const children = await Promise.all(
    profiles.map(async (p) => {
      const masteryRows = await db.select().from(masteryState)
        .where(eq(masteryState.profileId, p.id))
        .orderBy(desc(masteryState.updatedAt));
      const counts = { mastered: 0, inProgress: 0, needsReview: 0 };
      for (const row of masteryRows) {
        if (row.status === "mastered") counts.mastered += 1;
        else if (row.status === "inProgress") counts.inProgress += 1;
        else if (row.status === "needsReview") counts.needsReview += 1;
      }
      const needsReviewTopics = masteryRows
        .filter((r) => r.status === "needsReview")
        .slice(0, REVIEW_TOGETHER_LIMIT)
        .map((r) => ({
          topicId: r.topicId,
          name: graph.topics.get(r.topicId)?.name[locale as "it" | "en"] ?? r.topicId
        }));
      const masteredThisWeek = masteryRows.filter(
        (r) => r.masteredAt !== null && r.masteredAt >= mondayThisWeek
      ).length;

      const [xpRow] = await db
        .select({ total: sql<number>`coalesce(sum(${xpEvent.amount}), 0)` })
        .from(xpEvent)
        .where(eq(xpEvent.profileId, p.id));
      const recentBadges = await db.select().from(awardedBadge)
        .where(eq(awardedBadge.profileId, p.id))
        .orderBy(desc(awardedBadge.awardedAt))
        .limit(RECENT_BADGES_LIMIT);

      // Domain bars: only for children with an active enrollment — an unenrolled child has no
      // target topic list to bucket by domain, so the section is skipped entirely (empty array).
      let domains: DomainProgress[] = [];
      const enrollment = await repo.getActiveEnrollment(db, p.id);
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
        domains = [...domainTotals.entries()].map(([domain, v]) => ({ domain: domainLabel(domain, tDomains), ...v }));
      }

      // 14-day activity chart — daily_activity rows for the last 14 local dates, zero-filled where
      // no row exists (a day with no session at all).
      const today = localToday(p.timezone);
      const windowDates = lastNLocalDates(today, ACTIVITY_WINDOW_DAYS);
      const activityRows = await db.select().from(dailyActivity)
        .where(and(eq(dailyActivity.profileId, p.id), gte(dailyActivity.activityDate, windowDates[0]!)));
      const activityByDate = new Map(activityRows.map((r) => [r.activityDate, r]));
      const activityDays = windowDates.map((date) => {
        const row = activityByDate.get(date);
        return { date, xp: row?.xpEarned ?? 0, goal: row?.goalXp ?? p.dailyXpGoal };
      });

      // Weekly summary: this week's XP vs. the 7 days before it (a trend, not just a total),
      // sessions started, topics mastered, and reviews passed — all since Monday 00:00 UTC.
      const [xpThisWeekRow] = await db
        .select({ total: sql<number>`coalesce(sum(${xpEvent.amount}), 0)` })
        .from(xpEvent)
        .where(and(eq(xpEvent.profileId, p.id), gte(xpEvent.createdAt, mondayThisWeek)));
      const [xpLastWeekRow] = await db
        .select({ total: sql<number>`coalesce(sum(${xpEvent.amount}), 0)` })
        .from(xpEvent)
        .where(and(
          eq(xpEvent.profileId, p.id),
          gte(xpEvent.createdAt, mondayLastWeek),
          lt(xpEvent.createdAt, mondayThisWeek)
        ));
      const [{ count: sessionsThisWeek }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(learningSession)
        .where(and(eq(learningSession.profileId, p.id), gte(learningSession.startedAt, mondayThisWeek)));
      const [{ count: reviewsThisWeek }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(evidenceRecord)
        .where(and(
          eq(evidenceRecord.profileId, p.id),
          eq(evidenceRecord.source, "review"),
          eq(evidenceRecord.isCorrect, true),
          gte(evidenceRecord.createdAt, mondayThisWeek)
        ));
      const weekly = {
        xp: Number(xpThisWeekRow?.total ?? 0),
        xpDelta: Number(xpThisWeekRow?.total ?? 0) - Number(xpLastWeekRow?.total ?? 0),
        sessions: sessionsThisWeek,
        mastered: masteredThisWeek,
        reviews: reviewsThisWeek
      };

      return {
        profile: p, counts, totalXp: Number(xpRow?.total ?? 0), recentBadges,
        domains, activityDays, needsReviewTopics, weekly
      };
    })
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <h2 className="text-lg text-zinc-600 dark:text-zinc-400">{t("children")}</h2>

      {children.length === 0 ? (
        <p>{t("noChildren")}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {children.map(({ profile: p, counts, totalXp, recentBadges, domains, activityDays, needsReviewTopics, weekly }) => (
            <li key={p.id} className="rounded-2xl border border-black/[.08] p-5 dark:border-white/[.15]">
              <h3 className="text-xl font-semibold">{p.displayName}</h3>
              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-zinc-600 dark:text-zinc-400">{t("mastered")}</dt>
                  <dd className="text-lg font-semibold">{counts.mastered}</dd>
                </div>
                <div>
                  <dt className="text-zinc-600 dark:text-zinc-400">{t("inProgress")}</dt>
                  <dd className="text-lg font-semibold">{counts.inProgress}</dd>
                </div>
                <div>
                  <dt className="text-zinc-600 dark:text-zinc-400">{t("needsReview")}</dt>
                  <dd className="text-lg font-semibold">{counts.needsReview}</dd>
                </div>
                <div>
                  <dt className="text-zinc-600 dark:text-zinc-400">{t("totalXp")}</dt>
                  <dd className="text-lg font-semibold">{totalXp}</dd>
                </div>
                <div>
                  <dt className="text-zinc-600 dark:text-zinc-400">{t("streak")}</dt>
                  <dd className="text-lg font-semibold">{p.currentStreak}</dd>
                </div>
                <div>
                  <dt className="text-zinc-600 dark:text-zinc-400">{t("lastActive")}</dt>
                  <dd className="text-lg font-semibold">{p.lastActiveOn ?? t("noActivityYet")}</dd>
                </div>
              </dl>
              {recentBadges.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm text-zinc-600 dark:text-zinc-400">{t("recentBadges")}</h4>
                  <ul className="mt-2 flex flex-col gap-1">
                    {recentBadges.map((b) => (
                      <li key={b.id} className="flex items-center justify-between gap-4 text-sm">
                        <span>🏅 {badgeName(b.badgeId, locale)}</span>
                        <span className="text-zinc-600 dark:text-zinc-400">
                          {new Date(b.awardedAt).toLocaleDateString(locale)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {domains.length > 0 && (
                <div className="mt-4">
                  <PathProgress domains={domains} />
                </div>
              )}
              <div className="mt-4">
                <ActivityChart days={activityDays} />
              </div>
              {needsReviewTopics.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("reviewTogether")}</p>
                  <ul className="mt-2 flex flex-col gap-1 text-sm">
                    {needsReviewTopics.map((topic) => (
                      <li key={topic.topicId}>{topic.name}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-4">
                <h4 className="text-sm text-zinc-600 dark:text-zinc-400">{t("thisWeek")}</h4>
                <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-zinc-600 dark:text-zinc-400">{t("weekXp")}</dt>
                    <dd className="text-lg font-semibold">
                      {weekly.xp}
                      <span className={`ml-1 text-sm font-normal ${weekly.xpDelta >= 0 ? "text-green-600 dark:text-green-400" : "text-zinc-500"}`}>
                        {weekly.xpDelta >= 0 ? "▲" : "▼"} {Math.abs(weekly.xpDelta)}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-600 dark:text-zinc-400">{t("weekSessions")}</dt>
                    <dd className="text-lg font-semibold">{weekly.sessions}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-600 dark:text-zinc-400">{t("weekMastered")}</dt>
                    <dd className="text-lg font-semibold">{weekly.mastered}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-600 dark:text-zinc-400">{t("weekReviews")}</dt>
                    <dd className="text-lg font-semibold">{weekly.reviews}</dd>
                  </div>
                </dl>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

/** Falls back to the raw id for any badge id no longer in BADGE_DEFINITIONS (shouldn't happen —
 * defensive against schema drift, never crashes the page). */
function badgeName(badgeId: string, locale: string): string {
  const badge = BADGE_DEFINITIONS.find((b) => b.id === badgeId);
  return badge ? badge.name[locale as "it" | "en"] : badgeId;
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
