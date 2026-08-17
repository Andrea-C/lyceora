import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { getActiveProfileOrRedirect } from "@/lib/session";
import { getGraph } from "@/server/content";
import { domainLabel } from "@/server/domain-labels";
import { getJourneyState } from "@/server/services/journey";
import { getPathOverview } from "@/server/services/path-overview";
import { TopicMap } from "@/components/TopicMap";

/** Phase 3: the whole learning path, browsable. Mastered topics gray but openable, to-learn
 * highlighted; free navigation is stated as a feature and XP honesty as freedom, per the
 * pedagogy rules (nothing gated, nothing shamed). */
export default async function PathPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const { profile } = await getActiveProfileOrRedirect(locale);
  const loc = locale === "en" ? "en" : "it";
  const t = await getTranslations("browse");
  const tJourney = await getTranslations("journey");
  const tDomains = await getTranslations("domains");

  const journey = await getJourneyState(db, profile.id);
  if (!journey.enrolled) redirect(`/${locale}/app`);

  if (!journey.diagnosticDone) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">{t("emptyPreDiagnostic")}</p>
        <Link
          href={`/${locale}/app/diagnostic`}
          className="rounded-full bg-foreground px-8 py-4 text-xl text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          {journey.resumeDiagnostic ? tJourney("ctaResumeDiagnostic") : tJourney("ctaStartDiagnostic")}
        </Link>
      </main>
    );
  }

  const overview = await getPathOverview(db, getGraph(), profile.id, journey.pathId!, loc);
  const groups = overview.groups.map((g) => ({
    ...g,
    domain: domainLabel(g.domain, tDomains),
    topics: g.topics.map((topic) => ({ ...topic, href: `/${locale}/app/path/${topic.id}` }))
  }));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-2 text-lg text-zinc-600 dark:text-zinc-400">{t("intro")}</p>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">{t("orderHint")} {t("noXpHint")}</p>
      </div>
      <TopicMap groups={groups} />
    </main>
  );
}
