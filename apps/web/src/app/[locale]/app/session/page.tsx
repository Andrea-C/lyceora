import { redirect } from "next/navigation";
import type { Locale } from "@lyceora/taxonomy";
import { getActiveProfileOrRedirect } from "@/lib/session";
import { db } from "@/lib/db";
import { getGraph, getPath, getResources } from "@/server/content";
import * as repo from "@/server/repo";
import { startSession } from "@/server/services/session";
import { SessionClient } from "./session-client";

export default async function SessionPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const { session, profile } = await getActiveProfileOrRedirect(locale);
  const loc: Locale = locale === "en" ? "en" : "it";

  const enrollment = await repo.getActiveEnrollment(db, profile.id);
  if (!enrollment) redirect(`/${locale}/app`);

  const graph = getGraph();
  const targetTopicIds = getPath(enrollment.pathId).targetTopicIds;
  const { sessionId, plan } = await startSession(db, graph, session.user.id, profile.id, targetTopicIds);

  // Hydrate content the client needs to render the plan without a dedicated content API:
  // every topic's localized name (routing decisions can reference a prerequisite topic that
  // isn't itself a plan item), plus fuller lesson content (description + resources) only for
  // the topics that actually appear as "lesson" items.
  const topicNames: Record<string, string> = {};
  for (const topic of graph.topics.values()) topicNames[topic.id] = topic.name[loc];

  const lessonTopicIds = [...new Set(plan.items.filter((i) => i.kind === "lesson").map((i) => i.topicId))];
  const lessonContent: Record<string, { description: string; resources: { title: string; provider: string; kind: string; lang: "it" | "en"; url: string }[] }> = {};
  for (const topicId of lessonTopicIds) {
    const topic = graph.topics.get(topicId)!;
    lessonContent[topicId] = {
      description: topic.description[loc],
      resources: getResources(topicId).map((r) => ({ title: r.title[loc], provider: r.provider, kind: r.kind, lang: r.lang, url: r.url }))
    };
  }

  return (
    <SessionClient
      profileId={profile.id}
      sessionId={sessionId}
      plan={plan}
      topicNames={topicNames}
      lessonContent={lessonContent}
      locale={locale}
    />
  );
}
