"use client";

import { useTranslations } from "next-intl";

export interface ResourceItem {
  id?: string;
  title: string;
  provider: string;
  lang: "it" | "en";
  url: string;
  kind: string;
  summary?: string;
  suggested?: boolean;
  viewed?: boolean;
}

export interface ResourceListProps {
  resources: ResourceItem[];
  onOpen?: (item: ResourceItem) => void;
}

const GROUP_ORDER = ["video", "exercises", "assessment"] as const;

/** Curated resources for a topic, grouped by kind, as external links — provider badge + lang
 * chip, plus an optional suggested/alternative/viewed chip row used by the browse flow (unused
 * by the plain session flow, which passes none of the new props). */
export function ResourceList({ resources, onOpen }: ResourceListProps) {
  const t = useTranslations("session");
  const groupLabels: Record<(typeof GROUP_ORDER)[number], string> = {
    video: t("videos"),
    exercises: t("resourceExercises"),
    assessment: t("resourceAssessments")
  };

  if (resources.length === 0) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("noResources")}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {GROUP_ORDER.map((kind) => {
        const items = resources.filter((r) => r.kind === kind);
        if (items.length === 0) return null;
        return (
          <div key={kind} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{groupLabels[kind]}</h2>
            <ul className="flex flex-col gap-2">
              {items.map((r) => (
                <li key={r.url}>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => onOpen?.(r)}
                    className="flex items-center gap-3 rounded-xl border border-black/[.08] px-4 py-3 hover:bg-black/[.03] dark:border-white/[.15] dark:hover:bg-white/[.05]"
                  >
                    <span className="flex flex-1 flex-col">
                      <span>
                        {r.title} <span aria-hidden="true">↗</span>
                      </span>
                      {r.summary && (
                        <span className="text-sm text-zinc-600 dark:text-zinc-400">{r.summary}</span>
                      )}
                    </span>
                    <span className="rounded-full bg-black/[.06] px-2 py-1 text-xs dark:bg-white/[.1]">{r.provider}</span>
                    <span className="rounded-full bg-black/[.06] px-2 py-1 text-xs uppercase dark:bg-white/[.1]">{r.lang}</span>
                    {r.suggested === true && (
                      <span className="rounded-full bg-foreground px-2 py-1 text-xs text-background">{t("suggested")}</span>
                    )}
                    {r.suggested === false && (
                      <span className="rounded-full bg-black/[.06] px-2 py-1 text-xs dark:bg-white/[.1]">{t("alternative")}</span>
                    )}
                    {r.viewed && (
                      <span className="rounded-full bg-black/[.06] px-2 py-1 text-xs dark:bg-white/[.1]">{t("viewed")}</span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
