import { createHash } from "node:crypto";
import { resourceSchema, type CuratedResource, type Topic } from "@lyceora/taxonomy";

export interface CuratorSearchPort {
  search(query: string): Promise<{ url: string; title: string; snippet: string }[]>;
}

export interface CuratorJudgePort {
  judge(
    topic: Topic,
    candidate: { url: string; title: string; snippet: string },
    locale: "it" | "en"
  ): Promise<{
    keep: boolean;
    kind: "video" | "exercises" | "assessment";
    lang: "it" | "en";
    title: { it: string; en: string };
    provider: string;
    reason: string;
  }>;
}

export interface CuratorLivenessPort {
  alive(url: string): Promise<boolean>;
}

export function buildQueries(topic: Topic): string[] {
  return [
    `${topic.name.it} matematica spiegazione esercizi scuola media`,
    `${topic.name.en} math explained practice exercises`
  ];
}

export function resourceIdFor(topicId: string, url: string): string {
  return `res_${topicId}_${createHash("sha256").update(url).digest("hex").slice(0, 8)}`;
}

export async function curateTopic(
  topic: Topic,
  ports: {
    search: CuratorSearchPort["search"];
    judge: CuratorJudgePort["judge"];
    alive: CuratorLivenessPort["alive"];
  },
  opts: { existingUrls: Set<string>; maxSearches: number }
): Promise<CuratedResource[]> {
  const seen = new Set(opts.existingUrls);
  const out: CuratedResource[] = [];
  const queries = buildQueries(topic).slice(0, opts.maxSearches);
  for (const q of queries) {
    for (const cand of await ports.search(q)) {
      if (seen.has(cand.url)) continue;
      seen.add(cand.url);
      if (!(await ports.alive(cand.url))) continue;
      const verdict = await ports.judge(topic, cand, "it");
      if (!verdict.keep) continue;
      out.push(
        resourceSchema.parse({
          id: resourceIdFor(topic.id, cand.url),
          topicIds: [topic.id],
          kind: verdict.kind,
          provider: verdict.provider,
          title: verdict.title,
          url: cand.url,
          lang: verdict.lang
        })
      );
    }
  }
  return out;
}

export function createFakeCuratorPorts() {
  return {
    search: async (q: string) => [
      { url: "https://existing", title: `existing ${q}`, snippet: "s" },
      { url: "https://dead", title: "dead", snippet: "s" },
      { url: "https://good", title: "good", snippet: "s" }
    ],
    alive: async (url: string) => url !== "https://dead",
    judge: async (_t: Topic, c: { url: string; title: string }) => ({
      keep: c.url.startsWith("https://good"),
      kind: "video" as const,
      lang: "it" as const,
      provider: "fake",
      title: { it: c.title, en: c.title },
      reason: "fixture"
    })
  };
}
