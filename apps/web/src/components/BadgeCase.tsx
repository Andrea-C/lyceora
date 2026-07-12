import { BADGE_DEFINITIONS } from "@lyceora/engine";

export interface BadgeCaseProps {
  earnedIds: string[];
  locale: "it" | "en";
}

/** Server-safe badge case (no hooks) — grid over every defined badge, earned ones shown full-color
 * with their description, unearned ones muted (name only, no counters, no shame). */
export function BadgeCase({ earnedIds, locale }: BadgeCaseProps) {
  const earned = new Set(earnedIds);

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {BADGE_DEFINITIONS.map((badge) => {
        const isEarned = earned.has(badge.id);
        return (
          <li
            key={badge.id}
            className={`flex flex-col gap-1 rounded-2xl border border-black/[.08] p-4 dark:border-white/[.15]${isEarned ? "" : " opacity-40"}`}
          >
            <span className="font-semibold">{badge.name[locale]}</span>
            {isEarned && (
              <span className="text-sm text-zinc-600 dark:text-zinc-400">{badge.description[locale]}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
