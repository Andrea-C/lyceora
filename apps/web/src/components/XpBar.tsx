import { useTranslations } from "next-intl";

export interface XpBarProps {
  xpToday: number;
  goal: number;
  streak: number;
}

/** Today's XP vs. the daily goal + the streak flame. Presentational only — no "use client",
 * renders fine as a plain server component (useTranslations works in both). */
export function XpBar({ xpToday, goal, streak }: XpBarProps) {
  const t = useTranslations("dashboard");
  const pct = goal > 0 ? Math.min(100, Math.round((xpToday / goal) * 100)) : 0;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-black/[.08] p-5 dark:border-white/[.15]">
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">{t("xpToday")}</span>
        <span className="text-2xl font-semibold">
          <span data-testid="xp-value">{xpToday}</span>
          <span className="text-base font-normal text-zinc-500"> / {goal}</span>
        </span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-black/[.08] dark:bg-white/[.1]">
        <div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center gap-2 text-lg">
        <span aria-hidden>🔥</span>
        <span data-testid="streak-value" className="font-semibold">{streak}</span>
        <span className="text-sm text-zinc-600 dark:text-zinc-400">{t("streak")}</span>
      </div>
    </div>
  );
}
