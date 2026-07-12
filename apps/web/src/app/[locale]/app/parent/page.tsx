import { desc, eq, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { profile, masteryState, xpEvent, awardedBadge } from "@lyceora/db";
import { getSessionOrRedirect } from "@/lib/session";
import { BADGE_DEFINITIONS } from "@lyceora/engine";

const RECENT_BADGES_LIMIT = 5;

export default async function ParentPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getSessionOrRedirect(locale);
  const t = await getTranslations("parent");

  const profiles = await db.select().from(profile).where(eq(profile.ownerUserId, session.user.id));

  const children = await Promise.all(
    profiles.map(async (p) => {
      const masteryRows = await db.select().from(masteryState).where(eq(masteryState.profileId, p.id));
      const counts = { mastered: 0, inProgress: 0, needsReview: 0 };
      for (const row of masteryRows) {
        if (row.status === "mastered") counts.mastered += 1;
        else if (row.status === "inProgress") counts.inProgress += 1;
        else if (row.status === "needsReview") counts.needsReview += 1;
      }
      const [xpRow] = await db
        .select({ total: sql<number>`coalesce(sum(${xpEvent.amount}), 0)` })
        .from(xpEvent)
        .where(eq(xpEvent.profileId, p.id));
      const recentBadges = await db.select().from(awardedBadge)
        .where(eq(awardedBadge.profileId, p.id))
        .orderBy(desc(awardedBadge.awardedAt))
        .limit(RECENT_BADGES_LIMIT);
      return { profile: p, counts, totalXp: Number(xpRow?.total ?? 0), recentBadges };
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
          {children.map(({ profile: p, counts, totalXp, recentBadges }) => (
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
