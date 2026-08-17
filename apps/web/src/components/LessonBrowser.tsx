"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ResourceList, type ResourceItem } from "./ResourceList";

export interface LessonBrowserProps {
  profileId: string;
  topicId: string;
  locale: "it" | "en";
  /** Pre-annotated by the caller: id, suggested, viewed, lang, summary already resolved. */
  resources: ResourceItem[];
}

type LangFilter = "mine" | "all";

/** Free-browse resource list for one topic. Logs a topic-view beacon once on mount (StrictMode-
 * safe via a ref guard, same pattern as diagnostic-client.tsx's hasStarted ref) and a
 * per-resource view beacon on click, both fire-and-forget against POST /api/browse/view. */
export function LessonBrowser({ profileId, topicId, locale, resources }: LessonBrowserProps) {
  const t = useTranslations("browse");
  const [langFilter, setLangFilter] = useState<LangFilter>("mine");
  const [viewedIds, setViewedIds] = useState<Set<string>>(
    () => new Set(resources.filter((r) => r.viewed && r.id).map((r) => r.id as string))
  );
  const hasLoggedView = useRef(false);

  useEffect(() => {
    if (hasLoggedView.current) return;
    hasLoggedView.current = true;
    void fetch("/api/browse/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, topicId })
    });
    // intentionally run once on mount — profileId/topicId don't change for a mounted browser
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = resources.filter((r) => langFilter === "all" || r.lang === locale);

  // stable partition: suggested (true) first, everything else keeps its incoming relative order
  const ordered = [...filtered.filter((r) => r.suggested === true), ...filtered.filter((r) => r.suggested !== true)];

  const annotated = ordered.map((r) => ({
    ...r,
    viewed: r.viewed || (r.id ? viewedIds.has(r.id) : false)
  }));

  function handleOpen(item: ResourceItem) {
    if (!item.id) return;
    const id = item.id;
    setViewedIds((prev) => new Set(prev).add(id));
    void fetch("/api/browse/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, topicId, resourceId: id })
    });
  }

  const mineLabel = locale === "it" ? t("langIt") : t("langEn");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">{t("langFilter")}</span>
        <button
          type="button"
          onClick={() => setLangFilter("mine")}
          aria-pressed={langFilter === "mine"}
          className={`rounded-full px-3 py-1 ${langFilter === "mine" ? "bg-foreground text-background" : "bg-black/[.06] dark:bg-white/[.1]"}`}
        >
          {mineLabel}
        </button>
        <button
          type="button"
          onClick={() => setLangFilter("all")}
          aria-pressed={langFilter === "all"}
          className={`rounded-full px-3 py-1 ${langFilter === "all" ? "bg-foreground text-background" : "bg-black/[.06] dark:bg-white/[.1]"}`}
        >
          {t("langAll")}
        </button>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("langEmpty")}</p>
      ) : (
        <ResourceList resources={annotated} onOpen={handleOpen} />
      )}
    </div>
  );
}
