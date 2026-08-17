import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { dailyActivity, awardedBadge } from "@lyceora/db";
import { getActiveProfileOrRedirect } from "@/lib/session";
import { getGraph } from "@/server/content";
import { getJourneyState } from "@/server/services/journey";
import { getPathOverview } from "@/server/services/path-overview";
import { localToday } from "@/server/services/session";
import { XpBar } from "@/components/XpBar";
import { BadgeCase } from "@/components/BadgeCase";
import { JourneyPhases, type JourneyPhase, type JourneyPhaseKey } from "@/components/JourneyPhases";

/** The journey IS home: one page answering "where am I, what's next?" — the phase path is the
 * hero, a single state-derived CTA below it, and the XP/badge strip only once there's progress
 * to show (no "0 XP" guilt for a fresh profile). */
export default async function JourneyHomePage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const { profile } = await getActiveProfileOrRedirect(locale);
  const loc = locale === "en" ? "en" : "it";
  const t = await getTranslations("dashboard");
  const tJourney = await getTranslations("journey");

  const journey = await getJourneyState(db, profile.id);
  const base = `/${locale}/app`;

  const phaseHrefs: Partial<Record<JourneyPhaseKey, string>> = {
    subject: `${base}/subjects`,
    assessment: `${base}/diagnostic`,
    path: `${base}/path`
  };
  const phases: JourneyPhase[] = journey.phases.map((p) => ({ ...p, href: phaseHrefs[p.key] }));

  let ctaHref: string;
  let ctaLabel: string;
  let ctaTestId: string;
  if (!journey.enrolled) {
    ctaHref = `${base}/subjects`;
    ctaLabel = tJourney("ctaChooseSubject");
    ctaTestId = "choose-subject";
  } else if (!journey.diagnosticDone) {
    ctaHref = `${base}/diagnostic`;
    ctaLabel = journey.resumeDiagnostic ? tJourney("ctaResumeDiagnostic") : tJourney("ctaStartDiagnostic");
    ctaTestId = "go-diagnostic";
  } else {
    ctaHref = `${base}/session`;
    ctaLabel = tJourney("ctaStartSession");
    ctaTestId = "start-session";
  }

  let stats: { xpToday: number; earnedBadgeIds: string[]; mastered: number; total: number } | null = null;
  if (journey.enrolled && journey.diagnosticDone) {
    const today = localToday(profile.timezone);
    const [activity] = await db.select().from(dailyActivity)
      .where(and(eq(dailyActivity.profileId, profile.id), eq(dailyActivity.activityDate, today)));
    const earnedBadges = await db.select().from(awardedBadge).where(eq(awardedBadge.profileId, profile.id));
    const overview = await getPathOverview(db, getGraph(), profile.id, journey.pathId!, loc);
    stats = {
      xpToday: activity?.xpEarned ?? 0,
      earnedBadgeIds: earnedBadges.map((b) => b.badgeId),
      mastered: overview.mastered,
      total: overview.total
    };
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title", { name: profile.displayName })}</h1>
        <p className="mt-2 text-lg text-zinc-600 dark:text-zinc-400">{tJourney("subtitle")}</p>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">{tJourney("teacherHint")}</p>
      </div>
      <JourneyPhases phases={phases} />
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href={ctaHref}
          data-testid={ctaTestId}
          className="rounded-full bg-foreground px-8 py-4 text-xl text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          {ctaLabel}
        </Link>
        {journey.diagnosticDone && (
          <Link href={`${base}/path`} data-testid="view-journey" className="text-sm underline underline-offset-4">
            {t("viewJourney")}
          </Link>
        )}
      </div>
      {stats && (
        <>
          <XpBar xpToday={stats.xpToday} goal={profile.dailyXpGoal} streak={profile.currentStreak} />
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            <Link href={`${base}/path`} className="underline underline-offset-4">
              {tJourney("progress", { mastered: stats.mastered, total: stats.total })}
            </Link>
          </p>
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{t("badges")}</h2>
            <BadgeCase earnedIds={stats.earnedBadgeIds} locale={loc} />
          </div>
        </>
      )}
    </main>
  );
}
