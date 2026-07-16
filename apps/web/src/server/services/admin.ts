import type { Db } from "@lyceora/db";
import { user, profile, learningSession, masteryState, xpEvent, dailyActivity } from "@lyceora/db";
import { and, eq, gte, sql } from "drizzle-orm";

export interface AdminDashboard {
  counters: { users: number; profiles: number; sessions7d: number; activeProfiles7d: number };
  users: {
    id: string;
    email: string;
    role: string | null;
    createdAt: Date;
    profiles: {
      id: string;
      displayName: string;
      diagnosticDone: boolean;
      mastered: number;
      totalXp: number;
      streak: number;
      lastActiveOn: string | null;
    }[];
  }[];
}

/**
 * Admin overview: one query per aggregate, looped per user/profile — fine at this scale
 * (small admin-only page, not a hot path). sessions7d / activeProfiles7d window on the
 * last 7 days; activeProfiles7d counts distinct profiles with a daily_activity row in
 * that window (dates as YYYY-MM-DD strings, matching the column's local-date semantics).
 */
export async function getAdminDashboard(db: Db): Promise<AdminDashboard> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const sevenDaysAgoDate = sevenDaysAgo.toISOString().slice(0, 10);

  const [{ n: usersCount }] = await db.select({ n: sql<number>`count(*)` }).from(user);
  const [{ n: profilesCount }] = await db.select({ n: sql<number>`count(*)` }).from(profile);
  const [{ n: sessions7d }] = await db.select({ n: sql<number>`count(*)` }).from(learningSession)
    .where(gte(learningSession.startedAt, sevenDaysAgo));
  const [{ n: activeProfiles7d }] = await db
    .select({ n: sql<number>`count(distinct ${dailyActivity.profileId})` })
    .from(dailyActivity)
    .where(gte(dailyActivity.activityDate, sevenDaysAgoDate));

  const users = await db.select().from(user);
  const profiles = await db.select().from(profile);

  const usersWithProfiles = await Promise.all(users.map(async (u) => {
    const ownProfiles = profiles.filter((p) => p.ownerUserId === u.id);
    const profileDetails = await Promise.all(ownProfiles.map(async (p) => {
      const [{ n: diagCount }] = await db.select({ n: sql<number>`count(*)` }).from(learningSession)
        .where(and(
          eq(learningSession.profileId, p.id),
          eq(learningSession.kind, "diagnostic"),
          eq(learningSession.status, "completed")
        ));
      const [{ n: masteredCount }] = await db.select({ n: sql<number>`count(*)` }).from(masteryState)
        .where(and(eq(masteryState.profileId, p.id), eq(masteryState.status, "mastered")));
      const [{ total: xpTotal }] = await db
        .select({ total: sql<number>`coalesce(sum(${xpEvent.amount}), 0)` })
        .from(xpEvent)
        .where(eq(xpEvent.profileId, p.id));

      return {
        id: p.id,
        displayName: p.displayName,
        diagnosticDone: Number(diagCount) > 0,
        mastered: Number(masteredCount),
        totalXp: Number(xpTotal),
        streak: p.currentStreak,
        lastActiveOn: p.lastActiveOn
      };
    }));

    return { id: u.id, email: u.email, role: u.role, createdAt: u.createdAt, profiles: profileDetails };
  }));

  return {
    counters: {
      users: Number(usersCount),
      profiles: Number(profilesCount),
      sessions7d: Number(sessions7d),
      activeProfiles7d: Number(activeProfiles7d)
    },
    users: usersWithProfiles
  };
}
