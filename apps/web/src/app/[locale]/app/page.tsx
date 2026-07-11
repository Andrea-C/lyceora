import { redirect } from "next/navigation";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { dailyActivity } from "@lyceora/db";
import { getActiveProfileOrRedirect } from "@/lib/session";
import { getGraph, getPath } from "@/server/content";
import { domainLabel } from "@/server/domain-labels";
import * as repo from "@/server/repo";
import { localToday } from "@/server/services/session";
import { XpBar } from "@/components/XpBar";
import { PathProgress } from "@/components/PathProgress";

const RECOVERY_PATH_ID = "path_recupero_media";

export default async function DashboardPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const { profile } = await getActiveProfileOrRedirect(locale);
  const t = await getTranslations("dashboard");

  const enrollment = await repo.getActiveEnrollment(db, profile.id);

  async function startDiagnosticAction() {
    "use server";
    await repo.createEnrollment(db, profile.id, RECOVERY_PATH_ID);
    redirect(`/${locale}/app/diagnostic`);
  }

  if (!enrollment) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-8 px-6 py-16 text-center">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("title", { name: profile.displayName })}</h1>
          <p className="mt-2 text-lg text-zinc-600 dark:text-zinc-400">{t("intro")}</p>
        </div>
        <form action={startDiagnosticAction}>
          <button
            type="submit"
            data-testid="start-diagnostic"
            className="rounded-full bg-foreground px-8 py-4 text-xl text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            {t("startDiagnostic")}
          </button>
        </form>
      </main>
    );
  }

  const graph = getGraph();
  const path = getPath(enrollment.pathId);
  const mastery = await repo.getMasteryMap(db, profile.id);
  const tDomains = await getTranslations("domains");

  // Grouped by the raw (English) taxonomy domain string first, then translated for display —
  // grouping on the raw string keeps topics correctly bucketed even if two raw domains happened
  // to translate to the same label.
  const domainTotals = new Map<string, { mastered: number; total: number }>();
  for (const topicId of path.targetTopicIds) {
    const topic = graph.topics.get(topicId);
    if (!topic) continue;
    const bucket = domainTotals.get(topic.domain) ?? { mastered: 0, total: 0 };
    bucket.total += 1;
    if (mastery.get(topicId)?.status === "mastered") bucket.mastered += 1;
    domainTotals.set(topic.domain, bucket);
  }
  const domains = [...domainTotals.entries()].map(([domain, v]) => ({ domain: domainLabel(domain, tDomains), ...v }));

  const today = localToday(profile.timezone);
  const [activity] = await db.select().from(dailyActivity)
    .where(and(eq(dailyActivity.profileId, profile.id), eq(dailyActivity.activityDate, today)));
  const xpToday = activity?.xpEarned ?? 0;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title", { name: profile.displayName })}</h1>
      <XpBar xpToday={xpToday} goal={profile.dailyXpGoal} streak={profile.currentStreak} />
      <PathProgress domains={domains} />
      <Link
        href={`/${locale}/app/session`}
        data-testid="start-session"
        className="self-start rounded-full bg-foreground px-8 py-4 text-xl text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
      >
        {t("startSession")}
      </Link>
    </main>
  );
}
