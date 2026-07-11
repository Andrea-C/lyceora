import { useTranslations } from "next-intl";

export interface DomainProgress {
  domain: string;
  mastered: number;
  total: number;
}

export interface PathProgressProps {
  domains: DomainProgress[];
}

/** Mastered/total per domain for the profile's enrolled path. */
export function PathProgress({ domains }: PathProgressProps) {
  const t = useTranslations("dashboard");

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-black/[.08] p-5 dark:border-white/[.15]">
      <h2 className="text-lg font-semibold">{t("progress")}</h2>
      <ul className="flex flex-col gap-2">
        {domains.map((d) => (
          <li key={d.domain} className="flex items-center justify-between gap-4">
            <span>{d.domain}</span>
            <div className="flex flex-1 items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/[.08] dark:bg-white/[.1]">
                <div
                  className="h-full rounded-full bg-green-500"
                  style={{ width: `${d.total > 0 ? Math.round((d.mastered / d.total) * 100) : 0}%` }}
                />
              </div>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">{d.mastered}/{d.total}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
