import { useTranslations } from "next-intl";
import { BADGE_DEFINITIONS } from "@lyceora/engine";
import { domainLabel } from "@/server/domain-labels";
import { PathProgress } from "./PathProgress";
import { ActivityChart } from "./ActivityChart";
import type { ProfileReportData } from "@/server/services/profile-report";

export interface ProfileReportProps {
  data: ProfileReportData;
  locale: "it" | "en";
}

/** Renders one profile's progress report: recent badges, domain bars (omitted when unenrolled),
 * 14-day activity chart, needs-review list, and this-week summary. Shared by the parent page
 * (per-child) and the admin drill-in (single profile) — see getProfileReport. Domain keys arrive
 * untranslated from the service (keeps it next-intl/server-free and directly unit-testable) and
 * are translated here, at render time. */
export function ProfileReport({ data, locale }: ProfileReportProps) {
  const t = useTranslations("parent");
  const tDomains = useTranslations("domains");
  const { days, reviewTogether, week, recentBadges } = data;
  const domains = data.domains.map((d) => ({ ...d, domain: domainLabel(d.domain, tDomains) }));

  return (
    <>
      {recentBadges.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm text-zinc-600 dark:text-zinc-400">{t("recentBadges")}</h4>
          <ul className="mt-2 flex flex-col gap-1">
            {recentBadges.map((b) => (
              <li key={b.badgeId} className="flex items-center justify-between gap-4 text-sm">
                <span>🏅 {badgeName(b.badgeId, locale)}</span>
                <span className="text-zinc-600 dark:text-zinc-400">
                  {new Date(b.awardedAt).toLocaleDateString(locale)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {domains.length > 0 && (
        <div className="mt-4">
          <PathProgress domains={domains} />
        </div>
      )}
      <div className="mt-4">
        <ActivityChart days={days} />
      </div>
      {reviewTogether.length > 0 && (
        <div className="mt-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("reviewTogether")}</p>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {reviewTogether.map((name, i) => (
              <li key={`${i}-${name}`}>{name}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4">
        <h4 className="text-sm text-zinc-600 dark:text-zinc-400">{t("thisWeek")}</h4>
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-zinc-600 dark:text-zinc-400">{t("weekXp")}</dt>
            <dd className="text-lg font-semibold">
              {week.xp}
              <span className={`ml-1 text-sm font-normal ${week.xpDelta >= 0 ? "text-green-600 dark:text-green-400" : "text-zinc-500"}`}>
                {week.xpDelta >= 0 ? "▲" : "▼"} {Math.abs(week.xpDelta)}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-zinc-600 dark:text-zinc-400">{t("weekSessions")}</dt>
            <dd className="text-lg font-semibold">{week.sessions}</dd>
          </div>
          <div>
            <dt className="text-zinc-600 dark:text-zinc-400">{t("weekMastered")}</dt>
            <dd className="text-lg font-semibold">{week.mastered}</dd>
          </div>
          <div>
            <dt className="text-zinc-600 dark:text-zinc-400">{t("weekReviews")}</dt>
            <dd className="text-lg font-semibold">{week.reviews}</dd>
          </div>
        </dl>
      </div>
    </>
  );
}

/** Falls back to the raw id for any badge id no longer in BADGE_DEFINITIONS (shouldn't happen —
 * defensive against schema drift, never crashes the page). */
function badgeName(badgeId: string, locale: string): string {
  const badge = BADGE_DEFINITIONS.find((b) => b.id === badgeId);
  return badge ? badge.name[locale as "it" | "en"] : badgeId;
}
