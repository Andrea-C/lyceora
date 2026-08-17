import type { Db } from "@lyceora/db";
import { topoOrder, type TopicGraph } from "@lyceora/taxonomy";
import * as repo from "../repo";
import { getBrowsableTopicIds } from "../content";

export interface PathOverviewTopic {
  id: string;
  name: string;
  status: "mastered" | "inProgress" | "needsReview" | "unknown";
  viewed: boolean;
  completed: boolean;
}
export interface PathOverviewGroup {
  domain: string;
  mastered: number;
  total: number;
  topics: PathOverviewTopic[];
}

/** Domain string stays RAW (English, from taxonomy data) — the caller translates via domainLabel,
 * same contract profile-report.ts's domains already follow. */
export async function getPathOverview(
  db: Db, graph: TopicGraph, profileId: string, pathId: string, locale: "it" | "en"
): Promise<{ groups: PathOverviewGroup[]; mastered: number; total: number }> {
  const browsable = getBrowsableTopicIds(pathId);
  const ordered = topoOrder(graph, new Set(browsable));

  const [masteryMap, viewRows, completedTopicIds] = await Promise.all([
    repo.getMasteryMap(db, profileId),
    repo.getBrowseViews(db, profileId),
    repo.getLessonCompletedTopicIds(db, profileId)
  ]);
  const viewedTopicIds = new Set(viewRows.map((v) => v.topicId));

  const groupsByDomain = new Map<string, PathOverviewGroup>();
  let masteredTotal = 0;
  for (const topicId of ordered) {
    const topic = graph.topics.get(topicId);
    if (!topic) continue; // defensive: mirrors profile-report's existing "skip missing from graph"
    const status = masteryMap.get(topicId)?.status ?? "unknown";
    let group = groupsByDomain.get(topic.domain);
    if (!group) {
      group = { domain: topic.domain, mastered: 0, total: 0, topics: [] };
      groupsByDomain.set(topic.domain, group);
    }
    group.total += 1;
    if (status === "mastered") { group.mastered += 1; masteredTotal += 1; }
    group.topics.push({
      id: topicId, name: topic.name[locale], status,
      viewed: viewedTopicIds.has(topicId), completed: completedTopicIds.has(topicId)
    });
  }
  const groups = [...groupsByDomain.values()];
  const total = groups.reduce((sum, g) => sum + g.total, 0);
  return { groups, mastered: masteredTotal, total };
}
