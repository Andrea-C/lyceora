import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { getActiveProfileOrRedirect } from "@/lib/session";
import { getBrowsableTopicIds, getGraph, getResources, pickSuggested } from "@/server/content";
import * as repo from "@/server/repo";
import { getJourneyState } from "@/server/services/journey";
import { getPathOverview } from "@/server/services/path-overview";
import { LessonBrowser } from "@/components/LessonBrowser";
import { TeacherChat } from "@/components/TeacherChat";

/** Browse-mode lesson view for one topic: description, curated resources (suggested pinned by
 * pickSuggested), language filter, viewed markers, and the AI teacher — all VIEW-ONLY. The only
 * write this page's client triggers is the browse_view beacon; XP and mastery stay untouched. */
export default async function BrowseTopicPage({
  params
}: {
  params: Promise<{ locale: string; topicId: string }>;
}) {
  const { locale, topicId } = await params;
  const { profile } = await getActiveProfileOrRedirect(locale);
  const loc = locale === "en" ? "en" : "it";
  const t = await getTranslations("browse");

  const journey = await getJourneyState(db, profile.id);
  if (!journey.enrolled || !journey.diagnosticDone) redirect(`/${locale}/app/path`);
  if (!getBrowsableTopicIds(journey.pathId!).has(topicId)) notFound();

  const graph = getGraph();
  const topic = graph.topics.get(topicId);
  if (!topic) notFound();

  const [mastery, views, completedIds, overview] = await Promise.all([
    repo.getMasteryOrEmpty(db, profile.id, topicId),
    repo.getBrowseViews(db, profile.id),
    repo.getLessonCompletedTopicIds(db, profile.id),
    getPathOverview(db, graph, profile.id, journey.pathId!, loc)
  ]);
  const viewedResourceIds = new Set(
    views.filter((v) => v.topicId === topicId && v.resourceId !== "").map((v) => v.resourceId)
  );

  const resources = pickSuggested(getResources(topicId), loc).map((r) => ({
    id: r.id,
    title: r.title[loc],
    provider: r.provider,
    kind: r.kind,
    lang: r.lang,
    url: r.url,
    summary: r.summary?.[loc],
    suggested: r.suggested,
    viewed: viewedResourceIds.has(r.id)
  }));

  const flatIds = overview.groups.flatMap((g) => g.topics.map((tp) => tp.id));
  const idx = flatIds.indexOf(topicId);
  const prevId = idx > 0 ? flatIds[idx - 1] : null;
  const nextId = idx >= 0 && idx < flatIds.length - 1 ? flatIds[idx + 1] : null;

  const statusLabels = {
    mastered: t("statusMastered"),
    inProgress: t("statusInProgress"),
    needsReview: t("statusNeedsReview"),
    unknown: t("statusToLearn")
  } as const;
  const chip = "rounded-full bg-black/[.06] px-2 py-1 text-xs dark:bg-white/[.1]";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <Link href={`/${locale}/app/path`} className="text-sm underline underline-offset-4">
        ← {t("backToPath")}
      </Link>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{topic.name[loc]}</h1>
          <span className={chip}>{statusLabels[mastery.status]}</span>
          {completedIds.has(topicId) && <span className={chip}>✓ {t("doneInSession")}</span>}
        </div>
        {mastery.status === "mastered" && (
          <p className="rounded-xl border border-black/[.08] px-4 py-3 text-sm text-zinc-600 dark:border-white/[.15] dark:text-zinc-400">
            {t("masteredBanner")}
          </p>
        )}
        <p className="text-lg text-zinc-600 dark:text-zinc-400">{topic.description[loc]}</p>
      </div>
      <LessonBrowser profileId={profile.id} topicId={topicId} locale={loc} resources={resources} />
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("askTeacher")}</h2>
        <TeacherChat profileId={profile.id} topicId={topicId} threadId={`browse-${profile.id}-${topicId}`} />
      </div>
      <div className="flex items-center justify-between text-sm">
        {prevId ? (
          <Link href={`/${locale}/app/path/${prevId}`} className="underline underline-offset-4">
            ← {t("prevTopic")}
          </Link>
        ) : <span />}
        {nextId ? (
          <Link href={`/${locale}/app/path/${nextId}`} className="underline underline-offset-4">
            {t("nextTopic")} →
          </Link>
        ) : <span />}
      </div>
    </main>
  );
}
