import Link from "next/link";
import { useTranslations } from "next-intl";

export type TopicStatus = "mastered" | "inProgress" | "needsReview" | "unknown";

export interface TopicMapTopic {
  id: string;
  name: string;
  status: TopicStatus;
  viewed: boolean;
  completed: boolean;
  href: string;
}

export interface TopicMapGroup {
  /** Already translated by the caller (domain labels live server-side, e.g. domain-labels.ts). */
  domain: string;
  mastered: number;
  total: number;
  topics: TopicMapTopic[];
}

export interface TopicMapProps {
  groups: TopicMapGroup[];
}

/** Full browse view of a profile's path, grouped by domain. Every topic is always a Link
 * regardless of status — styling (opacity, chip color, accent border) communicates mastery
 * instead of gating access; browsing is always free. */
export function TopicMap({ groups }: TopicMapProps) {
  const t = useTranslations("browse");
  const tSession = useTranslations("session");

  const chipBase = "rounded-full bg-black/[.06] px-2 py-1 text-xs dark:bg-white/[.1]";
  const statusChip: Record<TopicStatus, { label: string; className: string }> = {
    mastered: { label: t("statusMastered"), className: chipBase },
    needsReview: { label: t("statusNeedsReview"), className: `${chipBase} text-amber-700 dark:text-amber-400` },
    inProgress: { label: t("statusInProgress"), className: chipBase },
    unknown: { label: t("statusToLearn"), className: chipBase }
  };

  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <div key={group.domain} className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">{group.domain}</h2>
            <span className="text-sm text-zinc-600 dark:text-zinc-400">{group.mastered}/{group.total}</span>
          </div>
          <ul className="flex flex-col gap-2">
            {group.topics.map((topic) => {
              const chip = statusChip[topic.status];
              return (
                <li key={topic.id}>
                  <Link
                    href={topic.href}
                    className={
                      "flex items-center gap-3 rounded-xl border border-black/[.08] px-4 py-3 hover:bg-black/[.03] dark:border-white/[.15] dark:hover:bg-white/[.05]" +
                      (topic.status === "mastered" ? " opacity-60" : "") +
                      (topic.status === "unknown" ? " border-l-4 border-l-foreground" : "")
                    }
                  >
                    <span className="flex-1">{topic.name}</span>
                    {topic.completed && (
                      <span className={chipBase}>✓ {t("doneInSession")}</span>
                    )}
                    {topic.viewed && (
                      <span className={chipBase}>{tSession("viewed")}</span>
                    )}
                    <span className={chip.className}>{chip.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
